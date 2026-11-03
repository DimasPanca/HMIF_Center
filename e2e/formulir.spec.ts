/**
 * Gate Formulir (ADR-038) — alur nyata dari pembuat sampai data terstruktur:
 *
 *   1. Anggota panitia membuat form Pendaftaran dari template lewat wizard,
 *      lalu membukanya (DRAF → DIBUKA).
 *   2. Calon peserta TANPA akun mengisi lewat /f/{token}; jawaban tersimpan
 *      satu baris per pertanyaan dan pendaftar otomatis menjadi baris peserta.
 *   3. Server menolak berkas palsu (magic bytes), jawaban wajib yang kosong,
 *      dan bot honeypot tidak menghasilkan respons.
 *   4. Respons & ekspor hanya untuk pengelola; Kadept yang bukan panitia
 *      acara ini tidak dapat membacanya.
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
  if (!url) throw new Error('Gate formulir butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
let formId = '';
let token = '';
let tag = '';
let panitia: Page;

async function sesi(browser: Browser, akun: AkunUji): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  return page;
}

test.beforeAll(async ({ browser }) => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 1 : 2}${Date.now().toString().slice(-5)}`;
  const nama = `E2EFORM ${tag} Seminar`;
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const [kadept] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${AKUN.kadept.email}`;
  const [anggota] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${AKUN.anggota.email}`;
  const [d] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role
    WHERE user_id = ${kadept!.id}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;
  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${p!.id}::uuid, ${d!.id}::uuid, ${nama}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      '2028-11-01', '2028-12-06', '2028-12-07', ${kadept!.id}::uuid)
    RETURNING id::text`;
  prokerId = pr!.id;
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan) VALUES (${prokerId}::uuid, ${nama}, ${`FORM${tag}`}) RETURNING id::text`;
  acaraId = k!.id;
  const [dv] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama) VALUES (${acaraId}::uuid, 'Acara') RETURNING id::text`;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dv!.id}::uuid, ${anggota!.id}::uuid, 'ANGGOTA')`;
  panitia = await sesi(browser, AKUN.anggota);
});

test.afterAll(async () => {
  await panitia?.context().close();
  if (sql) {
    if (formId) await sql`DELETE FROM form WHERE id = ${formId}::uuid`.catch(() => {});
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('panitia membuat form Pendaftaran dari template lalu membukanya', async () => {
  await panitia.goto(`/form/baru?acara=${acaraId}`, { waitUntil: 'load' });
  await panitia.getByTestId('kategori-PENDAFTARAN').click();
  await expect(panitia.getByRole('radio', { name: /Form Pendaftaran Peserta/ })).toHaveAttribute('aria-checked', 'true');
  await panitia.getByTestId('wizard-lanjut').click();
  await expect(panitia.getByTestId('wizard-acara')).toHaveValue(acaraId);
  await panitia.getByTestId('wizard-judul').fill(`Pendaftaran ${tag}`);
  await panitia.getByTestId('wizard-buat').click();
  await panitia.waitForURL(/\/form\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  formId = panitia.url().split('/').pop()!;

  const [f] = await sql<{ status: string; akses: string; n: number; token: string }[]>`
    SELECT status, akses, token, (SELECT count(*)::int FROM form_pertanyaan WHERE form_id = f.id) AS n FROM form f WHERE id = ${formId}::uuid`;
  expect(f).toMatchObject({ status: 'DRAF', akses: 'PUBLIK' });
  expect(f!.n).toBeGreaterThanOrEqual(5);
  token = f!.token;

  await expect(panitia.getByTestId('status-form')).toHaveText('Draf');
  await panitia.getByTestId('buka-form').click();
  await expect(panitia.getByTestId('status-form')).toHaveText('Dibuka', { timeout: 30_000 });
  const [s] = await sql<{ status: string }[]>`SELECT status FROM form WHERE id = ${formId}::uuid`;
  expect(s!.status).toBe('DIBUKA');
});

test('calon peserta tanpa akun mengisi; jawaban terstruktur & peserta acara terbentuk', async ({ browser }) => {
  const tamu = await (await browser.newContext()).newPage();
  await tamu.goto(`/f/${token}`, { waitUntil: 'load' });
  await expect(tamu.getByRole('heading', { name: `Pendaftaran ${tag}` })).toBeVisible();

  // "Berikutnya" tanpa isian: galat wajib di bidang, tetap di bagian 1.
  await tamu.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(tamu.getByText('Pertanyaan ini wajib diisi.').first()).toBeVisible();

  await tamu.getByLabel('Nama lengkap').fill(`Peserta Form ${tag}`);
  await tamu.getByLabel('NIM').fill(`77${tag}`);
  await tamu.getByLabel('Angkatan').fill('2025');
  await tamu.getByLabel('Nomor WhatsApp').fill('081234567890');
  await tamu.getByLabel('Email').fill('PESERTA@Contoh.com');
  await tamu.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(tamu.getByText('Pembayaran', { exact: true }).first()).toBeVisible();
  await tamu.getByTestId('form-kirim').click();
  await expect(tamu.getByTestId('form-selesai')).toBeVisible({ timeout: 30_000 });
  await tamu.context().close();

  const [r] = await sql<{ id: string; user_id: string | null; integrasi: { peserta_id?: string } }[]>`
    SELECT id::text, user_id::text, integrasi FROM form_respons WHERE form_id = ${formId}::uuid`;
  expect(r!.user_id).toBeNull();
  const jawaban = await sql<{ judul: string; nilai_teks: string | null }[]>`
    SELECT p.judul, j.nilai_teks FROM form_jawaban j JOIN form_pertanyaan p ON p.id = j.pertanyaan_id WHERE j.respons_id = ${r!.id}::uuid ORDER BY p.urutan`;
  expect(jawaban.find((j) => j.judul === 'Email')?.nilai_teks).toBe('peserta@contoh.com');
  expect(jawaban).toHaveLength(5);
  const [ps] = await sql<{ nama_lengkap: string; nim: string }[]>`SELECT nama_lengkap, nim FROM peserta WHERE id = ${r!.integrasi.peserta_id!}::uuid`;
  expect(ps).toEqual({ nama_lengkap: `Peserta Form ${tag}`, nim: `77${tag}` });
});

test('server menolak berkas palsu & jawaban wajib kosong; honeypot tidak tersimpan', async ({ request }) => {
  const ids = Object.fromEntries((await sql<{ id: string; judul: string }[]>`SELECT id::text, judul FROM form_pertanyaan WHERE form_id = ${formId}::uuid`).map((q) => [q.judul, q.id]));
  const isi = { [ids['Nama lengkap']!]: 'Bot', [ids['NIM']!]: '1', [ids['Angkatan']!]: '2025', [ids['Nomor WhatsApp']!]: '08', [ids['Email']!]: 'a@b.co' };
  const sebelum = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM form_respons WHERE form_id = ${formId}::uuid`)[0]!.n;

  // Berkas "PNG" yang sebenarnya teks → ditolak magic bytes.
  const palsu = await request.post(`/api/f/${token}`, {
    multipart: {
      jawaban: JSON.stringify(isi),
      [`berkas_${ids['Bukti pembayaran']}`]: { name: 'bukti.png', mimeType: 'image/png', buffer: Buffer.from('bukan gambar sama sekali') },
    },
  });
  expect(palsu.status()).toBe(422);
  expect((await palsu.json()).error.details[ids['Bukti pembayaran']!]).toMatch(/Jenis berkas/);

  const kosong = await request.post(`/api/f/${token}`, { multipart: { jawaban: JSON.stringify({ [ids['NIM']!]: '1' }) } });
  expect(kosong.status()).toBe(422);
  expect((await kosong.json()).error.details[ids['Nama lengkap']!]).toBe('Pertanyaan ini wajib diisi.');

  const bot = await request.post(`/api/f/${token}`, { multipart: { jawaban: JSON.stringify(isi), situs_web: 'http://spam.example' } });
  expect(bot.ok()).toBe(true);

  const sesudah = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM form_respons WHERE form_id = ${formId}::uuid`)[0]!.n;
  expect(sesudah).toBe(sebelum);
});

test('respons & ekspor untuk panitia; Kadept bukan panitia ditolak', async ({ browser }) => {
  await panitia.goto(`/form/${formId}/respons`, { waitUntil: 'load' });
  await expect(panitia.getByText('respons', { exact: false }).first()).toBeVisible();
  await expect(panitia.getByRole('heading', { name: 'Email' })).toBeVisible();
  const ekspor = await panitia.request.get(`/api/form/${formId}/respons/ekspor`);
  expect(ekspor.status()).toBe(200);
  expect(ekspor.headers()['content-type']).toContain('spreadsheetml');

  const kadept = await sesi(browser, AKUN.kadept);
  const r = await kadept.request.get(`/api/form/${formId}/respons`);
  expect(r.status()).toBe(404);
  const ubah = await kadept.request.post(`/api/form/${formId}/status`, { data: { aksi: 'tutup' } });
  expect(ubah.status()).toBe(403);
  await kadept.context().close();
});
