/**
 * Gate T-102 — Verifikasi nota oleh Bendahara (PRD F-11.4, USER_FLOW §7.2).
 *
 * Menguji:
 *   - antrian dikelompokkan per acara & divisi; grid memakai THUMBNAIL dan
 *     TIDAK PERNAH meminta master (diperiksa di lalu lintas jaringan);
 *     detail memakai PREVIEW berdampingan dengan data input;
 *   - tolak tanpa alasan ditolak server (422); tolak & minta perbaikan via UI;
 *   - setujui → TERVERIFIKASI, RAB DISETUJUI → REALISASI;
 *   - alokasi tidak seimbang: tombol setujui mati DAN API menolak (INV-28);
 *   - non-Bendahara: halaman 404, API 403.
 * Ukuran waktu galeri 30 nota: `npx tsx scripts/bench-galeri-nota.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';
import sharp from 'sharp';

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
  if (!url) throw new Error('Gate verifikasi-nota butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let kepId = '';
let imageId = '';
const nota: Record<'setuju' | 'tolak' | 'perbaiki' | 'timpang', string> = { setuju: '', tolak: '', perbaiki: '', timpang: '' };

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

/** Tiga turunan sah (pipeline T-097) — dibuat di Node supaya thumb/preview/master benar-benar ada di storage. */
async function turunan() {
  const dasar = sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 245, g: 240, b: 225 } } }).composite([
    { input: Buffer.from('<svg width="1200" height="900"><text x="80" y="200" font-size="90" fill="#222">NOTA UJI T-102</text></svg>') },
  ]);
  const master = await dasar.clone().jpeg({ quality: 90 }).toBuffer();
  const preview = await sharp(master).webp({ quality: 78 }).toBuffer();
  const thumb = await sharp(master).resize(400, 300).webp({ quality: 70 }).toBuffer();
  return { master, preview, thumb };
}

async function buatNota(divisiId: string, uploader: string, total: number, alokasi: { item: string | null; nominal: number }[]): Promise<string> {
  const [n] = await sql<{ id: string }[]>`
    INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota)
    VALUES (${divisiId}::uuid, ${imageId}::uuid, ${uploader}::uuid, '2026-10-01', ${total}) RETURNING id::text`;
  for (const a of alokasi) {
    await sql`INSERT INTO nota_alokasi (nota_id, rab_item_id, uraian_luar_rab, nominal)
      VALUES (${n!.id}::uuid, ${a.item}::uuid, ${a.item ? null : 'Di luar RAB uji'}, ${a.nominal})`;
  }
  return n!.id;
}

