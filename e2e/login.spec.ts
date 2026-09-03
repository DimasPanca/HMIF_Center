/**
 * Gate E2E T-045 — autentikasi.
 *
 * ===========================================================================
 * KONTRAK ANTARA BERKAS INI DAN HALAMAN LOGIN MILIK LANE UI
 * ===========================================================================
 * Berkas ini milik lane data; halaman dan route-nya milik lane ui. Yang
 * menyambungkan keduanya adalah daftar `data-testid` di bawah — bukan
 * struktur DOM, bukan nama kelas CSS. Selector berbasis kelas pecah setiap
 * kali Tailwind disusun ulang, dan test yang pecah karena hal kosmetik
 * lama-lama diabaikan.
 *
 * Halaman `/login` wajib menyediakan:
 *
 *   login-form        elemen <form>
 *   login-email       input email
 *   login-password    input password
 *   login-submit      tombol kirim
 *   login-error       wadah pesan gagal; boleh tidak ada saat belum ada galat
 *   login-hero        area ber-`--gradient-primary` (kontrak butir 7)
 *
 * Halaman mana pun di balik autentikasi wajib menyediakan:
 *
 *   app-shell         penanda bahwa pengguna sudah masuk
 *   logout-submit     tombol atau form keluar
 *
 * ===========================================================================
 * AKUN UJI DISIAPKAN TERPISAH
 * ===========================================================================
 * Membuat akun Supabase Auth menuntut SUPABASE_SECRET_KEY, dan worktree lane
 * ui sengaja tidak memilikinya. Kalau test yang membuatnya, gate ini hanya
 * dapat dijalankan pemegang kunci penuh — dan lane yang justru menulis
 * halamannya tidak akan pernah bisa menjalankannya.
 *
 * Akunnya disiapkan sekali dengan `npm run seed:e2e-auth`, lalu menetap di
 * proyek Supabase pengembangan. Perlu diulang setelah `npm run db:reset`.
 *
 * ===========================================================================
 * ADA DUA PEMBATAS PERCOBAAN, DAN YANG SATU DI LUAR KENDALI KITA
 * ===========================================================================
 * Supabase membatasi jumlah permintaan sign-in per proyek, terpisah dari
 * pembatas aplikasi di lib/auth/rate-limit.ts. Gate ini melakukan puluhan
 * sign-in tiap jalan, jadi menjalankannya berulang-ulang dalam waktu singkat
 * akan menabrak pembatas Supabase lebih dulu — dan login dengan password yang
 * BENAR pun ditolak.
 *
 * Gejalanya menyesatkan: test yang gagal berpindah-pindah, dan yang tertuduh
 * biasanya halaman login. Dua hal dikerjakan supaya itu tidak terulang:
 *
 *   1. `login()` kini membedakan 429 dari penyedia dan tidak lagi menyebutnya
 *      "Email atau password salah" (lib/auth/session.ts).
 *   2. Pembatas aplikasi hanya diuji di proyek desktop, dan tiap jalan memakai
 *      IP sintetis sendiri (playwright.config.ts).
 *
 * Bila gate ini merah dan pesannya menyebut "dari jaringan ini", tunggu
 * beberapa menit sebelum menyalahkan kode.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-045 · PRD F-1.1 · USER_FLOW §2.3
 *         · docs/ai/AUTH_CONTRACT.md
 */

import { expect, test, type Page } from '@playwright/test';

import {
  AKUN,
  EMAIL_TIDAK_TERDAFTAR,
  PASSWORD_SALAH,
  PASSWORD_UJI,
} from './fixtures/akun';

const HALAMAN = '/login';

/** Melewati seluruh berkas dengan pesan yang menyebut apa yang kurang. */
test.beforeEach(async ({ page }) => {
  const r = await page.goto(HALAMAN, { waitUntil: 'domcontentloaded' });

  if (!r || r.status() === 404) {
    test.skip(
      true,
      `Halaman ${HALAMAN} belum ada. Ia milik lane ui (T-045); ` +
        `lihat daftar data-testid di kepala berkas ini dan docs/ai/AUTH_CONTRACT.md.`,
    );
  }
  await page.waitForSelector('[data-testid="login-form"]');
});

