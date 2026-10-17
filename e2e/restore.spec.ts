/**
 * Gate E2E T-112 — dialog restore di halaman Admin backup.
 *
 * Database dev dipakai bersama, jadi gate ini TIDAK PERNAH menjalankan restore:
 * restore end-to-end (penuh dari .sql.gz, prokers.json ke tabel kosong,
 * strategi) diuji di dalam transaksi yang di-rollback oleh
 * `npx tsx scripts/e2e-restore.ts`. Di sini:
 *   1. Impor per modul: pratinjau prokers (Tambah) menampilkan hitungan per
 *      tabel; audit-log + Timpa ditolak (INV-06) tanpa tombol jalankan.
 *   2. Restore penuh: tombol jalankan baru aktif setelah nama sistem diketik
 *      persis; server juga menolak konfirmasi yang salah (422).
 *   3. BPH tidak melihat tombol restore dan ditolak POST (403).
 *
 * Butuh satu backup SUKSES sungguhan (manifest.json ada di storage) — buat
 * dengan `npx tsx scripts/verify-backup.ts --jalankan`. Tanpa itu SKIP.
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

function bacaKoneksi(): string | undefined {
  const berkas = path.resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(berkas)) {
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const t = baris.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0)
        env[t.slice(0, i).trim()] = t
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
    }
  }
  const g = { ...env, ...process.env };
  return g.DIRECT_URL ?? g.DATABASE_URL;
}

let idBackup: string | null = null;

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

test.beforeAll(async () => {
  const url = bacaKoneksi();
  if (!url) return;
  const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
  const [b] = await sql<{ id: string }[]>`
    SELECT id FROM backup WHERE status = 'SUKSES' AND manifest->>'format' = '1' AND manifest ? 'migrasiTerakhir'
    ORDER BY created_at DESC LIMIT 1`;
  idBackup = b?.id ?? null;
  await sql.end();
});

function baris(page: Page) {
  return page.locator(`[data-testid="baris-backup"][data-id="${idBackup}"]`);
}

test('impor per modul: pratinjau prokers, audit-log Timpa ditolak', async ({ page }) => {
  test.skip(!idBackup, 'Belum ada backup SUKSES sungguhan');
  await masuk(page, AKUN.admin);
  await page.goto('/admin/backup', { waitUntil: 'load' });
  await baris(page).getByTestId('buka-import-modul').click({ timeout: 60_000 });
  const d = page.getByTestId('dialog-import-modul');
  await d.getByTestId('modul-prokers').check();
  await d.getByTestId('strategi-TAMBAH').check();
  await expect(d.getByTestId('jalankan-import-modul')).toBeDisabled();
  await d.getByTestId('pratinjau-modul').click();
  await expect(d.getByTestId('pratinjau-proker')).toBeVisible({ timeout: 120_000 });
  await expect(d.getByTestId('jalankan-import-modul')).toBeEnabled();
  // Ganti pilihan → pratinjau lama tidak berlaku lagi.
  await d.getByTestId('modul-prokers').uncheck();
  await d.getByTestId('modul-audit-log').check();
  await d.getByTestId('strategi-TIMPA').check();
  await expect(d.getByTestId('jalankan-import-modul')).toBeDisabled();
  await d.getByTestId('pratinjau-modul').click();
  await expect(d.getByTestId('restore-ditolak')).toContainText('append-only', { timeout: 60_000 });
  await expect(d.getByTestId('jalankan-import-modul')).toBeDisabled();
});

test('restore penuh: jalankan hanya setelah nama sistem diketik persis; server menolak yang salah', async ({
  page,
}) => {
  test.skip(!idBackup, 'Belum ada backup SUKSES sungguhan');
  await masuk(page, AKUN.admin);
  await page.goto('/admin/backup', { waitUntil: 'load' });
  await baris(page).getByTestId('buka-restore-penuh').click({ timeout: 60_000 });
  const d = page.getByTestId('dialog-restore-penuh');
  await expect(d.getByTestId('pratinjau-restore')).toBeVisible({ timeout: 120_000 });
  const tombol = d.getByTestId('jalankan-restore-penuh');
  // Bundel dari migrasi lain ditolak dengan pesan; bila cocok, konfirmasi diperlukan.
  if (await d.getByTestId('restore-ditolak').count()) {
    await expect(tombol).toBeDisabled();
  } else {
    await d.getByTestId('konfirmasi-restore').fill('hmif center');
    await expect(tombol).toBeDisabled();
    await d.getByTestId('konfirmasi-restore').fill('HMIF Center');
    await expect(tombol).toBeEnabled();
  }
  const r = await page.request.post(`/api/backup/${idBackup}/restore`, {
    data: { aksi: 'mulai', permintaan: { mode: 'PENUH', konfirmasi: 'RESTORE PENUH' } },
  });
  expect(r.status()).toBe(422);
  expect((await r.json()).error.code).toBe('VALIDASI_GAGAL');
});

test('BPH tidak dapat memulihkan', async ({ page }) => {
  test.skip(!idBackup, 'Belum ada backup SUKSES sungguhan');
  await masuk(page, AKUN.bacaSaja);
  await page.goto('/admin/backup', { waitUntil: 'load' });
  await expect(baris(page)).toBeVisible({ timeout: 60_000 });
  await expect(baris(page).getByTestId('buka-restore-penuh')).toHaveCount(0);
  await expect(baris(page).getByTestId('buka-import-modul')).toHaveCount(0);
  const r = await page.request.post(`/api/backup/${idBackup}/restore`, {
    data: {
      aksi: 'pratinjau',
      permintaan: { mode: 'MODUL', modul: ['prokers'], strategi: 'TAMBAH' },
    },
  });
  expect(r.status()).toBe(403);
  expect((await page.request.get(`/api/backup/${idBackup}/restore`)).status()).toBe(200);
});
