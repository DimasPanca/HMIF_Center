/**
 * Gate T-101 — Alur upload nota (PRD F-11.1, USER_FLOW §7.1, ADR-006/007).
 *
 * Menguji:
 *   - kamera tidak bisa dibuka sebelum item RAB dipilih;
 *   - dropdown item RAB hanya memuat item divisi tempat panitia terdaftar;
 *   - alokasi Rp60.000 + Rp25.000 pada nota Rp75.000 ditolak dengan selisih
 *     ditampilkan; Rp50.000 + Rp25.000 diterima → MENUNGGU_VERIFIKASI;
 *   - API menolak item RAB divisi lain dan divisi yang bukan miliknya;
 *   - nota DITOLAK dapat diperbaiki pengunggah dan kembali MENUNGGU_VERIFIKASI.
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
  if (!url) throw new Error('Gate upload-nota butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

/** Bingkai pertama MJPEG fixture T-100 = satu JPEG utuh, dipakai sebagai "foto galeri". */
function fotoNota(): Buffer {
  const isi = fs.readFileSync(path.resolve('e2e/fixtures/nota-kamera.mjpeg'));
  const kedua = isi.indexOf(Buffer.from([0xff, 0xd8, 0xff]), 3);
  return kedua > 0 ? isi.subarray(0, kedua) : isi;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let namaAcara = '';
const div = { konsumsi: '', pdd: '' };
const item = { snack: '', galon: '', kamera: '' };
let notaId = '';
let anggotaId = '';

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

const idAkun = async (a: AkunUji) => (await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${a.email}`)[0]!.id;

async function bukaUpload(page: Page, query = ''): Promise<void> {
  await page.goto(`/keuangan/nota/upload${query}`, { waitUntil: 'load' });
  await expect(page.getByTestId('nota-form')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
}

async function pilihItem(page: Page, label: RegExp): Promise<void> {
  const opsi = page.locator('#nota-pilih-item option').filter({ hasText: label });
  await page.locator('#nota-pilih-item').selectOption((await opsi.getAttribute('value'))!);
}

async function unggahFoto(page: Page): Promise<void> {
  await page.getByTestId('nota-buka-kamera').click();
  const [pemilih] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('kamera-galeri').click({ timeout: 60_000 })]);
  await pemilih.setFiles({ name: 'nota.jpg', mimeType: 'image/jpeg', buffer: fotoNota() });
  await page.getByTestId('scan-gunakan').click({ timeout: 30_000 });
  await expect(page.getByTestId('nota-foto')).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E101 ${tag} NOTA`;
  namaAcara = nama;
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await idAkun(AKUN.kadept);
  anggotaId = await idAkun(AKUN.anggota);
  const ketuplak = await idAkun(AKUN.sekum);
  const [d] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role
    WHERE user_id = ${kadept}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;
  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${p!.id}::uuid, ${d!.id}::uuid, ${nama}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      '2026-11-01', '2026-12-06', '2026-12-07', ${kadept}::uuid)
    RETURNING id::text`;
  prokerId = pr!.id;
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
    VALUES (${prokerId}::uuid, ${nama}, ${`NT${tag}`}, ${ketuplak}::uuid) RETURNING id::text`;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${k!.id}::uuid)`;
  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${k!.id}::uuid, 'Konsumsi', ${anggotaId}::uuid, 1) RETURNING id::text`;
  const [dp] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${k!.id}::uuid, 'PDD', 2) RETURNING id::text`;
  div.konsumsi = dk!.id;
  div.pdd = dp!.id;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${div.konsumsi}::uuid, ${anggotaId}::uuid, 'KOORDINATOR')`;
  const [sk] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${div.konsumsi}::uuid, 'KONSUMSI PESERTA', 1) RETURNING id::text`;
  const [sp] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${div.pdd}::uuid, 'DOKUMENTASI', 1) RETURNING id::text`;
  const [i1] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${sk!.id}::uuid, 1, 'Snack peserta', '10', 10, 5000, 50000, false) RETURNING id::text`;
  const [i2] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${sk!.id}::uuid, 2, 'Galon air', '1', 1, 25000, 25000, false) RETURNING id::text`;
  const [i3] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${sp!.id}::uuid, 1, 'Sewa kamera PDD', '1', 1, 300000, 300000, false) RETURNING id::text`;
  item.snack = i1!.id;
  item.galon = i2!.id;
  item.kamera = i3!.id;
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    // Baris gambar uji buatan SQL (nota-nya ikut terhapus kaskade proker).
    await sql`DELETE FROM image i WHERE i.storage_uuid LIKE 'e2e101-%' AND NOT EXISTS (SELECT 1 FROM nota n WHERE n.image_id = i.id)`.catch(() => {});
    await sql.end();
  }
});

test('kamera terkunci sebelum item RAB dipilih; dropdown hanya item divisi sendiri', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  const cdn: string[] = [];
  koor.on('request', (r) => {
    if (/cdn.jsdelivr.net|jscanify|opencv/i.test(r.url())) cdn.push(r.url());
  });
  await bukaUpload(koor);
  // Koordinator bisa terdaftar di divisi acara lain (data uji lain) — pilih divisi uji bila perlu.
  if (await koor.locator('#nota-divisi').count()) await koor.locator('#nota-divisi').selectOption(div.konsumsi);
  await expect(koor.getByTestId('nota-buka-kamera')).toBeDisabled();
  await expect(koor.getByTestId('nota-kamera-terkunci')).toBeVisible();

  const opsi = koor.locator('#nota-pilih-item option');
  await expect(opsi.filter({ hasText: 'Snack peserta' })).toHaveCount(1);
  await expect(opsi.filter({ hasText: 'Galon air' })).toHaveCount(1);
  await expect(opsi.filter({ hasText: 'Sewa kamera PDD' })).toHaveCount(0);
  await expect(koor.locator('#nota-divisi option').filter({ hasText: /^PDD/ })).toHaveCount(0);

  await pilihItem(koor, /Snack peserta/);
  await expect(koor.getByTestId('nota-buka-kamera')).toBeEnabled();
  // Pemindai (OpenCV/jscanify) baru dimuat saat kamera dibuka (T-100).
  expect(cdn, 'skrip pemindai dimuat sebelum kamera dibuka').toEqual([]);
  await koor.context().close();
});

test('alokasi 60.000 + 25.000 ditolak dengan selisih; 50.000 + 25.000 diterima', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaUpload(koor);
  if (await koor.locator('#nota-divisi').count()) await koor.locator('#nota-divisi').selectOption(div.konsumsi);
  await pilihItem(koor, /Snack peserta/);
  await pilihItem(koor, /Galon air/);
  await expect(koor.getByTestId('nota-item-terpilih')).toHaveCount(2);
  await unggahFoto(koor);

  await koor.getByTestId('nota-total').fill('75000');
  const nominal = koor.getByTestId('nota-alokasi-nominal');
  await nominal.nth(0).fill('60000');
  await nominal.nth(1).fill('25000');
  await expect(koor.getByTestId('nota-sisa')).toHaveAttribute('data-selisih', '10000');
  await expect(koor.getByTestId('nota-sisa')).toContainText('lebih Rp10.000');
  await koor.getByTestId('nota-kirim').click();
  await expect(koor.getByTestId('nota-galat')).toContainText('selisih Rp10.000', { timeout: 60_000 });
  const [nol] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM nota WHERE divisi_id = ${div.konsumsi}::uuid`;
  expect(nol!.n).toBe(0);

  await nominal.nth(0).fill('50000');
  await expect(koor.getByTestId('nota-sisa')).toHaveAttribute('data-selisih', '0');
  await koor.getByTestId('nota-kirim').click();
  const terkirim = koor.getByTestId('nota-terkirim');
  await expect(terkirim).toBeVisible({ timeout: 60_000 });
  notaId = (await terkirim.getAttribute('data-nota-id'))!;

  const [n] = await sql<{ status: string; total: number; alok: number; jumlah: number }[]>`
    SELECT n.status::text, n.total_nota::int AS total,
           (SELECT sum(nominal)::int FROM nota_alokasi WHERE nota_id = n.id) AS alok,
           (SELECT count(*)::int FROM nota_alokasi WHERE nota_id = n.id) AS jumlah
    FROM nota n WHERE n.id = ${notaId}::uuid`;
  expect(n).toEqual({ status: 'MENUNGGU_VERIFIKASI', total: 75000, alok: 75000, jumlah: 2 });
  await koor.context().close();
});

