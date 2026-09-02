/**
 * S3Adapter — STUB.
 *
 * Belum diimplementasikan, dan itu disengaja. Adapter ini disiapkan untuk
 * Cloudflare R2 atau AWS S3 bila skalanya kelak menuntut.
 *
 * Yang membuat berkas ini berguna sekarang: ia membuktikan bahwa kontrak
 * StorageAdapter benar-benar dapat diisi backend lain, dan ia gagal dengan
 * pesan yang menyebut apa yang harus dilakukan — bukan dengan
 * "undefined is not a function" beberapa lapis di dalam kode fitur.
 *
 * Saat mengimplementasikannya nanti: JANGAN mengubah tanda tangan method.
 * Bucket ditentukan bentuk key lewat `bucketUntuk()` di keys.ts, dan aturan
 * itu berlaku untuk semua adapter tanpa kecuali.
 *
 * Sumber: SYSTEM_DESIGN §12.1 · docs/ai/tasks/P1-fondasi.md T-044
 */

import {
  NotImplementedError,
  type OpsiPut,
  type StorageAdapter,
  type StorageObject,
} from './adapter';

const NAMA = 'S3Adapter';
const KAPAN = 'Cloudflare R2 atau AWS S3 bila skalanya kelak menuntut';

export class S3Adapter implements StorageAdapter {
  put(_key: string, _data: Buffer | Blob, _contentType: string, _opts?: OpsiPut): Promise<{ key: string }> {
    throw new NotImplementedError(NAMA, 'put', KAPAN);
  }
  get(_key: string): Promise<Buffer> {
    throw new NotImplementedError(NAMA, 'get', KAPAN);
  }
  getSignedUrl(_key: string, _expiresInSeconds: number): Promise<string> {
    throw new NotImplementedError(NAMA, 'getSignedUrl', KAPAN);
  }
  getPublicUrl(_key: string): string {
    throw new NotImplementedError(NAMA, 'getPublicUrl', KAPAN);
  }
  delete(_key: string): Promise<void> {
    throw new NotImplementedError(NAMA, 'delete', KAPAN);
  }
  list(_prefix: string): Promise<StorageObject[]> {
    throw new NotImplementedError(NAMA, 'list', KAPAN);
  }
  exists(_key: string): Promise<boolean> {
    throw new NotImplementedError(NAMA, 'exists', KAPAN);
  }
}
