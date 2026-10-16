/**
 * Gate T-087 — Grid RAB inline-editable (PRD F-9.1, F-9.3, DESIGN_SYSTEM §9.3).
 *
 * Menguji "Selesai bila" kontrak:
 *   - mengubah harga satuan memperbarui total item + divisi + acara < 100 ms
 *     (diukur di browser, dari event input sampai teks total acara berubah);
 *   - "16 Unit" tersimpan apa adanya dan terhitung 16;
 *   - "2 Hari 1 Malam" memunculkan prompt nilai numerik;
 * ditambah: total server menang (INV-27), keyboard Enter/Esc, override total
 * bertanda, tambah item & sub-section, hapus sub-section dengan konfirmasi
 * ketik-nama, divisi lain tanpa input + PATCH 403 (INV-30), RAB terkunci 409
 * tanpa input (INV-29).
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
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
  if (!url) throw new Error('Gate rab-grid butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
const div = { konsumsi: '', pdd: '' };
const item = { galon: '', kamera: '' };
let halaman: Page;

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

async function dbItem(id: string) {
  const [r] = await sql<{ jumlah_teks: string; jumlah_numerik: string | null; harga_satuan: string; total: string; total_manual: boolean }[]>`
    SELECT jumlah_teks, jumlah_numerik::text, harga_satuan::text, total::text, total_manual FROM rab_item WHERE id = ${id}::uuid`;
  return r!;
}

const baris = (page: Page, id: string): Locator => page.locator(`[data-testid="rab-item"][data-item-id="${id}"]`);
const divisi = (page: Page, id: string): Locator => page.locator(`[data-testid="rab-divisi"][data-divisi-id="${id}"]`);

async function bukaRab(page: Page): Promise<void> {
  await page.goto(`/acara/${acaraId}?tab=rab`, { waitUntil: 'load' });
  await expect(page.getByTestId('rab-grid')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
}

/** Menunggu antrean simpan grid tuntas: nilai DB sama dengan harapan. */
async function tungguDb(id: string, cocok: (r: Awaited<ReturnType<typeof dbItem>>) => boolean) {
  await expect.poll(async () => cocok(await dbItem(id)), { timeout: 20_000 }).toBe(true);
}

