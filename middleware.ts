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

import { BATAS, cekBatas, ipDari, originSah, respons429 } from '@/lib/security/rate-limit';

/**
 * Rute yang boleh dibuka tanpa sesi.
 *
 * Daftar putih, bukan daftar hitam. Halaman baru yang lupa didaftarkan akan
 * MEMINTA LOGIN — merepotkan, tetapi tidak membocorkan apa pun. Dengan daftar
 * hitam, kelalaian yang sama membuat halaman itu terbuka bagi siapa saja.
 */
const RUTE_PUBLIK = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',

  // Aktivasi undangan (T-047). WAJIB publik, dan bukan kelonggaran:
  // penerima undangan BELUM PUNYA AKUN. Bila middleware mengalihkannya ke
  // /login, ia diminta masuk memakai akun yang justru sedang ia buat —
  // undangannya menjadi buntu dan tidak ada pesan yang menjelaskan kenapa.
  //
  // Yang menjaga keduanya bukan sesi melainkan tokennya sendiri: 32 byte acak
  // yang hanya tersimpan sebagai SHA-256, sekali pakai, berlaku 7 hari.
  // Halaman tanpa token yang sah tidak menampilkan apa pun selain pesan
  // kegagalan (lihat periksaUndangan di lib/auth/invitation.ts).
  //
  // Pencocokan di bawah memakai `pathname === r || startsWith(r + '/')`,
  // sehingga '/undangan' ikut membuka '/undangan/<token>'.
  '/undangan',
  '/api/auth/activate',
];

/**
 * Prefix halaman harness E2E, terbuka HANYA di luar produksi.
 *
 * Ditemukan lane ui: middleware ini menjaga `/qa/gantt` sehingga gate T-073
 * menerima 307 ke `/login` alih-alih halamannya. Harness itu memang sengaja
 * tidak berautentikasi — ia merender komponen dengan data tetap, tanpa
 * database dan tanpa sesi, supaya yang diuji benar-benar komponennya.
 *
 * Dua lapis menjaganya tetap tidak dapat dicapai di produksi:
 *
 *   1. Pengecualian di bawah hanya berlaku saat NODE_ENV !== 'production'.
 *   2. Halaman harness-nya sendiri memanggil notFound() di produksi.
 *
 * Satu lapis akan cukup; dua dipakai karena keduanya murah dan salah satunya
 * bisa saja terlupakan saat harness baru ditambahkan.
 */
const PREFIX_HARNESS = '/qa/';

/**
 * Jalur kesiapan untuk Playwright, hanya hidup di luar produksi.
 *
 * Playwright menunggu satu URL menjawab sebelum menjalankan test. Sejak
 * middleware ini ada, TIDAK ADA satu pun URL yang menjawab 200 tanpa sesi:
 * beranda dialihkan ke `/login`, dan `/login` sendiri milik lane lain yang
 * urutan pengerjaannya tidak boleh mengikat gate lane ini.
 *
 * Dicoba dan gagal sebelum sampai ke sini:
 *   url: '/'          307 lalu 404 — tidak pernah dianggap siap
 *   port: 3000        soket terbuka sebelum Next siap; navigasi pertama
 *                     gagal dengan ERR_ABORTED
 *   url: '/api/...'   401 dari middleware; berhasil hanya bila server sudah
 *                     hangat dari jalan sebelumnya
 *
 * Jawaban 200 dari middleware sendiri tidak bergantung pada halaman atau
 * route mana pun, dan datang segera setelah middleware selesai dikompilasi —
 * yaitu tepat saat server benar-benar siap melayani.
 */
const JALUR_SIAP = '/api/e2e-siap';

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
     *   favicon.ico, aset gambar    aset statis (termasuk video logo login — mp4/webm)
     *   /api/cron                   dijaga CRON_SECRET, bukan sesi (ADR-009)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm)$).*)',
  ],
};

function publik(pathname: string): boolean {
  return RUTE_PUBLIK.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export async function middleware(req: NextRequest) {
  // Harness diperiksa PALING AWAL, sebelum klien Supabase dibuat.
  //
  // Bukan sekadar demi kecepatan: harness harus dapat dibuka pada mesin yang
  // tidak memegang kredensial Supabase sama sekali — persis keadaan worktree
  // lane ui. Membuat kliennya lebih dulu akan menggagalkan permintaan itu
  // dengan galat yang tidak ada hubungannya dengan yang sedang diuji.
  const bukanProduksi = process.env.NODE_ENV !== 'production';

  if (bukanProduksi && req.nextUrl.pathname === JALUR_SIAP) {
    return NextResponse.json({ siap: true }, { status: 200 });
  }

  if (bukanProduksi && req.nextUrl.pathname.startsWith(PREFIX_HARNESS)) {
    return NextResponse.next({ request: req });
  }

  // CSRF (T-113, SYSTEM_DESIGN §18.1): mutasi API dari halaman situs lain
  // ditolak sebelum menyentuh apa pun. Server Actions dijaga Next.js sendiri
  // (Origin harus sama dengan Host).
  if (req.nextUrl.pathname.startsWith('/api/') && !originSah(req.method, req.headers, req.nextUrl.host)) {
    return NextResponse.json(
      { ok: false, error: { code: 'ORIGIN_DITOLAK', message: 'Permintaan lintas situs ditolak.' } },
      { status: 403 },
    );
  }

  // Batas umum 300/menit per IP (§18.3) — hanya produksi (lib/security/rate-limit.ts).
  // Dijalankan paralel dengan getUser() supaya tidak menambah latensi berurutan.
  const batasUmum = bukanProduksi
    ? null
    : cekBatas(`umum:${ipDari(req.headers)}`, BATAS.umum.batas, BATAS.umum.jendelaDetik);

  // Respons dibuat lebih dulu supaya Supabase punya tempat menulis cookie
  // yang diperbarui. Sesi 7 hari diperpanjang lewat cookie ini setiap kali
  // pengguna aktif (PRD F-1.1) — itulah yang membuat "diperpanjang otomatis"
  // benar-benar terjadi, bukan sekadar tertulis di dokumen.
  let res = NextResponse.next({ request: req });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Eksplisit (T-113): SameSite=Lax menahan cookie sesi pada POST lintas
      // situs; Secure di produksi. Sama dengan bawaan @supabase/ssr + Secure.
      cookieOptions: { sameSite: 'lax', secure: !bukanProduksi, path: '/' },
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

  if (batasUmum) {
    const h = await batasUmum;
    if (!h.ok) return respons429(h, 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
  }

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
