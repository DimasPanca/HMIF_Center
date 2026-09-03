/**
 * Pembatas percobaan login — 5 kegagalan per 15 menit, per email + IP.
 *
 * ===========================================================================
 * KENAPA HITUNGANNYA DISIMPAN DI DATABASE, BUKAN DI MEMORI
 * ===========================================================================
 * Aplikasi ini berjalan di Vercel sebagai fungsi serverless. Setiap request
 * bisa mendarat di instance yang berbeda, dan instance dibuang kapan saja.
 * Penghitung di memori karena itu bukan pembatas — ia hanya membatasi
 * percobaan pada satu instance yang kebetulan hidup, dan penyerang yang
 * mengirim 100 permintaan akan tersebar ke puluhan instance yang
 * masing-masing menghitung dari nol.
 *
 * Pembatas yang tidak membatasi apa pun lebih berbahaya daripada tidak ada
 * pembatas, karena ia memberi rasa aman yang keliru.
 *
 * ===========================================================================
 * KENAPA audit_log, BUKAN TABEL BARU
 * ===========================================================================
 * Kontrak T-045 sudah mewajibkan setiap kegagalan login tercatat di
 * `audit_log` (butir 5). Barisnya karena itu sudah pasti ada. Membuat tabel
 * kedua berisi kejadian yang sama berarti dua sumber kebenaran yang bisa
 * berbeda — dan yang satu bisa terhapus sementara yang lain tidak.
 *
 * Konsekuensinya satu: `audit_log` bersifat append-only (INV-06), jadi
 * hitungan tidak bisa "direset" dengan menghapus baris. Yang dilakukan
 * sebagai gantinya adalah menghitung kegagalan yang terjadi SETELAH login
 * sukses terakhir — lihat `periksaBatas()`.
 *
 * Sumber: PRD F-1.1 · SYSTEM_DESIGN §18.3 · USER_FLOW §2.3 · INV-06
 */

import { db } from '@/lib/db/client';

if (typeof window !== 'undefined') {
  throw new Error('lib/auth/rate-limit.ts adalah modul server-only.');
}

/** Jumlah kegagalan yang masih ditoleransi sebelum terkunci (PRD F-1.1). */
export const BATAS_PERCOBAAN = 5;

/** Panjang jendela pengamatan sekaligus lama terkunci, dalam menit. */
export const MENIT_JENDELA = 15;

/**
 * Nilai `entitas` untuk baris audit login.
 *
 * Sengaja BUKAN 'app_user'. Kegagalan login dengan email yang tidak terdaftar
 * tidak menunjuk baris app_user mana pun, dan memakai nama tabel itu akan
 * membuat penelusuran audit mengira ada pengguna yang tidak pernah ada.
 */
export const ENTITAS_AUTH = 'auth';

export interface StatusBatas {
  /** true bila percobaan berikutnya harus ditolak tanpa memeriksa password. */
  terkunci: boolean;
  /** Detik tersisa sampai terbuka kembali. 0 bila tidak terkunci. */
  sisaDetik: number;
  /** Berapa percobaan lagi sebelum terkunci. 0 bila sudah terkunci. */
  sisaPercobaan: number;
}

/** Email dinormalkan supaya "Budi@X.com" dan "budi@x.com" dihitung sama. */
export function normalkanEmail(email: string): string {
  return (email ?? '').trim().toLowerCase().slice(0, 254);
}

/**
 * Memeriksa apakah pasangan email + IP ini sedang terkunci.
 *
 * Yang dihitung hanya kegagalan yang terjadi SETELAH login sukses terakhir
 * pada jendela yang sama. Tanpa syarat itu, pengguna yang salah ketik empat
 * kali lalu berhasil masuk akan tetap membawa empat kegagalan itu selama 15
 * menit, dan terkunci pada percobaan berikutnya walau sudah membuktikan
 * dirinya. `audit_log` append-only, jadi hitungannya tidak bisa dinolkan
 * dengan menghapus baris — dan memang tidak boleh.
 */
export async function periksaBatas(email: string, ip: string | null): Promise<StatusBatas> {
  const e = normalkanEmail(email);

  // Sisa waktu dihitung SELURUHNYA di dalam database, bukan dengan
  // membandingkan `created_at` terhadap `Date.now()` di Node.
  //
  // Di Vercel, kode berjalan di mesin yang berbeda dari Postgres Supabase, dan
  // jam keduanya tidak pernah persis sama. Mencampurnya membuat sisa waktu
  // meleset sebesar selisih jam itu — terukur 2 detik saat test ditulis, dan
  // cukup untuk membuat pesan berbunyi "16 menit" pada jendela 15 menit.
  const baris = await db.$queryRaw<{ gagal: number; sisa_detik: number | null }[]>`
    WITH sukses_terakhir AS (
      SELECT max(created_at) AS pada
      FROM audit_log
      WHERE entitas = ${ENTITAS_AUTH}
        AND entitas_id = ${e}
        AND aksi = 'LOGIN'
        AND ip_address IS NOT DISTINCT FROM ${ip}::inet
        AND created_at > now() - (${MENIT_JENDELA} || ' minutes')::interval
    )
    SELECT count(*)::int AS gagal,
           CEIL(EXTRACT(EPOCH FROM (
             min(a.created_at) + (${MENIT_JENDELA} || ' minutes')::interval - now()
           )))::int AS sisa_detik
    FROM audit_log a, sukses_terakhir s
    WHERE a.entitas = ${ENTITAS_AUTH}
      AND a.entitas_id = ${e}
      AND a.aksi = 'LOGIN_GAGAL'
      AND a.ip_address IS NOT DISTINCT FROM ${ip}::inet
      AND a.created_at > now() - (${MENIT_JENDELA} || ' minutes')::interval
      AND (s.pada IS NULL OR a.created_at > s.pada)
  `;

  const gagal = baris[0]?.gagal ?? 0;

  if (gagal < BATAS_PERCOBAAN) {
    return {
      terkunci: false,
      sisaDetik: 0,
      sisaPercobaan: Math.max(0, BATAS_PERCOBAAN - gagal),
    };
  }

  // Minimal 1 detik: nol akan terbaca pengguna sebagai "sudah boleh sekarang"
  // padahal percobaan berikutnya masih ditolak.
  const sisaDetik = Math.max(1, baris[0]?.sisa_detik ?? MENIT_JENDELA * 60);

  return { terkunci: true, sisaDetik, sisaPercobaan: 0 };
}

/** Membulatkan sisa detik menjadi kalimat yang bisa dibaca pengguna. */
export function kalimatTunggu(sisaDetik: number): string {
  if (sisaDetik <= 60) return 'kurang dari 1 menit';
  const menit = Math.ceil(sisaDetik / 60);
  return `${menit} menit`;
}
