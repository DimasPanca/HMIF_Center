/**
 * Penyusun key storage — satu-satunya tempat path ditulis.
 *
 * ===========================================================================
 * KENAPA TIDAK BOLEH ADA STRING PATH DI LUAR BERKAS INI
 * ===========================================================================
 * Bukan soal kerapian. Bentuk key menentukan BUCKET, dan bucket menentukan
 * apakah sebuah berkas dapat dibuka siapa saja tanpa tautan bertanda tangan.
 *
 * Satu salah ketik pada `'nota/master/...'` menjadi `'nota/preview/...'`
 * memindahkan seluruh nota keuangan ke bucket publik, dan tidak ada yang
 * gagal saat itu terjadi. Selama pathnya hanya lahir dari fungsi di sini,
 * kesalahan itu mustahil.
 *
 * Sumber: SYSTEM_DESIGN §12.2 · INV-19, INV-21
 */

import { SalahBucketError } from './adapter';

export type NamaBucket = 'private' | 'public';

/** Ekstensi berkas gambar nota — daftar tertutup, bukan string bebas. */
export type EkstensiGambar = 'jpg' | 'png' | 'webp';

/**
 * Prefix yang tinggal di bucket PUBLIK. Selain yang terdaftar di sini,
 * segalanya privat.
 *
 * Daftar putih, bukan daftar hitam. Bila kelak ada jenis berkas baru dan
 * seseorang lupa mendaftarkannya, akibatnya berkas itu menjadi PRIVAT —
 * merepotkan, tetapi tidak membocorkan apa pun. Dengan daftar hitam,
 * kelalaian yang sama akan membuatnya terbuka.
 */
const PREFIX_PUBLIK = ['nota/preview/', 'nota/thumb/', 'avatar/', 'aset/'] as const;

/**
 * Bucket tempat sebuah key seharusnya berada, ditentukan dari bentuk key-nya
 * sendiri — bukan dari apa yang diminta pemanggil.
 */
export function bucketUntuk(key: string): NamaBucket {
  return PREFIX_PUBLIK.some((p) => key.startsWith(p)) ? 'public' : 'private';
}

/**
 * Memastikan permintaan pemanggil tidak bertentangan dengan bentuk key.
 *
 * Dipanggil setiap `put()`. Bila seseorang menulis
 * `put(keys.notaMaster(id), ..., { public: true })`, permintaan itu DITOLAK
 * alih-alih dituruti — karena menurutinya berarti menaruh master nota di
 * tempat yang dapat dibuka tanpa tautan bertanda tangan (INV-19).
 */
export function pastikanBucketCocok(key: string, mintaPublik?: boolean): NamaBucket {
  const seharusnya = bucketUntuk(key);
  if (mintaPublik === undefined) return seharusnya;

  const diminta: NamaBucket = mintaPublik ? 'public' : 'private';
  if (diminta !== seharusnya) {
    throw new SalahBucketError(
      `Key "${key}" termasuk bucket ${seharusnya}, tetapi diminta ${diminta}. ` +
        `Bucket ditentukan bentuk key-nya, bukan oleh pemanggil. ` +
        `Bila memang harus publik, pakai penyusun key yang benar di lib/storage/keys.ts.`,
    );
  }
  return seharusnya;
}

/** Menolak segmen yang dapat keluar dari direktorinya sendiri. */
function aman(segmen: string, nama: string): string {
  const s = String(segmen).trim();
  if (!s) throw new Error(`Segmen key "${nama}" kosong.`);
  if (s.includes('/') || s.includes('\\') || s.includes('..')) {
    throw new Error(
      `Segmen key "${nama}" mengandung karakter path: "${segmen}". ` +
        `Nilai ini datang dari data, dan path traversal di storage sama ` +
        `berbahayanya dengan di filesystem.`,
    );
  }
  return s;
}

