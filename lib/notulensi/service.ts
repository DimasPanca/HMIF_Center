/**
 * notulensi/service — notulensi rapat: daftar/detail/pencarian, buat & perbarui
 * transaksional, daftar hadir dari pengurus, keputusan, action item, konversi ke
 * kartu Kanban, dan generate DOCX. SERVER-ONLY.
 *
 * ===========================================================================
 * LINGKUP DIPAKSAKAN DI SINI, BUKAN HANYA DI RLS
 * ===========================================================================
 * Koneksi aplikasi (withAuditContext) MELEWATI RLS. Service inilah gerbang untuk
 * request aplikasi; RLS (migrasi 027) menjaga akses langsung/authenticated.
 * Keduanya menurunkan lingkup dari NOTULENSI INDUK: tulis = ADMIN/KETUA/WAKIL/
 * SEKUM lintas-organisasi atau KADEPT departemennya (role & departemen pada
 * baris user_role yang SAMA), periode aktif. BPH baca saja (INV-03).
 *
 * Departemen tujuan action item TIDAK ditebak dari PIC (bisa multi-role):
 * notulensi departemen memaksa departemennya; notulensi himpunan menetapkannya
 * eksplisit. Konversi mengunci baris (anti duplikasi).
 *
 * Sumber: docs/ai/tasks/P8-kesekretariatan.md T-106 · PRD M13 · USER_FLOW §9.2 ·
 *         INV-03, INV-08 · docs/ai/NOTULENSI_CONTRACT.md
 */

import { z } from 'zod';

