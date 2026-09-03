/**
 * Sesi dan alur login.
 *
 * Seluruh keputusan login ada di sini, dan route handler di `app/api/auth/`
 * hanya menerjemahkan hasilnya menjadi respons HTTP. Pembagian itu disengaja:
 * urutan pemeriksaan pada alur login menentukan apa yang bocor kepada
 * penyerang, dan aturan seperti itu tidak boleh tersebar di beberapa berkas
 * yang dimiliki lane berbeda.
 *
 * ===========================================================================
 * URUTAN PEMERIKSAAN — DAN KENAPA URUTANNYA BEGITU
 * ===========================================================================
 * Mengikuti USER_FLOW §2.3, dan setiap langkah ada alasannya:
 *
 *   1. BATAS PERCOBAAN, sebelum password diperiksa sama sekali.
 *      Kalau password diperiksa lebih dulu, penyerang dapat mengukur selisih
 *      waktu antara "email tidak ada" dan "password salah", lalu menyusun
 *      daftar email yang terdaftar tanpa pernah berhasil masuk.
 *
 *   2. KREDENSIAL, lewat Supabase Auth.
 *
 *   3. is_active, setelah password benar.
 *      Diperiksa belakangan supaya pesan "akun dinonaktifkan" hanya sampai
 *      kepada orang yang memang tahu passwordnya. Menampilkannya lebih awal
 *      berarti memberi tahu penyerang bahwa email itu terdaftar.
 *
 *   4. PERIODE AKTIF.
 *      USER_FLOW §2.3 menyebutnya sebagai keadaan tersendiri, dan kontrak
 *      T-045 tidak. Tanpa periode aktif, `auth_roles()` mengembalikan array
 *      kosong dan pengguna masuk ke aplikasi yang seluruh datanya tampak
 *      hilang — tanpa satu pun pesan yang menjelaskan kenapa.
 *
 * ===========================================================================
 * SATU PESAN UNTUK DUA KEGAGALAN YANG BERBEDA
 * ===========================================================================
 * Email tidak terdaftar dan password salah menghasilkan `KREDENSIAL_SALAH`
 * dengan kalimat yang sama persis (PRD F-1.1). Membedakannya adalah cara
 * termurah bagi siapa pun untuk menyusun daftar seluruh pengurus HMIF:
 * coba satu email, lihat pesannya.
 *
 * Sumber: PRD F-1.1 · USER_FLOW §2.3 · SYSTEM_DESIGN §18.3 · INV-02
 */

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { db } from '@/lib/db/client';
import {
  BATAS_PERCOBAAN,
  ENTITAS_AUTH,
  kalimatTunggu,
  normalkanEmail,
  periksaBatas,
} from './rate-limit';

if (typeof window !== 'undefined') {
  throw new Error('lib/auth/session.ts adalah modul server-only.');
}

// ---------------------------------------------------------------------------
// BENTUK DATA — inilah kontrak dengan route handler milik lane ui
// ---------------------------------------------------------------------------

export type KodeGagalLogin =
  /** Email tidak terdaftar ATAU password salah. Sengaja tidak dibedakan. */
  | 'KREDENSIAL_SALAH'
  /** Terlalu banyak percobaan gagal. `sisaDetik` terisi. */
  | 'TERLALU_BANYAK_PERCOBAAN'
  /** Password benar, tetapi `app_user.is_active = false`. */
  | 'AKUN_NONAKTIF'
  /** Tidak ada periode berstatus AKTIF. */
  | 'TIDAK_ADA_PERIODE'
  /** Masukan tidak lengkap. */
  | 'INPUT_TIDAK_VALID';

export interface HasilLoginSukses {
  ok: true;
  userId: string;
  namaLengkap: string;
  /** Tujuan setelah login. Route handler mengalihkan ke sini. */
  redirect: string;
}

export interface HasilLoginGagal {
  ok: false;
  kode: KodeGagalLogin;
  /** Kalimat siap tampil, sudah dalam bahasa Indonesia. */
  pesan: string;
  /** Hanya terisi pada `TERLALU_BANYAK_PERCOBAAN`. */
  sisaDetik?: number;
}

export type HasilLogin = HasilLoginSukses | HasilLoginGagal;

export interface ParamLogin {
  email: string;
  password: string;
  /** Dari header `x-forwarded-for` elemen pertama, atau `x-real-ip`. */
  ip: string | null;
  userAgent: string | null;
  /** Isi `?next=` bila ada. Divalidasi di sini, bukan dipercaya. */
  next?: string | null;
}

