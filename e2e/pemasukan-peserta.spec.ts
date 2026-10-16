/**
 * Gate T-092 — PEMASUKAN & data peserta (PRD F-9.4).
 *
 *   - ringkasan (peserta, sudah/belum bayar, terkumpul, total pemasukan) cocok
 *     dengan baris peserta di DATABASE pada setiap perubahan;
 *   - import 100 peserta menampilkan pratinjau valid/peringatan/error SEBELUM
 *     menyimpan (tidak ada baris tersimpan sampai "Import");
 *   - sumber dana manual; hapus hanya Bendahara/Admin (cermin RLS);
 *   - total pemasukan mengalir ke saldo awal sheet PENGELUARAN (ekspor).
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
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
  if (!url) throw new Error('Gate pemasukan-peserta butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
let tag = '';
let koor: Page;

async function sesi(browser: Browser, akun: AkunUji): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  return page;
}

async function bukaRab(page: Page): Promise<void> {
  await page.goto(`/acara/${acaraId}?tab=rab`, { waitUntil: 'load' });
  await expect(page.getByTestId('pemasukan-panel')).toBeVisible({ timeout: 60_000 });
}

const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

/** Ringkasan di layar harus sama dengan hitungan langsung dari tabel peserta. */
async function ringkasCocokDb(page: Page): Promise<void> {
  const [db] = await sql<{ total: number; sudah: number; terkumpul: string; sumber: string }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE sudah_bayar)::int AS sudah,
           COALESCE(SUM(jumlah) FILTER (WHERE sudah_bayar), 0)::text AS terkumpul,
           (SELECT COALESCE(SUM(saldo), 0)::text FROM pemasukan WHERE kepanitiaan_id = ${acaraId}::uuid) AS sumber
    FROM peserta WHERE kepanitiaan_id = ${acaraId}::uuid`;
  await expect(page.getByTestId('peserta-ringkas-total')).toHaveText(String(db!.total));
  await expect(page.getByTestId('peserta-ringkas-sudah')).toHaveText(String(db!.sudah));
  await expect(page.getByTestId('peserta-ringkas-belum')).toHaveText(String(db!.total - db!.sudah));
  await expect(page.getByTestId('peserta-ringkas-terkumpul')).toHaveText(rp(Number(db!.terkumpul)));
  await expect(page.getByTestId('pemasukan-total')).toHaveText(rp(Number(db!.terkumpul) + Number(db!.sumber)));
}

/** 100 baris: 90 valid, 4 NIM ganda di berkas (peringatan), 6 error. */
function csv100(): string {
  const b: string[][] = [['Nama Lengkap', 'NIM', 'Status Bayar', 'Tgl Bayar', 'Jumlah']];
  const nim = (n: number) => `98${tag}${String(n).padStart(3, '0')}`;
  for (let i = 1; i <= 90; i++) b.push([`E2E092 ${tag} Peserta ${i}`, nim(i), i % 2 ? 'Lunas' : 'Belum', i % 2 ? '22/11/2025' : '', i % 2 ? '150000' : '0']);
  b.push([`E2E092 ${tag} Ganda A`, nim(91), 'Belum', '', ''], [`E2E092 ${tag} Ganda B`, nim(91), 'Belum', '', '']);
  b.push([`E2E092 ${tag} Ganda C`, nim(93), 'Belum', '', ''], [`E2E092 ${tag} Ganda D`, nim(93), 'Belum', '', '']);
  b.push(['', nim(95), 'Lunas', '', '']);
  b.push([`E2E092 ${tag} Status Aneh`, nim(96), 'mungkin', '', '']);
  b.push([`E2E092 ${tag} Tanggal Aneh`, nim(97), 'Lunas', '31 Nov', '']);
  b.push([`E2E092 ${tag} Belum Bertanggal`, nim(98), 'Belum', '22/11/2025', '']);
  b.push([`E2E092 ${tag} NIM Huruf`, '33A7', 'Belum', '', '']);
  b.push([`E2E092 ${tag} Jumlah Aneh`, nim(100), 'Lunas', '', 'seratus ribu']);
  return b.map((r) => r.map((s) => `"${s}"`).join(';')).join('\r\n');
}

test.beforeAll(async ({ browser }) => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 1 : 2}${Date.now().toString().slice(-5)}`;
  const nama = `E2E092 ${tag} SYNCHRONIZE`;
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
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan) VALUES (${prokerId}::uuid, ${nama}, ${`SYNC${tag}`}) RETURNING id::text`;
  acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${acaraId}::uuid)`;
  const [dv] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id) VALUES (${acaraId}::uuid, 'Bendahara', ${anggota!.id}::uuid) RETURNING id::text`;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dv!.id}::uuid, ${anggota!.id}::uuid, 'KOORDINATOR')`;
  koor = await sesi(browser, AKUN.anggota);
});

