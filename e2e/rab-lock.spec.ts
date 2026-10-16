/**
 * Gate T-089 — Status & penguncian RAB (PRD F-9.5, USER_FLOW §11.3, INV-29).
 *
 * Alur: panitia mengajukan → Bendahara menyetujui & mengunci → perubahan item
 * ditolak (API 409; database menolak lewat RLS — skenario 7 & 15
 * `db:test -- 015c_rls_negatif`) → buka kunci tanpa alasan ditolak → buka
 * kunci dengan alasan → alasan tercatat di audit_log.
 *
 * Tombol status hanya dirender untuk yang berhak; transisi ilegal ditolak.
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
  if (!url) throw new Error('Gate rab-lock butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
let itemId = '';
let alasan = '';
let koor: Page;
let bendum: Page;

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

const idAkun = async (akun: AkunUji) => (await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${akun.email}`)[0]!.id;
const statusDb = async () => (await sql<{ status: string }[]>`SELECT status::text FROM rab_meta WHERE kepanitiaan_id = ${acaraId}::uuid`)[0]!.status;

async function bukaRab(page: Page): Promise<void> {
  await page.goto(`/acara/${acaraId}?tab=rab`, { waitUntil: 'load' });
  await expect(page.getByTestId('rab-grid')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
}

test.beforeAll(async ({ browser }) => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  alasan = `Tambahan sewa sound system hari kedua (${tag})`;
  const nama = `E2E089 ${tag} SYNCHRONIZE`;
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await idAkun(AKUN.kadept);
  const anggota = await idAkun(AKUN.anggota);
  const [d] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role
    WHERE user_id = ${kadept}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;
  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${p!.id}::uuid, ${d!.id}::uuid, ${nama}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      '2028-11-01', '2028-12-06', '2028-12-07', ${kadept}::uuid)
    RETURNING id::text`;
  prokerId = pr!.id;
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan) VALUES (${prokerId}::uuid, ${nama}, ${`SYNC${tag}`}) RETURNING id::text`;
  acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${acaraId}::uuid)`;
  const [dv] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dv!.id}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;
  const [s] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama) VALUES (${dv!.id}::uuid, 'KONSUMSI PANITIA') RETURNING id::text`;
  const [i] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
    VALUES (${s!.id}::uuid, 1, 'Galon', '10', 10, 5000, 50000) RETURNING id::text`;
  itemId = i!.id;

  koor = await sesi(browser, AKUN.anggota);
  bendum = await sesi(browser, AKUN.bendum);
});

test.afterAll(async () => {
  await koor?.context().close();
  await bendum?.context().close();
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('panitia mengajukan; tombol kunci tidak dirender untuk panitia', async () => {
  await bukaRab(koor);
  await expect(koor.getByTestId('status-rab')).toHaveAttribute('data-status', 'DRAFT');
  await expect(koor.getByTestId('rab-kunci')).toHaveCount(0);
  await expect(koor.getByTestId('rab-buka-kunci')).toHaveCount(0);
  await koor.getByTestId('rab-ajukan').click();
  await expect(koor.getByTestId('status-rab')).toHaveAttribute('data-status', 'DIAJUKAN', { timeout: 30_000 });
  expect(await statusDb()).toBe('DIAJUKAN');
  await expect(koor.getByTestId('rab-ajukan')).toHaveCount(0);

  // Panitia tidak dapat mengunci, dan mengajukan dua kali ditolak.
  expect((await koor.request.post(`/api/rab/${acaraId}/lock`, { data: {} })).status()).toBe(403);
  expect((await koor.request.post(`/api/rab/${acaraId}/submit`, { data: {} })).status()).toBe(409);
});

test('Bendahara menyetujui & mengunci; perubahan item ditolak', async () => {
  await bukaRab(bendum);
  await bendum.getByTestId('rab-kunci').click();
  await bendum.getByRole('dialog').getByRole('button', { name: 'Setujui & kunci' }).click();
  await expect(bendum.getByTestId('status-rab')).toHaveAttribute('data-status', 'DISETUJUI', { timeout: 30_000 });
  await expect(bendum.getByTestId('status-rab-terkunci-oleh')).toContainText(AKUN.bendum.namaLengkap);
  expect(await statusDb()).toBe('DISETUJUI');

  await bukaRab(koor);
  await expect(koor.getByTestId('rab-terkunci')).toBeVisible();
  await expect(koor.locator('[data-testid="rab-grid"] input')).toHaveCount(0);
  const ubah = await koor.request.patch(`/api/rab/item/${itemId}`, { data: { harga_satuan: 1 } });
  expect(ubah.status(), await ubah.text()).toBe(409);
  const [h] = await sql<{ harga: string }[]>`SELECT harga_satuan::text AS harga FROM rab_item WHERE id = ${itemId}::uuid`;
  expect(Number(h!.harga)).toBe(5000);
});

test('buka kunci tanpa alasan (atau alasan terlalu pendek) ditolak', async () => {
  expect((await bendum.request.post(`/api/rab/${acaraId}/unlock`, { data: {} })).status()).toBe(422);
  expect((await bendum.request.post(`/api/rab/${acaraId}/unlock`, { data: { alasan: 'revisi' } })).status()).toBe(422);
  expect((await koor.request.post(`/api/rab/${acaraId}/unlock`, { data: { alasan } })).status()).toBe(403);
  expect(await statusDb()).toBe('DISETUJUI');

  // Di UI: tombol konfirmasi tidak dapat ditekan selama alasan kosong.
  await bukaRab(bendum);
  await bendum.getByTestId('rab-buka-kunci').click();
  const dialog = bendum.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Buka kunci' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Batal' }).click();
  await expect(dialog).toHaveCount(0);
});

test('buka kunci beralasan: kembali DRAFT, alasan tampil dan tercatat di audit log', async () => {
  await bukaRab(bendum);
  await bendum.getByTestId('rab-buka-kunci').click();
  const dialog = bendum.getByRole('dialog');
  await dialog.getByRole('textbox').fill(alasan);
  await dialog.getByRole('button', { name: 'Buka kunci' }).click();
  await expect(bendum.getByTestId('status-rab')).toHaveAttribute('data-status', 'DRAFT', { timeout: 30_000 });
  await expect(bendum.getByTestId('status-rab-alasan')).toContainText(alasan);

  const [m] = await sql<{ alasan: string; disetujui_at: Date | null }[]>`
    SELECT alasan_buka_kunci AS alasan, disetujui_at FROM rab_meta WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(m).toEqual({ alasan, disetujui_at: null });
  const audit = await sql<{ pelaku: string | null }[]>`
    SELECT user_id::text AS pelaku FROM audit_log
    WHERE entitas = 'rab_meta' AND entitas_id = ${acaraId} AND aksi = 'UPDATE' AND nilai_baru->>'alasan_buka_kunci' = ${alasan}`;
  expect(audit.length).toBe(1);
  expect(audit[0]!.pelaku).toBe(await idAkun(AKUN.bendum));

  // Item kembali dapat diubah panitia.
  await bukaRab(koor);
  await expect(koor.locator(`[data-item-id="${itemId}"] [data-testid="rab-harga"]`)).toBeVisible();
  const ubah = await koor.request.patch(`/api/rab/item/${itemId}`, { data: { harga_satuan: 6000 } });
  expect(ubah.status(), await ubah.text()).toBe(200);
});
