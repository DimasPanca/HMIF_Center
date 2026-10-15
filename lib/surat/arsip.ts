/**
 * arsip — daftar surat untuk halaman Arsip (T-063). Server-only.
 *
 * Satu skema filter (`SkemaFilterArsip`) dibaca dari URL halaman, dari query
 * API, dan dari export Excel (K-04) — filter yang dibagikan lewat tautan
 * menghasilkan daftar yang sama di ketiganya.
 *
 * Siapa melihat apa:
 *   - Surat resmi (menunggu, disetujui, terbit, DIBATALKAN) terlihat oleh
 *     pemegang `surat.read`; draft dan surat ditolak hanya oleh pembuatnya —
 *     itu belum surat himpunan.
 *   - Lingkup DEPARTEMEN (Kadept) hanya surat departemennya atau buatannya
 *     (INV-08 — app bypass RLS, jadi lingkup ditegakkan di sini).
 *   - Periode lain boleh dibuka, baca saja (INV-08: arsip lintas periode).
 *   - DIBATALKAN TIDAK PERNAH disembunyikan (kontrak T-063 "Jangan").
 *
 * Paginasi kursor 50 baris, urut tanggal surat terbaru. Kursor memuat
 * `created_at` sebagai teks Postgres utuh (mikrodetik): `Date` JavaScript hanya
 * milidetik, dan kursor yang dibulatkan melompati atau mengulang baris.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-063 · PRD F-4.4 · INV-08
 */

import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { infoJenis, type JenisSurat } from '@/lib/surat/field-schemas';
import { jenisDari } from '@/lib/surat/draft';
import {
  BARIS_PER_HALAMAN,
  STATUS_RESMI,
  type FilterArsip,
  type StatusArsip,
} from '@/lib/surat/filter-arsip';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/arsip.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export {
  BARIS_PER_HALAMAN,
  STATUS_ARSIP,
  SkemaFilterArsip,
  filterDariQuery,
  queryDariFilter,
  type FilterArsip,
  type StatusArsip,
} from '@/lib/surat/filter-arsip';

// ---------------------------------------------------------------------------
// Kursor
// ---------------------------------------------------------------------------

interface Kursor {
  tanggal: string;
  dibuat: string;
  id: string;
}

export function encodeKursor(k: Kursor): string {
  return Buffer.from(JSON.stringify([k.tanggal, k.dibuat, k.id])).toString('base64url');
}

/**
 * Bentuk `timestamptz::text` Postgres: `2026-10-15 05:01:02.123456+00`.
 * BUKAN divalidasi lewat `Date.parse` — ia menolak offset `+00` tanpa menit,
 * sehingga setiap kursor dianggap tidak sah dan halaman 2 diam-diam mengulang
 * halaman 1 (ditemukan gate arsip-surat).
 */
const POLA_TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

