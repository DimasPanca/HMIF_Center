/**
 * Kontrak Storage Adapter.
 *
 * Gunanya satu: memindahkan backend penyimpanan tanpa menyentuh kode fitur.
 * Hari ini Supabase Storage; kelak mungkin Google Drive untuk arsip, disk
 * lokal saat pindah ke server kampus, atau S3 bila skalanya menuntut.
 *
 * Karena itu tidak ada satu pun kode fitur yang boleh memanggil
 * `supabase.storage` langsung, dan tidak ada satu pun path yang boleh ditulis
 * sebagai string literal di luar `keys.ts`.
 *
 * Sumber: SYSTEM_DESIGN §12, §12.1, §12.2 · §18.1 · docs/ai/tasks/P1-fondasi.md T-044
 */

/** Satu objek di storage, hasil `list()`. */
export interface StorageObject {
  /** Key lengkap termasuk prefix, siap dipakai `get()` atau `delete()`. */
  key: string;
  size: number;
  contentType: string | null;
  updatedAt: Date | null;
}

export interface OpsiPut {
  /**
   * Penegasan bahwa objek ini memang ditujukan ke bucket publik.
   *
   * Bukan penentu: bucket dipilih dari BENTUK KEY-nya (lihat `keys.ts`).
   * Bila nilai di sini bertentangan dengan key-nya, adapter menolak alih-alih
   * menuruti. Alasannya di `bucketUntuk()`.
   */
  public?: boolean;
  /** Menimpa objek yang sudah ada dengan key sama. Default false. */
  upsert?: boolean;
}

export interface StorageAdapter {
  put(
    key: string,
    data: Buffer | Blob,
    contentType: string,
    opts?: OpsiPut,
  ): Promise<{ key: string }>;

  get(key: string): Promise<Buffer>;

  /**
   * URL berbatas waktu untuk objek privat.
   *
   * `expiresInSeconds` sengaja WAJIB, bukan opsional dengan nilai bawaan.
   * Umur sebuah URL yang membocorkan nota keuangan adalah keputusan, dan
   * keputusan tidak boleh terjadi karena lupa. Pakai `DETIK_SIGNED_URL`
   * kecuali ada alasan yang bisa disebutkan.
   */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;

  /** URL permanen. Hanya sah untuk key bucket publik; selain itu melempar. */
  getPublicUrl(key: string): string;

  delete(key: string): Promise<void>;

  /** Rekursif. Prefix kosong berarti seluruh isi kedua bucket. */
  list(prefix: string): Promise<StorageObject[]>;

  exists(key: string): Promise<boolean>;
}

/**
 * Umur baku signed URL: 5 menit (SYSTEM_DESIGN §18.1).
 *
 * Cukup untuk membuka atau mengunduh satu berkas, terlalu pendek untuk
 * berguna bila URL-nya tersebar di grup WhatsApp.
 */
export const DETIK_SIGNED_URL = 300;

/**
 * Batas atas umur signed URL: 1 jam.
 *
 * Ditegakkan, bukan disarankan. Tanpa batas, satu pemanggilan dengan 86400
 * mengubah "berdurasi pendek" pada §18.1 menjadi tautan yang berlaku sehari
 * penuh — dan pelanggaran itu tidak akan pernah terlihat karena tidak ada
 * yang gagal.
 *
 * Butuh akses lebih lama? Ambil isinya lewat `get()` di server, jangan
 * memperpanjang URL-nya.
 */
export const MAKS_DETIK_SIGNED_URL = 3600;

/** Dilempar adapter yang memang belum diimplementasikan. */
export class NotImplementedError extends Error {
  constructor(adapter: string, method: string, kapan: string) {
    super(
      `${adapter}.${method}() belum diimplementasikan. ` +
        `Adapter ini disiapkan untuk ${kapan}. ` +
        `Sampai saat itu tiba, jalankan dengan STORAGE_DRIVER=supabase.`,
    );
    this.name = 'NotImplementedError';
  }
}

/** Dilempar bila key dan bucket yang diminta tidak cocok. */
export class SalahBucketError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = 'SalahBucketError';
  }
}