/**
 * Seluruh key yang dikenal sistem.
 *
 * Nama fungsi mengikuti isi, bukan lokasi: `notaMaster` bukan `privateNota`.
 * Dengan begitu pemanggil tidak perlu tahu bucket mana pun.
 */
export const keys = {
  // --- Nota (SYSTEM_DESIGN §12.2) -----------------------------------------
  /** MASTER — hanya untuk unduhan, tidak pernah untuk ditampilkan (INV-19). */
  //  Ekstensi mengikuti jenis hasil sniffing server (T-098): master lazimnya
  //  JPEG, WebP bila sumbernya bertransparansi (I8).
  notaMaster: (uuid: string, ekstensi: EkstensiGambar = 'webp'): string => `nota/master/${aman(uuid, 'uuid')}.${ekstensi}`,
  notaPreview: (uuid: string, ekstensi: EkstensiGambar = 'webp'): string => `nota/preview/${aman(uuid, 'uuid')}.${ekstensi}`,
  notaThumb: (uuid: string, ekstensi: EkstensiGambar = 'webp'): string => `nota/thumb/${aman(uuid, 'uuid')}.${ekstensi}`,

  // --- Identitas ----------------------------------------------------------
  /** Tanda tangan. Privat: gambar tanda tangan orang adalah data pribadi. */
  ttd: (userId: string): string => `ttd/${aman(userId, 'userId')}.png`,
  avatar: (userId: string): string => `avatar/${aman(userId, 'userId')}.webp`,

  // --- Dokumen yang dihasilkan --------------------------------------------
  suratDocx: (suratId: string): string => `dokumen/surat/${aman(suratId, 'suratId')}.docx`,
  suratPdf: (suratId: string): string => `dokumen/surat/${aman(suratId, 'suratId')}.pdf`,
  proposalPdf: (kepanitiaanId: string): string =>
    `dokumen/proposal/${aman(kepanitiaanId, 'kepanitiaanId')}.pdf`,
  proposalDocx: (kepanitiaanId: string): string =>
    `dokumen/proposal/${aman(kepanitiaanId, 'kepanitiaanId')}.docx`,
  torDocx: (kepanitiaanId: string): string =>
    `dokumen/tor/${aman(kepanitiaanId, 'kepanitiaanId')}.docx`,
  lpjPdf: (kepanitiaanId: string): string =>
    `dokumen/lpj/${aman(kepanitiaanId, 'kepanitiaanId')}.pdf`,
  lpjDocx: (kepanitiaanId: string): string =>
    `dokumen/lpj/${aman(kepanitiaanId, 'kepanitiaanId')}.docx`,
  rabXlsx: (kepanitiaanId: string): string =>
    `dokumen/rab/${aman(kepanitiaanId, 'kepanitiaanId')}.xlsx`,

  // --- Lampiran kendala (T-082) — PRIVAT, bukan di PREFIX_PUBLIK ------------
  kendalaLampiran: (kendalaId: string, lampiranId: string, ekstensi: string): string =>
    `kendala/${aman(kendalaId, 'kendalaId')}/${aman(lampiranId, 'lampiranId')}.${aman(ekstensi, 'ekstensi')}`,

  // --- Template dan aset ---------------------------------------------------
  template: (templateId: string, versi: number): string =>
    `template/${aman(templateId, 'templateId')}_v${Math.trunc(versi)}.docx`,
  aset: (namaBerkas: string): string => `aset/${aman(namaBerkas, 'namaBerkas')}`,

  // --- Backup --------------------------------------------------------------
  backup: (backupId: string, berkas: string): string =>
    `backup/${aman(backupId, 'backupId')}/${aman(berkas, 'berkas')}`,
  backupPrefix: (backupId: string): string => `backup/${aman(backupId, 'backupId')}/`,

  // --- Prefix untuk list() -------------------------------------------------
  prefixNotaMaster: 'nota/master/',
  prefixDokumenSurat: 'dokumen/surat/',
  prefixTemplate: 'template/',
} as const;