export function decodeKursor(s: string | undefined): Kursor | null {
  if (!s) return null;
  try {
    const [tanggal, dibuat, id] = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as unknown[];
    if (typeof tanggal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
    if (typeof dibuat !== 'string' || !POLA_TIMESTAMPTZ.test(dibuat)) return null;
    if (typeof id !== 'string' || !z.uuid().safeParse(id).success) return null;
    return { tanggal, dibuat, id };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface BarisArsip {
  id: string;
  jenis: JenisSurat | null;
  nama_jenis: string;
  kode_surat: string;
  nomor_lengkap: string | null;
  perihal: string;
  tujuan_nama: string;
  tanggal_surat: string;
  status: StatusArsip;
  kode_kegiatan: string;
  nama_departemen: string | null;
  nama_pembuat: string;
  nama_penyetuju: string | null;
  alasan_pembatalan: string | null;
  ada_docx: boolean;
  ada_pdf: boolean;
  dibuat_oleh: string;
}

interface BarisMentah {
  id: string;
  kode_surat: string;
  varian: string | null;
  nomor_lengkap: string | null;
  perihal: string;
  tujuan_nama: string;
  tanggal_surat: string;
  status: StatusArsip;
  kode_kegiatan: string;
  nama_departemen: string | null;
  nama_pembuat: string;
  nama_penyetuju: string | null;
  alasan_pembatalan: string | null;
  ada_docx: boolean;
  ada_pdf: boolean;
  dibuat_oleh: string;
  dibuat_teks: string;
}

/** Siapa boleh melihat baris mana — dipakai daftar DAN detail. */
function terlihat(konteks: Konteks): Prisma.Sql[] {
  const saya = konteks.sesi.userId;
  const syarat = [Prisma.sql`(s.status::text IN (${Prisma.join(STATUS_RESMI)}) OR s.dibuat_oleh = ${saya}::uuid)`];
  if (lingkupKonteks(konteks, 'surat.read') === 'DEPARTEMEN') {
    syarat.push(
      Prisma.sql`(s.departemen_id = ANY(${konteks.departemenIds}::uuid[]) OR s.dibuat_oleh = ${saya}::uuid)`,
    );
  }
  return syarat;
}

/** Klausa WHERE bersama daftar, hitungan, dan export — tanpa kursor. */
function kondisi(konteks: Konteks, f: FilterArsip): Prisma.Sql {
  const syarat: Prisma.Sql[] = [Prisma.sql`s.periode_id = ${f.periode ?? konteks.periodeId}::uuid`, ...terlihat(konteks)];
  if (f.jenis) {
    const info = infoJenis(f.jenis);
    syarat.push(Prisma.sql`s.kode_surat = ${info.kode}`);
    syarat.push(info.varian ? Prisma.sql`t.varian = ${info.varian}` : Prisma.sql`s.template_id IS NULL`);
  }
  if (f.bulan) {
    // Batas bulan dihitung Postgres (SkemaFilterArsip sudah memastikan YYYY-MM).
    syarat.push(
      Prisma.sql`s.tanggal_surat >= to_date(${f.bulan}, 'YYYY-MM') AND s.tanggal_surat < to_date(${f.bulan}, 'YYYY-MM') + interval '1 month'`,
    );
  }
  if (f.status) syarat.push(Prisma.sql`s.status::text = ${f.status}`);
  if (f.departemen) syarat.push(Prisma.sql`s.departemen_id = ${f.departemen}::uuid`);
  if (f.kegiatan) syarat.push(Prisma.sql`upper(s.kode_kegiatan) = upper(${f.kegiatan})`);
  if (f.q) syarat.push(Prisma.sql`s.cari @@ websearch_to_tsquery('indonesian', ${f.q})`);
  return Prisma.join(syarat, ' AND ');
}

const DARI = Prisma.sql`
  FROM surat s
  LEFT JOIN surat_template t ON t.id = s.template_id
  JOIN app_user u ON u.id = s.dibuat_oleh
  LEFT JOIN app_user a ON a.id = s.disetujui_oleh
  LEFT JOIN departemen d ON d.id = s.departemen_id`;

const KOLOM = Prisma.sql`
  s.id::text, s.kode_surat, t.varian, s.nomor_lengkap, s.perihal, s.tujuan_nama,
  to_char(s.tanggal_surat, 'YYYY-MM-DD') AS tanggal_surat, s.status::text AS status, s.kode_kegiatan,
  d.nama AS nama_departemen, u.nama_lengkap AS nama_pembuat, a.nama_lengkap AS nama_penyetuju,
  s.alasan_pembatalan, s.dibuat_oleh::text,
  EXISTS (SELECT 1 FROM dokumen x WHERE x.surat_id = s.id AND x.jenis = 'SURAT' AND x.format = 'DOCX') AS ada_docx,
  EXISTS (SELECT 1 FROM dokumen x WHERE x.surat_id = s.id AND x.jenis = 'SURAT' AND x.format = 'PDF') AS ada_pdf,
  s.created_at::text AS dibuat_teks`;

function rapikan(b: BarisMentah): BarisArsip {
  const jenis = jenisDari(b.kode_surat, b.varian);
  const { varian: _v, dibuat_teks: _d, ...sisa } = b;
  void _v;
  void _d;
  return { ...sisa, jenis, nama_jenis: jenis ? infoJenis(jenis).nama : `Kode ${b.kode_surat}` };
}

export interface HalamanArsip {
  baris: BarisArsip[];
  /** Kursor halaman berikutnya; `null` = halaman terakhir. */
  berikut: string | null;
  total: number;
}

export async function daftarArsip(konteks: Konteks, f: FilterArsip, batas = BARIS_PER_HALAMAN): Promise<HalamanArsip> {
  const where = kondisi(konteks, f);
  const k = decodeKursor(f.cursor);
  const setelah = k
    ? Prisma.sql` AND (s.tanggal_surat, s.created_at, s.id) < (${k.tanggal}::date, ${k.dibuat}::timestamptz, ${k.id}::uuid)`
    : Prisma.empty;

  const [baris, [hitung]] = await Promise.all([
    db.$queryRaw<BarisMentah[]>`
      SELECT ${KOLOM} ${DARI}
      WHERE ${where}${setelah}
      ORDER BY s.tanggal_surat DESC, s.created_at DESC, s.id DESC
      LIMIT ${batas + 1}`,
    db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n ${DARI} WHERE ${where}`,
  ]);

  const ada = baris.length > batas;
  const tampil = baris.slice(0, batas);
  const akhir = tampil.at(-1);
  return {
    baris: tampil.map(rapikan),
    berikut: ada && akhir ? encodeKursor({ tanggal: akhir.tanggal_surat, dibuat: akhir.dibuat_teks, id: akhir.id }) : null,
    total: hitung?.n ?? 0,
  };
}

export interface DetailArsip extends BarisArsip {
  periode_id: string;
  nama_periode: string;
  tujuan_alamat: string;
  alasan_penolakan: string | null;
  disetujui_at: string | null;
  dibatalkan_at: string | null;
  nama_pembatal: string | null;
}

/**
 * Satu surat untuk halaman detail arsip — periode mana pun (baca saja,
 * INV-08), dengan aturan "siapa melihat apa" yang sama dengan daftar.
 * `null` bila tidak ada atau tidak boleh dilihat; pemanggil menjawab 404.
 */
export async function detailArsip(konteks: Konteks, id: string): Promise<DetailArsip | null> {
  type Mentah = BarisMentah &
    Omit<DetailArsip, keyof BarisArsip | 'disetujui_at' | 'dibatalkan_at'> & { disetujui: Date | null; dibatalkan: Date | null };
  const [b] = await db.$queryRaw<Mentah[]>`
    SELECT ${KOLOM}, s.periode_id::text, p.nama AS nama_periode, s.tujuan_alamat, s.alasan_penolakan,
           s.disetujui_at AS disetujui, s.dibatalkan_at AS dibatalkan, b.nama_lengkap AS nama_pembatal
    ${DARI}
    JOIN periode p ON p.id = s.periode_id
    LEFT JOIN app_user b ON b.id = s.dibatalkan_oleh
    WHERE s.id = ${id}::uuid AND ${Prisma.join(terlihat(konteks), ' AND ')}`;
  if (!b) return null;
  const { periode_id, nama_periode, tujuan_alamat, alasan_penolakan, nama_pembatal, disetujui, dibatalkan } = b;
  const { disetujui: _a, dibatalkan: _b, ...baris } = rapikan(b) as BarisArsip & { disetujui?: unknown; dibatalkan?: unknown };
  void _a;
  void _b;
  return {
    ...baris,
    periode_id,
    nama_periode,
    tujuan_alamat,
    alasan_penolakan,
    nama_pembatal,
    disetujui_at: disetujui?.toISOString() ?? null,
    dibatalkan_at: dibatalkan?.toISOString() ?? null,
  };
}

/** Batas baris export Excel — satu periode HMIF ±300–600 surat (PRD §8.2). */
export const MAKS_EXPORT = 5000;

/** Seluruh baris yang cocok filter (tanpa kursor), untuk export. */
export async function semuaArsip(konteks: Konteks, f: FilterArsip): Promise<BarisArsip[]> {
  const baris = await db.$queryRaw<BarisMentah[]>`
    SELECT ${KOLOM} ${DARI}
    WHERE ${kondisi(konteks, { ...f, cursor: undefined })}
    ORDER BY s.tanggal_surat DESC, s.created_at DESC, s.id DESC
    LIMIT ${MAKS_EXPORT}`;
  return baris.map(rapikan);
}

// ---------------------------------------------------------------------------
// Pilihan filter
// ---------------------------------------------------------------------------

export interface PilihanFilter {
  periode: { id: string; nama: string; aktif: boolean }[];
  departemen: { id: string; nama: string }[];
  kegiatan: string[];
}

export async function pilihanFilterArsip(konteks: Konteks, periodeId: string): Promise<PilihanFilter> {
  const [periode, departemen, kegiatan] = await Promise.all([
    db.periode.findMany({
      where: { status: { in: ['AKTIF', 'ARSIP'] } },
      orderBy: { tanggal_mulai: 'desc' },
      select: { id: true, nama: true, status: true },
    }),
    db.departemen.findMany({
      where: lingkupKonteks(konteks, 'surat.read') === 'DEPARTEMEN' ? { id: { in: konteks.departemenIds } } : {},
      orderBy: { urutan: 'asc' },
      select: { id: true, nama: true },
    }),
    db.$queryRaw<{ kode: string }[]>`
      SELECT DISTINCT upper(kode_kegiatan) AS kode FROM surat
      WHERE periode_id = ${periodeId}::uuid AND kode_kegiatan <> '' ORDER BY 1 LIMIT 100`,
  ]);
  return {
    periode: periode.map((p) => ({ id: p.id, nama: p.nama, aktif: p.status === 'AKTIF' })),
    departemen,
    kegiatan: kegiatan.map((k) => k.kode),
  };
}