test.beforeAll(async ({ browser }) => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E102 ${tag} VERIF`;
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
      '2026-11-01', '2026-12-06', '2026-12-07', ${kadept}::uuid)
    RETURNING id::text`;
  prokerId = pr!.id;
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan) VALUES (${prokerId}::uuid, ${nama}, ${`VF${tag}`}) RETURNING id::text`;
  kepId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${kepId}::uuid)`;
  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${kepId}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  const [dp] = await sql<{ id: string }[]>`INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${kepId}::uuid, 'PDD', 2) RETURNING id::text`;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dk!.id}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;
  const [s] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dk!.id}::uuid, 'MAKAN', 1) RETURNING id::text`;
  const [it] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${s!.id}::uuid, 1, 'Snack peserta', '10', 10, 5000, 50000, false) RETURNING id::text`;
  // RAB disetujui (bertahap — trigger 041).
  await sql`UPDATE rab_meta SET status = 'DIAJUKAN' WHERE kepanitiaan_id = ${kepId}::uuid`;
  await sql`UPDATE rab_meta SET status = 'DISETUJUI' WHERE kepanitiaan_id = ${kepId}::uuid`;

  // Gambar asli lewat endpoint unggah (pengunggah = anggota).
  const page = await sesi(browser, AKUN.anggota);
  const t = await turunan();
  const r = await page.request.post('/api/images/upload', {
    multipart: {
      master: { name: 'master.jpg', mimeType: 'image/jpeg', buffer: t.master },
      preview: { name: 'preview.webp', mimeType: 'image/webp', buffer: t.preview },
      thumb: { name: 'thumb.webp', mimeType: 'image/webp', buffer: t.thumb },
      original_width: '1200',
      original_height: '900',
      original_mime_type: 'image/jpeg',
      kind: 'DOKUMEN',
      is_scanned: 'false',
      original_filename: 'nota-uji-t102.jpg',
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  imageId = ((await r.json()) as { data: { id: string } }).data.id;
  await page.context().close();

  nota.setuju = await buatNota(dk!.id, anggota, 50000, [{ item: it!.id, nominal: 50000 }]);
  nota.tolak = await buatNota(dk!.id, anggota, 20000, [{ item: null, nominal: 20000 }]);
  nota.perbaiki = await buatNota(dp!.id, anggota, 30000, [{ item: null, nominal: 30000 }]);
  nota.timpang = await buatNota(dk!.id, anggota, 75000, [{ item: null, nominal: 70000 }]);
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('antrian per acara & divisi memakai thumbnail; detail preview; master tak pernah dimuat', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  const diminta: string[] = [];
  bendum.on('request', (r) => diminta.push(r.url()));
  await bendum.goto(`/keuangan/nota/verifikasi?nota=${nota.setuju}`, { waitUntil: 'load' });
  const grup = bendum.getByTestId('antrian-grup').filter({ hasText: /E2E102/ });
  await expect(grup).toHaveCount(2, { timeout: 60_000 });
  await expect(grup.filter({ hasText: 'Konsumsi' }).getByTestId('antrian-kartu')).toHaveCount(3);
  await expect(grup.filter({ hasText: 'PDD' }).getByTestId('antrian-kartu')).toHaveCount(1);

  const kartu = bendum.locator(`[data-testid="antrian-kartu"][data-nota-id="${nota.setuju}"] img`);
  await expect(kartu).toHaveAttribute('src', /nota\/thumb\//);
  await expect(kartu).toHaveAttribute('loading', 'lazy');
  await expect.poll(() => kartu.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 30_000 }).toBe(true);

  const detail = bendum.getByTestId('nota-detail');
  await expect(detail).toHaveAttribute('data-nota-id', nota.setuju);
  await expect(detail.getByTestId('nota-image-preview').locator('img')).toHaveAttribute('src', /nota\/preview\//);
  await expect(detail.getByTestId('nota-detail-total')).toHaveText('Rp50.000');
  await expect(detail.getByTestId('nota-unduh-master')).toHaveAttribute('href', `/api/images/${imageId}/download`);

  await bendum.waitForLoadState('networkidle');
  expect(diminta.filter((u) => /nota\/master\/|\/download/.test(u)), 'grid/detail meminta berkas master').toEqual([]);
  await bendum.context().close();
});

test('tolak tanpa alasan ditolak server; tolak & minta perbaikan lewat UI', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  const kosong = await bendum.request.post(`/api/nota/${nota.tolak}/reject`, { data: {} });
  expect(kosong.status()).toBe(422);
  const pendek = await bendum.request.post(`/api/nota/${nota.tolak}/reject`, { data: { alasan: 'x' } });
  expect(pendek.status()).toBe(422);

  await bendum.goto(`/keuangan/nota/verifikasi?nota=${nota.tolak}`, { waitUntil: 'load' });
  await bendum.getByTestId('verifikasi-tolak').click({ timeout: 60_000 });
  const dialog = bendum.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Tolak nota' })).toBeDisabled();
  await dialog.getByRole('textbox').fill('Nota bukan untuk kegiatan ini');
  await dialog.getByRole('button', { name: 'Tolak nota' }).click();
  await expect.poll(async () => (await sql<{ s: string }[]>`SELECT status::text AS s FROM nota WHERE id = ${nota.tolak}::uuid`)[0]!.s, { timeout: 30_000 }).toBe('DITOLAK');

  await bendum.goto(`/keuangan/nota/verifikasi?nota=${nota.perbaiki}`, { waitUntil: 'load' });
  await bendum.getByTestId('verifikasi-minta-perbaikan').click({ timeout: 60_000 });
  await bendum.getByRole('dialog').getByRole('textbox').fill('Foto buram, total tidak terbaca');
  await bendum.getByRole('dialog').getByRole('button', { name: 'Kirim permintaan' }).click();
  await expect
    .poll(async () => (await sql<{ s: string; a: string }[]>`SELECT status::text AS s, alasan_penolakan AS a FROM nota WHERE id = ${nota.perbaiki}::uuid`)[0], { timeout: 30_000 })
    .toEqual({ s: 'PERLU_PERBAIKAN', a: 'Foto buram, total tidak terbaca' });
  await bendum.context().close();
});

test('alokasi tidak seimbang: tombol setujui mati dan API menolak (INV-28)', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  await bendum.goto(`/keuangan/nota/verifikasi?nota=${nota.timpang}`, { waitUntil: 'load' });
  await expect(bendum.getByTestId('nota-detail-total-alokasi')).toHaveAttribute('data-seimbang', '0', { timeout: 60_000 });
  await expect(bendum.getByTestId('verifikasi-setujui')).toBeDisabled();
  const r = await bendum.request.post(`/api/nota/${nota.timpang}/verify`);
  expect(r.status()).toBe(422);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('ALOKASI_TIDAK_SEIMBANG');
  await bendum.context().close();
});

test('setujui → TERVERIFIKASI, RAB DISETUJUI → REALISASI; nota terproses tak dapat diproses ulang', async ({ browser }) => {
  const bendum = await sesi(browser, AKUN.bendum);
  await bendum.goto(`/keuangan/nota/verifikasi?nota=${nota.setuju}`, { waitUntil: 'load' });
  await bendum.getByTestId('verifikasi-setujui').click({ timeout: 60_000 });
  await expect
    .poll(async () => (await sql<{ s: string }[]>`SELECT status::text AS s FROM nota WHERE id = ${nota.setuju}::uuid`)[0]!.s, { timeout: 30_000 })
    .toBe('TERVERIFIKASI');
  const [n] = await sql<{ oleh: string; rab: string }[]>`
    SELECT (SELECT email FROM app_user WHERE id = n.verified_by) AS oleh,
           (SELECT status::text FROM rab_meta WHERE kepanitiaan_id = ${kepId}::uuid) AS rab
    FROM nota n WHERE n.id = ${nota.setuju}::uuid`;
  expect(n).toEqual({ oleh: AKUN.bendum.email, rab: 'REALISASI' });
  // Setelah aksi, antrian bergerak ke nota berikutnya (bukan nota yang sama).
  await expect(bendum.getByTestId('nota-detail')).not.toHaveAttribute('data-nota-id', nota.setuju, { timeout: 30_000 });
  const ulang = await bendum.request.post(`/api/nota/${nota.setuju}/reject`, { data: { alasan: 'coba tolak ulang' } });
  expect(ulang.status()).toBe(409);
  await bendum.context().close();
});

test('selain Bendahara/Admin: halaman 404, API 403', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  const hal = await koor.goto('/keuangan/nota/verifikasi', { waitUntil: 'load' });
  expect(hal?.status()).toBe(404);
  const r = await koor.request.post(`/api/nota/${nota.timpang}/verify`);
  expect(r.status()).toBe(403);
  await koor.context().close();
});
