/**
 * Validasi gambar sisi server (T-098). Server-only.
 *
 * Tidak satu pun yang dikirim klien dipercaya: ukuran diukur dari byte, jenis
 * dari magic bytes (`file-type`, INV-21) — bukan ekstensi, bukan
 * `Content-Type` — dan keutuhannya dibuktikan dengan men-decode seluruh
 * piksel (I10). Berkas yang gagal di sini tidak pernah menyentuh storage.
 *
 * Sumber: T-098 · SYSTEM_DESIGN §9.3 · PRD F-11.2 (I5, I6, I7, I10, I11) · INV-21
 */

import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import { KONFIG } from '@/lib/images/constants';
import { MetadataRusakError, bersihkanMetadata } from '@/lib/images/strip-metadata';

if (typeof window !== 'undefined') {
  throw new Error('lib/images/server-validate.ts adalah modul server-only.');
}

/** ADR-014: batas ukuran unggahan. */
export const MAKS_BYTE = 15 * 1024 * 1024;
export const MIME_DITERIMA = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MimeGambar = (typeof MIME_DITERIMA)[number];

/** Penjaga bom dekompresi: 3000px master × rasio ekstrem masih jauh di bawah ini. */
const MAKS_PIKSEL = 40_000_000;

/** Toleransi pembulatan sisi panjang turunan dari pipeline klien. */
const TOLERANSI_DIM = 2;

export type PeranBerkas = 'master' | 'preview' | 'thumb';

const BATAS_DIM: Record<PeranBerkas, number> = {
  master: KONFIG.master.maxDim,
  preview: KONFIG.preview.maxDim,
  thumb: KONFIG.thumb.maxDim,
};

export const LABEL_PERAN: Record<PeranBerkas, string> = { master: 'Gambar utama', preview: 'Pratinjau', thumb: 'Thumbnail' };

export class FileTidakValidError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = 'FileTidakValidError';
  }
}

export interface GambarSah {
  isi: Buffer;
  mime: MimeGambar;
  ekstensi: 'jpg' | 'png' | 'webp';
  lebar: number;
  tinggi: number;
}

const EKSTENSI: Record<MimeGambar, GambarSah['ekstensi']> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Validasi satu berkas lalu buang metadatanya tanpa re-encode.
 * Melempar `FileTidakValidError` dengan pesan yang dapat ditampilkan.
 */
export async function validasiGambar(mentah: Buffer, peran: PeranBerkas): Promise<GambarSah> {
  const label = LABEL_PERAN[peran];
  if (mentah.length === 0) throw new FileTidakValidError(`${label} kosong.`);
  if (mentah.length > MAKS_BYTE) {
    throw new FileTidakValidError(`${label} berukuran ${(mentah.length / 1024 / 1024).toFixed(1)} MB, melebihi batas 15 MB.`);
  }

  const jenis = await fileTypeFromBuffer(mentah);
  if (!jenis || !(MIME_DITERIMA as readonly string[]).includes(jenis.mime)) {
    throw new FileTidakValidError(
      `${label} bukan gambar JPG, PNG, atau WEBP${jenis ? ` (terdeteksi ${jenis.ext.toUpperCase()})` : ''}. Nama berkas tidak menentukan jenisnya.`,
    );
  }
  const mime = jenis.mime as MimeGambar;

  let meta: sharp.Metadata;
  try {
    meta = await sharp(mentah, { limitInputPixels: MAKS_PIKSEL }).metadata();
  } catch {
    throw new FileTidakValidError(`${label} tidak dapat dibaca sebagai gambar.`);
  }
  if (!meta.width || !meta.height || meta.width < 1 || meta.height < 1) throw new FileTidakValidError(`${label} tidak memiliki dimensi yang sah.`);
  if (Math.max(meta.width, meta.height) > BATAS_DIM[peran] + TOLERANSI_DIM) {
    throw new FileTidakValidError(`${label} berukuran ${meta.width}×${meta.height}px, melebihi sisi maksimal ${BATAS_DIM[peran]}px.`);
  }
  // Pipeline klien sudah memutar piksel. Tag orientasi yang tersisa berarti
  // berkas tidak lewat pipeline: membuang EXIF-nya akan membuat nota miring.
  if (meta.orientation && meta.orientation > 1) {
    throw new FileTidakValidError(`${label} belum dinormalkan orientasinya. Unggah lewat aplikasi HMIF Center.`);
  }

  // Decode SELURUH piksel: metadata() hanya membaca kepala berkas, sehingga
  // JPEG terpotong separuh lolos di sana. failOn 'error' menolak data rusak.
  try {
    await sharp(mentah, { limitInputPixels: MAKS_PIKSEL, failOn: 'error' }).stats();
  } catch {
    throw new FileTidakValidError(`${label} rusak atau terpotong.`);
  }

  let isi: Buffer;
  try {
    isi = bersihkanMetadata(mentah, mime);
  } catch (e) {
    throw new FileTidakValidError(e instanceof MetadataRusakError ? `${label}: ${e.message}` : `${label} tidak dapat dibersihkan.`);
  }
  return { isi, mime, ekstensi: EKSTENSI[mime], lebar: meta.width, tinggi: meta.height };
}

/** Nama asli untuk header unduhan & tampilan: tanpa path, tanpa karakter kendali. */
export function sanitasiNamaBerkas(nama: string): string {
  const dasar = (nama.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"\\]/g, '').trim();
  const aman = dasar.replace(/^\.+/, '').slice(0, 200);
  return aman || 'nota.jpg';
}

/** Membaca ulang master dari storage dan memastikan dapat di-decode (T-098 #6). */
export async function verifikasiMaster(isi: Buffer, lebar: number, tinggi: number): Promise<void> {
  const m = await sharp(isi, { limitInputPixels: MAKS_PIKSEL, failOn: 'error' }).metadata();
  if (m.width !== lebar || m.height !== tinggi) throw new FileTidakValidError('Verifikasi master setelah disimpan gagal.');
}
