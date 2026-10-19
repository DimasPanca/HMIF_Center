/**
 * Gate ADR-037 — di layar HP tidak ada halaman yang harus digeser ke samping,
 * dan tampilan khusus HP menjadi bawaan (Gantt = daftar, Kanban = per status,
 * tab acara = kisi). Sidebar hanya menyalakan SATU butir.
 *
 * Berjalan di proyek `mobile` saja dan MENGOSONGKAN preferensi tampilan yang
 * di-set playwright.config untuk gate lama, supaya yang diuji adalah bawaan.
 */

import { expect, test, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'mobile', 'Gate tampilan HP — hanya proyek mobile.');
});

async function masuk(page: Page) {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(AKUN.aktif.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function lebarHalaman(page: Page) {
  return page.evaluate(() => ({ dok: document.documentElement.scrollWidth, layar: document.documentElement.clientWidth }));
}

test('halaman utama tidak lebih lebar dari layar HP', async ({ page }) => {
  await masuk(page);
  for (const rute of ['/', '/proker', '/proker/kalender', '/acara', '/surat', '/surat/keterangan-aktif', '/departemen/kendala']) {
    await page.goto(rute, { waitUntil: 'networkidle', timeout: 120_000 });
    const { dok, layar } = await lebarHalaman(page);
    expect(dok, `${rute} melebar ${dok}px pada layar ${layar}px`).toBeLessThanOrEqual(layar);
  }
});

test('Gantt di Beranda tampil sebagai daftar bawaan, dapat dialihkan ke grafik', async ({ page }) => {
  await masuk(page);
  await page.goto('/', { waitUntil: 'networkidle', timeout: 120_000 });
  const daftar = page.getByTestId('gantt-tampilan-daftar');
  test.skip((await daftar.count()) === 0, 'Master Gantt tanpa data di DB uji.');
  await expect(daftar).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gantt-daftar-hp')).toBeVisible();
  await page.getByTestId('gantt-tampilan-grafik').click();
  await expect(page.getByTestId('gantt-tampilan-grafik')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gantt-daftar-hp')).toHaveCount(0);
});

test('sidebar hanya menyalakan satu butir (Kalender tidak ikut menyalakan Daftar Proker)', async ({ page }) => {
  await masuk(page);
  await page.goto('/proker/kalender', { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('button', { name: /buka (menu|navigasi)/i }).first().click();
  const nyala = page.locator('nav[aria-label="Menu aplikasi"] a[aria-current="page"]');
  await expect(nyala).toHaveCount(1);
  await expect(nyala).toHaveAttribute('href', '/proker/kalender');
});
