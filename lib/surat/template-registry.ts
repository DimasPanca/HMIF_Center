/**
 * template-registry — daftar template DOCX, versinya di storage, dan barisnya
 * di `surat_template`. Server-only.
 *
 * Dua kelompok berkas, diperlakukan berbeda (ADR-027):
 *
 *   SURAT    7 berkas. Terdaftar di `surat_template`, versioned per baris:
 *            revisi menambah baris `versi + 1` dan menonaktifkan yang lama,
 *            supaya surat yang sudah terbit tetap dapat di-generate ulang
 *            persis dengan template yang dipakainya.
 *   DOKUMEN  4 berkas (TOR, Proposal, LPJ, Notulensi). Bukan surat — tidak
 *            punya kode 01–09, jadi tidak dapat masuk `surat_template`.
 *            Versinya konstanta di sini; isinya tidak pernah ditimpa.
 *
 * Fungsi `rencanakan*` murni supaya keputusan "unggah ulang atau tidak" dapat
 * diuji tanpa database maupun storage. `scripts/upload-templates.ts` yang
 * menjalankannya.
 *
 * Sumber: SYSTEM_DESIGN §4.8, §12.2 · docs/ai/tasks/P2-persuratan.md T-055 ·
 *         ADR-004, ADR-026, ADR-027
 */

import { createHash } from 'node:crypto';
import { db } from '@/lib/db/client';
import { serialisasiFieldSchema, type FieldSchemaTemplate, type JenisSurat, infoJenis } from '@/lib/surat/field-schemas';
import { keys } from '@/lib/storage';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/template-registry.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------------------------------------------------------------------------
// Daftar berkas
// ---------------------------------------------------------------------------

/** `slug` = nama berkas tanpa `.docx`; identitas template yang tetap lintas versi. */
export interface TemplateSurat {
  slug: string;
  jenis: JenisSurat;
}

export const TEMPLATE_SURAT: readonly TemplateSurat[] = [
  { slug: 'surat-02-keterangan-aktif', jenis: 'KETERANGAN_AKTIF' },
  { slug: 'surat-03-aspirasi', jenis: 'ASPIRASI' },
  { slug: 'surat-04-undangan-pemateri', jenis: 'UNDANGAN_PEMATERI' },
  { slug: 'surat-04-undangan-sambutan', jenis: 'UNDANGAN_SAMBUTAN' },
  { slug: 'surat-05-peminjaman-barang', jenis: 'PEMINJAMAN_BARANG' },
  { slug: 'surat-05-peminjaman-ruangan', jenis: 'PEMINJAMAN_RUANGAN' },
  { slug: 'surat-08-kerja-sama', jenis: 'KERJA_SAMA' },
];

export type JenisDokumen = 'TOR' | 'PROPOSAL' | 'LPJ' | 'NOTULENSI';

/**
 * Mengubah isi salah satu berkas ini WAJIB disertai menaikkan `versi`.
 * Skrip unggah menolak menimpa versi yang sudah ada dengan isi berbeda,
 * karena dokumen yang pernah di-generate dari versi itu tak dapat diulang lagi.
 */
export const TEMPLATE_DOKUMEN: readonly { slug: string; dokumen: JenisDokumen; versi: number }[] = [
  { slug: 'tor', dokumen: 'TOR', versi: 1 },
  { slug: 'proposal', dokumen: 'PROPOSAL', versi: 1 },
  { slug: 'lpj', dokumen: 'LPJ', versi: 1 },
  { slug: 'notulensi', dokumen: 'NOTULENSI', versi: 1 },
];

/**
 * Template umum ber-kop untuk surat tanpa contoh resmi: kode 01, 06, 07, 09
 * (ADR-028, ADR-029). Tidak punya baris `surat_template` — surat generik
 * menyimpan `template_id` NULL — jadi versinya konstanta, diperlakukan seperti
 * TEMPLATE_DOKUMEN: mengubah isinya WAJIB menaikkan `versi`.
 */
export const TEMPLATE_UMUM = { slug: 'surat-umum', versi: 1 } as const;

export function berkasTemplate(slug: string): string {
  return `${slug}.docx`;
}

export function kunciTemplateDokumen(dokumen: JenisDokumen): string {
  const t = TEMPLATE_DOKUMEN.find((d) => d.dokumen === dokumen)!;
  return keys.template(t.slug, t.versi);
}

export function hashIsi(isi: Buffer): string {
  return createHash('sha256').update(isi).digest('hex');
}

/**
 * JSON dengan kunci terurut. JSONB Postgres menyimpan ulang urutan kunci,
 * sehingga membandingkan `JSON.stringify` mentah akan selalu menganggap
 * `field_schema` berubah dan membuat versi baru di setiap jalan.
 */
