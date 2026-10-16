/**
 * Klien: foto nota → pipeline T-097 (satu decode, tiga turunan) →
 * POST /api/images/upload (T-098). Mengembalikan id gambar untuk nota dan URL
 * objek pratinjau lokal (tanpa unduh ulang dari server).
 */

import { processImage } from '@/lib/images/client-pipeline';

export interface HasilUnggahGambar {
  imageId: string;
  urlPratinjau: string;
}

export class GagalUnggahGambar extends Error {}

export async function unggahFotoNota(
  berkas: Blob,
  terpindai: boolean,
  namaAsli = 'nota.jpg',
): Promise<HasilUnggahGambar> {
  const h = await processImage(berkas, { scanned: terpindai });
  const form = new FormData();
  form.append('master', h.master.blob, 'master');
  form.append('preview', h.preview.blob, 'preview');
  form.append('thumb', h.thumb.blob, 'thumb');
  form.append('original_width', String(h.originalWidth));
  form.append('original_height', String(h.originalHeight));
  form.append('original_mime_type', h.originalMime || 'image/jpeg');
  form.append('kind', h.kind);
  form.append('is_scanned', String(h.isScanned));
  form.append('original_filename', h.originalName || namaAsli);
  const r = await fetch('/api/images/upload', { method: 'POST', body: form });
  const b = (await r.json().catch(() => null)) as
    { ok: true; data: { id: string } } | { ok: false; error?: { message?: string } } | null;
  if (!r.ok || !b?.ok)
    throw new GagalUnggahGambar(
      (b && !b.ok && b.error?.message) || 'Foto nota gagal diunggah. Coba lagi.',
    );
  return { imageId: b.data.id, urlPratinjau: URL.createObjectURL(h.preview.blob) };
}
