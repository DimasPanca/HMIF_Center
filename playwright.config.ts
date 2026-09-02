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
  webServer: {
    command: 'npm run dev',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
