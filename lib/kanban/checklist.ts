/**
 * checklist — service checklist kartu Kanban: ambil, tambah, ubah/centang,
 * hapus, urutkan, simpan template, terapkan template. SERVER-ONLY.
 *
 * ===========================================================================
 * LINGKUP DIPAKSAKAN DI SINI, BUKAN HANYA DI RLS
 * ===========================================================================
 * Koneksi aplikasi (withAuditContext) MELEWATI RLS — ia hanya memasang konteks
 * audit, bukan `request.jwt.claims`. Jadi RLS `checklist_item` (migrasi 026)
 * menjaga akses LANGSUNG/authenticated, sedangkan service inilah gerbang untuk
 * request aplikasi. Keduanya menurunkan lingkup dari KARTU INDUK dengan aturan
 * yang sama: kartu berbasis departemen, periode aktif, role KADEPT/ANGGOTA pada
 * departemen kartu (atau ADMIN). Meniru PATCH /api/kanban/[id] (T-080) supaya
 * dua jalur tak menyimpang. BPH tak pernah menulis (INV-03).
 *
 * Progres proker TIDAK dihitung dari checklist (T-081 "Jangan"; PRD F-7.1) —
 * itu tetap dari kolom kartu. Checklist hanya progres per-kartu (`3/8`).
 *
 * Route handler (lane ui, `app/api/kanban/[id]/checklist/route.ts`) tinggal:
 * guard `kanban.*` → withAuditContext → fungsi di sini → sukses()/gagal().
 *
 * Sumber: docs/ai/tasks/P4-kanban.md T-081 · PRD F-7.2 · docs/ai/CHECKLIST_CONTRACT.md
 */

import { z } from 'zod';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';

// ---------------------------------------------------------------------------
// Bentuk data
// ---------------------------------------------------------------------------

export interface ItemChecklist {
  id: string;
  card_id: string;
  teks: string;
  selesai: boolean;
  assignee_id: string | null;
  assignee_nama: string | null;
  /** `YYYY-MM-DD` atau null. */
  deadline: string | null;
  urutan: number;
}

export interface RingkasTemplateChecklist {
  id: string;
  nama: string;
  departemen_id: string;
  jumlah_item: number;
}

export type KodeGagalChecklist = 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'TIDAK_VALID';

export interface GagalChecklist {
  ok: false;
  kode: KodeGagalChecklist;
  pesan: string;
  /** Terisi untuk `TIDAK_VALID`: isu per-field dari Zod (K-02 error.details). */
  details?: unknown;
}

export type HasilChecklist<T> = { ok: true; nilai: T } | GagalChecklist;

export const STATUS_GAGAL_CHECKLIST: Record<KodeGagalChecklist, number> = {
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  TIDAK_VALID: 422,
};

const gagal = (kode: KodeGagalChecklist, pesan: string, details?: unknown): GagalChecklist =>
  details === undefined ? { ok: false, kode, pesan } : { ok: false, kode, pesan, details };

// ---------------------------------------------------------------------------
// Skema (K-04) — diekspor agar route lane ui memvalidasi bentuk yang sama
// ---------------------------------------------------------------------------

const teksItem = z.string().trim().min(1, 'Teks item wajib diisi.').max(500, 'Teks item terlalu panjang.');
const tanggal = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD.');

export const SkemaTambahItem = z.object({
  teks: teksItem,
  assignee_id: z.uuid().nullish(),
  deadline: tanggal.nullish(),
});

export const SkemaUbahItem = z
  .object({
    teks: teksItem.optional(),
    selesai: z.boolean().optional(),
    assignee_id: z.uuid().nullable().optional(),
    deadline: tanggal.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Tidak ada perubahan yang diberikan.',
  });

export const SkemaUrutkan = z.object({ urutan: z.array(z.uuid()).min(1) });
export const SkemaSimpanTemplate = z.object({
  nama: z.string().trim().min(1, 'Nama template wajib diisi.').max(120),
});
export const SkemaTerapkanTemplate = z.object({ template_id: z.uuid() });

export type InputTambahItem = z.infer<typeof SkemaTambahItem>;
export type InputUbahItem = z.infer<typeof SkemaUbahItem>;

