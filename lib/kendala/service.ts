/**
 * service kendala departemen (T-082). Server-only.
 *
 * Hak (matriks PRD §5.1 `kendala`): Ketua/Wakil/Admin baca & ubah semua;
 * Sekum/Bendum/BPH BACA saja (BPH tak dapat membalas maupun mengubah);
 * Kadept & Anggota baca/buat/ubah/balas di departemennya sendiri; hapus
 * hanya Admin & Kadept departemennya. App bypass RLS → lingkup ditegakkan
 * di sini (INV-08), termasuk periode.
 *
 * Sumber: T-082 · PRD F-7.3 · USER_FLOW §8.2 · INV-08
 */

import { Prisma } from '@prisma/client';

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { can, type Permission } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import {
  SkemaBalasan,
  SkemaKendalaBaru,
  SkemaUbahKendala,
  idTerMention,
  type BalasanDatar,
  type Prioritas,
  type StatusKendala,
} from '@/lib/kendala/skema';

if (typeof window !== 'undefined') {
  throw new Error('lib/kendala/service.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type KodeGagalKendala = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'BERKAS_DITOLAK';
export const STATUS_GAGAL_KENDALA: Record<KodeGagalKendala, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  BERKAS_DITOLAK: 422,
};
export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalKendala; pesan: string };

