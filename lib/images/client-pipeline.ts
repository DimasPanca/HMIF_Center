/**
 * Pipeline gambar sisi klien.
 *
 * Satu berkas dari kamera ponsel masuk, tiga turunan keluar: master untuk
 * diunduh, preview untuk dilihat, thumb untuk daftar. Seluruhnya dikerjakan
 * di perangkat pengguna supaya yang terkirim ke server sudah ringan.
 *
 * ===========================================================================
 * TIGA KOREKSI TERHADAP SYSTEM_DESIGN §9.2
 * ===========================================================================
 *
 * 1. `bitmap.close()` DIPANGGIL SEBELUM `bitmap.width` DIBACA.
 *    Contoh di dokumen menutup bitmap lalu memakai `bitmap.width` dan
 *    `bitmap.height` pada objek kembaliannya. Setelah `close()`, keduanya
 *    menjadi 0 — jadi setiap baris `image` akan tersimpan dengan dimensi asli
 *    0x0, dan CHECK `master_valid` di migrasi 007 akan menolaknya. Di sini
 *    dimensinya dicatat lebih dulu.
 *
 * 2. TRANSPARANSI DIPAKSA KE JPEG.
 *    CONFIG di dokumen menetapkan master selalu `image/jpeg`. JPEG tidak
 *    mengenal alpha, sehingga PNG bertransparansi berubah menjadi latar
 *    HITAM — persis yang dilarang daftar periksa PRD (I8). Di sini master
 *    beralih ke WebP lossless bila sumbernya beralpha.
 *
 * 3. ORIENTASI EXIF DIBACA TETAPI TIDAK PERNAH DIPAKAI.
 *    Dokumen memanggil `exifr.orientation()` lalu mengandalkan
 *    `imageOrientation: 'from-image'`. Pada browser yang mengabaikan opsi itu,
 *    foto potret dari ponsel akan tersimpan MIRING dan tidak ada yang gagal.
 *    Di sini nilai exifr dipakai untuk memeriksa apakah rotasi benar-benar
 *    terjadi, dan memutarnya sendiri bila tidak.
 *
 * INV-18 adalah alasan bentuk fungsi ini: tiga turunan dibuat PARALEL dari
 * satu bitmap yang sama. Merantainya (master -> preview) berarti preview
 * mewarisi seluruh artefak kompresi master, lalu thumb mewarisi artefak
 * keduanya. Kerugian itu tidak dapat dikembalikan.
 *
 * Sumber: SYSTEM_DESIGN §9.1, §9.2 · PRD F-11.2 (I1-I12) · INV-18, INV-20, INV-22
 */

import { KONFIG, ORIENTASI_TERPUTAR, type JenisGambar } from './constants';
import { deteksiDariPiksel } from './detect-kind';
import { fitWithin } from './fit-within';

/** Sumber gambar yang sudah di-decode, cukup untuk seluruh pipeline. */
export interface SumberGambar {
  width: number;
  height: number;
  close(): void;
}

/**
 * Primitif yang bergantung platform.
 *
 * Dipisah bukan demi abstraksi, melainkan supaya pipeline ini dapat diuji
 * dengan gambar sungguhan di Node — `createImageBitmap` dan `OffscreenCanvas`
 * tidak ada di sana. Yang diuji tetap logika yang sama persis dengan yang
 * berjalan di browser.
 */
export interface MesinGambar {
  decode(file: Blob): Promise<SumberGambar>;
  /** Piksel RGBA hasil penyusutan ke `sisi` x `sisi`, untuk histogram. */
  sampelPiksel(src: SumberGambar, sisi: number): Promise<Uint8ClampedArray>;
  render(
    src: SumberGambar,
    width: number,
    height: number,
    type: string,
    quality: number,
  ): Promise<Blob>;
  /** Apakah berkas sumbernya punya kanal alpha. */
  punyaAlpha(file: Blob): Promise<boolean>;
  /** Orientasi EXIF, 1 bila tidak ada. */
  orientasi(file: Blob): Promise<number>;
  /** Memutar sumber searah jarum jam sebanyak `derajat`. */
  putar(src: SumberGambar, derajat: 90 | 180 | 270): Promise<SumberGambar>;
}

export interface Turunan {
  blob: Blob;
  width: number;
  height: number;
  type: string;
}

export interface HasilPipeline {
  master: Turunan;
  preview: Turunan;
  thumb: Turunan;
  kind: JenisGambar;
  originalName: string;
  originalMime: string;
  originalWidth: number;
  originalHeight: number;
  isScanned: boolean;
}

