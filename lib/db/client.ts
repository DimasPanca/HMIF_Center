/**
 * Klien Prisma — server-only.
 *
 * Berdampingan dengan `lib/db/connection.ts` yang memakai postgres.js. Bukan
 * duplikasi: skrip administratif dan migrasi butuh SQL mentah dan koneksi sesi,
 * sedangkan kode aplikasi butuh tipe dan relasi. Keduanya menunjuk database
 * yang sama.
 *
 * Sumber: SYSTEM_DESIGN §14.2 · docs/ai/tasks/P1-fondasi.md T-043
 */

import { PrismaClient } from '@prisma/client';

// Modul ini menyentuh kredensial database dan tidak boleh pernah ikut ke bundle
// browser. Penjaga runtime, melengkapi `npm run check:secrets` yang memeriksa
// berkas ber-"use client" secara statis.
if (typeof window !== 'undefined') {
  throw new Error('lib/db/client.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

/**
 * Menambahkan `pgbouncer=true` bila belum ada.
 *
 * Supabase transaction pooler memberi koneksi backend yang berbeda antar
 * perintah. Tanpa parameter ini Prisma tetap membuat prepared statement, lalu
 * gagal dengan "prepared statement s0 already exists" atau "does not exist" —
 * secara acak, hanya di bawah beban, dan tidak pernah saat pengembangan.
 *
 * Dikerjakan di sini, bukan diserahkan ke isi environment variable, karena
 * satu deployment yang lupa menambahkannya menghasilkan kegagalan yang sangat
 * sulit dilacak dan hanya muncul di produksi.
 */
function urlPooler(url: string): string {
  if (url.includes('pgbouncer=')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'pgbouncer=true';
}

function buatKlien(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Environment variable DATABASE_URL belum diisi. Jalankan: npm run check:env');
  }

  return new PrismaClient({
    datasources: { db: { url: urlPooler(url) } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });
}

// Singleton. Tanpa ini, hot reload Next.js membuat pool baru setiap kali
// berkas berubah sampai kuota koneksi Supabase habis.
const global_ = globalThis as unknown as { __hmifPrisma?: PrismaClient };

/**
 * MALAS, bukan langsung. Klien baru dibuat saat method pertama dipakai.
 *
 * Versi pertama berbunyi `export const db = global_.__hmifPrisma ?? buatKlien()`,
 * dan itu membaca DATABASE_URL saat modulnya DIIMPOR. Akibatnya:
 *
 *   - `npm run verify` gagal di mesin yang belum memegang kredensial database,
 *     walau seluruh test yang gagal itu memang melewati bagian databasenya.
 *     Berkas test yang sekadar mengimpor lib/auth/session.ts ikut jatuh.
 *   - `next build` mengevaluasi modul yang diimpor. Satu halaman yang
 *     mengimpor tipe dari sini akan menggagalkan build Vercel bila env-nya
 *     belum lengkap, dengan pesan yang menunjuk ke dalam node_modules.
 *
 * Kegagalannya tetap keras dan tetap menyebut nama variabelnya — hanya
 * terjadi pada saat yang benar, yaitu saat database sungguh-sungguh dipakai.
 *
 * Pola yang sama dipakai `lib/storage/index.ts` dan
 * `lib/storage/supabase-adapter.ts`, dengan alasan yang sama persis.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    global_.__hmifPrisma ??= buatKlien();
    const nilai = Reflect.get(global_.__hmifPrisma as object, prop) as unknown;
    return typeof nilai === 'function' ? nilai.bind(global_.__hmifPrisma) : nilai;
  },
});
