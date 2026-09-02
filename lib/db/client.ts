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

export const db: PrismaClient = global_.__hmifPrisma ?? buatKlien();

if (process.env.NODE_ENV !== 'production') global_.__hmifPrisma = db;