test('API: item RAB divisi lain & divisi bukan miliknya ditolak; tanpa alokasi ditolak', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  // Gambar baru milik pengunggah yang belum dipakai nota mana pun.
  const kunci = `e2e101-${Date.now()}`;
  const [img] = await sql<{ id: string }[]>`
    INSERT INTO image (uploader_id, original_filename, storage_uuid, master_path, preview_path, thumbnail_path,
                       original_mime_type, master_mime_type, original_width, original_height,
                       master_width, master_height, master_file_size, kind)
    VALUES (${anggotaId}::uuid, 'nota.jpg', ${kunci}, ${`nota/master/${kunci}.jpg`}, ${`nota/preview/${kunci}.webp`},
            ${`nota/thumb/${kunci}.webp`}, 'image/jpeg', 'image/jpeg', 1200, 900, 1200, 900, 100000, 'DOKUMEN')
    RETURNING id::text`;
  const dasar = { divisi_id: div.konsumsi, image_id: img!.id, tanggal_belanja: '2026-10-01', total_nota: 300000, keterangan: null };
  const lain = await koor.request.post('/api/nota', {
    data: { ...dasar, alokasi: [{ rab_item_id: item.kamera, uraian_luar_rab: null, jumlah_aktual: null, harga_aktual: null, nominal: 300000 }] },
  });
  expect(lain.status(), await lain.text()).toBe(422);
  const bukanDivisi = await koor.request.post('/api/nota', {
    data: { ...dasar, divisi_id: div.pdd, alokasi: [{ rab_item_id: item.kamera, uraian_luar_rab: null, jumlah_aktual: null, harga_aktual: null, nominal: 300000 }] },
  });
  expect(bukanDivisi.status(), await bukanDivisi.text()).toBe(403);
  const kosong = await koor.request.post('/api/nota', { data: { ...dasar, alokasi: [] } });
  expect(kosong.status()).toBe(422);
  const tidakSeimbang = await koor.request.post('/api/nota', {
    data: { ...dasar, total_nota: 75000, alokasi: [{ rab_item_id: null, uraian_luar_rab: 'Galon', jumlah_aktual: null, harga_aktual: null, nominal: 70000 }] },
  });
  expect(tidakSeimbang.status()).toBe(422);
  const b = (await tidakSeimbang.json()) as { error: { code: string; details: { selisih: number } } };
  expect(b.error.code).toBe('ALOKASI_TIDAK_SEIMBANG');
  expect(b.error.details.selisih).toBe(-5000);
  await koor.context().close();
});

