/**
 * Storage Adapter untuk Supabase Storage — implementasi yang dipakai MVP.
 *
 * Memakai SECRET KEY, jadi modul ini server-only dan berjalan melewati policy
 * Storage. Otorisasi siapa boleh membaca apa dikerjakan lapisan service
 * sebelum memanggil adapter, bukan oleh Storage itu sendiri.
 *
 * Sumber: SYSTEM_DESIGN §12, §12.2 · §18.1 · docs/ai/tasks/P1-fondasi.md T-044
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  MAKS_DETIK_SIGNED_URL,
  NotImplementedError,
  SalahBucketError,
  type OpsiPut,
  type StorageAdapter,
  type StorageObject,
} from './adapter';
import { bucketUntuk, pastikanBucketCocok, type NamaBucket } from './keys';

if (typeof window !== 'undefined') {
  throw new Error('lib/storage/supabase-adapter.ts memegang secret key dan server-only.');
}

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) {
    throw new Error(`Environment variable ${nama} belum diisi. Jalankan: npm run check:env`);
  }
  return nilai;
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly disuntik: SupabaseClient | undefined;
  private siap: { klien: SupabaseClient; bucket: Record<NamaBucket, string>; urlDasar: string } | null =
    null;

  /**
   * Constructor sengaja TIDAK membaca environment variable.
   *
   * Ditemukan lane ui: `npm run verify` di worktree mereka gagal pada
   * "SUPABASE_SECRET_KEY belum diisi" — padahal test yang gagal hanya
   * memeriksa `buatAdapter('supabase').constructor.name`. Worktree itu
   * memang sengaja diberi .env.local tanpa secret key (hak minimum), dan
   * sekadar MEMILIH driver seharusnya tidak menuntut kredensial.
   *
   * Akibatnya bukan hanya di test. `next build` mengevaluasi modul yang
   * diimpor; satu halaman yang mengimpor tipe dari sini akan menggagalkan
   * build Vercel bila env-nya belum lengkap, dengan pesan yang menunjuk ke
   * dalam node_modules.
   *
   * Env dibaca saat method pertama dipanggil. Kegagalannya tetap keras dan
   * tetap menyebut nama variabelnya — hanya terjadi pada saat yang benar.
   */
  constructor(klien?: SupabaseClient) {
    this.disuntik = klien;
  }

  private konteks(): { klien: SupabaseClient; bucket: Record<NamaBucket, string>; urlDasar: string } {
    if (this.siap) return this.siap;

    const urlDasar = wajib('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
    const klien =
      this.disuntik ??
      createClient(urlDasar, wajib('SUPABASE_SECRET_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
      });

    this.siap = {
      klien,
      urlDasar,
      bucket: {
        private: process.env.STORAGE_BUCKET_PRIVATE ?? 'private',
        public: process.env.STORAGE_BUCKET_PUBLIC ?? 'public',
      },
    };
    return this.siap;
  }

  /** Nama bucket sesungguhnya untuk sebuah key. */
  private bucketNyata(key: string): string {
    return this.konteks().bucket[bucketUntuk(key)];
  }

  async put(
    key: string,
    data: Buffer | Blob,
    contentType: string,
    opts?: OpsiPut,
  ): Promise<{ key: string }> {
    // Menolak lebih dulu bila key dan permintaan pemanggil bertentangan.
    // Lihat alasannya di keys.pastikanBucketCocok().
    const jenis = pastikanBucketCocok(key, opts?.public);

    const { error } = await this.konteks().klien.storage.from(this.konteks().bucket[jenis]).upload(key, data, {
      contentType,
      upsert: opts?.upsert ?? false,
    });

    if (error) throw new Error(`Gagal mengunggah "${key}" ke bucket ${jenis}: ${error.message}`);
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    // Objek bucket publik dibaca lewat URL publiknya, BUKAN `download()`.
    //
    // `download()` meminta `/storage/v1/object/{bucket}/{key}`. Bucket publik
    // HMIF bernama `public`, sehingga jalurnya menjadi `/object/public/aset/…`
    // — persis rute objek-publik Storage, yang membaca segmen berikutnya
    // ("aset") sebagai nama bucket dan menjawab "Bucket not found". Ditemukan
    // T-061 saat generator membaca aset stempel; setiap get() ke bucket publik
    // gagal dengan cara yang sama sejak T-044.
    if (bucketUntuk(key) === 'public') {
      const r = await fetch(this.getPublicUrl(key), { cache: 'no-store' });
      if (!r.ok) throw new Error(`Gagal mengambil "${key}": HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    }

    const { data, error } = await this.konteks().klien.storage.from(this.bucketNyata(key)).download(key);
    if (error || !data) {
      throw new Error(`Gagal mengambil "${key}": ${error?.message ?? 'objek kosong'}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error(`expiresInSeconds harus angka positif, diterima: ${expiresInSeconds}`);
    }
    if (expiresInSeconds > MAKS_DETIK_SIGNED_URL) {
      throw new Error(
        `Umur signed URL ${expiresInSeconds} detik melebihi batas ${MAKS_DETIK_SIGNED_URL}. ` +
          `SYSTEM_DESIGN §18.1 menetapkan tautan berdurasi pendek; untuk akses lebih ` +
          `lama ambil isinya lewat get() di server, jangan memperpanjang URL-nya.`,
      );
    }

    const { data, error } = await this.konteks()
      .klien.storage.from(this.bucketNyata(key))
      .createSignedUrl(key, Math.trunc(expiresInSeconds));

    if (error || !data) {
      throw new Error(`Gagal membuat signed URL "${key}": ${error?.message ?? 'kosong'}`);
    }
    return data.signedUrl;
  }

  async getSignedUrls(keys: string[], expiresInSeconds: number): Promise<Map<string, string>> {
    const hasil = new Map<string, string>();
    if (!keys.length) return hasil;
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > MAKS_DETIK_SIGNED_URL) {
      throw new Error(`expiresInSeconds harus 1–${MAKS_DETIK_SIGNED_URL}, diterima: ${expiresInSeconds}`);
    }
    const perBucket = new Map<string, string[]>();
    for (const k of new Set(keys)) {
      const b = this.bucketNyata(k);
      perBucket.set(b, [...(perBucket.get(b) ?? []), k]);
    }
    for (const [bucket, daftar] of perBucket) {
      const { data, error } = await this.konteks().klien.storage.from(bucket).createSignedUrls(daftar, Math.trunc(expiresInSeconds));
      if (error || !data) throw new Error(`Gagal membuat signed URL batch: ${error?.message ?? 'kosong'}`);
      for (const d of data) if (d.path && d.signedUrl && !d.error) hasil.set(d.path, d.signedUrl);
    }
    return hasil;
  }

  getPublicUrl(key: string): string {
    // Objek privat TIDAK punya URL publik. Mengembalikan sesuatu yang
    // berbentuk URL tetapi selalu ditolak server hanya memindahkan
    // kegagalannya ke tempat yang lebih sulit dilacak — biasanya ke gambar
    // yang tidak muncul di halaman, tanpa pesan apa pun.
    if (bucketUntuk(key) !== 'public') {
      throw new SalahBucketError(
        `"${key}" berada di bucket privat dan tidak punya URL publik. ` +
          `Pakai getSignedUrl(key, DETIK_SIGNED_URL).`,
      );
    }
    const { urlDasar, bucket } = this.konteks();
    return `${urlDasar}/storage/v1/object/public/${bucket.public}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.konteks().klien.storage.from(this.bucketNyata(key)).remove([key]);
    if (error) throw new Error(`Gagal menghapus "${key}": ${error.message}`);
  }

  /**
   * Daftar objek di bawah sebuah prefix, REKURSIF.
   *
   * Supabase `list()` hanya mengembalikan satu tingkat dan menandai folder
   * dengan `id: null`. Tanpa penelusuran di bawah ini, `list('backup/')`
   * mengembalikan nama-nama folder alih-alih berkasnya — dan kode pemanggil
   * yang mengira sudah memegang daftar berkas akan diam-diam melewatkan
   * semuanya.
   */
  async list(prefix: string): Promise<StorageObject[]> {
    const { bucket } = this.konteks();
    // Prefix kosong = isi KEDUA bucket (kontrak adapter); dipakai backup (T-110).
    // Objek yang tersimpan di bucket yang TIDAK sesuai bentuk key-nya (sisa uji
    // lama) tak terjangkau `get()` — bucket selalu diturunkan dari key — jadi
    // tidak dilaporkan.
    if (!prefix) {
      const [privat, publik] = await Promise.all([this.telusuri(bucket.private, ''), this.telusuri(bucket.public, '')]);
      return [...privat.filter((o) => bucketUntuk(o.key) === 'private'), ...publik.filter((o) => bucketUntuk(o.key) === 'public')];
    }
    return this.telusuri(bucket[bucketUntuk(prefix)], prefix);
  }

  private async telusuri(bucket: string, prefix: string): Promise<StorageObject[]> {
    const hasil: StorageObject[] = [];
    const jalur = prefix.replace(/\/+$/, '');

    // Satu panggilan list dibatasi satu halaman; nota/master melewati 1000
    // berkas dalam satu periode — tanpa paging sisanya diam-diam terlewat.
    const HALAMAN = 1000;
    const data = [];
    for (let offset = 0; ; offset += HALAMAN) {
      const r = await this.konteks().klien.storage.from(bucket).list(jalur, { limit: HALAMAN, offset });
      if (r.error) throw new Error(`Gagal mendaftar "${prefix}": ${r.error.message}`);
      data.push(...(r.data ?? []));
      if (!r.data || r.data.length < HALAMAN) break;
    }

    for (const item of data) {
      const key = jalur ? `${jalur}/${item.name}` : item.name;

      // id === null menandai folder, bukan objek.
      if (item.id === null) {
        hasil.push(...(await this.telusuri(bucket, `${key}/`)));
        continue;
      }

      const meta = item.metadata as { size?: number; mimetype?: string } | null;
      hasil.push({
        key,
        size: meta?.size ?? 0,
        contentType: meta?.mimetype ?? null,
        updatedAt: item.updated_at ? new Date(item.updated_at) : null,
      });
    }
    return hasil;
  }

  async exists(key: string): Promise<boolean> {
    const potong = key.lastIndexOf('/');
    const folder = potong === -1 ? '' : key.slice(0, potong);
    const nama = potong === -1 ? key : key.slice(potong + 1);

    const { data, error } = await this.konteks()
      .klien.storage.from(this.bucketNyata(key))
      .list(folder, { limit: 1, search: nama });

    if (error) throw new Error(`Gagal memeriksa "${key}": ${error.message}`);
    return (data ?? []).some((o) => o.name === nama);
  }
}

/** Dipakai adapter stub supaya pesannya seragam. */
export { NotImplementedError };
