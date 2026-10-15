/**
 * Gate T-107 — Data Pengurus (PRD F-14.1, USER_FLOW §9.1).
 *
 * Menguji:
 *   - import 100 baris: pratinjau valid/peringatan/error SEBELUM menyimpan;
 *     NIM ganda di berkas & NIM yang sudah terdaftar ditandai; yang terdaftar
 *     dilewati bawaan dan memperbarui bila centangnya dihapus;
 *   - tambah/ubah satuan, NIM kembar ditolak dengan pesan jelas;
 *   - export Excel memuat NIM sebagai teks;
 *   - memilih 30 pengurus (tanpa akun) → 30 Surat Aktif diajukan sebagai satu
 *     batch. Penomoran berurutan 30 surat batch diuji gate `surat-massal`;
 *   - Kadept hanya melihat departemennya dan tidak dapat menulis; BPH baca saja.
 *
 * Setiap jalan memakai NIM bertanda unik — data contoh dan data lain tidak disentuh.
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
  if (!url) throw new Error('Gate data-pengurus butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let periode = '';
let tag = '';
let deptNama = '';
const nimTerdaftar: string[] = [];

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

const nim = (n: number) => `97${tag}${String(n).padStart(3, '0')}`;
const nama = (n: number) => `E2E107 ${tag} Pengurus ${String(n).padStart(3, '0')}`;

/** CSV 100 baris: 90 valid, 2 pasang NIM ganda, 2 NIM terdaftar, 4 error. */
function csv100(): string {
  const b: string[][] = [['Nama Lengkap', 'NIM', 'Jabatan', 'Departemen', 'Angkatan', 'Status']];
  for (let i = 1; i <= 90; i++) b.push([nama(i), nim(i), 'Staff Departemen', deptNama, '2023', 'Aktif']);
  b.push([nama(91), nim(91), 'Staff', '', '2023', ''], [nama(92), nim(91), 'Staff', '', '2023', '']);
  b.push([nama(93), nim(93), 'Staff', '', '2023', ''], [nama(94), nim(93), 'Staff', '', '2023', '']);
  b.push([nama(95), nimTerdaftar[0]!, 'Jabatan Baru', '', '2022', ''], [nama(96), nimTerdaftar[1]!, 'Jabatan Baru', '', '2022', '']);
  b.push(['', nim(97), 'Staff', '', '', ''], [nama(98), '33A7', 'Staff', '', '', ''], [nama(99), nim(99), 'Staff', 'Humas Galaksi', '', '']);
  b.push([nama(100), nim(100), 'Staff', '', 'dua ribu', '']);
  return b.map((r) => r.map((s) => `"${s}"`).join(';')).join('\r\n');
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 1 : 2}${Date.now().toString().slice(-5)}`;
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  periode = p!.id;
  const [d] = await sql<{ nama: string }[]>`SELECT nama FROM departemen WHERE is_active ORDER BY urutan LIMIT 1`;
  deptNama = d!.nama;
  for (const n of [901, 902]) {
    await sql`INSERT INTO pengurus (periode_id, nama_lengkap, nim, jabatan) VALUES (${periode}::uuid, ${nama(n)}, ${nim(n)}, 'Jabatan Lama')`;
    nimTerdaftar.push(nim(n));
  }
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM surat WHERE periode_id = ${periode}::uuid AND data_dinamis->>'nama_pemohon' LIKE ${`E2E107 ${tag}%`}`.catch(() => {});
    await sql`DELETE FROM pengurus WHERE nim LIKE ${`97${tag}%`}`.catch(() => {});
    await sql.end();
  }
});

