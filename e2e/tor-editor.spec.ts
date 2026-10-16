/**
 * Gate T-094 — Editor TOR 14 bagian (PRD F-10.1).
 *
 * Menguji:
 *   - bagian Anggaran terisi otomatis dari RAB, tanpa satu pun input, dengan
 *     tautan "Ubah di RAB"; perubahan RAB langsung tercermin;
 *   - bobot parameter kelulusan ≠ 100% ditandai inline, = 100% tidak;
 *   - rundown yang diubah di TOR berubah di tabel `rundown` (satu sumber) —
 *     bukan disalin ke tor.data; baris belum lengkap ditahan, tidak menghapus;
 *   - auto-save 10 detik → "Tersimpan ✓", penghitung "x dari 14 bagian terisi";
 *   - pembaca (BPH) melihat TOR tanpa tombol tulis; PUT ditolak 403.
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
  if (!url) throw new Error('Gate tor-editor butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
let itemId = '';

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

async function bukaTor(page: Page): Promise<void> {
  await page.goto(`/acara/${acaraId}/tor`, { waitUntil: 'load' });
  await expect(page.getByTestId('tor-editor')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
}

const terisi = async (page: Page) => Number(await page.getByTestId('tor-kelengkapan').getAttribute('data-terisi'));

async function tungguTersimpan(page: Page): Promise<void> {
  // Auto-save tiap 10 detik — tanpa menekan apa pun.
  await expect(page.getByTestId('tor-status')).toHaveAttribute('data-status', 'tersimpan', { timeout: 25_000 });
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E094 ${tag} TOR`;
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await idAkun(AKUN.kadept);
  const anggota = await idAkun(AKUN.anggota);
  const ketuplak = await idAkun(AKUN.sekum);
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
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
    VALUES (${prokerId}::uuid, ${nama}, ${`TOR${tag}`}, ${ketuplak}::uuid) RETURNING id::text`;
  acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${acaraId}::uuid)`;
  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dk!.id}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;
  const [s] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dk!.id}::uuid, 'MAKAN', 1) RETURNING id::text`;
  const [it] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${s!.id}::uuid, 1, 'Nasi kotak', '10', 10, 25000, 250000, false) RETURNING id::text`;
  itemId = it!.id;
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('anggaran otomatis dari RAB, tanpa input; perubahan RAB langsung tercermin', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaTor(koor);
  const anggaran = koor.getByTestId('tor-bagian-anggaran');
  await expect(anggaran.getByTestId('tor-anggaran')).toContainText('Konsumsi');
  await expect(koor.getByTestId('tor-anggaran-total')).toHaveText('Rp250.000');
  await expect(anggaran.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
  await expect(koor.getByTestId('tor-ubah-di-rab')).toHaveAttribute('href', `/acara/${acaraId}?tab=rab`);

  await sql`UPDATE rab_item SET jumlah_numerik = 12, jumlah_teks = '12', total = 300000 WHERE id = ${itemId}::uuid`;
  await bukaTor(koor);
  await expect(koor.getByTestId('tor-anggaran-total')).toHaveText('Rp300.000');
  // Anggaran tidak pernah disalin ke tor.data.
  const [t] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM tor WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(t!.n).toBe(0);
  await koor.context().close();
});

test('bobot parameter ≠ 100% ditandai; auto-save; penghitung bagian terisi', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaTor(koor);
  const awal = await terisi(koor);
  await expect(koor.getByTestId('tor-kelengkapan')).toHaveText(`${awal} dari 14 bagian terisi`);

  await koor.locator('#tor-tema').fill('Synergy of Informatics');
  await expect(koor.getByTestId('tor-bagian-tema')).toHaveAttribute('data-terisi', '1');

  const p = koor.getByTestId('tor-bagian-parameter');
  await p.getByTestId('tor-tambah-parameter').click();
  await p.getByTestId('tor-tambah-parameter').click();
  await koor.locator('#parameter-0-kriteria').fill('Keaktifan');
  await koor.locator('#parameter-0-bobot').fill('40');
  await koor.locator('#parameter-1-kriteria').fill('Kehadiran');
  await koor.locator('#parameter-1-bobot').fill('50');
  await expect(koor.getByTestId('tor-bobot-peringatan')).toContainText('Total bobot 90% — kurang 10%');
  await koor.locator('#parameter-1-bobot').fill('60');
  await expect(koor.getByTestId('tor-bobot-peringatan')).toHaveCount(0);
  await expect(koor.getByTestId('tor-bobot-total')).toHaveAttribute('data-total', '100');

  // Teks kaya (TipTap) — gambaran umum.
  const gambaran = koor.getByRole('textbox', { name: 'Gambaran umum kegiatan' });
  await expect(gambaran).toBeVisible({ timeout: 60_000 });
  await gambaran.click();
  await koor.keyboard.type('Kegiatan pengenalan prodi.');
  await expect(koor.getByTestId('tor-bagian-gambaran')).toHaveAttribute('data-terisi', '1');

  // Tanpa memeriksa 'berubah': tick auto-save bisa jatuh tepat setelah ketikan terakhir.
  await tungguTersimpan(koor);
  expect(await terisi(koor)).toBeGreaterThanOrEqual(awal + 3);

  const [t] = await sql<{ data: Record<string, unknown> }[]>`SELECT data FROM tor WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(t!.data.tema).toBe('Synergy of Informatics');
  expect(t!.data.parameter).toEqual([
    { kriteria: 'Keaktifan', bobot: 40, kkm: null },
    { kriteria: 'Kehadiran', bobot: 60, kkm: null },
  ]);
  expect(JSON.stringify(t!.data.gambaran_umum)).toContain('Kegiatan pengenalan prodi.');
  expect(Object.keys(t!.data)).not.toContain('rundown');
  expect(Object.keys(t!.data)).not.toContain('anggaran');

  // Muat ulang: isian bertahan.
  await bukaTor(koor);
  await expect(koor.locator('#tor-tema')).toHaveValue('Synergy of Informatics');
  await expect(koor.locator('#parameter-1-bobot')).toHaveValue('60');
  await koor.context().close();
});

test('rundown yang diubah di TOR berubah di tabel rundown (satu sumber)', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaTor(koor);
  const r = koor.getByTestId('tor-bagian-rundown');
  await r.getByTestId('tor-tambah-rundown').click();
  const baris = r.getByTestId('tor-baris-rundown').first();
  // Tanggal awal = hari-H acara.
  await expect(baris.locator('[data-kolom="tanggal"]')).toHaveValue('2028-12-06');
  await baris.locator('[data-kolom="waktu_mulai"]').fill('08:00');
  await baris.locator('[data-kolom="waktu_selesai"]').fill('09:00');
  await baris.locator('[data-kolom="acara"]').fill('Pembukaan');
  await baris.locator('[data-kolom="keterangan"]').fill('MC');
  await tungguTersimpan(koor);

  const db1 = await sql<{ id: string; acara: string; mulai: string }[]>`
    SELECT id::text, acara, to_char(waktu_mulai, 'HH24:MI') AS mulai FROM rundown WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(db1).toHaveLength(1);
  expect(db1[0]).toMatchObject({ acara: 'Pembukaan', mulai: '08:00' });

  // Diubah di TOR → baris yang SAMA berubah (bukan baris baru).
  await baris.locator('[data-kolom="acara"]').fill('Pembukaan resmi');
  await tungguTersimpan(koor);
  const db2 = await sql<{ id: string; acara: string }[]>`SELECT id::text, acara FROM rundown WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(db2).toEqual([{ id: db1[0]!.id, acara: 'Pembukaan resmi' }]);

  // Baris belum lengkap ditahan: tidak tersimpan dan tidak menghapus baris lama.
  await r.getByTestId('tor-tambah-rundown').click();
  await expect(koor.getByTestId('tor-rundown-ditahan')).toBeVisible();
  await expect(r.getByTestId('tor-rundown-galat')).toContainText('Nama acara rundown wajib diisi.');
  await koor.getByTestId('tor-simpan').click();
  await expect(koor.getByTestId('tor-status')).toHaveAttribute('data-status', 'berubah', { timeout: 15_000 });
  const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM rundown WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(n!.n).toBe(1);

  // Hapus baris yang belum lengkap lalu baris pertama → tabel rundown kosong.
  await r.getByTestId('tor-hapus-rundown').nth(1).click();
  await r.getByTestId('tor-hapus-rundown').first().click();
  await tungguTersimpan(koor);
  const [m] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM rundown WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(m!.n).toBe(0);
  await koor.context().close();
});

test('pembaca (BPH): TOR terbaca tanpa tombol tulis, PUT ditolak 403', async ({ browser }) => {
  const bph = await sesi(browser, AKUN.bacaSaja);
  await bukaTor(bph);
  await expect(bph.getByTestId('tor-baca-saja')).toBeVisible();
  await expect(bph.locator('[data-testid^="tor-tambah-"], [data-testid="tor-simpan"]')).toHaveCount(0);
  await expect(bph.locator('#tor-tema')).toHaveAttribute('readonly', '');
  await expect(bph.getByTestId('tor-anggaran-total')).toHaveText('Rp300.000');

  const r = await bph.request.put(`/api/tor/${acaraId}`, {
    data: {
      data: {
        nama_kegiatan: 'x',
        tema: '',
        gambaran_umum: { type: 'doc' },
        tujuan: [],
        bentuk_acara: { uraian: { type: 'doc' }, sub: [] },
        waktu_tempat: [],
        sasaran: { uraian: { type: 'doc' }, estimasi_jumlah: null, jumlah_kelompok: null },
        kondisi: [],
        parameter: [],
        rangkaian: [],
        penutup: { type: 'doc' },
      },
    },
  });
  expect(r.status(), await r.text()).toBe(403);
  await bph.context().close();
});

test('tab TOR di ruang kerja acara menampilkan kelengkapan dan tautan editor', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto(`/acara/${acaraId}?tab=tor`, { waitUntil: 'load' });
  await expect(koor.getByTestId('acara-isi-tor')).toContainText(/\d+ dari 14 bagian terisi/, { timeout: 60_000 });
  await expect(koor.getByTestId('acara-buka-tor')).toHaveAttribute('href', `/acara/${acaraId}/tor`);
  await koor.context().close();
});