// ---------------------------------------------------------------------------
// Penjaga lingkup — turunkan dari kartu induk (meniru PATCH /api/kanban/[id])
// ---------------------------------------------------------------------------

interface BarisLingkupKartu {
  card_departemen: string | null;
  card_divisi: string | null;
  proker_periode: string | null;
  proker_departemen: string | null;
}

/**
 * Apakah `konteks` boleh MENULIS checklist kartu `cardId`. Kartu wajib berbasis
 * departemen (tanpa divisi), periode proker (bila ada) harus aktif dan tak
 * bertentangan dengan departemen kartu. Selain ADMIN, wajib ada baris user_role
 * (KADEPT/ANGGOTA) pada departemen kartu di periode aktif — role & departemen
 * pada BARIS yang sama, bukan gabungan ID role lain.
 */
async function bolehTulisKartu(
  tx: TxKlien,
  konteks: Konteks,
  cardId: string,
): Promise<HasilChecklist<{ departemenId: string }>> {
  const [kartu] = await tx.$queryRaw<BarisLingkupKartu[]>`
    SELECT c.departemen_id AS card_departemen, c.divisi_id AS card_divisi,
           p.periode_id AS proker_periode, p.departemen_id AS proker_departemen
    FROM kanban_card c
    LEFT JOIN proker p ON p.id = c.proker_id
    WHERE c.id = ${cardId}::uuid`;

  if (!kartu) return gagal('TIDAK_DITEMUKAN', 'Kartu tidak ditemukan.');

  const konteksBentrok =
    !kartu.card_departemen ||
    kartu.card_divisi !== null ||
    (kartu.proker_periode !== null &&
      (kartu.proker_periode !== konteks.periodeId ||
        kartu.proker_departemen !== kartu.card_departemen));
  if (konteksBentrok) {
    return gagal('TIDAK_BERWENANG', 'Anda tidak berwenang mengubah checklist kartu ini.');
  }

  const departemenId = kartu.card_departemen!;
  if (!konteks.roles.includes('ADMIN')) {
    const peran = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM user_role
      WHERE user_id = ${konteks.sesi.userId}::uuid
        AND periode_id = ${konteks.periodeId}::uuid
        AND departemen_id = ${departemenId}::uuid
        AND role IN ('KADEPT', 'ANGGOTA')
      LIMIT 1`;
    if (peran.length === 0) {
      return gagal('TIDAK_BERWENANG', 'Anda tidak berwenang mengubah checklist kartu ini.');
    }
  }
  return { ok: true, nilai: { departemenId } };
}

async function ambilItem(klien: TxKlien | typeof db, id: string): Promise<ItemChecklist | null> {
  const [row] = await klien.$queryRaw<ItemChecklist[]>`
    SELECT ci.id, ci.card_id, ci.teks, ci.selesai, ci.assignee_id,
           u.nama_lengkap AS assignee_nama,
           to_char(ci.deadline, 'YYYY-MM-DD') AS deadline, ci.urutan
    FROM checklist_item ci
    LEFT JOIN app_user u ON u.id = ci.assignee_id
    WHERE ci.id = ${id}::uuid`;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Operasi item
// ---------------------------------------------------------------------------

/** Item checklist satu kartu, terurut. Baca org-wide (konsisten kanban_card). */
export async function daftarChecklist(
  _konteks: Konteks,
  cardId: string,
  klien: TxKlien | typeof db = db,
): Promise<ItemChecklist[]> {
  return klien.$queryRaw<ItemChecklist[]>`
    SELECT ci.id, ci.card_id, ci.teks, ci.selesai, ci.assignee_id,
           u.nama_lengkap AS assignee_nama,
           to_char(ci.deadline, 'YYYY-MM-DD') AS deadline, ci.urutan
    FROM checklist_item ci
    LEFT JOIN app_user u ON u.id = ci.assignee_id
    WHERE ci.card_id = ${cardId}::uuid
    ORDER BY ci.urutan ASC, ci.id ASC`;
}

export async function tambahChecklist(
  tx: TxKlien,
  konteks: Konteks,
  cardId: string,
  input: unknown,
): Promise<HasilChecklist<ItemChecklist>> {
  const boleh = await bolehTulisKartu(tx, konteks, cardId);
  if (!boleh.ok) return boleh;

  const parsed = SkemaTambahItem.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Item checklist tidak valid.', parsed.error.issues);

  const [baris] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO checklist_item (card_id, teks, assignee_id, deadline, urutan)
    VALUES (${cardId}::uuid, ${parsed.data.teks},
      ${parsed.data.assignee_id ?? null}::uuid, ${parsed.data.deadline ?? null}::date,
      (SELECT COALESCE(MAX(urutan) + 1, 0) FROM checklist_item WHERE card_id = ${cardId}::uuid))
    RETURNING id`;
  return { ok: true, nilai: (await ambilItem(tx, baris!.id))! };
}

export async function ubahChecklist(
  tx: TxKlien,
  konteks: Konteks,
  itemId: string,
  input: unknown,
): Promise<HasilChecklist<ItemChecklist>> {
  const [kini] = await tx.$queryRaw<
    { card_id: string; teks: string; selesai: boolean; assignee_id: string | null; deadline: string | null }[]
  >`
    SELECT card_id, teks, selesai, assignee_id, to_char(deadline, 'YYYY-MM-DD') AS deadline
    FROM checklist_item WHERE id = ${itemId}::uuid`;
  if (!kini) return gagal('TIDAK_DITEMUKAN', 'Item checklist tidak ditemukan.');

  const boleh = await bolehTulisKartu(tx, konteks, kini.card_id);
  if (!boleh.ok) return boleh;

  const parsed = SkemaUbahItem.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Perubahan checklist tidak valid.', parsed.error.issues);

  // Gabung: field yang tak diberikan (undefined) mempertahankan nilai lama;
  // `null` eksplisit mengosongkan assignee/deadline. `?? ` aman untuk `selesai`
  // karena hanya jatuh ke lama pada undefined, bukan `false`.
  const teks = parsed.data.teks ?? kini.teks;
  const selesai = parsed.data.selesai ?? kini.selesai;
  const assignee = parsed.data.assignee_id !== undefined ? parsed.data.assignee_id : kini.assignee_id;
  const deadline = parsed.data.deadline !== undefined ? parsed.data.deadline : kini.deadline;

  await tx.$executeRaw`
    UPDATE checklist_item
    SET teks = ${teks}, selesai = ${selesai},
        assignee_id = ${assignee}::uuid, deadline = ${deadline}::date
    WHERE id = ${itemId}::uuid`;
  return { ok: true, nilai: (await ambilItem(tx, itemId))! };
}

export async function hapusChecklist(
  tx: TxKlien,
  konteks: Konteks,
  itemId: string,
): Promise<HasilChecklist<{ id: string }>> {
  const [item] = await tx.$queryRaw<{ card_id: string }[]>`
    SELECT card_id FROM checklist_item WHERE id = ${itemId}::uuid`;
  if (!item) return gagal('TIDAK_DITEMUKAN', 'Item checklist tidak ditemukan.');

  const boleh = await bolehTulisKartu(tx, konteks, item.card_id);
  if (!boleh.ok) return boleh;

  await tx.$executeRaw`DELETE FROM checklist_item WHERE id = ${itemId}::uuid`;
  return { ok: true, nilai: { id: itemId } };
}

/** Urutkan ulang: `urutanIds` = seluruh id kartu dalam urutan baru. */
export async function urutkanChecklist(
  tx: TxKlien,
  konteks: Konteks,
  cardId: string,
  input: unknown,
): Promise<HasilChecklist<ItemChecklist[]>> {
  const boleh = await bolehTulisKartu(tx, konteks, cardId);
  if (!boleh.ok) return boleh;

  const parsed = SkemaUrutkan.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Urutan tidak valid.', parsed.error.issues);

  const ada = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM checklist_item WHERE card_id = ${cardId}::uuid`;
  const set = new Set(ada.map((r) => r.id));
  if (parsed.data.urutan.length !== set.size || !parsed.data.urutan.every((id) => set.has(id))) {
    return gagal('TIDAK_VALID', 'Daftar urutan harus tepat memuat semua item kartu.');
  }

  for (let i = 0; i < parsed.data.urutan.length; i++) {
    await tx.$executeRaw`
      UPDATE checklist_item SET urutan = ${i}
      WHERE id = ${parsed.data.urutan[i]!}::uuid AND card_id = ${cardId}::uuid`;
  }
  return { ok: true, nilai: await daftarChecklist(konteks, cardId, tx) };
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/** Template checklist departemen tertentu (untuk dipilih & diterapkan). */
export async function daftarTemplate(
  _konteks: Konteks,
  departemenId: string,
  klien: TxKlien | typeof db = db,
): Promise<RingkasTemplateChecklist[]> {
  return klien.$queryRaw<RingkasTemplateChecklist[]>`
    SELECT t.id, t.nama, t.departemen_id,
           (SELECT count(*)::int FROM checklist_template_item i WHERE i.template_id = t.id) AS jumlah_item
    FROM checklist_template t
    WHERE t.departemen_id = ${departemenId}::uuid
    ORDER BY t.created_at DESC`;
}

/** Simpan checklist kartu saat ini sebagai template departemennya. */
export async function simpanTemplate(
  tx: TxKlien,
  konteks: Konteks,
  cardId: string,
  input: unknown,
): Promise<HasilChecklist<RingkasTemplateChecklist>> {
  const boleh = await bolehTulisKartu(tx, konteks, cardId);
  if (!boleh.ok) return boleh;

  const parsed = SkemaSimpanTemplate.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Template tidak valid.', parsed.error.issues);

  const [tpl] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO checklist_template (departemen_id, nama, dibuat_oleh)
    VALUES (${boleh.nilai.departemenId}::uuid, ${parsed.data.nama}, ${konteks.sesi.userId}::uuid)
    RETURNING id`;
  await tx.$executeRaw`
    INSERT INTO checklist_template_item (template_id, teks, urutan)
    SELECT ${tpl!.id}::uuid, teks, urutan FROM checklist_item
    WHERE card_id = ${cardId}::uuid ORDER BY urutan, id`;

  const [ring] = await tx.$queryRaw<RingkasTemplateChecklist[]>`
    SELECT t.id, t.nama, t.departemen_id,
           (SELECT count(*)::int FROM checklist_template_item i WHERE i.template_id = t.id) AS jumlah_item
    FROM checklist_template t WHERE t.id = ${tpl!.id}::uuid`;
  return { ok: true, nilai: ring! };
}

/** Terapkan item template ke kartu (menambahkan di bawah item yang ada). */
export async function terapkanTemplate(
  tx: TxKlien,
  konteks: Konteks,
  cardId: string,
  input: unknown,
): Promise<HasilChecklist<ItemChecklist[]>> {
  const boleh = await bolehTulisKartu(tx, konteks, cardId);
  if (!boleh.ok) return boleh;

  const parsed = SkemaTerapkanTemplate.safeParse(input);
  if (!parsed.success) return gagal('TIDAK_VALID', 'Permintaan template tidak valid.', parsed.error.issues);

  const [tpl] = await tx.$queryRaw<{ id: string; departemen_id: string }[]>`
    SELECT id, departemen_id FROM checklist_template WHERE id = ${parsed.data.template_id}::uuid`;
  if (!tpl) return gagal('TIDAK_DITEMUKAN', 'Template tidak ditemukan.');
  if (tpl.departemen_id !== boleh.nilai.departemenId) {
    return gagal('TIDAK_BERWENANG', 'Template bukan milik departemen kartu.');
  }

  await tx.$executeRaw`
    INSERT INTO checklist_item (card_id, teks, urutan)
    SELECT ${cardId}::uuid, i.teks,
      (SELECT COALESCE(MAX(urutan) + 1, 0) FROM checklist_item WHERE card_id = ${cardId}::uuid)
        + (ROW_NUMBER() OVER (ORDER BY i.urutan, i.id) - 1)
    FROM checklist_template_item i WHERE i.template_id = ${tpl.id}::uuid`;
  return { ok: true, nilai: await daftarChecklist(konteks, cardId, tx) };
}