const tidakAda = { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Kendala tidak ditemukan.' } as const;

// ---------------------------------------------------------------------------
// Lingkup
// ---------------------------------------------------------------------------

/** Departemen yang boleh disentuh untuk sebuah aksi; `null` = semua; `[]` = tidak ada. */
function lingkup(konteks: Konteks, perm: Permission): string[] | null {
  if (!can(konteks.roles, perm)) return [];
  return lingkupKonteks(konteks, perm) === null ? null : konteks.departemenIds;
}

export function boleh(konteks: Konteks, perm: Permission, departemenId: string | null): boolean {
  const l = lingkup(konteks, perm);
  return l === null || (departemenId !== null && l.includes(departemenId));
}

export async function departemenDariKode(kode: string): Promise<{ id: string; kode: string; nama: string } | null> {
  return db.departemen.findFirst({ where: { kode: { equals: kode, mode: 'insensitive' }, is_active: true }, select: { id: true, kode: true, nama: true } });
}

export async function departemenTerlihat(konteks: Konteks) {
  const l = lingkup(konteks, 'kendala.read');
  return db.departemen.findMany({
    where: { is_active: true, ...(l === null ? {} : { id: { in: l } }) },
    orderBy: { urutan: 'asc' },
    select: { id: true, kode: true, nama: true },
  });
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export interface BarisKendala {
  id: string;
  judul: string;
  prioritas: Prioritas;
  status: StatusKendala;
  departemen_id: string | null;
  kode_departemen: string | null;
  nama_departemen: string | null;
  nama_assignee: string | null;
  nama_pembuat: string;
  nama_proker: string | null;
  jumlah_balasan: number;
  jumlah_lampiran: number;
  created_at: string;
  updated_at: string;
}

export interface FilterKendala {
  departemenId?: string;
  q?: string;
  status?: StatusKendala | 'AKTIF';
  prioritas?: Prioritas;
  /** Arsip periode lain (baca saja). */
  periodeId?: string;
}

export async function daftarKendala(konteks: Konteks, f: FilterKendala = {}): Promise<BarisKendala[]> {
  const l = lingkup(konteks, 'kendala.read');
  if (l !== null && l.length === 0) return [];
  const syarat: Prisma.Sql[] = [Prisma.sql`k.periode_id = ${f.periodeId ?? konteks.periodeId}::uuid`];
  if (l !== null) syarat.push(Prisma.sql`k.departemen_id = ANY(${l}::uuid[])`);
  if (f.departemenId) syarat.push(Prisma.sql`k.departemen_id = ${f.departemenId}::uuid`);
  if (f.status === 'AKTIF') syarat.push(Prisma.sql`k.status <> 'SELESAI'`);
  else if (f.status) syarat.push(Prisma.sql`k.status::text = ${f.status}`);
  if (f.prioritas) syarat.push(Prisma.sql`k.prioritas::text = ${f.prioritas}`);
  if (f.q?.trim()) syarat.push(Prisma.sql`k.cari @@ websearch_to_tsquery('indonesian', ${f.q.trim()})`);
  return db.$queryRaw<BarisKendala[]>`
    SELECT k.id::text, k.judul, k.prioritas::text AS prioritas, k.status::text AS status,
           k.departemen_id::text, d.kode AS kode_departemen, d.nama AS nama_departemen,
           a.nama_lengkap AS nama_assignee, u.nama_lengkap AS nama_pembuat, p.nama AS nama_proker,
           (SELECT count(*)::int FROM kendala_reply r WHERE r.kendala_id = k.id) AS jumlah_balasan,
           (SELECT count(*)::int FROM kendala_lampiran l WHERE l.kendala_id = k.id) AS jumlah_lampiran,
           to_char(k.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, to_char(k.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
    FROM kendala k
    JOIN app_user u ON u.id = k.dibuat_oleh
    LEFT JOIN app_user a ON a.id = k.assignee_id
    LEFT JOIN departemen d ON d.id = k.departemen_id
    LEFT JOIN proker p ON p.id = k.proker_id
    WHERE ${Prisma.join(syarat, ' AND ')}
    ORDER BY (k.status = 'SELESAI'), array_position(ARRAY['KRITIS','TINGGI','SEDANG','RENDAH'], k.prioritas::text), k.created_at DESC
    LIMIT 300`;
}

export interface LampiranKendala {
  id: string;
  nama_berkas: string;
  mime_type: string;
  ukuran: number;
  diunggah_oleh: string;
  created_at: string;
}

export interface DetailKendala extends BarisKendala {
  deskripsi: string;
  periode_id: string;
  assignee_id: string | null;
  proker_id: string | null;
  dibuat_oleh: string;
  catatan_penyelesaian: string | null;
  resolved_at: string | null;
  balasan: BalasanDatar[];
  lampiran: LampiranKendala[];
}

/** Satu kendala lengkap; `null` bila tidak ada atau di luar lingkup baca. */
export async function detailKendala(konteks: Konteks, id: string): Promise<DetailKendala | null> {
  const [k] = await db.$queryRaw<(Omit<DetailKendala, 'balasan' | 'lampiran'>)[]>`
    SELECT k.id::text, k.judul, k.deskripsi, k.prioritas::text AS prioritas, k.status::text AS status,
           k.periode_id::text, k.departemen_id::text, d.kode AS kode_departemen, d.nama AS nama_departemen,
           k.assignee_id::text, a.nama_lengkap AS nama_assignee, k.dibuat_oleh::text, u.nama_lengkap AS nama_pembuat,
           k.proker_id::text, p.nama AS nama_proker, k.catatan_penyelesaian, to_char(k.resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS resolved_at,
           0 AS jumlah_balasan, 0 AS jumlah_lampiran, to_char(k.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, to_char(k.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
    FROM kendala k
    JOIN app_user u ON u.id = k.dibuat_oleh
    LEFT JOIN app_user a ON a.id = k.assignee_id
    LEFT JOIN departemen d ON d.id = k.departemen_id
    LEFT JOIN proker p ON p.id = k.proker_id
    WHERE k.id = ${id}::uuid`;
  if (!k || !boleh(konteks, 'kendala.read', k.departemen_id)) return null;
  const [balasan, lampiran] = await Promise.all([
    db.$queryRaw<BalasanDatar[]>`
      SELECT r.id::text, r.parent_id::text, r.konten, r.penulis_id::text, u.nama_lengkap AS nama_penulis, to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
      FROM kendala_reply r JOIN app_user u ON u.id = r.penulis_id
      WHERE r.kendala_id = ${id}::uuid ORDER BY r.created_at, r.id`,
    db.$queryRaw<LampiranKendala[]>`
      SELECT id::text, nama_berkas, mime_type, ukuran::int, diunggah_oleh::text, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
      FROM kendala_lampiran WHERE kendala_id = ${id}::uuid ORDER BY created_at`,
  ]);
  return { ...k, jumlah_balasan: balasan.length, jumlah_lampiran: lampiran.length, balasan, lampiran };
}

/**
 * Pengurus yang relevan untuk assignee & mention: anggota departemen itu di
 * periode berjalan, ditambah pimpinan (Ketua, Wakil) yang lazim dilibatkan.
 */
export async function orangRelevan(konteks: Konteks, departemenId: string | null) {
  return db.$queryRaw<{ id: string; nama: string; peran: string }[]>`
    SELECT DISTINCT ON (u.id) u.id::text, u.nama_lengkap AS nama, ur.role::text AS peran
    FROM user_role ur JOIN app_user u ON u.id = ur.user_id
    WHERE ur.periode_id = ${konteks.periodeId}::uuid AND u.is_active
      AND (ur.departemen_id = ${departemenId}::uuid OR ur.role::text IN ('KETUA','WAKIL'))
    ORDER BY u.id, ur.role`;
}

export async function prokerPilihan(konteks: Konteks, departemenId: string) {
  return db.proker.findMany({
    where: { periode_id: konteks.periodeId, departemen_id: departemenId },
    orderBy: { nama: 'asc' },
    select: { id: true, nama: true },
  });
}

// ---------------------------------------------------------------------------
// Tulis
// ---------------------------------------------------------------------------

async function assigneeSah(tx: TxKlien, konteks: Konteks, departemenId: string | null, assigneeId: string | null): Promise<boolean> {
  if (!assigneeId) return true;
  const [r] = await tx.$queryRaw<{ ada: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM user_role ur JOIN app_user u ON u.id = ur.user_id
      WHERE ur.user_id = ${assigneeId}::uuid AND ur.periode_id = ${konteks.periodeId}::uuid AND u.is_active
        AND (ur.departemen_id = ${departemenId}::uuid OR ur.role::text IN ('KETUA','WAKIL'))
    ) AS ada`;
  return r?.ada ?? false;
}

export async function buatKendala(tx: TxKlien, konteks: Konteks, departemenId: string, body: unknown): Promise<Hasil<{ id: string }>> {
  if (!boleh(konteks, 'kendala.create', departemenId)) {
    return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Anda tidak dapat melaporkan kendala untuk departemen ini.' };
  }
  const p = SkemaKendalaBaru.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.' };
  if (!(await assigneeSah(tx, konteks, departemenId, p.data.assignee_id))) {
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Assignee harus pengurus departemen ini, Ketua, atau Wakil.' };
  }
  if (p.data.proker_id) {
    const pr = await tx.proker.findFirst({ where: { id: p.data.proker_id, periode_id: konteks.periodeId }, select: { id: true } });
    if (!pr) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Proker terkait tidak ditemukan di periode ini.' };
  }
  const r = await tx.kendala.create({
    data: { ...p.data, departemen_id: departemenId, periode_id: konteks.periodeId, dibuat_oleh: konteks.sesi.userId },
    select: { id: true },
  });
  return { ok: true, nilai: r };
}

async function kunci(tx: TxKlien, konteks: Konteks, id: string) {
  const [k] = await tx.$queryRaw<{ id: string; departemen_id: string | null; periode_id: string; status: string }[]>`
    SELECT id::text, departemen_id::text, periode_id::text, status::text FROM kendala WHERE id = ${id}::uuid FOR UPDATE`;
  // Periode lain = arsip baca saja.
  return k && k.periode_id === konteks.periodeId ? k : null;
}

export async function ubahKendala(tx: TxKlien, konteks: Konteks, id: string, body: unknown): Promise<Hasil<{ status: StatusKendala }>> {
  const k = await kunci(tx, konteks, id);
  if (!k || !boleh(konteks, 'kendala.read', k.departemen_id)) return tidakAda;
  if (!boleh(konteks, 'kendala.update', k.departemen_id)) return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Anda hanya dapat membaca kendala ini.' };
  const p = SkemaUbahKendala.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.' };
  if (p.data.assignee_id !== undefined && !(await assigneeSah(tx, konteks, k.departemen_id, p.data.assignee_id))) {
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Assignee harus pengurus departemen ini, Ketua, atau Wakil.' };
  }
  const status = (p.data.status ?? k.status) as StatusKendala;
  await tx.kendala.update({
    where: { id },
    data: {
      ...(p.data.prioritas ? { prioritas: p.data.prioritas } : {}),
      ...(p.data.assignee_id !== undefined ? { assignee_id: p.data.assignee_id } : {}),
      ...(p.data.status
        ? p.data.status === 'SELESAI'
          ? { status: 'SELESAI', resolved_at: new Date(), catatan_penyelesaian: p.data.catatan_penyelesaian }
          : // Dibuka lagi: waktu selesai dihapus, catatan lama tetap tersimpan sebagai riwayat.
            { status: p.data.status, resolved_at: null }
        : {}),
    },
  });
  return { ok: true, nilai: { status } };
}

export async function hapusKendala(tx: TxKlien, konteks: Konteks, id: string): Promise<Hasil<{ id: string }>> {
  const k = await kunci(tx, konteks, id);
  if (!k || !boleh(konteks, 'kendala.read', k.departemen_id)) return tidakAda;
  if (!boleh(konteks, 'kendala.delete', k.departemen_id)) return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Anda tidak dapat menghapus kendala ini.' };
  await tx.kendala.delete({ where: { id } });
  return { ok: true, nilai: { id } };
}

/**
 * Balasan berulir. Hak membalas = hak membuat kendala di departemen itu:
 * Sekum, Bendum, dan BPH (baca saja) tidak dapat membalas.
 */
export async function balasKendala(tx: TxKlien, konteks: Konteks, id: string, body: unknown): Promise<Hasil<{ id: string; mention: string[] }>> {
  const k = await kunci(tx, konteks, id);
  if (!k || !boleh(konteks, 'kendala.read', k.departemen_id)) return tidakAda;
  if (!boleh(konteks, 'kendala.create', k.departemen_id)) return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Anda hanya dapat membaca diskusi ini.' };
  const p = SkemaBalasan.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.' };
  if (p.data.parent_id) {
    const induk = await tx.kendala_reply.findFirst({ where: { id: p.data.parent_id, kendala_id: id }, select: { id: true } });
    if (!induk) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Balasan induk tidak ditemukan di diskusi ini.' };
  }
  const r = await tx.kendala_reply.create({
    data: { kendala_id: id, parent_id: p.data.parent_id, konten: p.data.konten, penulis_id: konteks.sesi.userId },
    select: { id: true },
  });
  // Balasan membuat kendala "baru bergerak" di daftar.
  await tx.kendala.update({ where: { id }, data: { updated_at: new Date() } });
  return { ok: true, nilai: { id: r.id, mention: idTerMention(p.data.konten) } };
}