test.beforeAll(async ({ browser }) => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E087 ${tag} SYNCHRONIZE`;
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
  await sql`INSERT INTO rab_meta (kepanitiaan_id, status) VALUES (${acaraId}::uuid, 'DRAFT')`;
  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  const [dp] = await sql<{ id: string }[]>`INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${acaraId}::uuid, 'PDD', 2) RETURNING id::text`;
  div.konsumsi = dk!.id;
  div.pdd = dp!.id;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${div.konsumsi}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;

  const [sk] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${div.konsumsi}::uuid, 'KONSUMSI PANITIA', 0) RETURNING id::text`;
  const [g] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
    VALUES (${sk!.id}::uuid, 1, 'Galon', '10', 10, 5000, 50000) RETURNING id::text`;
  await sql`INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
    VALUES (${sk!.id}::uuid, 2, 'Makan 3 kali', '58', 58, 30000, 1740000)`;
  item.galon = g!.id;
  const [sp] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${div.pdd}::uuid, 'DOKUMENTASI', 0) RETURNING id::text`;
  const [kam] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${sp!.id}::uuid, 1, 'Sewa kamera', '2 Hari 1 Malam', NULL, 0, 400000, true) RETURNING id::text`;
  item.kamera = kam!.id;

  halaman = await sesi(browser, AKUN.anggota);
});

test.afterAll(async () => {
  await halaman?.context().close();
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('harga satuan memperbarui total item, divisi, dan acara < 100 ms; tersimpan di server', async () => {
  const page = halaman;
  await bukaRab(page);
  await expect(page.getByTestId('rab-total-acara')).toHaveText('Rp2.190.000');

  const ms = await page.evaluate((id) => {
    const input = document.querySelector<HTMLInputElement>(`[data-item-id="${id}"] [data-testid="rab-harga"]`)!;
    const total = document.querySelector('[data-testid="rab-total-acara"]')!;
    const awal = total.textContent;
    return new Promise<number>((selesai) => {
      const t0 = performance.now();
      const amati = new MutationObserver(() => {
        if (total.textContent !== awal) {
          amati.disconnect();
          selesai(performance.now() - t0);
        }
      });
      amati.observe(total, { characterData: true, childList: true, subtree: true });
      // Batas 3 dtk: bila total tidak pernah berubah, ukurannya -1 dan assertion gagal jelas.
      setTimeout(() => {
        amati.disconnect();
        selesai(-1);
      }, 3_000);
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '7500');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, item.galon);
  console.log(`    rekalkulasi grid: ${ms.toFixed(1)} ms`);
  expect(ms).toBeGreaterThanOrEqual(0);
  expect(ms).toBeLessThan(100);

  await expect(baris(page, item.galon).getByTestId('rab-harga')).toHaveValue('Rp7.500');
  await expect(baris(page, item.galon).getByTestId('rab-total')).toHaveText('Rp75.000');
  await expect(divisi(page, div.konsumsi).getByTestId('rab-divisi-total')).toHaveText('Rp1.815.000');
  await expect(page.getByTestId('rab-total-acara')).toHaveText('Rp2.215.000');

  await baris(page, item.galon).getByTestId('rab-harga').blur();
  await tungguDb(item.galon, (r) => Number(r.harga_satuan) === 7500 && Number(r.total) === 75000);
});

test('"16 Unit" tersimpan apa adanya dan terhitung sebagai 16', async () => {
  const page = halaman;
  const jumlah = baris(page, item.galon).getByTestId('rab-jumlah');
  await jumlah.fill('16 Unit');
  await expect(baris(page, item.galon).getByTestId('rab-jumlah-hint')).toHaveText('→ 16');
  await expect(baris(page, item.galon).getByTestId('rab-total')).toHaveText('Rp120.000');
  await jumlah.press('Tab');
  await tungguDb(item.galon, (r) => r.jumlah_teks === '16 Unit' && Number(r.jumlah_numerik) === 16 && Number(r.total) === 120000);
});

test('"2 Hari 1 Malam" memunculkan prompt nilai numerik; isian manual dipakai menghitung', async () => {
  const page = halaman;
  const b = baris(page, item.galon);
  await b.getByTestId('rab-jumlah').fill('2 Hari 1 Malam');
  await expect(b.getByTestId('rab-jumlah-manual')).toBeVisible();
  await expect(b.getByTestId('rab-jumlah-hint')).toContainText('Jumlah untuk perhitungan');
  await b.getByTestId('rab-jumlah-manual').fill('3');
  await expect(b.getByTestId('rab-total')).toHaveText('Rp22.500');
  await b.getByTestId('rab-jumlah-manual').press('Enter');
  await tungguDb(item.galon, (r) => r.jumlah_teks === '2 Hari 1 Malam' && Number(r.jumlah_numerik) === 3 && Number(r.total) === 22500);
});

test('keyboard: Enter turun ke baris berikutnya, Esc membatalkan', async () => {
  const page = halaman;
  const jenis = baris(page, item.galon).getByTestId('rab-jenis');
  await jenis.click();
  await jenis.press('Enter');
  await expect(page.locator(`[data-rab-divisi="${div.konsumsi}"] [data-baris="1"][data-kolom="jenis"]`)).toBeFocused();

  await jenis.click();
  await jenis.fill('Galon salah ketik');
  await jenis.press('Escape');
  await expect(jenis).toHaveValue('Galon');
  await expect(jenis).not.toBeFocused();
});

test('override total manual ditandai dan dikunci; dapat dikembalikan', async () => {
  const page = halaman;
  const b = baris(page, item.galon);
  await b.getByTestId('rab-total-manual').click();
  await expect(b.getByTestId('rab-total-manual')).toHaveAttribute('aria-pressed', 'true');
  const total = b.locator('input[data-testid="rab-total"]');
  await total.fill('25000');
  await total.press('Enter');
  await tungguDb(item.galon, (r) => r.total_manual && Number(r.total) === 25000);
  await b.getByTestId('rab-harga').fill('9000');
  await expect(total).toHaveValue('Rp25.000'); // terkunci, tidak dihitung ulang
  await b.getByTestId('rab-harga').press('Tab');

  await b.getByTestId('rab-total-manual').click();
  await expect(b.getByTestId('rab-total-manual')).toHaveAttribute('aria-pressed', 'false');
  await expect(b.getByTestId('rab-total')).toHaveText('Rp27.000'); // 3 × 9.000
  await tungguDb(item.galon, (r) => !r.total_manual && Number(r.total) === 27000);
});

test('tambah item & sub-section; hapus sub-section memakai konfirmasi ketik-nama', async () => {
  const page = halaman;
  const blok = divisi(page, div.konsumsi);
  await blok.getByTestId('rab-tambah-item').click();
  // Aksi struktur menunggu antrean simpan + kompilasi rute dingin di dev server.
  await expect(blok.getByTestId('rab-item')).toHaveCount(3, { timeout: 30_000 });
  await expect(blok.getByTestId('rab-item').last().getByTestId('rab-no')).toHaveText('3');
  await expect(blok.getByTestId('rab-item').last().getByTestId('rab-jenis')).toBeFocused();

  await blok.getByTestId('rab-tambah-section-nama').fill('Konsumsi peserta');
  await blok.getByTestId('rab-tambah-section').click();
  const section = blok.getByTestId('rab-section').filter({ has: page.locator('input[value="KONSUMSI PESERTA"]') });
  await expect(section).toHaveCount(1, { timeout: 30_000 });

  await section.getByTestId('rab-hapus-section').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Hapus sub-section KONSUMSI PESERTA?');
  await dialog.getByRole('textbox').fill('KONSUMSI PESERTA');
  await dialog.getByRole('button', { name: 'Hapus sub-section' }).click();
  await expect(section).toHaveCount(0, { timeout: 30_000 });
  const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM rab_section WHERE divisi_id = ${div.konsumsi}::uuid`;
  expect(n!.n).toBe(1);
});

