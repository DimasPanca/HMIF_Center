/**
 * Implementasi `MesinGambar` untuk browser.
 *
 * Seluruh isi berkas ini memakai API yang hanya ada di browser:
 * `createImageBitmap`, `OffscreenCanvas`, dan `exifr`. Karena itu ia diimpor
 * secara malas oleh `client-pipeline.ts` — modul pipeline-nya sendiri harus
 * tetap dapat dimuat di Node agar dapat diuji.
 *
 * Sumber: SYSTEM_DESIGN §9.2 · docs/ai/tasks/P7-nota-lpj.md T-097
 */

import type { MesinGambar, SumberGambar } from './client-pipeline';

function kanvas(width: number, height: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error(
      'OffscreenCanvas tidak tersedia. Pipeline gambar sisi klien hanya ' +
        'berjalan di browser; di server pakai lib/images/server-validate.ts (T-098).',
    );
  }
  return new OffscreenCanvas(width, height);
}

function konteks(c: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Konteks 2D tidak dapat dibuat.');
  return ctx;
}

/** Membungkus ImageBitmap agar cocok dengan kontrak SumberGambar. */
function bungkus(bitmap: ImageBitmap): SumberGambar {
  return {
    width: bitmap.width,
    height: bitmap.height,
    close: () => {
      bitmap.close();
    },
  };
}

/** Menyimpan bitmap aslinya supaya dapat digambar ulang. */
const asli = new WeakMap<SumberGambar, ImageBitmap>();

function jadiSumber(bitmap: ImageBitmap): SumberGambar {
  const s = bungkus(bitmap);
  asli.set(s, bitmap);
  return s;
}

function ambilBitmap(s: SumberGambar): ImageBitmap {
  const b = asli.get(s);
  if (!b) throw new Error('SumberGambar ini bukan berasal dari mesin browser.');
  return b;
}

export function mesinBrowser(): MesinGambar {
  return {
    async decode(file) {
      // `from-image` meminta browser menerapkan orientasi EXIF sendiri.
      // Sebagian browser mengabaikannya; client-pipeline memeriksa hasilnya
      // dan memutar sendiri bila perlu.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return jadiSumber(bitmap);
    },

    async sampelPiksel(src, sisi) {
      const c = kanvas(sisi, sisi);
      const ctx = konteks(c);
      ctx.drawImage(ambilBitmap(src), 0, 0, sisi, sisi);
      return ctx.getImageData(0, 0, sisi, sisi).data;
    },

    async render(src, width, height, type, quality) {
      const c = kanvas(width, height);
      const ctx = konteks(c);

      // Penyusutan tanpa penghalusan menghasilkan tepi bergerigi yang
      // membuat teks pada nota menjadi sulit dibaca.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(ambilBitmap(src), 0, 0, width, height);
      return c.convertToBlob({ type, quality });
    },

    async punyaAlpha(file) {
      // PNG dan WebP dapat beralpha; JPEG tidak pernah. Pemeriksaan murah
      // ini cukup: yang mahal — memindai piksel — tidak sepadan untuk
      // keputusan yang hanya menentukan format master.
      return file.type === 'image/png' || file.type === 'image/webp';
    },

    async orientasi(file) {
      try {
        const exifr = (await import('exifr')).default;
        return (await exifr.orientation(file)) ?? 1;
      } catch {
        // Berkas tanpa EXIF, atau EXIF rusak. Keduanya berarti hal yang sama:
        // tidak ada instruksi rotasi. Gambar tetap harus diproses.
        return 1;
      }
    },

    async putar(src, derajat) {
      const b = ambilBitmap(src);
      const tegak = derajat === 90 || derajat === 270;
      const w = tegak ? b.height : b.width;
      const h = tegak ? b.width : b.height;

      const c = kanvas(w, h);
      const ctx = konteks(c);
      ctx.translate(w / 2, h / 2);
      ctx.rotate((derajat * Math.PI) / 180);
      ctx.drawImage(b, -b.width / 2, -b.height / 2);

      const blob = await c.convertToBlob({ type: 'image/png' });
      const bitmapBaru = await createImageBitmap(blob);
      return jadiSumber(bitmapBaru);
    },
  };
}
