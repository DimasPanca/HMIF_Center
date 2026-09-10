/**
 * Gate E2E T-052 — command palette & pintasan keyboard.
 *
 * Menguji perilaku palette yang sudah dibangun lane ui (components/layout/
 * CommandPalette.tsx, lib/shortcuts.ts) — berkas ini milik lane data dan HANYA
 * membaca UI, tak mengubahnya. Selector mengikuti implementasi nyata:
 *   command-palette   dialog palette (terlihat saat terbuka)
 *   command-search    input pencarian (role=combobox)
 *   command-result-<id>   satu hasil (role=option); nav id: beranda/proker/surat/…
 *   shortcut-list     daftar pintasan (mode `?`)
 *   role=status aria-live  pengumuman jumlah hasil untuk screen reader
 *
 * Endpoint fitur surat/acara/pengurus belum ada — dukungan hasilnya diuji dengan
 * INTERSEPSI respons K-02, bukan dengan membangun endpoint (kontrak T-052).
 * Pencarian proker diuji terhadap `/api/proker` NYATA dengan fixture proker.
 *
 * Filter izin: ANGGOTA satu-satunya role tanpa `surat.read`, jadi hanya
 * dengannya terbukti menu surat disembunyikan dan `/api/surat` tak diminta.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-052 · DESIGN_SYSTEM §9.2 · USER_FLOW Lampiran
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

const PREFIX = 'E2E52';

function bacaKoneksi(): string | undefined {
  const berkas = path.resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(berkas)) {
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const t = baris.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  const g = { ...env, ...process.env };
  return g.DIRECT_URL ?? g.DATABASE_URL;
}

let sql: ReturnType<typeof postgres> | null = null;
let prokerCari: { id: string; nama: string } | null = null;

test.beforeAll(async () => {
  const k = bacaKoneksi();
  if (!k) return;
  sql = postgres(k, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  const per = (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`)[0]?.id;
  const dep = (await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan LIMIT 1`)[0]?.id;
  const u = (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`)[0]?.id;
  if (per && dep && u) {
    const nama = `${PREFIX} Zephyrus Cari`;
    const [p] = await sql<{ id: string }[]>`
      INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
      VALUES (${per}::uuid, ${dep}::uuid, ${nama}, 'TERJADWAL', 'DRAFT', '{}'::text[],
        '2028-11-01','2028-12-06','2028-12-07', ${u}::uuid)
      RETURNING id`;
    prokerCari = { id: p!.id, nama };
  }
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM proker WHERE nama LIKE ${PREFIX + ' %'}`.catch(() => {});
    await sql.end();
  }
  sql = null;
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForLoadState('networkidle');
}

const palette = (page: Page) => page.getByTestId('command-palette');

async function bukaPalet(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
}

// ---------------------------------------------------------------------------
// Membuka / menutup
// ---------------------------------------------------------------------------

test('Ctrl/Cmd+K membuka palette', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await expect(palette(page)).toBeHidden();
  await bukaPalet(page);
});

test('Esc menutup palette', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await bukaPalet(page);
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
});

test('? membuka daftar tujuh pintasan', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await page.keyboard.press('?');
  await expect(page.getByTestId('shortcut-list')).toBeVisible();
  await expect(page.getByTestId('shortcut-list').locator('ul > li')).toHaveCount(7);
});

// ---------------------------------------------------------------------------
// Pintasan navigasi
// ---------------------------------------------------------------------------

test('G lalu H menuju Beranda', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await page.goto('/proker', { waitUntil: 'load' });
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 8000 });
});

test('G lalu P menuju Program Kerja', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await page.keyboard.press('g');
  await page.keyboard.press('p');
  await page.waitForURL('**/proker', { timeout: 8000 });
});

test('G lalu S menuju Persuratan bila role berhak', async ({ page }) => {
  await masuk(page, AKUN.admin); // ADMIN punya surat.create
  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await page.waitForURL('**/surat', { timeout: 8000 });
});

