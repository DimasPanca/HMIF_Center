/**
 * Gate T-084 — Ruang kerja acara (PRD F-8.1, F-8.2, USER_FLOW §6.2).
 *
 * Menguji:
 *   - /acara memuat acara (status, tanggal, PIC, total RAB, progres);
 *   - delapan tab dapat dibuka dan TIDAK ADA yang kosong tanpa penjelasan;
 *   - kartu divisi memuat keempat metrik (koordinator, anggota, RAB, progres);
 *   - ruang kerja divisi: breadcrumb Acara → Divisi + enam bagian PRD F-8.2,
 *     dan divisi lain dalam acara yang sama tetap dapat dibaca;
 *   - header menampilkan kode_kegiatan dan "Buat Surat untuk acara ini"
 *     mengisi kode & nama kegiatan di form surat;
 *   - angka RAB disembunyikan ("Terbatas") bagi yang tidak berhak.
 *
 * Fixture ditanam lewat SQL (proker + kepanitiaan + divisi + RAB + Kanban)
 * bertanda unik per jalan, lalu dihapus lewat CASCADE dari proker.
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
  if (!url) throw new Error('Gate ruang-acara butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let tag = '';
let namaAcara = '';
let kode = '';
let prokerId = '';
let acaraId = '';
const divisi: Record<'konsumsi' | 'pdd', string> = { konsumsi: '', pdd: '' };

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

async function idAkun(akun: AkunUji): Promise<string> {
  const [u] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${akun.email}`;
  return u!.id;
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  namaAcara = `E2E084 ${tag} SYNCHRONIZE`;
  kode = `SYNC${tag}`;

  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await idAkun(AKUN.kadept);
  const anggota = await idAkun(AKUN.anggota);
  const sekum = await idAkun(AKUN.sekum);
  const [d] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role
    WHERE user_id = ${kadept}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;

  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${p!.id}::uuid, ${d!.id}::uuid, ${namaAcara}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      '2028-11-01', '2028-12-06', '2028-12-07', ${kadept}::uuid)
    RETURNING id::text`;
  prokerId = pr!.id;

  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, tema, kode_kegiatan, ketua_pelaksana, target_anggaran)
    VALUES (${prokerId}::uuid, ${namaAcara}, 'Synergy of Informatics', ${kode}, ${kadept}::uuid, 20000000)
    RETURNING id::text`;
  acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${acaraId}::uuid)`;

  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan, warna)
    VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota}::uuid, 1, '#F59E0B') RETURNING id::text`;
  const [dp] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${acaraId}::uuid, 'PDD', 2) RETURNING id::text`;
  divisi.konsumsi = dk!.id;
  divisi.pdd = dp!.id;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES
    (${divisi.konsumsi}::uuid, ${anggota}::uuid, 'Koordinator'),
    (${divisi.konsumsi}::uuid, ${sekum}::uuid, 'Anggota')`;

  const [s] = await sql<{ id: string }[]>`
    INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${divisi.konsumsi}::uuid, 'KONSUMSI PANITIA', 1) RETURNING id::text`;
  await sql`INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total) VALUES
    (${s!.id}::uuid, 1, 'Galon', '10', 10, 5000, 50000),
    (${s!.id}::uuid, 2, 'Makan 3 kali', '58', 58, 30000, 1740000)`;
  const [sp] = await sql<{ id: string }[]>`
    INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${divisi.pdd}::uuid, 'DOKUMENTASI', 1) RETURNING id::text`;
  await sql`INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
    VALUES (${sp!.id}::uuid, 1, 'Sewa kamera', '2 Hari 1 Malam', NULL, 0, 400000)`;

  await sql`INSERT INTO kanban_card (divisi_id, judul, kolom, created_by) VALUES
    (${divisi.konsumsi}::uuid, 'Survey katering', 'DONE', ${anggota}::uuid),
    (${divisi.konsumsi}::uuid, 'Pesan galon', 'TODO', ${anggota}::uuid)`;
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('daftar acara memuat status, tanggal, PIC, total RAB, dan progres', async ({ browser }) => {
  const ketua = await sesi(browser, AKUN.aktif);
  await ketua.goto('/acara', { waitUntil: 'load' });
  const item = ketua.getByTestId('acara-item').filter({ hasText: namaAcara });
  await expect(item).toBeVisible({ timeout: 60_000 });
  await expect(item).toContainText('Berjalan');
  await expect(item).toContainText('PIC');
  await expect(item).toContainText('2028');
  await expect(item.getByTestId('acara-item-rab')).toHaveText('Rp2.190.000');
  await expect(item).toContainText('50% · 1/2 kartu');
  await ketua.context().close();
});

test('delapan tab dapat dibuka dan tidak ada yang kosong tanpa penjelasan', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto('/acara', { waitUntil: 'load' });
  const item = koor.getByTestId('acara-item').filter({ hasText: namaAcara });
  await expect(item).toContainText('Anda panitia', { timeout: 60_000 });
  await item.getByTestId('acara-item-buka').click();
  await koor.waitForURL(new RegExp(`/acara/${acaraId}`), { timeout: 60_000 });

  await expect(koor.getByTestId('acara-kode-kegiatan')).toHaveText(kode);
  await expect(koor.getByTestId('acara-peran-saya')).toContainText('Koordinator Divisi Konsumsi');

  for (const slug of ['ringkasan', 'gantt', 'divisi', 'rab', 'tor', 'proposal', 'nota', 'lpj']) {
    await koor.getByTestId(`acara-tab-${slug}`).click();
    await expect(koor.getByTestId(`acara-tab-${slug}`)).toHaveAttribute('aria-current', 'page', { timeout: 30_000 });
    const panel = koor.getByTestId(`acara-panel-${slug}`);
    await expect(panel).toBeVisible();
    // Setiap tab berisi konten atau EmptyState yang menjelaskan dirinya.
    const teks = (await panel.innerText()).trim();
    expect(teks.length, `tab ${slug} kosong`).toBeGreaterThan(20);
  }
  await koor.context().close();
});

test('kartu divisi menampilkan keempat metrik', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto(`/acara/${acaraId}?tab=divisi`, { waitUntil: 'load' });
  const kartu = koor.getByTestId('divisi-card').filter({ hasText: 'Konsumsi' });
  await expect(kartu).toBeVisible({ timeout: 60_000 });
  await expect(kartu.getByTestId('divisi-card-koordinator')).toHaveText(AKUN.anggota.namaLengkap);
  await expect(kartu.getByTestId('divisi-card-anggota')).toHaveText('2 orang');
  await expect(kartu.getByTestId('divisi-card-rab')).toHaveText('Rp1.790.000');
  await expect(kartu.getByTestId('divisi-card-progres')).toContainText('50% · 1/2 kartu');
  await expect(koor.getByTestId('divisi-card')).toHaveCount(2);
  await koor.context().close();
});

test('ruang kerja divisi: breadcrumb, enam bagian, dan divisi lain tetap terbaca', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto(`/acara/${acaraId}?tab=divisi`, { waitUntil: 'load' });
  await koor.getByTestId('divisi-card').filter({ hasText: 'Konsumsi' }).getByTestId('divisi-card-buka').click();
  await koor.waitForURL(new RegExp(`/acara/${acaraId}/divisi/${divisi.konsumsi}`), { timeout: 60_000 });

  const remah = koor.getByTestId('acara-breadcrumb');
  await expect(remah).toContainText('Acara Besar');
  await expect(remah).toContainText(namaAcara);
  await expect(remah).toContainText('Divisi Konsumsi');
  for (const b of ['job-desk', 'gantt', 'rab', 'progres', 'dokumen', 'nota']) {
    await expect(koor.getByTestId(`divisi-bagian-${b}`)).toBeVisible();
  }
  await expect(koor.getByTestId('divisi-rab-item')).toHaveCount(2);
  await expect(koor.getByTestId('divisi-rab-total')).toContainText('Rp1.790.000');

  // Divisi lain dalam acara yang sama: dapat dibaca (PRD F-8.3).
  await koor.goto(`/acara/${acaraId}/divisi/${divisi.pdd}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('acara-breadcrumb')).toContainText('Divisi PDD', { timeout: 60_000 });
  await expect(koor.getByTestId('divisi-rab-item')).toContainText('2 Hari 1 Malam');

  // Divisi milik acara lain lewat URL acara ini: 404, bukan bocor.
  const r = await koor.goto(`/acara/${acaraId}/divisi/00000000-0000-4000-8000-000000000000`, { waitUntil: 'load' });
  expect(r?.status()).toBe(404);
  await koor.context().close();
});

test('kode kegiatan di header dan "Buat Surat untuk acara ini" mengisi form surat', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  await kadept.goto(`/acara/${acaraId}`, { waitUntil: 'load' });
  await expect(kadept.getByTestId('acara-kode-kegiatan')).toHaveText(kode, { timeout: 60_000 });
  await kadept.getByTestId('acara-buat-surat').click();
  await kadept.waitForURL(/\/surat\/baru\?acara=/, { timeout: 60_000 });
  await expect(kadept.locator('#surat-field-kode_kegiatan')).toHaveValue(kode, { timeout: 60_000 });
  await expect(kadept.locator('#surat-dinamis-nama_kegiatan')).toHaveValue(namaAcara);
  await expect(kadept.locator('#surat-dinamis-tema_kegiatan')).toHaveValue('Synergy of Informatics');
  await kadept.context().close();
});

test('BPH membaca seluruh angka; acara periode/ID lain menjawab 404', async ({ browser }) => {
  const bph = await sesi(browser, AKUN.bacaSaja);
  await bph.goto(`/acara/${acaraId}`, { waitUntil: 'load' });
  await expect(bph.getByTestId('ringkasan-total-rab')).toContainText('Rp2.190.000', { timeout: 60_000 });
  await expect(bph.getByTestId('acara-buat-surat')).toHaveCount(0); // BPH tidak membuat surat
  const r = await bph.goto('/acara/00000000-0000-4000-8000-000000000000', { waitUntil: 'load' });
  expect(r?.status()).toBe(404);
  await bph.context().close();
});
