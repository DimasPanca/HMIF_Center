import { defineConfig, devices } from '@playwright/test';

/**
 * Konfigurasi test end-to-end.
 *
 * Proyek `mobile` bukan pelengkap: PRD §8.5 mewajibkan modul Nota dan Kanban
 * nyaman dipakai panitia dari ponsel di lapangan, dan T-115 mengujinya pada
 * lebar 375 px. Menjalankannya sejak awal mencegah regresi yang baru ketahuan
 * saat audit aksesibilitas.
 */
/**
 * IP sintetis, berbeda tiap jalan DAN tiap proyek.
 *
 * Pembatas percobaan login (lib/auth/rate-limit.ts) mengunci pasangan
 * email + IP selama 15 menit, dan hitungannya hanya tereset oleh login yang
 * BERHASIL — audit_log bersifat append-only, jadi barisnya memang tidak dapat
 * dihapus. Dua dari tiga akun uji tidak pernah bisa login berhasil:
 * `e2e-nonaktif` selalu ditolak karena is_active=false, `e2e-tanpa-profil`
 * karena tidak punya baris app_user.
 *
 * Akibatnya suite ini tidak aman dijalankan dua kali dalam 15 menit. Diukur:
 * jalan kedua gagal dengan "Terlalu banyak percobaan gagal. Coba lagi dalam 14
 * menit." pada test yang seharusnya memeriksa pesan akun nonaktif — kegagalan
 * yang menuduh halaman login, padahal sebabnya sisa kunci dari jalan
 * sebelumnya.
 *
 * Memberi tiap jalan IP-nya sendiri memberi tiap jalan ember hitungannya
 * sendiri. Yang TIDAK dilakukan: menyisipkan baris LOGIN palsu ke audit_log
 * untuk mereset hitungan. Itu memang berhasil secara teknis, dan justru itu
 * bahayanya — audit log yang memuat login yang tidak pernah terjadi tidak lagi
 * berguna sebagai bukti apa pun.
 */
const IP_JALAN = `10.90.${Math.floor(Date.now() / 1000) % 254}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /*
   * Dua worker, bukan setengah jumlah core.
   *
   * Bawaan Playwright di mesin ini enam, dan gate login gagal berpindah-pindah
   * karenanya: `waitForSelector` menunggu 30 detik untuk form yang seharusnya
   * muncul dalam sedetik, lalu test lain gagal di tempat yang berbeda pada
   * jalan berikutnya. Yang diperebutkan bukan CPU melainkan tiga hal yang
   * memang tunggal — satu dev server yang mengkompilasi rute saat pertama
   * diminta, satu proyek Supabase, dan satu database.
   *
   * Kegagalan seperti itu paling berbahaya bukan karena menghambat, melainkan
   * karena mengajari orang mengabaikan gate yang merah. Enam kali lebih cepat
   * tidak sepadan dengan gate yang tidak dipercaya.
   */
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        extraHTTPHeaders: { 'x-forwarded-for': `${IP_JALAN}.1` },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], extraHTTPHeaders: { 'x-forwarded-for': `${IP_JALAN}.2` } },
    },
  ],
  /*
   * Kesiapan diukur dari sebuah rute API, bukan dari beranda.
   *
   * `url: 'http://localhost:3000'` berhenti bekerja begitu middleware T-045
   * masuk: beranda kini menjawab 307 ke `/login`, dan `/login` sendiri belum
   * tentu ada — Playwright tidak pernah menerima jawaban yang diterimanya dan
   * menyerah setelah 120 detik, padahal dev server siap dalam 1,6 detik.
   *
   * `port: 3000` juga dicoba dan lebih buruk: soket terbuka sebelum Next siap
   * melayani, dan navigasi pertama gagal dengan ERR_ABORTED.
   *
   * Yang dipakai sekarang memanfaatkan perilaku middleware itu sendiri.
   * Permintaan `/api/*` tanpa sesi dijawab 401 JSON — bukan dialihkan — dan
   * 401 termasuk status yang diterima Playwright sebagai tanda server hidup.
   * Jawaban itu datang dari middleware, jadi tidak bergantung pada satu pun
   * halaman atau route yang mungkin belum dibuat lane lain.
   */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/e2e-siap',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