import type { Konteks } from '@/lib/auth/guard';
import { lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';

import { buatDocxNotulensi, type DataDocxNotulensi } from './docx';
import { ekstrakBlok, ekstrakTeks, sanitasiKonten, type NodeProseMirror } from './sanitasi';
import {
  SkemaActionItemInput,
  SkemaBuatNotulensi,
  SkemaKehadiran,
  SkemaKonversi,
  SkemaPerbaruiNotulensi,
  type StatusKehadiran,
} from './skema';

// ---------------------------------------------------------------------------
// Bentuk data
// ---------------------------------------------------------------------------

export type { StatusKehadiran };

export interface RingkasNotulensi {
  id: string;
  judul: string;
  tanggal: string;
  tempat: string | null;
  departemen_id: string | null;
  nama_departemen: string | null;
}

export interface BarisKehadiran {
  user_id: string;
  nama: string;
  status: StatusKehadiran;
}
export interface RingkasKehadiran {
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
}
export interface ActionItemNotulensi {
  id: string;
  tugas: string;
  pic_id: string | null;
  pic_nama: string | null;
  deadline: string | null;
  departemen_id: string | null;
  kanban_card_id: string | null;
}
export interface LampiranNotulensi {
  id: string;
  nama_berkas: string;
  storage_key: string;
  mime: string | null;
  ukuran: number | null;
}
export interface Pengurus {
  user_id: string;
  nama_lengkap: string;
  jabatan: string;
  departemen_id: string | null;
}

export interface NotulensiDetail {
  id: string;
  periode_id: string;
  departemen_id: string | null;
  judul: string;
  tanggal: string;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  tempat: string | null;
  pemimpin_id: string | null;
  pemimpin_nama: string | null;
  notulis_id: string | null;
  notulis_nama: string | null;
  konten: NodeProseMirror;
  keputusan: string[];
  kehadiran: BarisKehadiran[];
  ringkasan: RingkasKehadiran;
  action_items: ActionItemNotulensi[];
  lampiran: LampiranNotulensi[];
}

export type KodeGagalNotulensi = 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'TIDAK_VALID' | 'KONFLIK';
export interface GagalNotulensi {
  ok: false;
  kode: KodeGagalNotulensi;
  pesan: string;
  details?: unknown;
}
export type HasilNotulensi<T> = { ok: true; nilai: T } | GagalNotulensi;
export const STATUS_GAGAL_NOTULENSI: Record<KodeGagalNotulensi, number> = {
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  TIDAK_VALID: 422,
  KONFLIK: 409,
};
const gagal = (kode: KodeGagalNotulensi, pesan: string, details?: unknown): GagalNotulensi =>
  details === undefined ? { ok: false, kode, pesan } : { ok: false, kode, pesan, details };

// ---------------------------------------------------------------------------
// Skema (K-04) — didefinisikan di ./skema (aman untuk klien), diekspor ulang
// ---------------------------------------------------------------------------

export { SkemaActionItemInput, SkemaBuatNotulensi, SkemaKehadiran, SkemaKonversi, SkemaPerbaruiNotulensi };

// ---------------------------------------------------------------------------
// Lingkup
// ---------------------------------------------------------------------------

const PERAN_GLOBAL = ['ADMIN', 'KETUA', 'WAKIL', 'SEKUM'] as const;

export async function bolehTulisNotulensi(
  tx: TxKlien | typeof db,
  konteks: Konteks,
  departemenId: string | null,
): Promise<boolean> {
  if (!konteks.periodeId) return false;
  if (konteks.roles.some((r) => (PERAN_GLOBAL as readonly string[]).includes(r))) return true;
  if (!departemenId) return false;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM user_role
    WHERE user_id = ${konteks.sesi.userId}::uuid AND periode_id = ${konteks.periodeId}::uuid
      AND role = 'KADEPT' AND departemen_id = ${departemenId}::uuid
    LIMIT 1`;
  return rows.length > 0;
}

/** Tujuan yang boleh dipilih saat membuat notulensi: himpunan dan/atau departemen tertentu. */
export async function tujuanTulisNotulensi(
  konteks: Konteks,
  klien: TxKlien | typeof db = db,
): Promise<{ himpunan: boolean; departemenIds: string[] | 'SEMUA' }> {
  if (!konteks.periodeId) return { himpunan: false, departemenIds: [] };
  if (konteks.roles.some((r) => (PERAN_GLOBAL as readonly string[]).includes(r))) {
    return { himpunan: true, departemenIds: 'SEMUA' };
  }
  const rows = await klien.$queryRaw<{ departemen_id: string }[]>`
    SELECT DISTINCT departemen_id FROM user_role
    WHERE user_id = ${konteks.sesi.userId}::uuid AND periode_id = ${konteks.periodeId}::uuid
      AND role = 'KADEPT' AND departemen_id IS NOT NULL`;
  return { himpunan: false, departemenIds: rows.map((r) => r.departemen_id) };
}

/**
 * Departemen yang boleh DIBACA, atau `null` bila seluruh organisasi.
 * PRD §5.1: ANGGOTA `R*` / KADEPT `CRU*` terbatas departemen sendiri. RLS SELECT
 * notulensi (015b) `USING (true)` lebih longgar, jadi batas ini hanya ditegakkan
 * di sini — lihat ADR-025.
 */
export function departemenBacaNotulensi(konteks: Konteks): string[] | null {
  return lingkupUntuk(konteks.roles, 'notulensi.read') === 'DEPARTEMEN' ? konteks.departemenIds : null;
}

async function ringkasKehadiran(klien: TxKlien | typeof db, id: string): Promise<RingkasKehadiran> {
  const [r] = await klien.$queryRaw<RingkasKehadiran[]>`
    SELECT
      count(*) FILTER (WHERE status = 'HADIR')::int AS hadir,
      count(*) FILTER (WHERE status = 'IZIN')::int  AS izin,
      count(*) FILTER (WHERE status = 'SAKIT')::int AS sakit,
      count(*) FILTER (WHERE status = 'ALFA')::int  AS alfa
    FROM notulensi_attendance WHERE notulensi_id = ${id}::uuid`;
  return r ?? { hadir: 0, izin: 0, sakit: 0, alfa: 0 };
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

/** Daftar/pencarian notulensi periode aktif. `q` mencari judul, tempat & ISI. */
export async function daftarNotulensi(
  konteks: Konteks,
  opsi: { q?: string; departemenId?: string | null } = {},
  klien: TxKlien | typeof db = db,
): Promise<RingkasNotulensi[]> {
  if (!konteks.periodeId) return [];
  const q = opsi.q?.trim() || null;
  const dep = opsi.departemenId ?? null;
  const lingkup = departemenBacaNotulensi(konteks);
  return klien.$queryRaw<RingkasNotulensi[]>`
    SELECT n.id, n.judul, to_char(n.tanggal, 'YYYY-MM-DD') AS tanggal, n.tempat,
           n.departemen_id, d.nama AS nama_departemen
    FROM notulensi n
    LEFT JOIN departemen d ON d.id = n.departemen_id
    WHERE n.periode_id = ${konteks.periodeId}::uuid
      AND (${dep}::uuid IS NULL OR n.departemen_id = ${dep}::uuid)
      AND (${lingkup === null}::boolean OR n.departemen_id = ANY(${lingkup ?? []}::uuid[]))
      AND (${q ?? null}::text IS NULL OR n.cari_tsv @@ plainto_tsquery('indonesian', ${q ?? null}))
    ORDER BY n.tanggal DESC, n.created_at DESC`;
}

export async function detailNotulensi(
  konteks: Konteks,
  id: string,
  klien: TxKlien | typeof db = db,
): Promise<NotulensiDetail | null> {
  const [n] = await klien.$queryRaw<
    (Omit<NotulensiDetail, 'konten' | 'keputusan' | 'kehadiran' | 'ringkasan' | 'action_items' | 'lampiran'> & {
      konten: NodeProseMirror | null;
      keputusan: string[] | null;
    })[]
  >`
    SELECT n.id, n.periode_id, n.departemen_id, n.judul,
           to_char(n.tanggal, 'YYYY-MM-DD') AS tanggal,
           to_char(n.waktu_mulai, 'HH24:MI') AS waktu_mulai,
           to_char(n.waktu_selesai, 'HH24:MI') AS waktu_selesai,
           n.tempat, n.pemimpin_id, pu.nama_lengkap AS pemimpin_nama,
           n.notulis_id, nu.nama_lengkap AS notulis_nama,
           n.konten, n.keputusan
    FROM notulensi n
    LEFT JOIN app_user pu ON pu.id = n.pemimpin_id
    LEFT JOIN app_user nu ON nu.id = n.notulis_id
    WHERE n.id = ${id}::uuid`;
  if (!n) return null;
  // Di luar lingkup baca dijawab sama dengan "tidak ada" agar keberadaannya tidak bocor.
  const lingkup = departemenBacaNotulensi(konteks);
  if (lingkup && !(n.departemen_id && lingkup.includes(n.departemen_id))) return null;

  const kehadiran = await klien.$queryRaw<BarisKehadiran[]>`
    SELECT a.user_id, u.nama_lengkap AS nama, a.status
    FROM notulensi_attendance a JOIN app_user u ON u.id = a.user_id
    WHERE a.notulensi_id = ${id}::uuid ORDER BY u.nama_lengkap`;
  const action_items = await klien.$queryRaw<ActionItemNotulensi[]>`
    SELECT ai.id, ai.tugas, ai.pic_id, u.nama_lengkap AS pic_nama,
           to_char(ai.deadline, 'YYYY-MM-DD') AS deadline, ai.departemen_id, ai.kanban_card_id
    FROM action_item ai LEFT JOIN app_user u ON u.id = ai.pic_id
    WHERE ai.notulensi_id = ${id}::uuid ORDER BY ai.id`;
  const lampiran = await klien.$queryRaw<LampiranNotulensi[]>`
    SELECT id, nama_berkas, storage_key, mime, ukuran
    FROM notulensi_lampiran WHERE notulensi_id = ${id}::uuid ORDER BY created_at`;

  return {
    ...n,
    konten: n.konten ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    keputusan: n.keputusan ?? [],
    kehadiran,
    ringkasan: await ringkasKehadiran(klien, id),
    action_items,
    lampiran,
  };
}

/** Pengurus periode aktif untuk membangun daftar hadir (yang punya akun). */
export async function daftarPengurus(
  konteks: Konteks,
  departemenId: string | null,
  klien: TxKlien | typeof db = db,
): Promise<Pengurus[]> {
  if (!konteks.periodeId) return [];
  return klien.$queryRaw<Pengurus[]>`
    SELECT p.user_id, p.nama_lengkap, p.jabatan, p.departemen_id
    FROM pengurus p
    WHERE p.periode_id = ${konteks.periodeId}::uuid AND p.is_aktif AND p.user_id IS NOT NULL
      AND (${departemenId}::uuid IS NULL OR p.departemen_id = ${departemenId}::uuid)
    ORDER BY p.nama_lengkap`;
}

// ---------------------------------------------------------------------------
// Tulis
// ---------------------------------------------------------------------------

async function simpanKehadiran(tx: TxKlien, id: string, daftar: z.infer<typeof SkemaKehadiran>[]): Promise<void> {
  await tx.$executeRaw`DELETE FROM notulensi_attendance WHERE notulensi_id = ${id}::uuid`;
  for (const k of daftar) {
    await tx.$executeRaw`
      INSERT INTO notulensi_attendance (notulensi_id, user_id, status)
      VALUES (${id}::uuid, ${k.user_id}::uuid, ${k.status}::kehadiran)`;
  }
}

export async function buatNotulensi(
  tx: TxKlien,
  konteks: Konteks,
  input: unknown,
): Promise<HasilNotulensi<{ id: string }>> {
  const parsed = SkemaBuatNotulensi.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Notulensi tidak valid.', parsed.error.issues);
  const d = parsed.data;
  if (!(await bolehTulisNotulensi(tx, konteks, d.departemen_id))) {
    return gagal('TIDAK_BERWENANG', 'Anda tidak berwenang membuat notulensi ini.');
  }

  const konten = sanitasiKonten(d.konten ?? null);
  const kontenTeks = `${ekstrakTeks(konten)} ${d.keputusan.join(' ')}`.trim();

  const [n] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO notulensi (periode_id, departemen_id, judul, tanggal, waktu_mulai, waktu_selesai,
      tempat, pemimpin_id, notulis_id, konten, konten_teks, keputusan)
    VALUES (${konteks.periodeId}::uuid, ${d.departemen_id}::uuid, ${d.judul}, ${d.tanggal}::date,
      ${d.waktu_mulai ?? null}::time, ${d.waktu_selesai ?? null}::time, ${d.tempat ?? null},
      ${d.pemimpin_id ?? null}::uuid, ${d.notulis_id ?? null}::uuid,
      ${JSON.stringify(konten)}::jsonb, ${kontenTeks}, ${JSON.stringify(d.keputusan)}::jsonb)
    RETURNING id`;
  const id = n!.id;

  await simpanKehadiran(tx, id, d.kehadiran);
  for (const a of d.action_items) {
    // Notulensi departemen memaksa departemennya; himpunan memakai yang diberikan.
    const dept = d.departemen_id ?? a.departemen_id ?? null;
    await tx.$executeRaw`
      INSERT INTO action_item (notulensi_id, tugas, pic_id, deadline, departemen_id)
      VALUES (${id}::uuid, ${a.tugas}, ${a.pic_id ?? null}::uuid, ${a.deadline ?? null}::date, ${dept}::uuid)`;
  }
  return { ok: true, nilai: { id } };
}

export async function perbaruiNotulensi(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  input: unknown,
): Promise<HasilNotulensi<{ id: string }>> {
  const [n] = await tx.$queryRaw<{ departemen_id: string | null; periode_id: string }[]>`
    SELECT departemen_id, periode_id FROM notulensi WHERE id = ${id}::uuid`;
  if (!n) return gagal('TIDAK_DITEMUKAN', 'Notulensi tidak ditemukan.');
  if (n.periode_id !== konteks.periodeId) return gagal('TIDAK_BERWENANG', 'Notulensi di luar periode aktif.');
  if (!(await bolehTulisNotulensi(tx, konteks, n.departemen_id))) {
    return gagal('TIDAK_BERWENANG', 'Anda tidak berwenang mengubah notulensi ini.');
  }

  const parsed = SkemaPerbaruiNotulensi.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Perubahan tidak valid.', parsed.error.issues);
  const d = parsed.data;

  if (d.judul !== undefined) await tx.$executeRaw`UPDATE notulensi SET judul = ${d.judul} WHERE id = ${id}::uuid`;
  if (d.tanggal !== undefined) await tx.$executeRaw`UPDATE notulensi SET tanggal = ${d.tanggal}::date WHERE id = ${id}::uuid`;
  if (d.waktu_mulai !== undefined) await tx.$executeRaw`UPDATE notulensi SET waktu_mulai = ${d.waktu_mulai}::time WHERE id = ${id}::uuid`;
  if (d.waktu_selesai !== undefined) await tx.$executeRaw`UPDATE notulensi SET waktu_selesai = ${d.waktu_selesai}::time WHERE id = ${id}::uuid`;
  if (d.tempat !== undefined) await tx.$executeRaw`UPDATE notulensi SET tempat = ${d.tempat} WHERE id = ${id}::uuid`;
  if (d.pemimpin_id !== undefined) await tx.$executeRaw`UPDATE notulensi SET pemimpin_id = ${d.pemimpin_id}::uuid WHERE id = ${id}::uuid`;
  if (d.notulis_id !== undefined) await tx.$executeRaw`UPDATE notulensi SET notulis_id = ${d.notulis_id}::uuid WHERE id = ${id}::uuid`;

  // Konten & keputusan memperbarui juga konten_teks (indeks pencarian).
  if (d.konten !== undefined || d.keputusan !== undefined) {
    const [kini] = await tx.$queryRaw<{ konten: NodeProseMirror | null; keputusan: string[] | null }[]>`
      SELECT konten, keputusan FROM notulensi WHERE id = ${id}::uuid`;
    const konten = d.konten !== undefined ? sanitasiKonten(d.konten) : sanitasiKonten(kini!.konten);
    const keputusan = d.keputusan !== undefined ? d.keputusan : (kini!.keputusan ?? []);
    const kontenTeks = `${ekstrakTeks(konten)} ${keputusan.join(' ')}`.trim();
    await tx.$executeRaw`
      UPDATE notulensi SET konten = ${JSON.stringify(konten)}::jsonb,
        keputusan = ${JSON.stringify(keputusan)}::jsonb, konten_teks = ${kontenTeks}
      WHERE id = ${id}::uuid`;
  }

  if (d.kehadiran !== undefined) await simpanKehadiran(tx, id, d.kehadiran);
  return { ok: true, nilai: { id } };
}

// ---------------------------------------------------------------------------
// Action item
// ---------------------------------------------------------------------------

async function lingkupActionItem(
  tx: TxKlien,
  konteks: Konteks,
  actionItemId: string,
): Promise<HasilNotulensi<{ notulensiDept: string | null }>> {
  const [ai] = await tx.$queryRaw<{ notulensi_dept: string | null; periode_id: string }[]>`
    SELECT n.departemen_id AS notulensi_dept, n.periode_id
    FROM action_item ai JOIN notulensi n ON n.id = ai.notulensi_id
    WHERE ai.id = ${actionItemId}::uuid`;
  if (!ai) return gagal('TIDAK_DITEMUKAN', 'Action item tidak ditemukan.');
  if (ai.periode_id !== konteks.periodeId) return gagal('TIDAK_BERWENANG', 'Di luar periode aktif.');
  if (!(await bolehTulisNotulensi(tx, konteks, ai.notulensi_dept))) {
    return gagal('TIDAK_BERWENANG', 'Anda tidak berwenang mengubah action item ini.');
  }
  return { ok: true, nilai: { notulensiDept: ai.notulensi_dept } };
}

export async function tambahActionItem(
  tx: TxKlien,
  konteks: Konteks,
  notulensiId: string,
  input: unknown,
): Promise<HasilNotulensi<{ id: string }>> {
  const [n] = await tx.$queryRaw<{ departemen_id: string | null; periode_id: string }[]>`
    SELECT departemen_id, periode_id FROM notulensi WHERE id = ${notulensiId}::uuid`;
  if (!n) return gagal('TIDAK_DITEMUKAN', 'Notulensi tidak ditemukan.');
  if (n.periode_id !== konteks.periodeId) return gagal('TIDAK_BERWENANG', 'Di luar periode aktif.');
  if (!(await bolehTulisNotulensi(tx, konteks, n.departemen_id))) {
    return gagal('TIDAK_BERWENANG', 'Anda tidak berwenang menambah action item.');
  }
  const parsed = SkemaActionItemInput.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Action item tidak valid.', parsed.error.issues);
  const dept = n.departemen_id ?? parsed.data.departemen_id ?? null;
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO action_item (notulensi_id, tugas, pic_id, deadline, departemen_id)
    VALUES (${notulensiId}::uuid, ${parsed.data.tugas}, ${parsed.data.pic_id ?? null}::uuid,
      ${parsed.data.deadline ?? null}::date, ${dept}::uuid)
    RETURNING id`;
  return { ok: true, nilai: { id: row!.id } };
}

export async function hapusActionItem(
  tx: TxKlien,
  konteks: Konteks,
  actionItemId: string,
): Promise<HasilNotulensi<{ id: string }>> {
  const lingkup = await lingkupActionItem(tx, konteks, actionItemId);
  if (!lingkup.ok) return lingkup;
  await tx.$executeRaw`DELETE FROM action_item WHERE id = ${actionItemId}::uuid`;
  return { ok: true, nilai: { id: actionItemId } };
}

/**
 * Konversi action item menjadi kartu Kanban di departemen tujuan, menyimpan
 * `kanban_card_id`. Mengunci baris (FOR UPDATE) agar tak menggandakan konversi.
 */
export async function konversiActionItem(
  tx: TxKlien,
  konteks: Konteks,
  actionItemId: string,
  input: unknown,
): Promise<HasilNotulensi<{ kanban_card_id: string }>> {
  const parsed = SkemaKonversi.safeParse(input ?? {});
  if (!parsed.success) return gagal('TIDAK_VALID', 'Permintaan konversi tidak valid.', parsed.error.issues);

  const [ai] = await tx.$queryRaw<
    {
      tugas: string;
      pic_id: string | null;
      deadline: string | null;
      ai_dept: string | null;
      kanban_card_id: string | null;
      notulensi_dept: string | null;
      periode_id: string;
    }[]
  >`
    SELECT ai.tugas, ai.pic_id, to_char(ai.deadline, 'YYYY-MM-DD') AS deadline,
           ai.departemen_id AS ai_dept, ai.kanban_card_id,
           n.departemen_id AS notulensi_dept, n.periode_id
    FROM action_item ai JOIN notulensi n ON n.id = ai.notulensi_id
    WHERE ai.id = ${actionItemId}::uuid
    FOR UPDATE OF ai`;
  if (!ai) return gagal('TIDAK_DITEMUKAN', 'Action item tidak ditemukan.');
  if (ai.periode_id !== konteks.periodeId) return gagal('TIDAK_BERWENANG', 'Di luar periode aktif.');
  if (!(await bolehTulisNotulensi(tx, konteks, ai.notulensi_dept))) {
    return gagal('TIDAK_BERWENANG', 'Anda tidak berwenang mengonversi action item ini.');
  }
  if (ai.kanban_card_id) {
    return gagal('KONFLIK', 'Action item ini sudah menjadi kartu Kanban.');
  }

  // Notulensi departemen → tujuan = departemennya; himpunan → dari input/kolom.
  const target = ai.notulensi_dept ?? parsed.data.departemen_id ?? ai.ai_dept ?? null;
  if (!target) {
    return gagal('TIDAK_VALID', 'Departemen tujuan wajib untuk notulensi tingkat himpunan.');
  }

  const [card] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO kanban_card (departemen_id, judul, assignee_id, deadline, created_by)
    VALUES (${target}::uuid, ${ai.tugas}, ${ai.pic_id ?? null}::uuid, ${ai.deadline ?? null}::date,
      ${konteks.sesi.userId}::uuid)
    RETURNING id`;
  await tx.$executeRaw`
    UPDATE action_item SET kanban_card_id = ${card!.id}::uuid, departemen_id = ${target}::uuid
    WHERE id = ${actionItemId}::uuid`;
  return { ok: true, nilai: { kanban_card_id: card!.id } };
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tanggalIndonesia(iso: string): string {
  const [y, m, dd] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, dd!));
  return `${HARI[d.getUTCDay()]}, ${dd} ${BULAN[m! - 1]} ${y}`;
}

