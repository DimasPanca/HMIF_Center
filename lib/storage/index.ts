/**
 * Pintu masuk storage — satu-satunya yang diimpor kode fitur.
 *
 *     import { storage, keys, DETIK_SIGNED_URL } from '@/lib/storage';
 *
 *     await storage.put(keys.notaMaster(uuid), buf, 'image/webp');
 *     const url = await storage.getSignedUrl(keys.notaMaster(uuid), DETIK_SIGNED_URL);
 *
 * Kode fitur TIDAK PERNAH mengimpor `supabase-adapter` atau adapter lain
 * secara langsung, dan tidak pernah menulis path sebagai string. Dengan
 * begitu mengganti STORAGE_DRIVER benar-benar cukup mengubah satu baris
 * environment — bukan mencari-cari pemanggilan yang tersebar.
 *
 * Sumber: SYSTEM_DESIGN §12.1 · docs/ai/tasks/P1-fondasi.md T-044
 */

import type { StorageAdapter } from './adapter';
import { GoogleDriveAdapter } from './gdrive-adapter';
import { LocalDiskAdapter } from './local-adapter';
import { S3Adapter } from './s3-adapter';
import { SupabaseStorageAdapter } from './supabase-adapter';

export {
  DETIK_SIGNED_URL,
  MAKS_DETIK_SIGNED_URL,
  NotImplementedError,
  SalahBucketError,
  type OpsiPut,
  type StorageAdapter,
  type StorageObject,
} from './adapter';

export { bucketUntuk, keys, type NamaBucket } from './keys';

export function buatAdapter(driver = process.env.STORAGE_DRIVER): StorageAdapter {
  switch (driver) {
    case 'gdrive':
      return new GoogleDriveAdapter();
    case 'local':
      return new LocalDiskAdapter();
    case 's3':
      return new S3Adapter();
    case undefined:
    case '':
    case 'supabase':
      return new SupabaseStorageAdapter();
    default:
      // Salah ketik pada nama driver jangan diam-diam jatuh ke Supabase.
      // Deployment yang dikira memakai S3 tetapi sebenarnya menulis ke
      // Supabase adalah kegagalan yang baru ketahuan saat mencari berkas
      // yang tidak ada di tempat yang dikira.
      throw new Error(
        `STORAGE_DRIVER="${driver}" tidak dikenal. ` +
          `Pilihannya: supabase (bawaan), gdrive, local, s3.`,
      );
  }
}

// Malas, bukan langsung. Adapter Supabase menuntut NEXT_PUBLIC_SUPABASE_URL
// dan SUPABASE_SECRET_KEY sudah ada saat dibuat; membuatnya di module scope
// akan menggagalkan `next build` di berkas mana pun yang sekadar mengimpor
// tipe dari sini.
let instans: StorageAdapter | null = null;

export const storage: StorageAdapter = new Proxy({} as StorageAdapter, {
  get(_target, prop: string | symbol) {
    instans ??= buatAdapter();
    const nilai = Reflect.get(instans as object, prop) as unknown;
    return typeof nilai === 'function' ? nilai.bind(instans) : nilai;
  },
});

/** Membuang instans yang tersimpan. Untuk test yang mengganti driver. */
export function resetStorage(): void {
  instans = null;
}
