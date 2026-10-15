/**
 * Gate T-063 — Arsip surat (PRD F-4.4).
 *
 * Data uji disuntik lewat SQL dengan kode kegiatan UNIK per jalan, sehingga
 * filter `kegiatan=` mengisolasi hitungan dari surat lain di DB dev. Menguji:
 *   - pencarian "peminjaman tandu" menemukan surat lewat perihal DAN isi
 *     (data_dinamis), tidak menemukan yang tak relevan;
 *   - surat DIBATALKAN tetap tampil dengan badge dan nomornya;
 *   - filter tersimpan di URL dan dapat dibuka pengguna lain (BPH);
 *   - paginasi kursor 50 baris, tanpa baris ganda antarhalaman;
 *   - export Excel memuat baris yang sama, termasuk yang dibatalkan;
 *   - Kadept hanya melihat surat departemennya; draft orang lain tak terlihat;
 *   - halaman detail: pembatalan surat TERBIT wajib beralasan, tetap di arsip.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

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
  if (!url) throw new Error('Gate arsip-surat butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
const dibuat: string[] = [];
let kegiatan = '';
const id: Record<'tandu' | 'isi' | 'lain' | 'batal' | 'terbit' | 'draftLain' | 'deptLain', string> = {
  tandu: '',
  isi: '',
  lain: '',
  batal: '',
  terbit: '',
  draftLain: '',
  deptLain: '',
};
const nomor: Record<string, string> = {};

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

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  // Unik per project & jalan: dua project paralel tidak saling menghitung.
  kegiatan = `E63${test.info().project.name.slice(0, 1).toUpperCase()}${Date.now().toString(36).slice(-5).toUpperCase()}`;

  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const pengguna = await sql<{ email: string; id: string }[]>`
    SELECT email, id::text FROM app_user WHERE email IN (${AKUN.aktif.email}, ${AKUN.kadept.email}, ${AKUN.sekum.email})`;
  const uid = Object.fromEntries(pengguna.map((u) => [u.email, u.id]));
  const ketua = uid[AKUN.aktif.email]!;
  const kadept = uid[AKUN.kadept.email]!;
  const sekum = uid[AKUN.sekum.email]!;
  const [dk] = await sql<{ departemen_id: string }[]>`
    SELECT departemen_id::text FROM user_role WHERE user_id = ${kadept}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;
  const [dLain] = await sql<{ id: string }[]>`SELECT id::text FROM departemen WHERE id <> ${dk!.departemen_id}::uuid LIMIT 1`;

  async function surat(o: {
    perihal: string;
    oleh: string;
    dept: string | null;
    status?: string;
    data?: Record<string, string>;
    tanggal?: string;
  }): Promise<string> {
    const [r] = await sql<{ id: string }[]>`
      INSERT INTO surat (periode_id, kode_surat, kode_kegiatan, tanggal_surat, perihal, tujuan_nama, tujuan_alamat,
                         dibuat_oleh, departemen_id, status, data_dinamis)
      VALUES (${p!.id}::uuid, '01', ${kegiatan}, ${o.tanggal ?? '2026-10-15'}::date, ${o.perihal}, 'Kepala BPBD', 'di Tempat',
              ${o.oleh}::uuid, ${o.dept}::uuid, ${o.status ?? 'MENUNGGU_APPROVAL'}, ${sql.json(o.data ?? {})})
      RETURNING id::text`;
    dibuat.push(r!.id);
    return r!.id;
  }
  async function terbit(sid: string): Promise<string> {
    const [n] = await sql<{ n: string }[]>`SELECT alokasi_nomor_surat(${sid}::uuid, ${ketua}::uuid) AS n`;
    await sql`UPDATE surat SET status = 'TERBIT' WHERE id = ${sid}::uuid`;
    return n!.n;
  }

  id.tandu = await surat({ perihal: 'Permohonan Peminjaman Tandu', oleh: kadept, dept: dk!.departemen_id, tanggal: '2026-10-14' });
  nomor.tandu = await terbit(id.tandu);
  id.isi = await surat({ perihal: 'Pemberitahuan Kegiatan Bakti', oleh: kadept, dept: dk!.departemen_id, data: { barang: 'Peminjaman tandu lipat untuk bakti sosial' } });
  id.lain = await surat({ perihal: 'Undangan Rapat Pleno', oleh: sekum, dept: null });
  id.batal = await surat({ perihal: 'Permohonan Dana Kegiatan', oleh: kadept, dept: dk!.departemen_id });
  nomor.batal = await terbit(id.batal);
  await sql`UPDATE surat SET status = 'DIBATALKAN', alasan_pembatalan = 'Diganti surat baru', dibatalkan_oleh = ${ketua}::uuid, dibatalkan_at = now()
            WHERE id = ${id.batal}::uuid`;
  id.terbit = await surat({ perihal: 'Permohonan Kerja Sama Klinik', oleh: sekum, dept: null });
  nomor.terbit = await terbit(id.terbit);
  id.draftLain = await surat({ perihal: 'Draf Rahasia Sekum', oleh: sekum, dept: null, status: 'DRAFT' });
  id.deptLain = await surat({ perihal: 'Surat Departemen Lain', oleh: sekum, dept: dLain!.id });
});

test.afterAll(async () => {
  if (sql) {
    if (dibuat.length) await sql`DELETE FROM surat WHERE id = ANY(${dibuat}::uuid[])`.catch(() => {});
    await sql.end();
  }
});

const terlihat = async (page: Page, sid: string) => page.getByTestId(`arsip-baris-${sid}`).count();

test('pencarian "peminjaman tandu" menemukan surat lewat perihal dan isi; filter tersimpan di URL', async ({ browser }) => {
  const ketua = await sesi(browser, AKUN.aktif);
  await ketua.goto(`/surat?kegiatan=${kegiatan}`, { waitUntil: 'load' });
  await expect(ketua.getByTestId('arsip-tabel')).toBeVisible({ timeout: 60_000 });
  // Ketua melihat semua surat resmi, tetapi bukan draf orang lain.
  await expect(ketua.getByTestId('arsip-jumlah')).toContainText('6 surat');
  expect(await terlihat(ketua, id.draftLain)).toBe(0);

  await ketua.getByTestId('arsip-cari').fill('peminjaman tandu');
  await ketua.getByTestId('arsip-cari-kirim').click();
  await expect.poll(() => new URL(ketua.url()).searchParams.get('q'), { timeout: 60_000 }).toBe('peminjaman tandu');
  await expect(ketua.getByTestId('arsip-jumlah')).toContainText('2 surat');
  expect(await terlihat(ketua, id.tandu)).toBe(1);
  expect(await terlihat(ketua, id.isi)).toBe(1);
  expect(await terlihat(ketua, id.lain)).toBe(0);
  await expect(ketua.getByTestId(`arsip-baris-${id.tandu}`)).toContainText(nomor.tandu!);

  // Tautan yang dibagikan: BPH membuka URL yang sama, hasilnya sama.
  const url = ketua.url();
  const bph = await sesi(browser, AKUN.bacaSaja);
  await bph.goto(url, { waitUntil: 'load' });
  await expect(bph.getByTestId('arsip-jumlah')).toContainText('2 surat', { timeout: 60_000 });
  expect(await terlihat(bph, id.tandu)).toBe(1);
  await expect(bph.getByTestId('arsip-cari')).toHaveValue('peminjaman tandu');

  for (const p of [ketua, bph]) await p.context().close();
});

test('surat DIBATALKAN tetap tampil dengan badge dan nomornya', async ({ browser }) => {
  const ketua = await sesi(browser, AKUN.aktif);
  await ketua.goto(`/surat?kegiatan=${kegiatan}`, { waitUntil: 'load' });
  const baris = ketua.getByTestId(`arsip-baris-${id.batal}`);
  await expect(baris).toBeVisible({ timeout: 60_000 });
  await expect(baris).toHaveAttribute('data-status', 'DIBATALKAN');
  await expect(baris).toContainText('Dibatalkan');
  await expect(baris).toContainText(nomor.batal!);

  await ketua.goto(`/surat?kegiatan=${kegiatan}&status=DIBATALKAN`, { waitUntil: 'load' });
  await expect(ketua.getByTestId('arsip-jumlah')).toContainText('1 surat', { timeout: 60_000 });

  await ketua.goto(`/surat/${id.batal}`, { waitUntil: 'load' });
  await expect(ketua.getByTestId('surat-detail-batal')).toContainText('Diganti surat baru', { timeout: 60_000 });
  await expect(ketua.getByTestId('surat-detail-nomor')).toContainText(nomor.batal!);
  await expect(ketua.getByTestId('surat-batalkan')).toHaveCount(0);
  await ketua.context().close();
});

test('Kadept hanya melihat surat departemennya; draf orang lain dan detailnya 404', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  await kadept.goto(`/surat?kegiatan=${kegiatan}`, { waitUntil: 'load' });
  await expect(kadept.getByTestId('arsip-tabel')).toBeVisible({ timeout: 60_000 });
  // tandu, isi, batal = buatan Kadept di departemennya.
  await expect(kadept.getByTestId('arsip-jumlah')).toContainText('3 surat');
  for (const sid of [id.lain, id.terbit, id.deptLain, id.draftLain]) expect(await terlihat(kadept, sid)).toBe(0);
  expect((await kadept.goto(`/surat/${id.deptLain}`))?.status()).toBe(404);
  expect((await kadept.goto(`/surat/${id.draftLain}`))?.status()).toBe(404);

  const anggota = await sesi(browser, AKUN.anggota);
  expect((await anggota.goto('/surat'))?.status()).toBe(404);
  expect((await anggota.request.get('/api/surat')).status()).toBe(403);
  for (const p of [kadept, anggota]) await p.context().close();
});

test('paginasi kursor 50 baris tanpa baris ganda; export Excel memuat baris yang sama', async ({ browser }) => {
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const [u] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${AKUN.sekum.email}`;
  // 52 baris bertanggal sama: urutan di dalam satu tanggal ditentukan created_at
  // mikrodetik — kursor milidetik akan melompati atau mengulang baris di sini.
  const baru = await sql<{ id: string }[]>`
    INSERT INTO surat (periode_id, kode_surat, kode_kegiatan, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    SELECT ${p!.id}::uuid, '01', ${kegiatan}, '2026-10-01'::date, 'Halaman uji ' || g, 'X', 'di Tempat', ${u!.id}::uuid, 'MENUNGGU_APPROVAL'
    FROM generate_series(1, 52) g RETURNING id::text`;
  dibuat.push(...baru.map((b) => b.id));

  const ketua = await sesi(browser, AKUN.aktif);
  const h1 = (await (await ketua.request.get(`/api/surat?kegiatan=${kegiatan}`)).json()) as {
    data: { baris: { id: string }[]; berikut: string | null; total: number };
  };
  expect(h1.data.total).toBe(58);
  expect(h1.data.baris).toHaveLength(50);
  expect(h1.data.berikut).not.toBeNull();
  const h2 = (await (await ketua.request.get(`/api/surat?kegiatan=${kegiatan}&cursor=${h1.data.berikut}`)).json()) as typeof h1;
  expect(h2.data.baris).toHaveLength(8);
  expect(h2.data.berikut).toBeNull();
  const semua = [...h1.data.baris, ...h2.data.baris].map((b) => b.id);
  expect(new Set(semua).size).toBe(58);

  // Filter bulan: seluruh data uji bertanggal Oktober 2026.
  const total = async (q: string) =>
    ((await (await ketua.request.get(`/api/surat?kegiatan=${kegiatan}&${q}`)).json()) as typeof h1).data.total;
  expect(await total('bulan=2026-10')).toBe(58);
  expect(await total('bulan=2026-09')).toBe(0);
  expect(await total('bulan=2026-10&status=DIBATALKAN')).toBe(1);

  // Tombol halaman berikutnya di UI memakai kursor yang sama.
  await ketua.goto(`/surat?kegiatan=${kegiatan}`, { waitUntil: 'load' });
  await ketua.getByTestId('arsip-berikutnya').click({ timeout: 60_000 });
  await expect.poll(() => new URL(ketua.url()).searchParams.get('cursor'), { timeout: 60_000 }).toBe(h1.data.berikut);
  await expect(ketua.getByTestId(`arsip-baris-${h2.data.baris[0]!.id}`)).toBeVisible({ timeout: 60_000 });

  // Export: seluruh baris (tanpa kursor), termasuk yang dibatalkan, sebagai xlsx.
  const x = await ketua.request.get(`/api/surat?kegiatan=${kegiatan}&format=xlsx`);
  expect(x.status()).toBe(200);
  expect(x.headers()['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await x.body()) as never);
  const ws = wb.worksheets[0]!;
  expect(ws.rowCount).toBe(2 + 58);
  const isi = JSON.stringify(ws.getSheetValues());
  expect(isi).toContain(nomor.batal);
  expect(isi).toContain('Dibatalkan');
  await ketua.context().close();
});

test('detail: pembatalan surat TERBIT wajib beralasan dan surat tetap di arsip', async ({ browser }) => {
  test.skip(test.info().project.name !== 'desktop', 'satu project cukup untuk aksi yang mengubah data');
  const ketua = await sesi(browser, AKUN.aktif);
  await ketua.goto(`/surat/${id.terbit}`, { waitUntil: 'load' });
  await ketua.getByTestId('surat-batalkan').click({ timeout: 60_000 });
  await expect(ketua.getByTestId('surat-batalkan-kirim')).toBeDisabled();
  await ketua.getByTestId('surat-alasan-batal').fill('Klinik mitra berganti');
  await ketua.getByTestId('surat-batalkan-kirim').click();
  await expect(ketua.getByTestId('surat-detail-batal')).toContainText('Klinik mitra berganti', { timeout: 20_000 });

  await ketua.goto(`/surat?kegiatan=${kegiatan}&status=DIBATALKAN`, { waitUntil: 'load' });
  await expect(ketua.getByTestId(`arsip-baris-${id.terbit}`)).toContainText(nomor.terbit!, { timeout: 60_000 });
  const [r] = await sql<{ status: string; nomor_lengkap: string }[]>`SELECT status::text, nomor_lengkap FROM surat WHERE id = ${id.terbit}::uuid`;
  expect(r).toEqual({ status: 'DIBATALKAN', nomor_lengkap: nomor.terbit });
  await ketua.context().close();
});
