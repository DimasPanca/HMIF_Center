/**
 * URL tampilan gambar nota — HANYA thumb & preview. Server-only.
 *
 * Sengaja tidak ada `master`: master hanya keluar lewat
 * `/api/images/[id]/download` yang memeriksa hak (INV-19, INV-24).
 *
 * ADR-011: thumb & preview berada di bucket PRIVAT — URL-nya signed URL
 * 5 menit, dibuat sekaligus untuk satu halaman (`urlGambarNotaBanyak`).
 * Pemanggil hanya boleh memanggilnya untuk nota yang sudah lolos pemeriksaan
 * hak baca (service nota/verifikasi/LPJ).
 *
 * Sumber: T-099 · T-113 · SYSTEM_DESIGN §9.5 · ADR-011 · INV-24
 */

import { urlBertanda } from '@/lib/storage';

if (typeof window !== 'undefined') {
  throw new Error('lib/images/url-gambar.ts adalah modul server-only.');
}

export interface UrlGambarNota {
  id: string;
  thumbUrl: string;
  previewUrl: string;
  alt: string;
}

type SumberGambar = {
  id: string;
  thumbnail_path: string;
  preview_path: string;
  original_filename: string;
};

export async function urlGambarNotaBanyak(daftar: SumberGambar[]): Promise<UrlGambarNota[]> {
  const url = await urlBertanda(daftar.flatMap((g) => [g.thumbnail_path, g.preview_path]));
  return daftar.map((g) => ({
    id: g.id,
    thumbUrl: url.get(g.thumbnail_path) ?? '',
    previewUrl: url.get(g.preview_path) ?? '',
    alt: `Nota ${g.original_filename}`,
  }));
}

export async function urlGambarNota(g: SumberGambar): Promise<UrlGambarNota> {
  return (await urlGambarNotaBanyak([g]))[0]!;
}
