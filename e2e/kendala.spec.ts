/**
 * Gate T-082 — Kendala departemen (PRD F-7.3, USER_FLOW §8.2).
 *
 * Menguji:
 *   - kendala KRITIS yang dilaporkan Kadept muncul di dashboard Ketua < 3 detik
 *     tanpa muat ulang (kanal realtime);
 *   - balasan berulir menjorok hingga 3 tingkat, lebih dalam diratakan dengan
 *     keterangan "membalas X"; mention dipilih dari daftar & disorot;
 *   - BPH membaca seluruh kendala tetapi tidak dapat membalas/mengubah (UI & API);
 *   - menandai SELESAI wajib catatan penyelesaian;
 *   - arsip dapat dicari teks penuh, termasuk lewat isi catatan penyelesaian;
 *   - lampiran: berkas sah tersimpan privat, ekstensi palsu ditolak.
 *
 * Setiap jalan memakai judul bertanda unik dan menghapusnya di akhir.
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
  if (!url) throw new Error('Gate kendala butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let tag = '';
let dept = { id: '', kode: '' };
let ketuaId = '';

const judul = (s: string) => `E2E082 ${tag} ${s}`;

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function sesi(browser: Browser, akun: AkunUji): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await masuk(page, akun);
  return page;
}

async function lapor(page: Page, data: Record<string, unknown>): Promise<string> {
  const r = await page.request.post('/api/kendala', { data: { departemen_id: dept.id, deskripsi: 'Dibuat oleh gate e2e kendala.', ...data } });
  expect(r.status(), await r.text()).toBe(201);
  return ((await r.json()) as { data: { id: string } }).data.id;
}

async function balas(page: Page, id: string, konten: string, parent: string | null = null): Promise<string> {
  const r = await page.request.post(`/api/kendala/${id}/reply`, { data: { konten, parent_id: parent } });
  expect(r.status(), await r.text()).toBe(201);
  return ((await r.json()) as { data: { id: string } }).data.id;
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 'm' : 'd'}${Date.now().toString().slice(-6)}`;
  const [d] = await sql<{ id: string; kode: string }[]>`
    SELECT d.id::text, d.kode FROM user_role ur
    JOIN app_user u ON u.id = ur.user_id JOIN periode p ON p.id = ur.periode_id AND p.status = 'AKTIF'
    JOIN departemen d ON d.id = ur.departemen_id
    WHERE u.email = ${AKUN.kadept.email} AND ur.role = 'KADEPT' LIMIT 1`;
  dept = d!;
  const [k] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${AKUN.aktif.email}`;
  ketuaId = k!.id;
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM kendala WHERE judul LIKE ${`E2E082 ${tag}%`}`.catch(() => {});
    await sql.end();
  }
});

test('kendala Kritis muncul di dashboard Ketua < 3 detik', async ({ browser }) => {
  const ketua = await sesi(browser, AKUN.aktif);
  const kadept = await sesi(browser, AKUN.kadept);
  await ketua.goto('/', { waitUntil: 'load' });
  const kartu = ketua.getByTestId('dashboard-card-kendala-kritis');
  await expect(kartu).toBeVisible({ timeout: 60_000 });
  // Beri kanal waktu tersambung (handshake websocket + setAuth).
  await ketua.waitForTimeout(4_000);

  const j = judul('Sound system rusak H-1');
  await lapor(kadept, { judul: j, prioritas: 'KRITIS' });
  const mulai = Date.now();
  await expect(kartu.getByText(j)).toBeVisible({ timeout: 3_000 });
  expect(Date.now() - mulai).toBeLessThan(3_000);
  await expect(kartu.getByRole('link', { name: new RegExp(j) })).toHaveAttribute('href', /\/departemen\/kendala\//);
  await ketua.context().close();
  await kadept.context().close();
});

test('balasan berulir menjorok 3 tingkat, lebih dalam diratakan; mention disorot', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const id = await lapor(kadept, { judul: judul('Utas berulir') });
  const t1 = await balas(kadept, id, 'Tingkat satu');
  const t2 = await balas(kadept, id, 'Tingkat dua', t1);
  const t3 = await balas(kadept, id, 'Tingkat tiga', t2);
  const t4 = await balas(kadept, id, 'Tingkat empat', t3);
  const t5 = await balas(kadept, id, 'Tingkat lima', t4);

  await kadept.goto(`/departemen/kendala/${id}`, { waitUntil: 'load' });
  for (const [b, k] of [
    [t1, '1'],
    [t2, '2'],
    [t3, '3'],
    [t4, '3'],
    [t5, '3'],
  ] as const) {
    await expect(kadept.getByTestId(`balasan-${b}`)).toHaveAttribute('data-kedalaman', k, { timeout: 60_000 });
  }
  // Indentasi nyata: tingkat 2 lebih menjorok dari 1, tingkat 3 dari 2; 4 & 5 sejajar 3.
  const x = async (b: string) => (await kadept.getByTestId(`balasan-${b}`).boundingBox())!.x;
  const [x1, x2, x3, x4, x5] = [await x(t1), await x(t2), await x(t3), await x(t4), await x(t5)];
  expect(x2).toBeGreaterThan(x1);
  expect(x3).toBeGreaterThan(x2);
  expect(x4).toBe(x3);
  expect(x5).toBe(x3);
  await expect(kadept.getByTestId(`balasan-${t4}`)).toContainText('membalas Uji E2E Kadept');

  // Mention lewat daftar saran.
  const input = kadept.getByTestId('mention-input').last();
  await input.click();
  await input.pressSequentially('Mohon dicek @Akt');
  await kadept.getByTestId(`mention-opsi-${ketuaId}`).click();
  await input.pressSequentially('sebelum rapat.');
  await kadept.getByTestId('balasan-kirim').last().click();
  const mention = kadept.getByTestId('balasan-mention').filter({ hasText: '@Uji E2E Aktif' });
  await expect(mention).toBeVisible({ timeout: 30_000 });
  const [r] = await sql<{ konten: string }[]>`SELECT konten FROM kendala_reply WHERE kendala_id = ${id}::uuid ORDER BY created_at DESC LIMIT 1`;
  expect(r!.konten).toBe(`Mohon dicek @[Uji E2E Aktif](${ketuaId}) sebelum rapat.`);
  await kadept.context().close();
});

test('BPH membaca seluruh kendala tetapi tidak dapat membalas atau mengubah', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const id = await lapor(kadept, { judul: judul('Dibaca BPH') });
  await balas(kadept, id, 'Balasan Kadept');
  await kadept.context().close();

  const bph = await sesi(browser, AKUN.bacaSaja);
  await bph.goto('/departemen/kendala?status=', { waitUntil: 'load' });
  await expect(bph.getByTestId(`kendala-baris-${id}`)).toBeVisible({ timeout: 60_000 });
  await bph.goto(`/departemen/kendala/${id}`, { waitUntil: 'load' });
  await expect(bph.getByText('Balasan Kadept')).toBeVisible({ timeout: 60_000 });
  await expect(bph.getByTestId('utas-baca-saja')).toBeVisible();
  await expect(bph.getByTestId('kendala-baca-saja')).toBeVisible();
  await expect(bph.getByTestId('balasan-kirim')).toHaveCount(0);
  await expect(bph.getByTestId('kendala-status')).toBeDisabled();

  expect((await bph.request.post(`/api/kendala/${id}/reply`, { data: { konten: 'coba' } })).status()).toBe(403);
  expect((await bph.request.patch(`/api/kendala/${id}`, { data: { prioritas: 'RENDAH' } })).status()).toBe(403);
  expect((await bph.request.delete(`/api/kendala/${id}`)).status()).toBe(403);
  expect((await bph.request.post('/api/kendala', { data: { departemen_id: dept.id, judul: 'x', deskripsi: 'x' } })).status()).toBe(403);
  await bph.context().close();
});

test('SELESAI wajib catatan penyelesaian; arsip dicari teks penuh lewat solusinya', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const id = await lapor(kadept, { judul: judul('Perizinan gedung tertahan') });
  expect((await kadept.request.patch(`/api/kendala/${id}`, { data: { status: 'SELESAI' } })).status()).toBe(422);

  await kadept.goto(`/departemen/kendala/${id}`, { waitUntil: 'load' });
  await kadept.getByTestId('kendala-status').selectOption('SELESAI', { timeout: 60_000 });
  await kadept.getByTestId('kendala-simpan').click();
  await expect(kadept.getByTestId('kendala-galat')).toContainText('catatan penyelesaian');
  const solusi = `Surat disposisi wakil dekan ${tag}zx`;
  await kadept.getByTestId('kendala-catatan').fill(solusi);
  await kadept.getByTestId('kendala-simpan').click();
  await expect(kadept.getByTestId('kendala-catatan-tampil')).toContainText(solusi, { timeout: 30_000 });
  const [k] = await sql<{ status: string; resolved_at: Date | null }[]>`SELECT status::text, resolved_at FROM kendala WHERE id = ${id}::uuid`;
  expect(k!.status).toBe('SELESAI');
  expect(k!.resolved_at).not.toBeNull();

  // Pencarian teks penuh — kata dari catatan solusi, termasuk yang sudah selesai.
  await kadept.goto(`/departemen/${dept.kode}/kendala`, { waitUntil: 'load' });
  await kadept.getByTestId('kendala-cari').fill(`disposisi ${tag}zx`);
  await kadept.getByTestId('kendala-filter-status').selectOption('');
  await kadept.getByTestId('kendala-terapkan').click();
  await expect(kadept.getByTestId(`kendala-baris-${id}`)).toBeVisible({ timeout: 60_000 });
  await expect(kadept.getByTestId('kendala-daftar').locator('li')).toHaveCount(1);
  // Kata yang tak ada di mana pun → kosong.
  await kadept.goto(`/departemen/${dept.kode}/kendala?status=&q=${encodeURIComponent(`tidakada${tag}`)}`, { waitUntil: 'load' });
  await expect(kadept.getByTestId('kendala-kosong')).toBeVisible({ timeout: 60_000 });
  await kadept.context().close();
});

test('lapor lewat form + lampiran: berkas sah tersimpan, ekstensi palsu ditolak', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  await kadept.goto(`/departemen/${dept.kode}/kendala`, { waitUntil: 'load' });
  await kadept.getByTestId('lapor-kendala').click({ timeout: 60_000 });
  await kadept.getByTestId('lapor-judul').fill(judul('Sponsor mundur'));
  await kadept.getByTestId('lapor-deskripsi').fill('Sponsor utama membatalkan komitmen dana.');
  await kadept.getByTestId('lapor-prioritas').selectOption('TINGGI');
  await kadept.getByTestId('lapor-simpan').click();
  await kadept.waitForURL(/\/departemen\/kendala\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = kadept.url().split('/').pop()!;

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  await kadept.getByTestId('lampiran-unggah').setInputFiles({ name: 'bukti.png', mimeType: 'image/png', buffer: png });
  await expect(kadept.getByRole('link', { name: 'bukti.png' })).toBeVisible({ timeout: 30_000 });
  const [l] = await sql<{ id: string; storage_key: string }[]>`SELECT id::text, storage_key FROM kendala_lampiran WHERE kendala_id = ${id}::uuid`;
  expect(l!.storage_key).toMatch(new RegExp(`^kendala/${id}/`));
  const unduh = await kadept.request.get(`/api/kendala/lampiran/${l!.id}`);
  expect(unduh.status()).toBe(200);
  expect(Buffer.from(await unduh.body()).equals(png)).toBe(true);

  await kadept.getByTestId('lampiran-unggah').setInputFiles({ name: 'palsu.png', mimeType: 'image/png', buffer: Buffer.from('MZ bukan gambar') });
  await expect(kadept.getByTestId('kendala-galat')).toContainText('Jenis berkas tidak diterima', { timeout: 30_000 });

  await kadept.getByTestId(`lampiran-hapus-${l!.id}`).click();
  await expect(kadept.getByRole('link', { name: 'bukti.png' })).toHaveCount(0, { timeout: 30_000 });
  await kadept.context().close();
});
