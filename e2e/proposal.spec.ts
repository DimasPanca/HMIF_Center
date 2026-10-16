/**
 * Gate T-096 — Editor & generator Proposal (PRD F-10.2).
 *
 * Menguji:
 *   - membuat Proposal setelah TOR lengkap mengisi otomatis ≥ 60% field —
 *     persentase tampil di UI dan dicocokkan dengan perhitungan ulang;
 *   - field prefill bertanda "Diisi otomatis dari TOR", tetap dapat diedit,
 *     dan tandanya hilang setelah disunting (tercatat `manual`);
 *   - susunan kepanitiaan cocok dengan data panitia sebenarnya, tanpa field
 *     manual; anggaran tanpa field manual;
 *   - generate: ditolak bila lembar pengesahan kosong; setelah diisi, DOCX
 *     memuat panitia & RAB; RAB berubah → generate ulang → angka berubah;
 *   - pembaca (BPH): tanpa tombol tulis, PUT 403.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import PizZip from 'pizzip';
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
  if (!url) throw new Error('Gate proposal butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
let itemId = '';
const nama = { anggota: '', kadept: '', ketuplak: '' };

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

const akun = async (a: AkunUji) => (await sql<{ id: string; nama: string }[]>`SELECT id::text, nama_lengkap AS nama FROM app_user WHERE email = ${a.email}`)[0]!;

async function bukaProposal(page: Page): Promise<void> {
  await page.goto(`/acara/${acaraId}/proposal`, { waitUntil: 'load' });
  await expect(page.getByTestId('proposal-editor')).toHaveAttribute('data-siap', '1', { timeout: 60_000 });
}

const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const teksDocx = (b: Buffer) => new PizZip(b).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const namaAcara = `E2E096 ${tag} PROPOSAL`;
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await akun(AKUN.kadept);
  const anggota = await akun(AKUN.anggota);
  const ketuplak = await akun(AKUN.sekum);
  nama.anggota = anggota.nama;
  nama.kadept = kadept.nama;
  nama.ketuplak = ketuplak.nama;
  const [d] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role
    WHERE user_id = ${kadept.id}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;

  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana, deskripsi,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${p!.id}::uuid, ${d!.id}::uuid, ${namaAcara}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      'Mahasiswa baru perlu mengenal program studi sejak awal.',
      '2028-11-01', '2028-12-06', '2028-12-07', ${kadept.id}::uuid)
    RETURNING id::text`;
  prokerId = pr!.id;
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
    VALUES (${prokerId}::uuid, ${namaAcara}, ${`PRP${tag}`}, ${ketuplak.id}::uuid) RETURNING id::text`;
  acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${acaraId}::uuid)`;
  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota.id}::uuid, 1) RETURNING id::text`;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dk!.id}::uuid, ${anggota.id}::uuid, 'KOORDINATOR')`;
  await sql`INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Kesekretariatan', ${kadept.id}::uuid, 2)`;
  const [s] = await sql<{ id: string }[]>`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dk!.id}::uuid, 'MAKAN', 1) RETURNING id::text`;
  const [it] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${s!.id}::uuid, 1, 'Nasi kotak', '10', 10, 25000, 250000, false) RETURNING id::text`;
  itemId = it!.id;

  // TOR lengkap + rundown — sumber prefill.
  const tor = {
    nama_kegiatan: `${namaAcara} RESMI`,
    tema: 'Synergy',
    gambaran_umum: doc('Kegiatan pengenalan prodi untuk mahasiswa baru.'),
    tujuan: ['Mengenalkan himpunan', 'Mempererat angkatan'],
    bentuk_acara: { uraian: doc('Kegiatan luring.'), sub: [] },
    waktu_tempat: [{ sesi: 'Hari H', tanggal: '2028-12-06', waktu: '07.00 WIB', tempat: 'Kampus FT' }],
    sasaran: { uraian: doc('Mahasiswa baru Informatika.'), estimasi_jumlah: 120, jumlah_kelompok: 12 },
    kondisi: [{ sesi: 'Hari H', ketentuan: 'Dresscode' }],
    parameter: [{ kriteria: 'Kehadiran', bobot: 100, kkm: 60 }],
    rangkaian: [{ nama: 'Pembukaan', uraian: 'Sambutan ketua' }],
    penutup: doc('Demikian proposal ini dibuat.'),
  };
  await sql`INSERT INTO tor (kepanitiaan_id, data, updated_by) VALUES (${acaraId}::uuid, ${sql.json(tor)}, ${anggota.id}::uuid)`;
  await sql`INSERT INTO rundown (kepanitiaan_id, tanggal, waktu_mulai, waktu_selesai, acara, keterangan, urutan)
    VALUES (${acaraId}::uuid, '2028-12-06', '07:00', '07:30', 'Registrasi peserta', 'Acara', 0)`;
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('proposal setelah TOR lengkap: ≥ 60% field terisi otomatis, bertanda, dan tersimpan', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaProposal(koor);
  const prefill = koor.getByTestId('proposal-prefill');
  const persen = Number(await prefill.getAttribute('data-persen'));
  expect(persen).toBeGreaterThanOrEqual(60);
  await expect(prefill).toContainText(`${persen}% field terisi otomatis`);

  await expect(koor.getByTestId('proposal-otomatis-nama_kegiatan')).toHaveAttribute('data-asal', 'TOR');
  await expect(koor.getByTestId('proposal-otomatis-nama_kegiatan')).toContainText('Diisi otomatis dari TOR');
  await expect(koor.locator('#proposal-nama')).toHaveValue(/E2E096 .* PROPOSAL RESMI/);
  await expect(koor.getByTestId('proposal-otomatis-latar_belakang')).toHaveAttribute('data-asal', 'PROKER');
  await expect(koor.getByTestId('proposal-otomatis-sekretaris')).toHaveAttribute('data-asal', 'PANITIA');
  await expect(koor.locator('#proposal-sekretaris-nama')).toHaveValue(nama.kadept);
  await expect(koor.locator('#tujuan-1-teks')).toHaveValue('Mempererat angkatan');

  // Proposal baru: isian otomatis dicatat oleh auto-save pertama.
  await expect(koor.getByTestId('proposal-status')).toHaveAttribute('data-status', 'tersimpan', { timeout: 60_000 });
  const [r] = await sql<{ data: { asal: Record<string, string>; nama_kegiatan: string } }[]>`SELECT data FROM proposal WHERE kepanitiaan_id = ${acaraId}::uuid`;
  expect(r!.data.asal.nama_kegiatan).toBe('TOR');
  expect(Object.keys(r!.data)).not.toContain('susunan_kepanitiaan');
  expect(Object.keys(r!.data)).not.toContain('anggaran');
  await koor.context().close();
});

test('susunan kepanitiaan = data panitia, tanpa field manual; anggaran dari RAB', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaProposal(koor);
  const susunan = koor.getByTestId('proposal-bagian-kepanitiaan');
  const grup = susunan.getByTestId('proposal-susunan-divisi');
  await expect(grup).toHaveCount(3);
  await expect(grup.nth(0)).toContainText(`Ketua Pelaksana: ${nama.ketuplak}`);
  await expect(grup.nth(1)).toContainText(`Koordinator: ${nama.anggota}`);
  await expect(grup.nth(2)).toContainText(`Koordinator: ${nama.kadept}`);
  await expect(susunan.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
  await expect(koor.getByTestId('proposal-anggaran-total')).toHaveText('Rp250.000');
  await expect(koor.getByTestId('proposal-bagian-anggaran').locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
  await koor.context().close();
});

test('field prefill tetap dapat diedit; tandanya hilang dan tidak ditimpa prefill berikutnya', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaProposal(koor);
  await koor.locator('#proposal-nama').fill('Nama Proposal Resmi');
  await expect(koor.getByTestId('proposal-otomatis-nama_kegiatan')).toHaveCount(0);
  await koor.getByTestId('proposal-simpan').click();
  await expect(koor.getByTestId('proposal-status')).toHaveAttribute('data-status', 'tersimpan', { timeout: 60_000 });
  await bukaProposal(koor);
  await expect(koor.locator('#proposal-nama')).toHaveValue('Nama Proposal Resmi');
  await expect(koor.getByTestId('proposal-otomatis-nama_kegiatan')).toHaveCount(0);
  await expect(koor.getByTestId('proposal-otomatis-tujuan')).toHaveAttribute('data-asal', 'TOR');
  await koor.context().close();
});

test('generate: pengesahan kosong ditolak; setelah diisi, DOCX memuat panitia & RAB terbaru', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await bukaProposal(koor);
  await koor.getByTestId('proposal-buat-dokumen').click();
  const hasil = koor.getByTestId('proposal-buat-hasil');
  await expect(hasil).toContainText('Lengkapi dulu', { timeout: 60_000 });
  await expect(hasil).toContainText('Ketua BEM FT');
  await expect(hasil).toContainText('Landasan kegiatan');

  for (const [id, v] of [
    ['#proposal-ketua_bem-nama', 'Ketua BEM Uji'],
    ['#proposal-ketua_bem-nomor', '3337210001'],
    ['#proposal-wd3-nama', 'Dr. Wakil Dekan Tiga'],
    ['#proposal-wd3-nomor', '198001012005011001'],
    ['#proposal-kaprodi-nama', 'Dr. Kaprodi Informatika'],
    ['#proposal-kaprodi-nomor', '198101012006041002'],
  ] as const) {
    await koor.locator(id).fill(v);
  }
  const landasan = koor.getByRole('textbox', { name: 'Landasan kegiatan' });
  await expect(landasan).toBeVisible({ timeout: 60_000 });
  await landasan.click();
  await koor.keyboard.type('AD/ART HMIF dan Program Kerja periode berjalan.');
  await koor.getByTestId('proposal-buat-dokumen').click();
  await expect(hasil).toContainText('Dokumen proposal dibuat', { timeout: 60_000 });
  await expect(koor.getByTestId('proposal-unduh')).toBeVisible();

  const t1 = teksDocx(await (await koor.request.get(`/api/proposal/${acaraId}/generate`)).body());
  for (const s of ['Nama Proposal Resmi', 'Dr. Wakil Dekan Tiga', `Koordinator: ${nama.anggota}`, 'Rp250.000', 'Nasi kotak', 'Registrasi peserta', 'Mempererat angkatan']) {
    expect(t1, s).toContain(s);
  }

  await sql`UPDATE rab_item SET jumlah_numerik = 16, jumlah_teks = '16', total = 400000 WHERE id = ${itemId}::uuid`;
  expect((await koor.request.post(`/api/proposal/${acaraId}/generate`)).status()).toBe(201);
  const t2 = teksDocx(await (await koor.request.get(`/api/proposal/${acaraId}/generate`)).body());
  expect(t2).toContain('Rp400.000');
  expect(t2).not.toContain('Rp250.000');
  const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM dokumen WHERE kepanitiaan_id = ${acaraId}::uuid AND jenis = 'PROPOSAL' AND format = 'DOCX'`;
  expect(n!.n).toBe(2);
  await koor.context().close();
});

test('pembaca (BPH): tanpa tombol tulis, PUT ditolak 403; tab proposal menautkan editor', async ({ browser }) => {
  const bph = await sesi(browser, AKUN.bacaSaja);
  await bukaProposal(bph);
  await expect(bph.getByTestId('proposal-baca-saja')).toBeVisible();
  await expect(bph.locator('[data-testid^="tor-tambah-"], [data-testid="proposal-simpan"], [data-testid="proposal-buat-dokumen"]')).toHaveCount(0);
  await expect(bph.locator('#proposal-nama')).toHaveAttribute('readonly', '');
  const r = await bph.request.put(`/api/proposal/${acaraId}`, { data: { data: {} } });
  expect(r.status(), await r.text()).toBe(422);
  const g = await bph.request.get(`/api/proposal/${acaraId}`);
  const body = (await g.json()) as { data: { data: unknown } };
  const tolak = await bph.request.put(`/api/proposal/${acaraId}`, { data: { data: body.data.data } });
  expect(tolak.status(), await tolak.text()).toBe(403);

  await bph.goto(`/acara/${acaraId}?tab=proposal`, { waitUntil: 'load' });
  await expect(bph.getByTestId('acara-isi-proposal')).toContainText(/\d+% field terisi otomatis/, { timeout: 60_000 });
  await expect(bph.getByTestId('acara-buka-proposal')).toHaveAttribute('href', `/acara/${acaraId}/proposal`);
  await bph.context().close();
});