test('import 100 baris: pratinjau dulu, duplikat & terdaftar ditandai, lalu laporan', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  await sekum.goto('/sekretariat/pengurus', { waitUntil: 'load' });
  await sekum.getByTestId('pengurus-import').click({ timeout: 60_000 });
  await sekum.getByTestId('import-pengurus-berkas').setInputFiles({ name: 'pengurus.csv', mimeType: 'text/csv', buffer: Buffer.from(csv100(), 'utf8') });

  await expect(sekum.getByText('90 baris valid')).toBeVisible({ timeout: 60_000 });
  await expect(sekum.getByText('6 baris peringatan')).toBeVisible();
  await expect(sekum.getByText('4 baris error')).toBeVisible();
  // Belum ada yang tersimpan.
  const [awal] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pengurus WHERE nim LIKE ${`97${tag}%`}`;
  expect(awal!.n).toBe(2);
  // 90 valid + 4 ganda (dilaporkan, baris terakhir dipakai); 2 terdaftar dilewati bawaan.
  await expect(sekum.getByTestId('import-pengurus-simpan')).toHaveText('Import 94 baris');

  await sekum.getByTestId('import-pengurus-simpan').click();
  await expect(sekum.getByTestId('import-pengurus-laporan')).toContainText('92 pengurus baru · 0 diperbarui · 8 dilewati', { timeout: 60_000 });

  const rows = await sql<{ nim: string; nama_lengkap: string; jabatan: string; user_id: string | null }[]>`
    SELECT nim, nama_lengkap, jabatan, user_id::text FROM pengurus WHERE nim LIKE ${`97${tag}%`}`;
  expect(rows).toHaveLength(94);
  expect(rows.find((r) => r.nim === nim(91))?.nama_lengkap).toBe(nama(92)); // baris terakhir menang
  expect(rows.filter((r) => nimTerdaftar.includes(r.nim)).every((r) => r.jabatan === 'Jabatan Lama')).toBe(true);
  expect(rows.every((r) => r.user_id === null)).toBe(true); // tidak membuat akun
  await sekum.context().close();
});

test('NIM terdaftar yang TIDAK dilewati memperbarui data lama', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  await sekum.goto('/sekretariat/pengurus', { waitUntil: 'load' });
  await sekum.getByTestId('pengurus-import').click({ timeout: 60_000 });
  const isi = ['Nama;NIM;Jabatan', `"${nama(901)}";"${nimTerdaftar[0]}";"Koordinator Baru"`].join('\r\n');
  await sekum.getByTestId('import-pengurus-berkas').setInputFiles({ name: 'ulang.csv', mimeType: 'text/csv', buffer: Buffer.from(isi) });
  await expect(sekum.getByTestId('import-pengurus-simpan')).toBeDisabled({ timeout: 60_000 }); // satu-satunya baris dilewati bawaan
  await sekum.getByLabel('Lewati baris 2').uncheck();
  await expect(sekum.getByTestId('import-pengurus-simpan')).toHaveText('Import 1 baris (1 memperbarui)');
  await sekum.getByTestId('import-pengurus-simpan').click();
  await expect(sekum.getByTestId('import-pengurus-laporan')).toContainText('0 pengurus baru · 1 diperbarui', { timeout: 60_000 });
  const [r] = await sql<{ jabatan: string }[]>`SELECT jabatan FROM pengurus WHERE periode_id = ${periode}::uuid AND nim = ${nimTerdaftar[0]!}`;
  expect(r!.jabatan).toBe('Koordinator Baru');
  await sekum.context().close();
});

test('tambah & ubah satuan; NIM kembar ditolak; export Excel', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  await sekum.goto(`/sekretariat/pengurus?q=${tag}`, { waitUntil: 'load' });
  await sekum.getByTestId('pengurus-tambah').click({ timeout: 60_000 });
  await sekum.getByTestId('form-pengurus-nama_lengkap').fill(nama(500));
  await sekum.getByTestId('form-pengurus-nim').fill(nim(500));
  await sekum.getByTestId('form-pengurus-jabatan').fill('Bendahara Acara');
  await sekum.getByTestId('form-pengurus-angkatan').fill('2024');
  await sekum.getByTestId('form-pengurus-simpan').click();
  await expect(sekum.getByTestId(`pengurus-baris-${nim(500)}`)).toContainText('Bendahara Acara', { timeout: 30_000 });

  await sekum.getByTestId('pengurus-tambah').click();
  await sekum.getByTestId('form-pengurus-nama_lengkap').fill('Kembar');
  await sekum.getByTestId('form-pengurus-nim').fill(nim(500));
  await sekum.getByTestId('form-pengurus-jabatan').fill('Staff');
  await sekum.getByTestId('form-pengurus-simpan').click();
  await expect(sekum.getByTestId('form-pengurus-galat')).toContainText(`NIM ${nim(500)} sudah terdaftar`);
  await sekum.keyboard.press('Escape');

  const [r] = await sql<{ id: string }[]>`SELECT id::text FROM pengurus WHERE nim = ${nim(500)}`;
  await sekum.getByTestId(`pengurus-ubah-${r!.id}`).click();
  await sekum.getByTestId('form-pengurus-jabatan').fill('Bendahara Umum Acara');
  await sekum.getByTestId('form-pengurus-simpan').click();
  await expect(sekum.getByTestId(`pengurus-baris-${nim(500)}`)).toContainText('Bendahara Umum Acara', { timeout: 30_000 });

  const x = await sekum.request.get(`/api/pengurus/export?q=${tag}`);
  expect(x.status()).toBe(200);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await x.body()) as never);
  const nims = (wb.worksheets[0]!.getColumn(3).values as unknown[]).map(String);
  expect(nims).toContain(nim(500)); // teks, bukan 9,7E+10
  await sekum.context().close();
});

test('pilih 30 pengurus tanpa akun → 30 Surat Aktif diajukan sebagai satu batch', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  await sekum.goto(`/sekretariat/pengurus?q=${tag}`, { waitUntil: 'load' });
  const kotak = sekum.locator('[data-testid^="pengurus-pilih-"]:not([data-testid="pengurus-pilih-semua"])');
  await expect(kotak.first()).toBeVisible({ timeout: 60_000 });
  for (let i = 0; i < 30; i++) await kotak.nth(i).check();
  await sekum.getByTestId('pengurus-buat-surat').click();
  await sekum.waitForURL(/\/surat\/massal\?pilih=/, { timeout: 60_000 });
  await expect(sekum.getByTestId('massal-terpilih')).toContainText('30', { timeout: 60_000 });
  await sekum.getByTestId('massal-keperluan').fill('Kelengkapan Persyaratan Administrasi Beasiswa');
  await sekum.getByTestId('massal-buat').click();
  await sekum.getByTestId('massal-konfirmasi').click();
  await expect(sekum.getByTestId('massal-dibuat')).toContainText('30 surat diajukan', { timeout: 90_000 });

  const s = await sql<{ batch_id: string; n: number }[]>`
    SELECT batch_id::text, count(*)::int AS n FROM surat
    WHERE periode_id = ${periode}::uuid AND data_dinamis->>'nama_pemohon' LIKE ${`E2E107 ${tag}%`} GROUP BY 1`;
  expect(s).toEqual([{ batch_id: expect.any(String), n: 30 }]);
  await sekum.context().close();
});

test('Kadept hanya departemennya & tanpa tombol tulis; BPH baca saja; ANGGOTA tidak menulis', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const daftar = (await (await kadept.request.get('/api/pengurus?status=semua')).json()) as { data: { departemen_id: string | null }[] };
  const [dk] = await sql<{ departemen_id: string }[]>`
    SELECT ur.departemen_id::text FROM user_role ur JOIN app_user u ON u.id = ur.user_id
    WHERE u.email = ${AKUN.kadept.email} AND ur.periode_id = ${periode}::uuid AND ur.departemen_id IS NOT NULL LIMIT 1`;
  expect(daftar.data.every((b) => b.departemen_id === dk!.departemen_id)).toBe(true);
  await kadept.goto('/sekretariat/pengurus', { waitUntil: 'load' });
  await expect(kadept.getByTestId('pengurus-tabel').or(kadept.getByText('Belum ada pengurus'))).toBeVisible({ timeout: 60_000 });
  await expect(kadept.getByTestId('pengurus-tambah')).toHaveCount(0);
  await expect(kadept.getByTestId('pengurus-import')).toHaveCount(0);
  expect((await kadept.request.post('/api/pengurus', { data: { nama_lengkap: 'X', nim: '123456', jabatan: 'Y' } })).status()).toBe(403);

  const bph = await sesi(browser, AKUN.bacaSaja);
  expect((await bph.request.get(`/api/pengurus?q=${tag}`)).status()).toBe(200);
  expect((await bph.request.post('/api/pengurus', { data: { nama_lengkap: 'X', nim: '123456', jabatan: 'Y' } })).status()).toBe(403);
  const anggota = await sesi(browser, AKUN.anggota);
  expect((await anggota.request.post('/api/pengurus', { data: { nama_lengkap: 'X', nim: '123456', jabatan: 'Y' } })).status()).toBe(403);
  for (const p of [kadept, bph, anggota]) await p.context().close();
});