export interface OpsiPipeline {
  scanned?: boolean;
  mesin?: MesinGambar;
}

/**
 * Derajat putaran yang perlu diterapkan sendiri, bila browser mengabaikan
 * `imageOrientation: 'from-image'`.
 *
 * Dikembalikan 0 bila tidak perlu — termasuk saat browser SUDAH memutarnya,
 * yang dikenali dari sisi bitmap yang tertukar dibanding yang tercatat EXIF.
 */
export function derajatKoreksi(
  orientasi: number,
  lebarSetelahDecode: number,
  tinggiSetelahDecode: number,
): 0 | 90 | 180 | 270 {
  const terputar = (ORIENTASI_TERPUTAR as readonly number[]).includes(orientasi);

  // Browser sudah memutar: bitmap potret padahal EXIF bilang lanskap terputar.
  // Tidak ada yang perlu dikerjakan.
  if (terputar && tinggiSetelahDecode > lebarSetelahDecode) return 0;

  if (!terputar) return orientasi === 3 ? 180 : 0;
  return orientasi === 6 ? 90 : orientasi === 8 ? 270 : 90;
}

export async function processImage(
  file: File | Blob,
  opts: OpsiPipeline = {},
): Promise<HasilPipeline> {
  const mesin = opts.mesin ?? (await mesinBrowser());

  // 1. Orientasi dibaca SEBELUM apa pun. Setelah gambar di-decode dan
  //    dirender ke canvas, metadatanya sudah hilang.
  const orientasi = await mesin.orientasi(file);
  const beralpha = await mesin.punyaAlpha(file);

  // 2. Decode SEKALI. Inilah sumber tunggal ketiga turunan (INV-18).
  let sumber = await mesin.decode(file);

  try {
    // 3. Rotasi susulan hanya bila browser tidak mengerjakannya (INV-20).
    const koreksi = derajatKoreksi(orientasi, sumber.width, sumber.height);
    if (koreksi !== 0) {
      const diputar = await mesin.putar(sumber, koreksi);
      sumber.close();
      sumber = diputar;
    }

    // 4. Dimensi dicatat SEKARANG, selagi bitmap masih hidup. Membacanya
    //    setelah close() menghasilkan 0 — lihat koreksi 1 di kepala berkas.
    const originalWidth = sumber.width;
    const originalHeight = sumber.height;

    const piksel = await mesin.sampelPiksel(sumber, 128);
    const kind = deteksiDariPiksel(piksel);

    // Gambar beralpha tidak boleh dipaksa ke JPEG (I8).
    const tipeMaster = beralpha ? KONFIG.master.typeAlpha : KONFIG.master.type;
    const kualitasMaster = beralpha
      ? 1 // WebP lossless: transparansi tidak boleh ikut terkompresi rugi
      : KONFIG.master.quality[kind === 'DOKUMEN' ? 'dokumen' : 'foto'];

    const rencana = [
      { maxDim: KONFIG.master.maxDim, type: tipeMaster, quality: kualitasMaster },
      { maxDim: KONFIG.preview.maxDim, type: KONFIG.preview.type, quality: KONFIG.preview.quality },
      { maxDim: KONFIG.thumb.maxDim, type: KONFIG.thumb.type, quality: KONFIG.thumb.quality },
    ] as const;

    // 5. PARALEL dari bitmap yang sama, tidak berantai (INV-18).
    const [master, preview, thumb] = await Promise.all(
      rencana.map(async (r): Promise<Turunan> => {
        const { width, height } = fitWithin(originalWidth, originalHeight, r.maxDim);
        const blob = await mesin.render(sumber, width, height, r.type, r.quality);
        return { blob, width, height, type: r.type };
      }),
    );

    return {
      master: master!,
      preview: preview!,
      thumb: thumb!,
      kind,
      originalName: 'name' in file ? file.name : '',
      originalMime: file.type,
      originalWidth,
      originalHeight,
      isScanned: Boolean(opts.scanned),
    };
  } finally {
    // 6. Selalu ditutup, termasuk saat render gagal di tengah jalan. Ponsel
    //    kelas bawah kehabisan memori setelah beberapa unggahan bila bitmap
    //    seukuran 4032x3024 dibiarkan menggantung.
    sumber.close();
  }
}

/**
 * Implementasi browser. Diimpor malas supaya modul ini tetap dapat dimuat di
 * Node — test menyuntikkan mesinnya sendiri dan tidak pernah menyentuh ini.
 */
async function mesinBrowser(): Promise<MesinGambar> {
  const { mesinBrowser: buat } = await import('./browser-engine');
  return buat();
}