export interface Sesi {
  userId: string;
  email: string;
  namaLengkap: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// KLIEN
// ---------------------------------------------------------------------------

/**
 * Klien Supabase yang membaca dan menulis cookie sesi.
 *
 * Memakai PUBLISHABLE key, bukan secret. Yang menegakkan otorisasi adalah RLS
 * di database berdasarkan JWT yang dibawa cookie ini; memakai secret key di
 * sini justru membuat setiap kueri berjalan sebagai service dan menembus
 * seluruh 188 policy.
 */
export async function klienAuth(): Promise<SupabaseClient> {
  const jar = await cookies();

  return createServerClient(
    wajib('NEXT_PUBLIC_SUPABASE_URL'),
    wajib('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (daftar) => {
          try {
            for (const { name, value, options } of daftar) jar.set(name, value, options);
          } catch {
            // Server Component tidak boleh menulis cookie. Middleware yang
            // memperpanjang sesi, jadi kegagalan di sini aman diabaikan.
          }
        },
      },
    },
  );
}

function wajib(nama: string): string {
  const v = process.env[nama];
  if (!v) throw new Error(`Environment variable ${nama} belum diisi. Jalankan: npm run check:env`);
  return v;
}

// ---------------------------------------------------------------------------
// SESI
// ---------------------------------------------------------------------------

/**
 * Sesi yang sedang berjalan, atau `null`.
 *
 * Memakai `getUser()`, bukan `getSession()`. `getSession()` hanya membaca isi
 * cookie tanpa memverifikasinya ke server Supabase — cukup untuk menampilkan
 * nama di pojok layar, tidak cukup untuk keputusan otorisasi.
 */
