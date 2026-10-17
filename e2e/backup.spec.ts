/**
 * Gate E2E T-110 — halaman Admin backup: akses, progres, satu backup pada satu waktu.
 *
 * Backup sungguhan memakan menit (dump + arsip seluruh storage) dan sudah
 * diuji `npm run test -- backup-service` + `npx tsx scripts/verify-backup.ts`.
 * Di sini baris `backup` di-seed langsung supaya UI-nya teruji deterministik:
 *   1. Admin melihat progres backup BERJALAN, tombol "Backup Sekarang"
 *      nonaktif, dan POST kedua ditolak 409 — tidak pernah memulai backup
 *      sungguhan selama baris seed BERJALAN ada.
 *   2. Saat baris menjadi SUKSES, UI yang memantau ikut berubah tanpa reload.
 *   3. BPH (backup R) melihat daftar tanpa tombol dan ditolak POST (403);
 *      Anggota tidak dapat membuka halaman.
 *
 * Tanpa DIRECT_URL/DATABASE_URL seluruh test SKIP.
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

// Kompilasi rute dingin di dev server bisa memakan puluhan detik.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

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

let sql: ReturnType<typeof postgres> | null = null;
const seed: string[] = [];
let idJalan = '';

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
  sql = postgres(url, { ssl: 'require', max: 2, onnotice: () => {} });
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO backup (jenis, status, storage_key, manifest)
    VALUES ('MANUAL', 'BERJALAN', 'backup/e2e/', ${sql.json({ progres: { tahap: 'ARSIP', persen: 63, pesan: 'Mengarsipkan berkas 50/80 (e2e)' } })})
    RETURNING id`;
  idJalan = b!.id;
  seed.push(idJalan);
});

test.afterAll(async () => {
  if (sql && seed.length) await sql`DELETE FROM backup WHERE id IN ${sql(seed)}`;
  await sql?.end();
});

test('Admin melihat progres; tombol nonaktif; POST kedua ditolak 409; UI ikut SUKSES', async ({
  page,
}) => {
  test.skip(!sql, 'DB tidak tersedia');
  await masuk(page, AKUN.admin);
  await page.goto('/admin/backup', { waitUntil: 'load' });
  const baris = page.locator(`[data-testid="baris-backup"][data-id="${idJalan}"]`);
  await expect(baris).toHaveAttribute('data-status', 'BERJALAN', { timeout: 60_000 });
  await expect(baris.getByTestId('progres-backup')).toContainText(
    '63% · Mengarsipkan berkas 50/80 (e2e)',
  );
  await expect(baris.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  await expect(page.getByTestId('backup-sekarang')).toBeDisabled();

  const r = await page.request.post('/api/backup');
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe('KONFLIK');

  await sql!`UPDATE backup SET status = 'SUKSES', completed_at = now(), ukuran_bytes = 2048,
    manifest = ${sql!.json({ versiSkema: '1', migrasiTerakhir: '047_e2e', files: [{ path: 'a', size: 1, checksum: '0'.repeat(64) }], jumlahRecord: { users: 3 }, keterbatasan: [] })}
    WHERE id = ${idJalan}`;
  await expect(baris).toHaveAttribute('data-status', 'SUKSES', { timeout: 15_000 });
  await expect(baris).toContainText('2.0 KB · 2 berkas · 3 record · skema v1 (047_e2e)');
  await expect(baris.getByTestId('progres-backup')).toHaveCount(0);
});

test('BPH membaca tanpa tombol dan ditolak POST; Anggota tidak dapat membuka', async ({ page }) => {
  test.skip(!sql, 'DB tidak tersedia');
  await masuk(page, AKUN.bacaSaja);
  await page.goto('/admin/backup', { waitUntil: 'load' });
  await expect(page.getByTestId('daftar-backup')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('backup-sekarang')).toHaveCount(0);
  expect((await page.request.post('/api/backup')).status()).toBe(403);

  await masuk(page, AKUN.anggota);
  const res = await page.goto('/admin/backup', { waitUntil: 'load' });
  expect(res?.status()).toBe(404);
  expect((await page.request.get('/api/backup')).status()).toBe(403);
});
