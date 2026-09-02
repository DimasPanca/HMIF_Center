/**
 * Tetapan pipeline gambar.
 *
 * Angka-angka di sini bukan selera. Master 3000px cukup untuk membaca angka
 * pada nota belanja saat di-zoom; preview 1280px cukup untuk layar terbesar
 * tanpa memboroskan kuota; thumb 400px cukup untuk daftar.
 *
 * Kualitas master dibedakan foto dan dokumen karena artefak JPEG paling
 * merusak justru pada tepi tajam teks hitam di atas putih — dokumen butuh
 * 0.93 untuk tetap terbaca, sementara foto sudah bagus di 0.90.
 *
 * Sumber: SYSTEM_DESIGN §9.1, §9.2 · PRD F-11.2 (I1-I12) · docs/ai/tasks/P7-nota-lpj.md T-097
 */

export const KONFIG = {
  master: {
    maxDim: 3000,
    quality: { foto: 0.9, dokumen: 0.93 },
    type: 'image/jpeg',
    /**
     * Dipakai menggantikan JPEG bila gambar sumbernya bertransparansi (I8).
     * JPEG tidak mengenal alpha, dan memaksakannya membuat latar transparan
     * menjadi HITAM — persis yang dilarang daftar periksa PRD.
     */
    typeAlpha: 'image/webp',
  },
  preview: { maxDim: 1280, quality: 0.78, type: 'image/webp' },
  thumb: { maxDim: 400, quality: 0.7, type: 'image/webp' },
} as const;

/**
 * Ambang heuristik deteksi dokumen (SYSTEM_DESIGN §9.2).
 *
 * Dokumen hasil pindai didominasi putih kertas dengan sedikit nada tengah;
 * foto biasa punya sebaran nada yang jauh lebih rata.
 */
export const AMBANG = {
  /** Luminansi di atas ini dihitung sebagai "terang". */
  terang: 200,
  /** Luminansi di bawah ini dihitung sebagai "gelap". */
  gelap: 60,
  /** Rasio piksel terang minimum agar disebut DOKUMEN. */
  rasioTerangMin: 0.55,
  /** Rasio nada tengah maksimum agar disebut DOKUMEN. */
  rasioTengahMaks: 0.3,
  /** Sisi contoh untuk analisis histogram. */
  ukuranSampel: 128,
} as const;

/** Orientasi EXIF yang menukar sisi panjang dan lebar. */
export const ORIENTASI_TERPUTAR = [5, 6, 7, 8] as const;

export type JenisGambar = 'FOTO' | 'DOKUMEN';