/** Generate DOCX notulensi. Mengembalikan bytes berkas .docx. */
export async function generateDocxNotulensi(
  konteks: Konteks,
  id: string,
  klien: TxKlien | typeof db = db,
): Promise<HasilNotulensi<{ nama_berkas: string; docx: Buffer }>> {
  const n = await detailNotulensi(konteks, id, klien);
  if (!n) return gagal('TIDAK_DITEMUKAN', 'Notulensi tidak ditemukan.');

  const r = n.ringkasan;
  const data: DataDocxNotulensi = {
    judul: n.judul,
    hari_tanggal: tanggalIndonesia(n.tanggal),
    waktu: n.waktu_mulai && n.waktu_selesai ? `${n.waktu_mulai} – ${n.waktu_selesai}` : (n.waktu_mulai ?? ''),
    tempat: n.tempat ?? '',
    perihal: n.judul,
    pemimpin_rapat: n.pemimpin_nama ?? '',
    notulis: n.notulis_nama ?? '',
    hadir: `${r.hadir} Hadir · ${r.izin} Izin · ${r.sakit} Sakit · ${r.alfa} Alfa`,
    agenda: ekstrakBlok(n.konten).map((teks) => ({ teks })),
    hasil: n.keputusan.map((teks) => ({ teks })),
    kota: 'Cilegon',
    tanggal_format: tanggalIndonesia(n.tanggal),
  };
  return { ok: true, nilai: { nama_berkas: `notulensi-${n.tanggal}.docx`, docx: buatDocxNotulensi(data) } };
}
