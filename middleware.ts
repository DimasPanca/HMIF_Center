/**
 * Middleware — penjaga rute dan pemanjang sesi.
 *
 * ===========================================================================
 * BERKAS INI BERJALAN DI EDGE RUNTIME. JANGAN IMPOR APA PUN DARI lib/db/.
 * ===========================================================================
 * Prisma dan postgres.js keduanya menuntut Node runtime; mengimpornya di sini
 * membuat seluruh aplikasi gagal build dengan pesan yang menunjuk ke dalam
 * node_modules dan tidak menyebut berkas ini sama sekali.
 *
 * Konsekuensinya nyata dan disengaja: middleware TIDAK dapat memeriksa
 * `is_active`, role, atau periode aktif — ketiganya ada di database. Yang
 * diperiksa di sini hanya satu hal: apakah ada sesi yang sah.
 *
 * Pemeriksaan yang lebih dalam terjadi di lapisan berikutnya:
 *
 *   is_active        `sesiSaatIni()` di lib/auth/session.ts
 *   role & izin      lapisan permission (T-046)
 *   baris mana       RLS di database (migrasi 015b) — lapis terakhir, dan
 *                    satu-satunya yang tidak bisa dilewati kode aplikasi
 *
 * Pembagian ini bukan kompromi. Middleware yang menyaring 90% permintaan tak
 * berwenang dengan murah, lalu RLS yang menjamin 10% sisanya tidak pernah
 * melihat baris milik orang lain, lebih kuat daripada satu lapisan yang
 * mencoba melakukan keduanya.
 *
 * Sumber: PRD F-1.1 · USER_FLOW §2.3 · SYSTEM_DESIGN §18.1 · INV-01
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rute yang boleh dibuka tanpa sesi.
 *
 * Daftar putih, bukan daftar hitam. Halaman baru yang lupa didaftarkan akan
 * MEMINTA LOGIN — merepotkan, tetapi tidak membocorkan apa pun. Dengan daftar
 * hitam, kelalaian yang sama membuat halaman itu terbuka bagi siapa saja.
 */
const RUTE_PUBLIK = ['/login', '/api/auth/login', '/api/auth/logout'];

/**
 * Rute yang dilewati sepenuhnya — tidak diperiksa, tidak diperpanjang.
 * Aset statis tidak membawa cookie sesi dan memeriksanya hanya menambah
 * latensi pada setiap gambar.
 */
export const config = {
  matcher: [
    /*
     * Semua kecuali:
     *   _next/static, _next/image   berkas hasil build
     *   favicon.ico, aset gambar    aset statis
     *   /api/cron                   dijaga CRON_SECRET, bukan sesi (ADR-009)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

function publik(pathname: string): boolean {
  return RUTE_PUBLIK.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export async function middleware(req: NextRequest) {
  // Respons dibuat lebih dulu supaya Supabase punya tempat menulis cookie
  // yang diperbarui. Sesi 7 hari diperpanjang lewat cookie ini setiap kali
  // pengguna aktif (PRD F-1.1) — itulah yang membuat "diperpanjang otomatis"
  // benar-benar terjadi, bukan sekadar tertulis di dokumen.
  let res = NextResponse.next({ request: req });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (daftar) => {
          for (const { name, value } of daftar) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of daftar) res.cookies.set(name, value, options);
        },
      },
    },
  );

  // getUser(), bukan getSession(). getSession() hanya membaca isi cookie
  // tanpa memverifikasinya ke server Supabase — cookie kedaluwarsa atau
  // dipalsukan akan lolos. Panggilan ini sekaligus yang memperpanjang sesi.
  const {
    data: { user },
  } = await sb.auth.getUser();

  const path = req.nextUrl.pathname;

  // Sudah masuk tetapi membuka /login: langsung ke beranda. Tanpa ini,
  // pengguna yang menekan tombol "kembali" melihat form login lagi dan
  // mengira sesinya hilang.
  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (user || publik(path)) return res;

  // Permintaan API dijawab 401, bukan dialihkan. Redirect ke halaman HTML
  // membuat `fetch()` menerima 200 berisi markup login, dan kode pemanggil
  // mengira permintaannya berhasil.
  if (path.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'TIDAK_TERAUTENTIKASI', pesan: 'Sesi tidak ditemukan atau sudah berakhir.' },
      { status: 401 },
    );
  }

  // Halaman: ke /login dengan tujuan semula supaya pengguna kembali ke
  // tempat yang ia tuju, bukan ke beranda.
  const tujuan = req.nextUrl.pathname + req.nextUrl.search;
  const url = new URL('/login', req.url);
  if (tujuan && tujuan !== '/') url.searchParams.set('next', tujuan);

  return NextResponse.redirect(url);
}
