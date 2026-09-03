import { defineConfig, devices } from '@playwright/test';

/**
 * Konfigurasi test end-to-end.
 *
 * Proyek `mobile` bukan pelengkap: PRD §8.5 mewajibkan modul Nota dan Kanban
 * nyaman dipakai panitia dari ponsel di lapangan, dan T-115 mengujinya pada
 * lebar 375 px. Menjalankannya sejak awal mencegah regresi yang baru ketahuan
 * saat audit aksesibilitas.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
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
