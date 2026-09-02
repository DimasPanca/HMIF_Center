/**
 * Deteksi jenis gambar: foto biasa atau dokumen hasil pindai.
 *
 * Hasilnya menentukan kualitas master — dokumen 0.93, foto 0.90. Bedanya
 * tidak besar di angka tetapi besar di mata: artefak JPEG paling merusak
 * pada tepi tajam teks hitam di atas kertas putih.
 *
 * Heuristiknya sederhana dan memang seharusnya begitu. Ia berjalan di ponsel,
 * pada setiap unggahan, sebelum apa pun terlihat oleh pengguna. Salah tebak
 * pun akibatnya hanya kualitas master berbeda 0.03 — bukan kegagalan.
 *
 * Sumber: SYSTEM_DESIGN §9.2 · docs/ai/tasks/P7-nota-lpj.md T-097
 */

import { AMBANG, type JenisGambar } from './constants';

export interface Histogram {
  terang: number;
  gelap: number;
  tengah: number;
  total: number;
  rasioTerang: number;
  rasioTengah: number;
}

/**
 * Menghitung sebaran luminansi dari data piksel RGBA.
 *
 * Dipisah dari pengambilan pikselnya supaya dapat diuji dengan data
 * sungguhan tanpa canvas — dan supaya jelas bahwa ini fungsi murni.
 */
export function hitungHistogram(data: Uint8ClampedArray | number[]): Histogram {
  let terang = 0;
  let gelap = 0;
  let tengah = 0;

  for (let i = 0; i + 2 < data.length; i += 4) {
    // Luminansi persepsi ITU-R BT.601. Mata jauh lebih peka pada hijau
    // daripada biru, jadi rata-rata RGB biasa akan salah menilai gambar
    // berwarna dominan.
    const l = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;

    if (l > AMBANG.terang) terang++;
    else if (l < AMBANG.gelap) gelap++;
    else tengah++;
  }

  const total = terang + gelap + tengah;
  return {
    terang,
    gelap,
    tengah,
    total,
    rasioTerang: total === 0 ? 0 : terang / total,
    rasioTengah: total === 0 ? 0 : tengah / total,
  };
}

/**
 * Kesimpulan dari histogram.
 *
 * Dokumen: didominasi putih kertas DAN sedikit nada tengah. Kedua syarat
 * harus terpenuhi. Hanya syarat pertama tidak cukup — foto pantai siang hari
 * juga didominasi terang, tetapi penuh nada tengah pada pasir dan langit.
 */
export function jenisDariHistogram(h: Histogram): JenisGambar {
  if (h.total === 0) return 'FOTO';
  return h.rasioTerang > AMBANG.rasioTerangMin && h.rasioTengah < AMBANG.rasioTengahMaks
    ? 'DOKUMEN'
    : 'FOTO';
}

export function deteksiDariPiksel(data: Uint8ClampedArray | number[]): JenisGambar {
  return jenisDariHistogram(hitungHistogram(data));
}