async function isiDanKirim(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

/** Teks galat yang tampil, setelah menunggu wadahnya terisi. */
async function pesanGalat(page: Page): Promise<string> {
  const el = page.getByTestId('login-error');
  await expect(el).toBeVisible({ timeout: 5000 });
  return ((await el.textContent()) ?? '').trim();
}

// ===========================================================================
// JALUR BAHAGIA
// ===========================================================================

test.describe('login berhasil', () => {
  test('masuk dengan kredensial benar lalu sampai ke aplikasi', async ({ page }) => {
    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_UJI);

    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
  });

  test('sesi bertahan setelah halaman dimuat ulang', async ({ page }) => {
    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_UJI);
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
  });

  test('membuka /login setelah masuk mengalihkan ke beranda', async ({ page }) => {
    // Tanpa ini, pengguna yang menekan tombol kembali melihat form login lagi
    // dan mengira sesinya hilang.
    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_UJI);
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });

    await page.goto(HALAMAN);

    // `not.toHaveURL(/\/login/)`, BUKAN `toHaveURL(/\/$|\/(?!login)/)`.
    //
    // Pola kedua itu sempat dipakai di sini dan tidak menguji apa pun: pada
    // "http://localhost:3000/login", garis miring kedua pada "http://" sudah
    // memenuhi `\/(?!login)` — sehingga URL halaman login sendiri dinyatakan
    // lolos. Diukur: keduanya `true`. Kegagalan sesungguhnya baru muncul satu
    // baris di bawah, sebagai "app-shell tidak ditemukan", yang menunjuk ke
    // tempat yang salah.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
  });

  test('keluar mengakhiri sesi', async ({ page }) => {
    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_UJI);
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('logout-submit').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Dan sesinya benar-benar berakhir, bukan sekadar dialihkan.
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

// ===========================================================================
// PESAN GAGAL — INI BAGIAN YANG PALING MUDAH DIRUSAK
// ===========================================================================

test.describe('pesan gagal tidak membocorkan apa pun', () => {
  test('password salah menampilkan pesan generik', async ({ page }) => {
    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_SALAH);
    expect(await pesanGalat(page)).toContain('Email atau password salah');
  });

  test('EMAIL TIDAK TERDAFTAR MENAMPILKAN PESAN YANG SAMA PERSIS', async ({ page }) => {
    // Inti PRD F-1.1 kriteria 2, dan satu-satunya test yang benar-benar
    // menjaganya. Membedakan kedua pesan adalah cara termurah bagi siapa pun
    // untuk menyusun daftar seluruh pengurus HMIF: coba satu email, lihat
    // pesannya. Perbandingannya karakter per karakter, bukan sekadar
    // "mengandung", karena selisih satu kata pun sudah cukup membedakan.
    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_SALAH);
    const pesanPasswordSalah = await pesanGalat(page);

    await page.goto(HALAMAN);
    await isiDanKirim(page, EMAIL_TIDAK_TERDAFTAR, PASSWORD_SALAH);
    const pesanEmailTakAda = await pesanGalat(page);

    expect(pesanEmailTakAda).toBe(pesanPasswordSalah);
  });

  test('akun auth tanpa baris app_user juga menampilkan pesan generik', async ({ page }) => {
    // Keadaan nyata: undangan yang belum tuntas. Menyebutkannya membocorkan
    // keadaan internal sistem kepada orang yang belum tentu berhak tahu.
    await isiDanKirim(page, AKUN.tanpaProfil.email, PASSWORD_UJI);
    expect(await pesanGalat(page)).toContain('Email atau password salah');
  });

  test('akun nonaktif ditolak MESKI passwordnya benar', async ({ page }) => {
    // PRD F-1.1 kriteria 4. Pesannya memang berbeda, dan itu disengaja:
    // pemeriksaan ini terjadi SETELAH password terbukti benar, jadi yang
    // membacanya sudah pasti pemilik akunnya.
    await isiDanKirim(page, AKUN.nonaktif.email, PASSWORD_UJI);

    const pesan = await pesanGalat(page);
    expect(pesan).toMatch(/dinonaktifkan/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('tidak pernah masuk walau pesannya berbeda', async ({ page }) => {
    await isiDanKirim(page, AKUN.nonaktif.email, PASSWORD_UJI);
    await pesanGalat(page);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

// ===========================================================================
// PEMBATAS PERCOBAAN
// ===========================================================================

test.describe('pembatas percobaan', () => {
  test('percobaan keenam ditolak dengan sisa waktu tunggu', async ({ page }, info) => {
    // Hanya di desktop. Pembatas percobaan bekerja di server dan tidak punya
    // dimensi lebar layar sama sekali, jadi menjalankannya dua kali tidak
    // membuktikan apa pun — tetapi menambah dua belas permintaan sign-in ke
    // Supabase setiap jalan, dan Supabase punya pembatasnya sendiri di depan
    // pembatas kita. Beban itulah yang membuat gate ini gagal berpindah-pindah
    // saat dijalankan berulang.
    test.skip(info.project.name !== 'desktop', 'Perilaku server, tidak bergantung viewport.');

    // Email dibuat unik per jalan DAN per proyek. Pembatas mengunci pasangan
    // email + IP selama 15 menit; memakai email tetap akan meracuni test lain
    // dan membuat jalan berikutnya gagal karena sisa kunci dari jalan
    // sebelumnya — kegagalan yang terlihat acak dan sangat sulit dilacak.
    const email = `e2e-kunci-${info.project.name}-${Date.now()}@uji.test`;

    for (let i = 1; i <= 5; i++) {
      await page.goto(HALAMAN);
      await isiDanKirim(page, email, PASSWORD_SALAH);
      const pesan = await pesanGalat(page);
      expect(pesan, `percobaan ke-${i} seharusnya masih pesan generik`).toContain(
        'Email atau password salah',
      );
    }

    await page.goto(HALAMAN);
    await isiDanKirim(page, email, PASSWORD_SALAH);
    const pesanKeenam = await pesanGalat(page);

    expect(pesanKeenam).not.toContain('Email atau password salah');
    expect(pesanKeenam).toMatch(/terlalu banyak/i);
    // Harus menyebut berapa lama harus menunggu, bukan sekadar "coba lagi".
    expect(pesanKeenam).toMatch(/menit/i);
  });
});

// ===========================================================================
// PENJAGA RUTE
// ===========================================================================

test.describe('middleware', () => {
  test('rute terlindungi mengalihkan ke login beserta tujuan semula', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/proker');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    expect(new URL(page.url()).searchParams.get('next')).toBe('/proker');
  });

  test('setelah masuk, pengguna kembali ke tujuan semula', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/proker');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_UJI);
    await expect(page).toHaveURL(/\/proker/, { timeout: 10_000 });
  });

  test('tujuan ke domain lain DIABAIKAN', async ({ page }) => {
    // Tanpa penjaga ini, /login?next=https://situs-palsu.example membuat
    // korban melihat domain HMIF yang benar, memasukkan password, lalu
    // dilempar ke tempat lain — halaman login yang sah menjadi batu loncatan.
    await page.context().clearCookies();
    await page.goto('/login?next=https%3A%2F%2Fsitus-palsu.example');
    await isiDanKirim(page, AKUN.aktif.email, PASSWORD_UJI);

    await expect(page).toHaveURL(new RegExp(`^${escapeRe(baseURL(page))}/?$`), { timeout: 10_000 });
  });

  test('permintaan API tanpa sesi dijawab 401 JSON, bukan halaman login', async ({ request }) => {
    // Redirect ke HTML membuat fetch() menerima 200 berisi markup login, dan
    // kode pemanggil mengira permintaannya berhasil.
    const r = await request.get('/api/gantt/master', { maxRedirects: 0 });

    expect(r.status()).toBe(401);
    expect(r.headers()['content-type'] ?? '').toContain('application/json');
  });
});

// ===========================================================================
// TAMPILAN
// ===========================================================================

test.describe('halaman login', () => {
  test('memakai gradien sebagai hero', async ({ page }) => {
    // Satu-satunya tempat gradien diizinkan di seluruh aplikasi
    // (kontrak T-045 butir 7).
    const hero = page.getByTestId('login-hero');
    await expect(hero).toBeVisible();

    const latar = await hero.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.backgroundImage} ${s.background}`;
    });
    expect(latar).toMatch(/gradient/i);
  });

  test('tidak menawarkan pendaftaran mandiri maupun OAuth', async ({ page }) => {
    // Akun HANYA dibuat Admin (PRD F-1.1). Tautan "daftar" menjanjikan
    // sesuatu yang tidak ada, dan OAuth dinyatakan di luar cakupan MVP pada
    // bagian Jangan kontrak T-045.
    const teks = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const dilarang of ['daftar akun', 'buat akun', 'sign up', 'google', 'github']) {
      expect(teks, `halaman login memuat "${dilarang}"`).not.toContain(dilarang);
    }
  });
});

function baseURL(page: Page): string {
  const u = new URL(page.url());
  return `${u.protocol}//${u.host}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