test.afterAll(async () => {
  await koor?.context().close();
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('sumber dana manual & peserta satuan: ringkasan cocok dengan database di setiap perubahan', async () => {
  await bukaRab(koor);
  await ringkasCocokDb(koor);

  await koor.getByTestId('sumber-baru-keterangan').fill('Kas Himpunan');
  await koor.getByTestId('sumber-baru-saldo').fill('2600000');
  await koor.getByTestId('sumber-tambah').click();
  await expect(koor.getByTestId('sumber-item')).toHaveCount(1, { timeout: 30_000 });
  await ringkasCocokDb(koor);

  await koor.getByTestId('peserta-baru-nama').fill(`E2E092 ${tag} Triana`);
  await koor.getByTestId('peserta-baru-jumlah').fill('150000');
  await koor.getByTestId('peserta-tambah').click();
  const baris = koor.getByTestId('peserta-item').filter({ hasText: 'Triana' });
  await expect(baris).toHaveCount(1, { timeout: 30_000 });
  await ringkasCocokDb(koor);

  await baris.getByTestId('peserta-bayar').check();
  await expect(koor.getByTestId('peserta-ringkas-sudah')).toHaveText('1', { timeout: 30_000 });
  await ringkasCocokDb(koor);
  const [t] = await sql<{ tanggal: string | null }[]>`SELECT tanggal_bayar::text AS tanggal FROM peserta WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(t!.tanggal).not.toBeNull(); // dicentang → tanggal hari ini terisi

  await baris.getByTestId('peserta-bayar').uncheck();
  await expect(koor.getByTestId('peserta-ringkas-sudah')).toHaveText('0', { timeout: 30_000 });
  await ringkasCocokDb(koor);
  const [u] = await sql<{ tanggal: string | null }[]>`SELECT tanggal_bayar::text AS tanggal FROM peserta WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(u!.tanggal).toBeNull(); // dibatalkan → tanggal ikut kosong (CHECK konsisten)

  // Panitia bukan Bendahara: tombol hapus tidak dirender, API ditolak.
  await expect(koor.getByTestId('peserta-hapus')).toHaveCount(0);
  await expect(koor.getByTestId('sumber-hapus')).toHaveCount(0);
  const id = await baris.getAttribute('data-id');
  expect((await koor.request.delete(`/api/kepanitiaan/${acaraId}/peserta?baris=${id}`)).status()).toBe(403);
});

test('import 100 peserta: pratinjau valid/peringatan/error sebelum menyimpan', async () => {
  await bukaRab(koor);
  await koor.getByTestId('peserta-impor').click();
  await koor.getByTestId('peserta-impor-berkas').setInputFiles({ name: 'peserta.csv', mimeType: 'text/csv', buffer: Buffer.from(csv100(), 'utf8') });
  await expect(koor.getByTestId('peserta-impor-ringkas')).toContainText('90 baris valid · 4 baris peringatan · 6 baris error', { timeout: 60_000 });
  const [awal] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM peserta WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(awal!.n).toBe(1); // belum ada yang tersimpan

  await expect(koor.getByTestId('peserta-impor-simpan')).toHaveText('Import 94 baris');
  await koor.getByTestId('peserta-impor-simpan').click();
  await expect(koor.getByTestId('peserta-impor-laporan')).toContainText('92 peserta baru · 0 diperbarui · 8 dilewati', { timeout: 60_000 });
  await koor.getByRole('button', { name: 'Tutup', exact: true }).click();
  await expect(koor.getByTestId('peserta-item')).toHaveCount(93, { timeout: 30_000 });
  await ringkasCocokDb(koor);
});

test('Bendahara menghapus peserta; nomor urut dirapatkan; ringkasan tetap cocok', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  await bukaRab(bendum);
  const pertama = bendum.getByTestId('peserta-item').first();
  await pertama.getByTestId('peserta-hapus').click();
  await expect(bendum.getByTestId('peserta-item')).toHaveCount(92, { timeout: 30_000 });
  await ringkasCocokDb(bendum);
  const urut = await sql<{ no: number }[]>`SELECT no_urut AS no FROM peserta WHERE kepanitiaan_id = ${acaraId}::uuid ORDER BY no_urut`;
  expect(urut.map((x) => x.no)).toEqual(Array.from({ length: 92 }, (_, i) => i + 1));
  await bendum.context().close();
});

test('total pemasukan menjadi saldo awal sheet PENGELUARAN di Excel', async () => {
  const r = await koor.request.get(`/api/rab/${acaraId}/export`);
  expect(r.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await r.body()) as unknown as ArrayBuffer);
  const [db] = await sql<{ terkumpul: string }[]>`
    SELECT COALESCE(SUM(jumlah) FILTER (WHERE sudah_bayar), 0)::text AS terkumpul FROM peserta WHERE kepanitiaan_id = ${acaraId}::uuid`;
  const total = Number(db!.terkumpul) + 2_600_000;
  const pm = wb.getWorksheet('PEMASUKAN')!;
  expect(pm.getCell('C4').value).toContain('Total Pembayaran');
  expect(pm.getCell('D4').value).toBe(Number(db!.terkumpul));
  expect(pm.getCell('C5').value).toBe('Kas Himpunan');
  expect((pm.getCell('D6').value as { result: number }).result).toBe(total);
  const pg = wb.getWorksheet('PENGELUARAN')!;
  expect((pg.getCell('H6').value as { result: number }).result).toBe(total);
});