export function jsonStabil(nilai: unknown): string {
  if (Array.isArray(nilai)) return `[${nilai.map(jsonStabil).join(',')}]`;
  if (nilai && typeof nilai === 'object') {
    const isi = Object.keys(nilai as object)
      .sort()
      .filter((k) => (nilai as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${jsonStabil((nilai as Record<string, unknown>)[k])}`);
    return `{${isi.join(',')}}`;
  }
  return JSON.stringify(nilai);
}

// ---------------------------------------------------------------------------
// Perencanaan — murni
// ---------------------------------------------------------------------------

export interface BarisTemplate {
  id: string;
  versi: number;
  storage_key: string;
  field_schema: unknown;
}

export type RencanaSurat =
  | { aksi: 'TETAP'; versi: number; kunci: string }
  /** Baris ada tetapi berkasnya belum pernah diunggah (seed 018): isi di tempat. */
  | { aksi: 'ADOPSI'; id: string; versi: number; kunci: string }
  | { aksi: 'VERSI_BARU'; dariId: string; versi: number; kunci: string }
  | { aksi: 'BARU'; versi: number; kunci: string };

export interface KeadaanSurat {
  slug: string;
  /** Baris aktif untuk (kode_surat, varian), bila ada. */
  aktif: BarisTemplate | null;
  /** Versi tertinggi yang pernah dipakai, termasuk baris nonaktif. */
  versiTertinggi: number;
  hashBerkas: string;
  /** Hash objek di `aktif.storage_key`; `null` bila objeknya tidak ada. */
  hashTersimpan: string | null;
  fieldSchema: FieldSchemaTemplate;
}

export function rencanakanSurat(k: KeadaanSurat): RencanaSurat {
  if (!k.aktif) {
    const versi = k.versiTertinggi + 1;
    return { aksi: 'BARU', versi, kunci: keys.template(k.slug, versi) };
  }

  const kunciAktif = keys.template(k.slug, k.aktif.versi);

  // Seed 018 mendaftarkan baris dengan storage_key bentuk lama dan
  // field_schema '{}' sebelum berkasnya ada. Belum ada surat yang dapat
  // memakainya, jadi mengisinya di tempat tidak menimpa apa pun.
  if (k.aktif.storage_key !== kunciAktif || k.hashTersimpan === null) {
    return { aksi: 'ADOPSI', id: k.aktif.id, versi: k.aktif.versi, kunci: kunciAktif };
  }

  const sama = k.hashTersimpan === k.hashBerkas && jsonStabil(k.aktif.field_schema) === jsonStabil(k.fieldSchema);
  if (sama) return { aksi: 'TETAP', versi: k.aktif.versi, kunci: kunciAktif };

  const versi = Math.max(k.versiTertinggi, k.aktif.versi) + 1;
  return { aksi: 'VERSI_BARU', dariId: k.aktif.id, versi, kunci: keys.template(k.slug, versi) };
}

export type RencanaDokumen =
  | { aksi: 'TETAP' | 'UNGGAH'; kunci: string }
  | { aksi: 'DITOLAK'; kunci: string; alasan: string };

/** Template ber-versi konstanta: TEMPLATE_DOKUMEN dan TEMPLATE_UMUM. */
export interface TemplateBerversi {
  slug: string;
  versi: number;
  /** Nama untuk pesan, mis. "TOR" atau "SURAT_UMUM". */
  label: string;
  /** Konstanta tempat versinya dinaikkan. */
  konstanta: 'TEMPLATE_DOKUMEN' | 'TEMPLATE_UMUM';
}

export function sebagaiBerversi(t: (typeof TEMPLATE_DOKUMEN)[number] | typeof TEMPLATE_UMUM): TemplateBerversi {
  return 'dokumen' in t
    ? { slug: t.slug, versi: t.versi, label: t.dokumen, konstanta: 'TEMPLATE_DOKUMEN' }
    : { slug: t.slug, versi: t.versi, label: 'SURAT_UMUM', konstanta: 'TEMPLATE_UMUM' };
}

export function rencanakanDokumen(
  t: (typeof TEMPLATE_DOKUMEN)[number] | typeof TEMPLATE_UMUM,
  hashBerkas: string,
  hashTersimpan: string | null,
): RencanaDokumen {
  const b = sebagaiBerversi(t);
  const kunci = keys.template(b.slug, b.versi);
  if (hashTersimpan === null) return { aksi: 'UNGGAH', kunci };
  if (hashTersimpan === hashBerkas) return { aksi: 'TETAP', kunci };
  return {
    aksi: 'DITOLAK',
    kunci,
    alasan: `Isi ${berkasTemplate(b.slug)} berbeda dari ${kunci} yang sudah ada. Naikkan versi ${b.label} di ${b.konstanta}.`,
  };
}

/** Isi `field_schema` yang disimpan untuk satu template surat. */
export function fieldSchemaUntuk(t: TemplateSurat): FieldSchemaTemplate {
  return serialisasiFieldSchema(t.jenis);
}

export function identitasSurat(t: TemplateSurat) {
  const info = infoJenis(t.jenis);
  // Selalu bertemplate: TEMPLATE_SURAT hanya memuat jenis bervarian.
  return { kode_surat: info.kode, varian: info.varian!, nama: info.nama };
}

// ---------------------------------------------------------------------------
// Pembacaan saat aplikasi berjalan — dipakai form (T-058) dan generator (T-061)
// ---------------------------------------------------------------------------

export interface TemplateAktif {
  id: string;
  kode_surat: string;
  varian: string;
  nama: string;
  versi: number;
  storage_key: string;
  field_schema: FieldSchemaTemplate;
}

/** Template aktif untuk satu jenis bertemplate; `null` untuk form generik. */
export async function templateAktif(jenis: JenisSurat): Promise<TemplateAktif | null> {
  const info = infoJenis(jenis);
  if (!info.varian) return null;
  const baris = await db.surat_template.findFirst({
    where: { kode_surat: info.kode, varian: info.varian, is_active: true },
    orderBy: { versi: 'desc' },
    select: { id: true, kode_surat: true, varian: true, nama: true, versi: true, storage_key: true, field_schema: true },
  });
  return baris ? { ...baris, field_schema: baris.field_schema as unknown as FieldSchemaTemplate } : null;
}

/** Template yang dipakai sebuah surat — bisa versi lama yang sudah nonaktif. */
export async function templateById(id: string): Promise<TemplateAktif | null> {
  const baris = await db.surat_template.findUnique({
    where: { id },
    select: { id: true, kode_surat: true, varian: true, nama: true, versi: true, storage_key: true, field_schema: true },
  });
  return baris ? { ...baris, field_schema: baris.field_schema as unknown as FieldSchemaTemplate } : null;
}
