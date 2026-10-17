/**
 * Gate T-105 — Generator LPJ (PRD F-12.1, ADR-015).
 *
 * Menguji:
 *   - prasyarat & isian wajib: generate ditolak dengan daftar yang kurang;
 *   - LPJ dapat di-generate setelah ≥ 1 nota terverifikasi; snapshot analisis
 *     tersimpan; nota terlampir sebagai MASTER (byte identik dengan berkas
 *     unduhan master), bukan preview/thumbnail;
 *   - alur DRAFT → DIAJUKAN → DISETUJUI_BENDUM (Bendum) → FINAL (Ketua);
 *     RAB menjadi SELESAI; LPJ FINAL tidak dapat diubah (API & database);
 *   - tampilan LPJ yang sudah diajukan memakai snapshot walau RAB berubah;
 *   - Anggota tidak punya akses LPJ.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import PizZip from 'pizzip';
import postgres from 'postgres';
import sharp from 'sharp';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

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
  if (!url) throw new Error('Gate lpj-generate butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let kepId = '';
let itemId = '';
let notaImage = '';
let fotoImage = '';
const divisi = { id: '' };

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

async function unggahGambar(page: Page, teks: string): Promise<string> {
  const master = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 245, g: 240, b: 225 } } })
    .composite([{ input: Buffer.from(`<svg width="1200" height="1600"><text x="80" y="300" font-size="90" fill="#222">${teks}</text></svg>`) }])
    .jpeg({ quality: 90 })
    .toBuffer();
  const r = await page.request.post('/api/images/upload', {
    multipart: {
      master: { name: 'master.jpg', mimeType: 'image/jpeg', buffer: master },
      preview: { name: 'p.webp', mimeType: 'image/webp', buffer: await sharp(master).resize(960, 1280).webp().toBuffer() },
      thumb: { name: 't.webp', mimeType: 'image/webp', buffer: await sharp(master).resize(300, 400).webp().toBuffer() },
      original_width: '1200',
      original_height: '1600',
      original_mime_type: 'image/jpeg',
      kind: 'DOKUMEN',
      is_scanned: 'false',
      original_filename: `${teks}.jpg`,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return ((await r.json()) as { data: { id: string } }).data.id;
}

const manual = (dokumentasi: { image_id: string; caption: string }[]) => ({
  pendahuluan: 'Kegiatan pengenalan prodi telah terlaksana.',
  target_peserta: 'Mahasiswa baru Informatika.',
  waktu: { hari_tanggal: 'Sabtu, 07 November 2026', waktu: '08.00 WIB', tempat: 'Kampus FT' },
  proses_perencanaan: 'Rapat persiapan tiga kali.',
  pelaksanaan_kegiatan: 'Acara berjalan sesuai rundown.',
  output: 'Mahasiswa baru mengenal himpunan.',
  penutup: 'Demikian laporan ini dibuat.',
  narasi: { [divisi.id]: { narasi: 'Divisi konsumsi menyediakan snack.', perencanaan: '', pelaksanaan: '', pendukung: '', penghambat: '', saran: '' } },
  catatan_materi: '',
  materi: [],
  daftar_hadir: 'Terlampir.',
  dokumentasi,
  pejabat: { kaprodi: { nama: 'Dr. Kaprodi Uji', nomor: '198101012006041002' }, wd3: { nama: 'Dr. WD Tiga Uji', nomor: '198001012005011001' } },
  catatan_pengembalian: null,
});

test.beforeAll(async ({ browser }) => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E105 ${tag} LPJ`;
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await idAkun(AKUN.kadept);
  const anggota = await idAkun(AKUN.anggota);
  const ketuplak = await idAkun(AKUN.sekum);
  const bendum = await idAkun(AKUN.bendum);
  const [d] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role
    WHERE user_id = ${kadept}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;
  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${p!.id}::uuid, ${d!.id}::uuid, ${nama}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      '2026-11-01', '2026-12-06', '2026-12-07', ${kadept}::uuid) RETURNING id::text`;
  prokerId = pr!.id;
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
    VALUES (${prokerId}::uuid, ${nama}, ${`LP${tag}`}, ${ketuplak}::uuid) RETURNING id::text`;
  kepId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${kepId}::uuid)`;
  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${kepId}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  divisi.id = dk!.id;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dk!.id}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;
  const [s] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dk!.id}::uuid, 'MAKAN', 1) RETURNING id::text`;
  const [it] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${s!.id}::uuid, 1, 'Snack peserta', '10', 10, 5000, 50000, false) RETURNING id::text`;
  itemId = it!.id;
  await sql`INSERT INTO pemasukan (kepanitiaan_id, no_urut, keterangan, saldo) VALUES (${kepId}::uuid, 1, 'Kas HMIF', 200000)`;
  for (const st of ['DIAJUKAN', 'DISETUJUI', 'REALISASI']) await sql`UPDATE rab_meta SET status = ${st} WHERE kepanitiaan_id = ${kepId}::uuid`;

  const koor = await sesi(browser, AKUN.anggota);
  notaImage = await unggahGambar(koor, 'NOTA LPJ UJI');
  await koor.context().close();
  const [n] = await sql<{ id: string }[]>`
    INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota, status, verified_by, verified_at)
    VALUES (${dk!.id}::uuid, ${notaImage}::uuid, ${anggota}::uuid, '2026-10-01', 60000, 'TERVERIFIKASI', ${bendum}::uuid, now()) RETURNING id::text`;
  await sql`INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal) VALUES (${n!.id}::uuid, ${itemId}::uuid, 45000)`;
  await sql`INSERT INTO nota_alokasi (nota_id, uraian_luar_rab, nominal) VALUES (${n!.id}::uuid, 'Parkir', 15000)`;
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('prasyarat & isian wajib: generate ditolak dengan daftar yang kurang', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  await bendum.goto(`/acara/${kepId}/lpj`, { waitUntil: 'load' });
  await expect(bendum.getByTestId('lpj-prasyarat-nota')).toHaveAttribute('data-terpenuhi', '1', { timeout: 60_000 });
  await expect(bendum.getByTestId('lpj-prasyarat-rab')).toHaveAttribute('data-terpenuhi', '1');
  await expect(bendum.getByTestId('lpj-prasyarat-dokumentasi')).toHaveAttribute('data-terpenuhi', '0');
  await expect(bendum.getByTestId('lpj-lampiran-kartu')).toHaveCount(1);
  await expect(bendum.getByTestId('lpj-total-pengeluaran')).toHaveText('Rp60.000');
  await expect(bendum.getByTestId('lpj-luar-rab')).toContainText('Parkir');

  const r = await bendum.request.post(`/api/lpj/${kepId}/generate`);
  expect(r.status()).toBe(422);
  const b = (await r.json()) as { error: { details: { kurang: string[] } } };
  expect(b.error.details.kurang).toEqual(expect.arrayContaining(['Dokumentasi kegiatan terunggah', 'Pendahuluan', 'Wakil Dekan III (lembar pengesahan)']));
  await bendum.context().close();
});

test('generate setelah ≥ 1 nota terverifikasi: snapshot tersimpan, nota terlampir sebagai MASTER', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  fotoImage = await unggahGambar(bendum, 'FOTO KEGIATAN');
  const put = await bendum.request.put(`/api/lpj/${kepId}`, { data: { manual: manual([{ image_id: fotoImage, caption: 'Sesi pembukaan' }]) } });
  expect(put.status(), await put.text()).toBe(200);

  await bendum.goto(`/acara/${kepId}/lpj`, { waitUntil: 'load' });
  await expect(bendum.getByTestId('lpj-prasyarat')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
  await bendum.getByTestId('lpj-generate').click();
  await expect(bendum.getByTestId('lpj-hasil')).toContainText('Dokumen LPJ dibuat', { timeout: 120_000 });

  const [l] = await sql<{ status: string; total: number; luar: number }[]>`
    SELECT status::text, (analisis->>'totalAktual')::int AS total, (analisis->>'totalDiLuarRab')::int AS luar FROM lpj WHERE kepanitiaan_id = ${kepId}::uuid`;
  expect(l).toEqual({ status: 'DRAFT', total: 60000, luar: 15000 });

  const docx = await (await bendum.request.get(`/api/lpj/${kepId}/generate`)).body();
  const zip = new PizZip(docx);
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/hmif_gambar'));
  expect(media.length).toBe(2);
  const master = await (await bendum.request.get(`/api/images/${notaImage}/download`)).body();
  // Nota terlampir = berkas master apa adanya (INV-19), bukan preview/thumbnail.
  expect(media.some((f) => zip.file(f)!.asNodeBuffer().equals(master))).toBe(true);
  const teks = zip.file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
  for (const s of ['LEMBAR PENGESAHAN', 'Dr. WD Tiga Uji', 'Lampiran Nota Belanja', 'Snack peserta', 'Divisi konsumsi menyediakan snack.', 'SISA DANA: Rp140.000']) {
    expect(teks, s).toContain(s);
  }
  await bendum.context().close();
});

test('alur Bendum → Ketua → FINAL; snapshot dipakai walau RAB berubah; FINAL beku', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  await bendum.goto(`/acara/${kepId}/lpj`, { waitUntil: 'load' });
  await bendum.getByTestId('lpj-ajukan').click({ timeout: 60_000 });
  await expect(bendum.getByTestId('halaman-lpj')).toHaveAttribute('data-status', 'DIAJUKAN', { timeout: 30_000 });

  // RAB/nota berubah setelah diajukan → tampilan tetap snapshot.
  await sql`UPDATE nota_alokasi SET nominal = 45000 WHERE rab_item_id = ${itemId}::uuid`;
  await sql`UPDATE pemasukan SET saldo = 999000 WHERE kepanitiaan_id = ${kepId}::uuid`;
  await bendum.reload({ waitUntil: 'load' });
  await expect(bendum.getByTestId('lpj-keuangan')).toHaveAttribute('data-snapshot', '1', { timeout: 60_000 });
  await expect(bendum.getByTestId('lpj-total-pemasukan')).toHaveText('Rp200.000');

  // Isi tak dapat diubah setelah diajukan.
  const put = await bendum.request.put(`/api/lpj/${kepId}`, { data: { manual: manual([{ image_id: fotoImage, caption: 'x' }]) } });
  expect(put.status()).toBe(409);

  await bendum.getByTestId('lpj-setujui').click();
  await expect(bendum.getByTestId('halaman-lpj')).toHaveAttribute('data-status', 'DISETUJUI_BENDUM', { timeout: 30_000 });
  // Bendum tidak dapat memfinalkan (tahap Ketua).
  const lompat = await bendum.request.post(`/api/lpj/${kepId}/approve`, { data: { aksi: 'setujui' } });
  expect(lompat.status()).toBe(403);
  await bendum.context().close();

  const ketua = await sesi(browser, AKUN.aktif);
  await ketua.goto(`/acara/${kepId}/lpj`, { waitUntil: 'load' });
  await ketua.getByTestId('lpj-setujui').click({ timeout: 60_000 });
  await expect(ketua.getByTestId('halaman-lpj')).toHaveAttribute('data-status', 'FINAL', { timeout: 30_000 });
  await expect(ketua.getByTestId('lpj-final')).toBeVisible();
  await expect(ketua.locator('[data-testid="lpj-generate"], [data-testid="lpj-kembalikan"], [data-testid="lpj-setujui"]')).toHaveCount(0);

  const [r] = await sql<{ lpj: string; rab: string; bendum: boolean; ketua: boolean }[]>`
    SELECT l.status::text AS lpj, m.status::text AS rab, l.disetujui_bendum_at IS NOT NULL AS bendum, l.disetujui_ketua_at IS NOT NULL AS ketua
    FROM lpj l JOIN rab_meta m ON m.kepanitiaan_id = l.kepanitiaan_id WHERE l.kepanitiaan_id = ${kepId}::uuid`;
  expect(r).toEqual({ lpj: 'FINAL', rab: 'SELESAI', bendum: true, ketua: true });

  // FINAL beku: API menolak, database menolak.
  expect((await ketua.request.post(`/api/lpj/${kepId}/approve`, { data: { aksi: 'kembalikan', alasan: 'coba kembalikan' } })).status()).toBe(409);
  const db = await sql`UPDATE lpj SET data_manual = '{}'::jsonb WHERE kepanitiaan_id = ${kepId}::uuid`.then(
    () => 'diterima',
    (e: Error) => e.message,
  );
  expect(db).toContain('LPJ FINAL tidak dapat diubah');
  await ketua.context().close();

  const bendum2 = await sesi(browser, AKUN.bendum);
  expect((await bendum2.request.post(`/api/lpj/${kepId}/generate`)).status()).toBe(409);
  await bendum2.context().close();
});

test('Anggota tidak punya akses LPJ', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  const hal = await koor.goto(`/acara/${kepId}/lpj`, { waitUntil: 'load' });
  expect(hal?.status()).toBe(404);
  expect((await koor.request.get(`/api/lpj/${kepId}`)).status()).toBe(403);
  await koor.context().close();
});
