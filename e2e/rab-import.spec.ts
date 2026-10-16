/**
 * Gate e2e T-091 — impor RAB dari Excel lewat UI (PRD F-9.3 AC import).
 * Gate unit kontraknya (`npm run test -- excel-import`) menguji pengurai &
 * roundtrip; berkas ini menguji alurnya terhadap database:
 *   - pratinjau WAJIB: tidak ada yang tersimpan sebelum "Simpan";
 *   - tambah / ubah / lewati beserta alasannya (divisi lain, divisi baru tanpa hak);
 *   - jumlah kompleks dapat diisi angkanya di pratinjau;
 *   - RAB terkunci → impor ditolak; berkas berstruktur lain → pesan menyebut sheet/kolom.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

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
  if (!url) throw new Error('Gate rab-import butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
let page: Page;
const div = { konsumsi: '', pdd: '' };

/** Berkas berformat template: Konsumsi (ubah+tambah+kompleks), PDD (bukan divisinya), LOGISTIK (divisi baru). */
async function berkasImpor(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RAB');
  let r = 2;
  const divisi = (nama: string, items: [string, string | number, number, ExcelJS.CellValue][], section?: string) => {
    ws.mergeCells(`B${r}:F${r}`);
    ws.getCell(`B${r}`).value = `DIVISI ${nama}`;
    r++;
    ['NO', 'Jenis Barang', 'Jumlah', 'Harga satuan', 'Total '].forEach((h, i) => (ws.getCell(r, 2 + i).value = h));
    r++;
    const awal = r;
    if (section) {
      ws.mergeCells(`B${r}:F${r}`);
      ws.getCell(`B${r}`).value = section;
      r++;
    }
    items.forEach(([jenis, jumlah, harga, f], i) => {
      ws.getCell(r, 2).value = i + 1;
      ws.getCell(r, 3).value = jenis;
      ws.getCell(r, 4).value = jumlah;
      ws.getCell(r, 5).value = harga;
      ws.getCell(r, 6).value = typeof f === 'string' ? { formula: f.replace(/#/g, String(r)), result: 0 } : f;
      r++;
    });
    ws.mergeCells(`B${r}:E${r}`);
    ws.getCell(`B${r}`).value = 'TOTAL';
    ws.getCell(`F${r}`).value = { formula: `SUM(F${awal}:F${r - 1})`, result: 0 };
    r++;
  };
  divisi(
    'KONSUMSI',
    [
      ['Galon', 10, 6000, 'D#*E#'],
      ['Angkot', '16 Unit', 300000, 'E#*16'],
      ['Sewa villa', '2 Hari 1 Malam', 1000000, 'E#*D#'], // rumus gaya template: angkanya perlu dipastikan
    ],
    'KONSUMSI PANITIA',
  );
  divisi('PDD', [['Kamera', 1, 500000, 'D#*E#']]);
  divisi('LOGISTIK', [['Tenda', 1, 300000, 'D#*E#']]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function berkasSalah(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Anggaran').getCell('A1').value = 'bukan template';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function bukaRab(): Promise<void> {
  await page.goto(`/acara/${acaraId}?tab=rab`, { waitUntil: 'load' });
  await expect(page.getByTestId('rab-grid')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
}

test.beforeAll(async ({ browser }) => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E091 ${tag} SYNCHRONIZE`;
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
  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota!.id}::uuid, 1) RETURNING id::text`;
  const [dp] = await sql<{ id: string }[]>`INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${acaraId}::uuid, 'PDD', 2) RETURNING id::text`;
  div.konsumsi = dk!.id;
  div.pdd = dp!.id;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${div.konsumsi}::uuid, ${anggota!.id}::uuid, 'KOORDINATOR')`;
  const [s] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama) VALUES (${div.konsumsi}::uuid, 'KONSUMSI PANITIA') RETURNING id::text`;
  await sql`INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
    VALUES (${s!.id}::uuid, 1, 'Galon', '10', 10, 5000, 50000)`;

  page = await (await browser.newContext()).newPage();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(AKUN.anggota.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
});

test.afterAll(async () => {
  await page?.context().close();
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

const itemDb = async (jenis: string) =>
  sql<{ jumlah_teks: string; jumlah_numerik: string | null; harga: string; total: string }[]>`
    SELECT i.jumlah_teks, i.jumlah_numerik::text, i.harga_satuan::text AS harga, i.total::text
    FROM rab_item i JOIN rab_section s ON s.id = i.section_id JOIN divisi d ON d.id = s.divisi_id
    WHERE d.kepanitiaan_id = ${acaraId}::uuid AND i.jenis_barang = ${jenis}`;

test('pratinjau wajib: tambah/ubah/lewati beserta alasan, belum ada yang tersimpan', async () => {
  await bukaRab();
  await page.getByTestId('rab-impor').click();
  await page.getByTestId('impor-berkas').setInputFiles({ name: 'rab.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await berkasImpor() });
  await expect(page.getByTestId('impor-ringkas')).toContainText('5 item di berkas: 2 ditambah · 1 diubah · 0 sama · 2 dilewati', { timeout: 60_000 });

  const baris = (teks: string) => page.getByTestId('impor-baris').filter({ hasText: teks });
  await expect(baris('Galon')).toHaveAttribute('data-aksi', 'UBAH');
  await expect(baris('Galon')).toContainText('harga 5000 → 6000');
  await expect(baris('Angkot')).toHaveAttribute('data-aksi', 'TAMBAH');
  await expect(baris('Kamera')).toHaveAttribute('data-aksi', 'LEWATI');
  await expect(baris('Kamera')).toContainText('Divisi PDD bukan divisi Anda.');
  await expect(baris('Tenda')).toContainText('Divisi baru hanya dapat ditambah');

  // Belum ada yang tersimpan.
  expect(await itemDb('Angkot')).toHaveLength(0);
  expect(Number((await itemDb('Galon'))[0]!.harga)).toBe(5000);
});

test('jumlah kompleks diisi di pratinjau, lalu simpan', async () => {
  const villa = page.getByTestId('impor-baris').filter({ hasText: 'Sewa villa' });
  const r = await villa.getAttribute('data-baris');
  await page.getByTestId(`impor-manual-${r}`).fill('3');
  await page.getByTestId(`impor-manual-${r}`).blur();
  await expect(villa).toContainText('Rp3.000.000', { timeout: 30_000 });

  await page.getByTestId('impor-simpan').click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-testid="rab-item"] input[data-kolom="jenis"][value="Angkot"]')).toHaveCount(1);

  expect(await itemDb('Galon')).toEqual([{ jumlah_teks: '10', jumlah_numerik: '10.00', harga: '6000.00', total: '60000.00' }]);
  expect(await itemDb('Angkot')).toEqual([{ jumlah_teks: '16 Unit', jumlah_numerik: '16.00', harga: '300000.00', total: '4800000.00' }]);
  expect(await itemDb('Sewa villa')).toEqual([{ jumlah_teks: '2 Hari 1 Malam', jumlah_numerik: '3.00', harga: '1000000.00', total: '3000000.00' }]);
  expect(await itemDb('Kamera')).toHaveLength(0);
  const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM divisi WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(n!.n).toBe(2); // LOGISTIK tidak dibuat
});

test('berkas berstruktur lain ditolak dengan pesan yang menyebut sheet', async () => {
  await bukaRab();
  await page.getByTestId('rab-impor').click();
  await page.getByTestId('impor-berkas').setInputFiles({ name: 'salah.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await berkasSalah() });
  await expect(page.getByTestId('impor-galat')).toHaveText('Sheet "RAB" tidak ditemukan. Sheet yang ada: "Anggaran".', { timeout: 60_000 });
  await expect(page.getByTestId('impor-simpan')).toBeDisabled();
});

test('RAB terkunci: impor ditolak', async () => {
  await sql`UPDATE rab_meta SET status = 'DIAJUKAN' WHERE kepanitiaan_id = ${acaraId}::uuid`;
  await sql`UPDATE rab_meta SET status = 'DISETUJUI' WHERE kepanitiaan_id = ${acaraId}::uuid`;
  try {
    const r = await page.request.post(`/api/rab/${acaraId}/import`, {
      multipart: { mode: 'pratinjau', berkas: { name: 'rab.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await berkasImpor() } },
    });
    expect(r.status(), await r.text()).toBe(409);
    await bukaRab();
    await expect(page.getByTestId('rab-impor')).toHaveCount(0);
  } finally {
    await sql`UPDATE rab_meta SET status = 'DRAFT', alasan_buka_kunci = ${`Uji e2e impor ${Date.now()}`} WHERE kepanitiaan_id = ${acaraId}::uuid`;
  }
});
