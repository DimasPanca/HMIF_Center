/**
 * Gate T-115 — aksesibilitas & responsif (PRD §8.6, DESIGN_SYSTEM §13–14).
 *
 *   npm run test:e2e -- a11y
 *
 *   1. 375 px: halaman inti — terutama Nota & Kanban (panitia di lapangan,
 *      PRD §8.5) — tanpa gulir horizontal; kontrol interaktif tetap terjangkau.
 *   2. Setiap input/select/textarea punya label; setiap tombol & tautan punya
 *      nama aksesibel; setiap gambar punya alt.
 *   3. Login dapat diselesaikan TANPA mouse; elemen fokus menampilkan
 *      indikator fokus; galat login terhubung `aria-describedby` dan diumumkan
 *      (role=alert / live region).
 *   4. `prefers-reduced-motion`: logo animasi diganti logo statis; transisi
 *      CSS dimatikan.
 *   5. K-15: status tidak hanya lewat warna — setiap StatusPill membawa ikon DAN teks.
 *
 * Kontras warna kedua tema diaudit unit test `a11y-kontras` (token
 * app/globals.css); hasilnya di docs/ai/A11Y_REPORT.md.
 */

import { expect, test, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 300_000 });
test.beforeEach(({}, info) =>
  test.skip(info.project.name !== 'desktop', 'viewport diatur per test'),
);

const PONSEL = { width: 375, height: 812 };

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
    timeout: 90_000,
    waitUntil: 'commit',
  });
}

/** Pelanggaran dasar yang dapat diperiksa tanpa pustaka tambahan. */
async function periksaHalaman(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hasil: string[] = [];
    const terlihat = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const nama = (el: Element) => {
      const e = el as HTMLElement;
      const label = e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null;
      const ref = e
        .getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((i) => document.getElementById(i)?.textContent ?? '')
        .join(' ');
      return (
        e.getAttribute('aria-label') ||
        ref ||
        label?.textContent ||
        e.closest('label')?.textContent ||
        e.getAttribute('title') ||
        (['BUTTON', 'A'].includes(e.tagName) ? e.textContent : '') ||
        e.querySelector('img[alt],svg[aria-label]')?.getAttribute('alt') ||
        ''
      ).trim();
    };
    const sel = (e: Element) =>
      `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${(e as HTMLElement).dataset.testid ? `[data-testid=${(e as HTMLElement).dataset.testid}]` : ''}`;
    for (const e of document.querySelectorAll('input:not([type=hidden]),select,textarea')) {
      if (terlihat(e) && !nama(e)) hasil.push(`kontrol tanpa label: ${sel(e)}`);
    }
    for (const e of document.querySelectorAll('button,a[href],[role=button]')) {
      if (terlihat(e) && !nama(e))
        hasil.push(
          `tombol/tautan tanpa nama: ${sel(e)} ${(e as HTMLElement).outerHTML.slice(0, 80)}`,
        );
    }
    for (const e of document.querySelectorAll('img')) {
      if (!e.hasAttribute('alt')) hasil.push(`gambar tanpa alt: ${e.getAttribute('src')}`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      const lebar = [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && terlihat(e))
        .slice(0, 3)
        .map(sel);
      hasil.push(
        `gulir horizontal: ${document.documentElement.scrollWidth}px > ${window.innerWidth}px (${lebar.join(', ')})`,
      );
    }
    return hasil;
  });
}

const HALAMAN: { akun: AkunUji; jalur: string[] }[] = [
  { akun: AKUN.anggota, jalur: ['/', '/keuangan/nota', '/keuangan/nota/upload', '/acara'] },
  { akun: AKUN.kadept, jalur: ['/departemen/kanban', '/proker', '/departemen/kendala'] },
  { akun: AKUN.bendum, jalur: ['/keuangan/nota/verifikasi', '/surat'] },
];

test('375 px: halaman inti tanpa gulir horizontal, kontrol berlabel, tombol bernama', async ({
  page,
}) => {
  await page.setViewportSize(PONSEL);
  const temuan: string[] = [];
  await page.goto('/login', { waitUntil: 'load' });
  temuan.push(...(await periksaHalaman(page)).map((x) => `/login ${x}`));
  for (const { akun, jalur } of HALAMAN) {
    await masuk(page, akun);
    for (const j of jalur) {
      await page.goto(j, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
      temuan.push(...(await periksaHalaman(page)).map((x) => `${j} (${akun.role}) ${x}`));
    }
  }
  expect(temuan, temuan.join('\n')).toEqual([]);
});

test('login tanpa mouse; fokus terlihat; galat terhubung aria-describedby dan diumumkan', async ({
  page,
}) => {
  await page.goto('/login', { waitUntil: 'load' });
  // Galat lebih dulu: password salah lewat keyboard.
  await page.locator('body').focus();
  const email = page.getByLabel(/email/i);
  const sandi = page.getByLabel(/password|kata sandi/i);
  for (let i = 0; i < 15 && !(await email.evaluate((e) => e === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(email).toBeFocused();
  const cincin = await email.evaluate((e) => {
    const s = getComputedStyle(e);
    return s.outlineStyle !== 'none' || s.boxShadow !== 'none';
  });
  expect(cincin, 'indikator fokus pada kolom email').toBe(true);
  await page.keyboard.type(AKUN.aktif.email);
  await page.keyboard.press('Tab');
  await expect(sandi).toBeFocused();
  await page.keyboard.type('salah-sekali');
  await page.keyboard.press('Enter');
  const galat = page.getByTestId('login-error');
  await expect(galat).toBeVisible({ timeout: 60_000 });
  await expect(galat).toHaveAttribute('role', 'alert');
  await expect(sandi).toHaveAttribute('aria-describedby', (await galat.getAttribute('id'))!);

  await sandi.fill('');
  await sandi.focus();
  await page.keyboard.type(PASSWORD_UJI);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
    timeout: 90_000,
    waitUntil: 'commit',
  });
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 60_000 });
  // Navigasi utama terjangkau keyboard: tautan sidebar dapat difokus.
  await page.locator('nav[aria-label="Menu aplikasi"] a').first().focus();
  await expect(page.locator('nav[aria-label="Menu aplikasi"] a').first()).toBeFocused();
});

test('prefers-reduced-motion: logo statis, transisi dimatikan', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/login', { waitUntil: 'load' });
  await expect(page.getByTestId('login-logo-animasi')).toBeHidden();
  await expect(page.getByRole('img', { name: /Logo HMIF/ })).toBeVisible();
  const durasi = await page
    .getByRole('button', { name: /masuk/i })
    .evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(durasi.split(',').every((d) => parseFloat(d) <= 0.01)).toBe(true);
  await ctx.close();
});

test('K-15: setiap status pill membawa ikon dan teks, bukan warna saja', async ({ page }) => {
  await masuk(page, AKUN.aktif);
  let total = 0;
  for (const j of ['/proker', '/acara', '/surat']) {
    await page.goto(j, { waitUntil: 'load', timeout: 120_000 });
    const pill = page.locator('[data-slot="status-pill"]');
    const n = await pill.count();
    total += n;
    for (let i = 0; i < n; i++) {
      const p = pill.nth(i);
      await expect(p.locator('svg')).toHaveCount(1);
      expect(((await p.textContent()) ?? '').trim().length).toBeGreaterThan(1);
    }
  }
  expect(total).toBeGreaterThan(0);
});
