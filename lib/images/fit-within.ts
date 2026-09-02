/**
 * Perhitungan ukuran turunan.
 *
 * Dua aturan yang tidak boleh dilanggar, keduanya invariant:
 *
 *   INV-22  TIDAK PERNAH upscale. Memperbesar gambar 800px menjadi 3000px
 *           tidak menambah satu pun detail, hanya memperbesar berkasnya dan
 *           membuat hasilnya terlihat lebih buruk daripada aslinya.
 *
 *   I12     Aspect ratio tidak pernah dipaksa. Tidak ada crop ke 1:1 —
 *           nota belanja yang dipotong menjadi kotak kehilangan bagian
 *           totalnya, dan itu justru bagian yang dibutuhkan.
 *
 * Sumber: SYSTEM_DESIGN §9.2 · PRD F-11.2 I12 · INV-22
 */

export interface Ukuran {
  width: number;
  height: number;
}

export function fitWithin(w: number, h: number, maxDim: number): Ukuran {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error(`Dimensi gambar tidak masuk akal: ${w}x${h}`);
  }

  // Sudah muat: dikembalikan apa adanya. Inilah yang mencegah upscale.
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };

  const ratio = Math.min(maxDim / w, maxDim / h);

  // Math.max(1, ...) menjaga gambar yang sangat panjang dan tipis — misalnya
  // struk kasir 4000x120 — dari menghasilkan tinggi 0, yang akan membuat
  // canvas menolak dan seluruh unggahan gagal.
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
  };
}