test('N menuju halaman buat baru secara kontekstual', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await page.goto('/proker', { waitUntil: 'load' });
  await page.keyboard.press('n');
  await page.waitForURL('**/proker/baru', { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Navigasi hasil dengan keyboard
// ---------------------------------------------------------------------------

test('ArrowDown lalu Enter mengoperasikan hasil pencarian', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await bukaPalet(page);
  await page.getByTestId('command-search').fill('proker');
  await expect(page.getByTestId('command-result-list').getByRole('option').first()).toBeVisible();
  await page.getByTestId('command-search').press('ArrowDown');
  await page.getByTestId('command-search').press('Enter');
  await page.waitForURL((u) => new URL(u).pathname.startsWith('/proker'), { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Supresi saat mengetik
// ---------------------------------------------------------------------------

test('mengetik di input tidak memicu pintasan global', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await page.goto('/proker/baru', { waitUntil: 'load' });
  const nama = page.getByTestId('wizard-field-nama');
  await nama.click();
  await nama.pressSequentially('gp'); // g lalu p di dalam input
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe('/proker/baru'); // tak berpindah
  await expect(nama).toHaveValue('gp');
});

test('mengetik di combobox pencarian tidak memicu pintasan (mis. N)', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await bukaPalet(page);
  await page.getByTestId('command-search').pressSequentially('n');
  await page.waitForTimeout(300);
  await expect(palette(page)).toBeVisible(); // masih terbuka, N tidak menavigasi
  expect(new URL(page.url()).pathname).not.toBe('/proker/baru');
});

// ---------------------------------------------------------------------------
// Filter izin — ANGGOTA tak melihat & tak meminta surat
// ---------------------------------------------------------------------------

test('ANGGOTA tidak melihat menu surat dan tidak meminta /api/surat', async ({ page }) => {
  await masuk(page, AKUN.anggota);
  let mintaSurat = 0;
  await page.route('**/api/surat**', async (route) => {
    mintaSurat += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":[]}' });
  });

  await bukaPalet(page);
  await page.getByTestId('command-search').fill('surat');
  await page.waitForTimeout(600); // lewati debounce 180ms + fetch

  await expect(page.getByTestId('command-result-surat')).toHaveCount(0); // menu surat tersembunyi
  expect(mintaSurat).toBe(0); // tak pernah meminta sumber surat
});

// ---------------------------------------------------------------------------
// Pencarian proker terhadap API nyata
// ---------------------------------------------------------------------------

test('pencarian proker memakai /api/proker nyata', async ({ page }) => {
  test.skip(!prokerCari, 'Fixture proker tak tersedia (butuh DIRECT_URL).');
  await masuk(page, AKUN.admin);
  await bukaPalet(page);
  await page.getByTestId('command-search').fill('Zephyrus');
  await expect(page.getByTestId(`command-result-proker-${prokerCari!.id}`)).toBeVisible({ timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Dukungan hasil surat/acara/pengurus via intersepsi K-02
// ---------------------------------------------------------------------------

test('hasil surat dirender dari respons K-02 (endpoint diintersepsi)', async ({ page }) => {
  await masuk(page, AKUN.admin); // ADMIN punya surat.read
  await page.route('**/api/surat**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [{ id: 's1', perihal: 'Surat Uji Palette', status: 'DRAFT' }] }),
    });
  });

  await bukaPalet(page);
  await page.getByTestId('command-search').fill('palette');
  await expect(page.getByTestId('command-result-surat-s1')).toBeVisible({ timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Pengumuman screen reader
// ---------------------------------------------------------------------------

test('mengumumkan jumlah hasil untuk screen reader', async ({ page }) => {
  await masuk(page, AKUN.admin);
  await bukaPalet(page);
  await page.getByTestId('command-search').fill('proker');
  await expect(palette(page).getByRole('status')).toContainText('hasil tersedia');
});
