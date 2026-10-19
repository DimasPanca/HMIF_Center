/**
 * Gate — tidak ada tautan sidebar yang mati.
 *
 * Ditemukan pemilik 2026-10-17: menu TOR, Proposal, Ruang Kerja Divisi, RAB,
 * dan LPJ menautkan ke halaman indeks yang tidak pernah dibuat (404), karena
 * fiturnya milik SATU acara. Kini menu itu membuka daftar acara sebagai
 * pemilih (`/acara?buka=…`). Gate ini mengunjungi SETIAP tautan sidebar yang
 * terlihat oleh Admin dan Ketua dan menolak 404, supaya menu baru tanpa
 * halaman tidak lolos lagi. (ADR-037: menu pemilih acara itu kemudian dihapus
 * dari sidebar karena dobel dengan tab acara; rute `?buka=` tetap berfungsi.)
 */

import { expect, test, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 300_000 });

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 60_000,
    waitUntil: 'commit',
  });
}

for (const akun of [AKUN.admin, AKUN.aktif]) {
  test(`setiap tautan sidebar terbuka (${akun.role})`, async ({ page }) => {
    await masuk(page, akun);
    await page.goto('/acara', { waitUntil: 'load' });
    const tautan = await page
      .locator('nav[aria-label="Menu aplikasi"] a[href^="/"]')
      .evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute('href')!))]);
    // ADR-037: Admin kini hanya melihat Beranda + Administrasi (5 tautan).
    expect(tautan.length).toBeGreaterThan(3);

    const mati: string[] = [];
    for (const href of tautan) {
      const r = await page.goto(href, { waitUntil: 'commit', timeout: 120_000 });
      if (!r || r.status() === 404) mati.push(href);
    }
    expect(mati, `tautan sidebar 404: ${mati.join(', ')}`).toEqual([]);
  });
}

test('menu TOR membuka pemilih acara, lalu TOR acara yang dipilih', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await page.goto('/acara?buka=tor', { waitUntil: 'load' });
  // Satu acara → langsung dialihkan; lebih dari satu → judul pemilih.
  if (!/\/acara\/[0-9a-f-]{36}\?tab=tor/.test(page.url())) {
    await expect(page.getByTestId('acara-judul')).toHaveText('Pilih acara untuk membuka TOR');
    const pertama = page.getByTestId('acara-item-buka').first();
    await expect(pertama).toHaveAttribute('href', /^\/acara\/[0-9a-f-]{36}\?tab=tor$/);
    await pertama.click();
    await page.waitForURL(/\/acara\/[0-9a-f-]{36}\?tab=tor/, { timeout: 60_000 });
  }
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
});
