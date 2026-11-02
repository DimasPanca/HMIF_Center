/**
 * Gate Bantuan (ADR-060):
 *   1. Guide terbuka dari sidebar, pencarian menemukan bagian lintas panduan dan menautkannya.
 *   2. Dhana: panel terbuka dari pojok kiri bawah; API menolak tamu dan pesan tidak valid
 *      (jawaban Gemini sendiri tidak diuji di sini — layanan eksternal berbayar).
 *   3. Lapor bug: Anggota melapor dengan tangkapan layar; lampiran palsu ditolak; Admin melihat
 *      laporan dan mengubah statusnya; pelapor melihat status & catatan baru.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

function bacaKoneksi(): string {
  const env: Record<string, string> = {};
  const berkas = path.resolve('.env.local');
  if (fs.existsSync(berkas)) {
    for (const b of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const i = b.indexOf('=');
      if (i > 0 && !b.trimStart().startsWith('#')) env[b.slice(0, i).trim()] = b.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error('Gate bantuan butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let tag = '';

async function sesi(browser: Browser, akun: AkunUji): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  return page;
}

/** PNG 1×1 yang sah (magic bytes asli). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.beforeAll(() => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM laporan_bug WHERE deskripsi LIKE ${`E2E-BUG ${tag}%`}`.catch(() => {});
    await sql.end();
  }
});

test('Guide: dibuka dari sidebar, pencarian menautkan ke bagian panduan', async ({ browser, isMobile }) => {
  const page = await sesi(browser, AKUN.anggota);
  if (isMobile) await page.getByRole('button', { name: /buka navigasi|menu/i }).first().click();
  await page.getByTestId('sidebar-bantuan-guide').click();
  await page.waitForURL(/\/guide$/, { timeout: 60_000 });
  await expect(page.getByTestId('guide-isi')).toContainText('Kabinet Vardhana (2026–2027)');
  await expect(page.getByTestId('guide-dok-anggota')).toContainText('untuk Anda');

  await page.getByTestId('guide-cari').fill('upload nota hp');
  const hasil = page.getByTestId('guide-hasil').getByRole('option');
  await expect(hasil.first()).toContainText('Mengunggah nota');
  await hasil.first().getByRole('link').click();
  await page.waitForURL(/\/guide\/anggota#3-/, { timeout: 60_000 });
  await expect(page.getByTestId('guide-isi')).toContainText('Panduan Anggota');
  await page.context().close();
});

test('Dhana: panel terbuka; API menolak tamu dan pesan tidak valid', async ({ browser, request, isMobile }) => {
  const page = await sesi(browser, AKUN.anggota);
  await page.getByTestId(isMobile ? 'dhana-buka-hp' : 'dhana-buka').click();
  await expect(page.getByTestId('dhana-panel')).toBeVisible();
  await expect(page.getByTestId('dhana-panel')).toContainText('Your Knowledge Companion');
  await expect(page.getByTestId('dhana-kirim')).toBeDisabled();
  await page.getByTestId('dhana-tutup').click();
  await expect(page.getByTestId('dhana-panel')).toHaveCount(0);

  const tidakSah = await page.request.post('/api/dhana', { data: { pesan: [{ peran: 'dhana', teks: 'halo' }] } });
  expect(tidakSah.status()).toBe(422);
  await page.context().close();

  const tamu = await request.post('/api/dhana', { data: { pesan: [{ peran: 'pengguna', teks: 'halo' }] } });
  expect([401, 403]).toContain(tamu.status());
});

test('Lapor bug: Anggota melapor, Admin menindak, pelapor melihat statusnya', async ({ browser }) => {
  const anggota = await sesi(browser, AKUN.anggota);
  await anggota.goto('/bantuan/lapor-bug', { waitUntil: 'load' });
  await anggota.getByTestId('bug-deskripsi').fill(`E2E-BUG ${tag} tombol simpan tidak merespons`);
  await anggota.getByTestId('bug-lampiran').setInputFiles({ name: 'layar.png', mimeType: 'image/png', buffer: PNG });
  await anggota.getByTestId('bug-kirim').click();
  await expect(anggota.getByTestId('bug-terkirim')).toBeVisible({ timeout: 30_000 });
  await expect(anggota.getByTestId('bug-item').filter({ hasText: `E2E-BUG ${tag}` })).toContainText('Baru');

  const [baris] = await sql<{ id: string; lampiran_key: string | null; halaman: string | null }[]>`
    SELECT id::text, lampiran_key, halaman FROM laporan_bug WHERE deskripsi LIKE ${`E2E-BUG ${tag}%`}`;
  expect(baris!.lampiran_key).toMatch(new RegExp(`^laporan-bug/${baris!.id}\\.png$`));

  const palsu = await anggota.request.post('/api/bug', {
    multipart: { deskripsi: `E2E-BUG ${tag} palsu`, lampiran: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('bukan gambar') } },
  });
  expect(palsu.status()).toBe(422);
  expect((await anggota.request.patch(`/api/bug/${baris!.id}`, { data: { status: 'SELESAI' } })).status()).toBe(403);

  const admin = await sesi(browser, AKUN.admin);
  await admin.goto('/admin/laporan-bug', { waitUntil: 'load' });
  const item = admin.getByTestId('admin-bug-item').filter({ hasText: `E2E-BUG ${tag}` });
  await expect(item).toBeVisible({ timeout: 60_000 });
  await item.getByTestId('admin-bug-status').selectOption('SELESAI');
  await item.getByRole('textbox').fill('Sudah diperbaiki.');
  await item.getByTestId('admin-bug-simpan').click();
  await expect.poll(async () => (await sql<{ status: string }[]>`SELECT status FROM laporan_bug WHERE id = ${baris!.id}::uuid`)[0]!.status, { timeout: 30_000 }).toBe('SELESAI');
  expect((await admin.request.get(`/api/bug/${baris!.id}/lampiran`)).status()).toBe(200);
  await admin.context().close();

  await anggota.reload({ waitUntil: 'load' });
  const milik = anggota.getByTestId('bug-item').filter({ hasText: `E2E-BUG ${tag}` });
  await expect(milik).toContainText('Selesai');
  await expect(milik).toContainText('Sudah diperbaiki.');
  await anggota.context().close();
});
