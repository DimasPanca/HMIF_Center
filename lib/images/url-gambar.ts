/**
 * URL tampilan gambar nota — HANYA thumb & preview (bucket publik). Server-only.
 *
 * Sengaja tidak ada `master`: master hanya keluar lewat
 * `/api/images/[id]/download` yang memeriksa hak (INV-19, INV-24).
 *
 * Sumber: T-099 · SYSTEM_DESIGN §9.5 · INV-24
 */

import { storage } from '@/lib/storage';

if (typeof window !== 'undefined') {
  throw new Error('lib/images/url-gambar.ts adalah modul server-only.');
}

export interface UrlGambarNota {
  id: string;
  thumbUrl: string;
  previewUrl: string;
  alt: string;
}

export function urlGambarNota(g: { id: string; thumbnail_path: string; preview_path: string; original_filename: string }): UrlGambarNota {
  return {
    id: g.id,
    thumbUrl: storage.getPublicUrl(g.thumbnail_path),
    previewUrl: storage.getPublicUrl(g.preview_path),
    alt: `Nota ${g.original_filename}`,
  };
}