test('nota DITOLAK diperbaiki pengunggah → kembali MENUNGGU_VERIFIKASI', async ({ browser }) => {
  await sql`UPDATE nota SET status = 'DITOLAK', alasan_penolakan = 'Nominal galon salah' WHERE id = ${notaId}::uuid`;
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto('/keuangan/nota', { waitUntil: 'load' });
  // Nama acara ber-tag project: desktop & mobile memakai akun uji yang sama secara paralel.
  const baris = koor.getByTestId('nota-saya-baris').filter({ hasText: namaAcara });
  await expect(baris).toHaveAttribute('data-status', 'DITOLAK', { timeout: 60_000 });
  await expect(baris).toContainText('Nominal galon salah');
  await baris.getByTestId('nota-perbaiki').click();
  await expect(koor.getByTestId('nota-form')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
  await expect(koor.getByTestId('nota-alasan-penolakan')).toContainText('Nominal galon salah');
  await expect(koor.getByTestId('nota-alokasi-baris')).toHaveCount(2);

  await koor.getByTestId('nota-total').fill('80000');
  await koor.getByTestId('nota-alokasi-nominal').nth(1).fill('30000');
  await koor.getByTestId('nota-kirim').click();
  await expect(koor.getByTestId('nota-terkirim')).toBeVisible({ timeout: 60_000 });
  const [n] = await sql<{ status: string; alasan: string | null; total: number; alok: number }[]>`
    SELECT status::text, alasan_penolakan AS alasan, total_nota::int AS total,
           (SELECT sum(nominal)::int FROM nota_alokasi WHERE nota_id = ${notaId}::uuid) AS alok
    FROM nota WHERE id = ${notaId}::uuid`;
  expect(n).toEqual({ status: 'MENUNGGU_VERIFIKASI', alasan: null, total: 80000, alok: 80000 });

  // Nota terverifikasi tidak dapat diubah lagi.
  await sql`UPDATE nota SET status = 'TERVERIFIKASI' WHERE id = ${notaId}::uuid`;
  const r = await koor.request.patch(`/api/nota/${notaId}`, { data: {} });
  expect(r.status()).toBe(409);
  await koor.context().close();
});