export async function sesiSaatIni(): Promise<Sesi | null> {
  const sb = await klienAuth();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;

  const baris = await db.$queryRaw<{ nama_lengkap: string; is_active: boolean }[]>`
    SELECT nama_lengkap, is_active FROM app_user WHERE id = ${data.user.id}::uuid
  `;
  const u = baris[0];
  if (!u) return null;

  return {
    userId: data.user.id,
    email: data.user.email ?? '',
    namaLengkap: u.nama_lengkap,
    isActive: u.is_active,
  };
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------

const PESAN_KREDENSIAL = 'Email atau password salah';

export async function login(p: ParamLogin): Promise<HasilLogin> {
  const email = normalkanEmail(p.email);
  const password = p.password ?? '';

  if (!email || !password) {
    return { ok: false, kode: 'INPUT_TIDAK_VALID', pesan: 'Email dan password wajib diisi.' };
  }

  // --- 1. Batas percobaan, sebelum password disentuh -----------------------
  const batas = await periksaBatas(email, p.ip);
  if (batas.terkunci) {
    // Percobaan yang ditolak batas TIDAK dicatat sebagai kegagalan baru.
    // Kalau dicatat, penyerang yang terus menekan tombol akan memperpanjang
    // kuncinya sendiri tanpa batas — dan begitu pula pengguna sah yang
    // panik mencoba berulang kali.
    return {
      ok: false,
      kode: 'TERLALU_BANYAK_PERCOBAAN',
      pesan: `Terlalu banyak percobaan gagal. Coba lagi dalam ${kalimatTunggu(batas.sisaDetik)}.`,
      sisaDetik: batas.sisaDetik,
    };
  }

  // --- 2. Kredensial -------------------------------------------------------
  const sb = await klienAuth();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await catatAudit({
      aksi: 'LOGIN_GAGAL',
      email,
      userId: null,
      ip: p.ip,
      userAgent: p.userAgent,
      keterangan: 'kredensial salah',
    });
    return { ok: false, kode: 'KREDENSIAL_SALAH', pesan: PESAN_KREDENSIAL };
  }

  const userId = data.user.id;

  // --- 3. Akun aktif -------------------------------------------------------
  const profil = await db.$queryRaw<{ nama_lengkap: string; is_active: boolean }[]>`
    SELECT nama_lengkap, is_active FROM app_user WHERE id = ${userId}::uuid
  `;
  const u = profil[0];

  // Punya akun auth tetapi tidak punya baris app_user berarti undangannya
  // belum tuntas. Dari sisi pengguna itu tidak berbeda dari kredensial salah,
  // dan menyebutkannya hanya membocorkan keadaan internal.
  if (!u) {
    await sb.auth.signOut();
    await catatAudit({
      aksi: 'LOGIN_GAGAL',
      email,
      userId: null,
      ip: p.ip,
      userAgent: p.userAgent,
      keterangan: 'akun auth tanpa baris app_user',
    });
    return { ok: false, kode: 'KREDENSIAL_SALAH', pesan: PESAN_KREDENSIAL };
  }

  if (!u.is_active) {
    // Sesi dibatalkan supaya cookie yang sah tidak tertinggal di peramban.
    await sb.auth.signOut();
    await catatAudit({
      aksi: 'LOGIN_GAGAL',
      email,
      userId,
      ip: p.ip,
      userAgent: p.userAgent,
      keterangan: 'akun nonaktif',
    });
    return {
      ok: false,
      kode: 'AKUN_NONAKTIF',
      pesan: 'Akun ini dinonaktifkan. Hubungi Admin.',
    };
  }

  // --- 4. Periode aktif ----------------------------------------------------
  const periode = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1
  `;
  if (!periode[0]) {
    await sb.auth.signOut();
    await catatAudit({
      aksi: 'LOGIN_GAGAL',
      email,
      userId,
      ip: p.ip,
      userAgent: p.userAgent,
      keterangan: 'tidak ada periode aktif',
    });
    return {
      ok: false,
      kode: 'TIDAK_ADA_PERIODE',
      pesan: 'Belum ada periode kepengurusan yang aktif. Hubungi Admin.',
    };
  }

  // --- 5. Sukses -----------------------------------------------------------
  await catatAudit({
    aksi: 'LOGIN',
    email,
    userId,
    ip: p.ip,
    userAgent: p.userAgent,
    periodeId: periode[0].id,
  });

  return {
    ok: true,
    userId,
    namaLengkap: u.nama_lengkap,
    redirect: tujuanAman(p.next),
  };
}

export async function logout(): Promise<void> {
  const sb = await klienAuth();
  await sb.auth.signOut();
}

// ---------------------------------------------------------------------------
// PEMBANTU
// ---------------------------------------------------------------------------

/**
 * Membersihkan `?next=` sebelum dipakai mengalihkan.
 *
 * Nilai ini datang dari URL, jadi datang dari siapa saja. Tanpa pembersihan,
 * tautan `/login?next=https://situs-palsu.example` mengubah halaman login
 * yang sah menjadi batu loncatan phishing: korban melihat domain HMIF yang
 * benar, memasukkan password, lalu dilempar ke tempat lain.
 *
 * Hanya path relatif satu garis miring yang diterima. `//jahat.example`
 * ditolak karena peramban membacanya sebagai URL protokol-relatif.
 */
export function tujuanAman(next: string | null | undefined): string {
  const BERANDA = '/';
  if (!next) return BERANDA;

  const n = next.trim();
  if (!n.startsWith('/')) return BERANDA;
  if (n.startsWith('//') || n.startsWith('/\\')) return BERANDA;

  // Syarat di atas sudah menanggung sebagian besar beban: apa pun yang tidak
  // diawali satu garis miring — termasuk "https://jahat.example" dan
  // "javascript:alert(1)" — berhenti di sana. Sempat ada pemeriksaan
  // includes('://') di baris ini sebagai penjaga tambahan, lalu dihapus
  // setelah uji mutasi menunjukkan ia TIDAK PERNAH TERCAPAI. Kode mati pada
  // jalur keamanan lebih buruk daripada tidak ada kodenya: ia terbaca seperti
  // perlindungan yang sebenarnya tidak ada, dan menutupi kenyataan bahwa
  // syarat pertamalah yang bekerja.
  //
  // Menghapusnya juga lebih benar: "/redirect?url=https://x" adalah path
  // relatif yang sah dan tidak seharusnya ditolak.

  if (n.startsWith('/login')) return BERANDA;

  return n;
}

interface ParamAudit {
  aksi: 'LOGIN' | 'LOGIN_GAGAL';
  email: string;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  periodeId?: string | null;
  keterangan?: string;
}

/**
 * Menulis satu baris ke `audit_log`.
 *
 * Login bukan mutasi tabel, jadi trigger `fn_audit()` tidak berlaku dan
 * barisnya ditulis langsung. Berjalan lewat klien Prisma yang memakai
 * DATABASE_URL — role `postgres` yang ber-BYPASSRLS — sehingga tidak
 * terhalang policy `audit_log` yang memang tidak memberi hak INSERT kepada
 * siapa pun (INV-06).
 *
 * Kegagalan menulis audit TIDAK menjatuhkan login. Itu keputusan yang
 * disengaja dan berbeda dari `fn_audit()`: di sana audit yang gagal harus
 * menggagalkan mutasinya, karena mutasi tanpa jejak adalah lubang. Di sini,
 * menolak login sah hanya karena audit gagal berarti satu gangguan basis
 * data mengunci seluruh pengurus di luar sistem. Kegagalannya dicatat ke
 * stderr agar terlihat di log Vercel.
 */
async function catatAudit(p: ParamAudit): Promise<void> {
  const nilai = {
    email: p.email,
    ...(p.keterangan ? { keterangan: p.keterangan } : {}),
  };

  try {
    await db.$executeRaw`
      INSERT INTO audit_log (user_id, periode_id, aksi, entitas, entitas_id,
                             nilai_baru, ip_address, user_agent)
      VALUES (
        ${p.userId}::uuid,
        ${p.periodeId ?? null}::uuid,
        ${p.aksi},
        ${ENTITAS_AUTH},
        ${p.email},
        ${JSON.stringify(nilai)}::jsonb,
        ${p.ip}::inet,
        ${p.userAgent}
      )
    `;
  } catch (e) {
    process.stderr.write(
      `[auth] gagal menulis audit ${p.aksi} untuk ${p.email}: ` +
        `${e instanceof Error ? e.message : String(e)}\n`,
    );
  }
}

export { BATAS_PERCOBAAN, kalimatTunggu, normalkanEmail, periksaBatas };