test('divisi lain: tanpa input dan PATCH langsung ditolak 403 (INV-30)', async () => {
  const page = halaman;
  const pdd = divisi(page, div.pdd);
  await expect(pdd).toHaveAttribute('data-boleh-tulis', '0');
  await expect(pdd.locator('input')).toHaveCount(0);
  await expect(pdd.getByTestId('rab-tambah-item')).toHaveCount(0);
  await expect(baris(page, item.kamera)).toContainText('2 Hari 1 Malam');
  const r = await page.request.patch(`/api/rab/item/${item.kamera}`, { data: { harga_satuan: 1 } });
  expect(r.status(), await r.text()).toBe(403);
  expect(Number((await dbItem(item.kamera)).total)).toBe(400000);
});

test('RAB terkunci: tanpa input, PATCH 409 (INV-29)', async () => {
  const page = halaman;
  await sql`UPDATE rab_meta SET status = 'DISETUJUI' WHERE kepanitiaan_id = ${acaraId}::uuid`;
  try {
    await bukaRab(page);
    await expect(page.getByTestId('rab-terkunci')).toBeVisible();
    await expect(page.locator('[data-testid="rab-grid"] input')).toHaveCount(0);
    const r = await page.request.patch(`/api/rab/item/${item.galon}`, { data: { harga_satuan: 1 } });
    expect(r.status(), await r.text()).toBe(409);
  } finally {
    await sql`UPDATE rab_meta SET status = 'DRAFT' WHERE kepanitiaan_id = ${acaraId}::uuid`;
  }
});
