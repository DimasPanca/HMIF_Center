/**
 * Gate T-058 — form surat dinamis.
 *
 * Menguji (kontrak T-058 · PRD F-4.2 Acceptance Criteria):
 *   - mengganti jenis surat mengubah field TANPA reload, nilai bersama tetap;
 *   - preset "BEM FT UNTIRTA" mengisi nama & alamat, dan tetap dapat diedit;
 *   - field wajib kosong → tombol Ajukan nonaktif DAN daftar field yang kurang;
 *   - auto-save tiap 10 detik tanpa blur, indikator "Tersimpan", draft benar
 *     tersimpan di server;
 *   - field repeatable: tambah, urut ulang, hapus;
 *   - opsi PDF tidak dirender saat PDF_ENABLED mati (ADR-010);
 *   - draft orang lain tidak dapat dibuka; ANGGOTA tidak punya halaman ini.
 *
 * data-testid: surat-form, surat-jenis, surat-field-{kunci}, surat-tujuan-preset,
 * surat-dinamis-{kunci}, surat-tambah-{kunci}, surat-dinamis-{kunci}-{i},
 * surat-ttd-{jabatan|nama|nim}, surat-format-{DOCX|PDF|BOTH}, surat-kurang,
 * surat-kurang-item, surat-ajukan, surat-tersimpan.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

// 90 dtk: halaman memuat editor TipTap, dan dev server dingin meng-compile-nya
// saat diminta pertama kali — melewati 30 dtk bawaan (HANDOFF §4 no. 6).
test.describe.configure({ mode: 'serial', timeout: 90_000 });

function bacaKoneksi(): string {
  const env: Record<string, string> = {};
  const berkas = path.resolve('.env.local');
  if (fs.existsSync(berkas)) {
    for (const b of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const i = b.indexOf('=');
      if (i > 0 && !b.trimStart().startsWith('#')) env[b.slice(0, i).trim()] = b.slice(i + 1).trim();
    }
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error('Gate surat-form butuh DIRECT_URL/DATABASE_URL untuk pembersihan.');
  return url;
}

const prefix = () => `E2E058-${test.info().project.name}`;
let sql: ReturnType<typeof postgres>;

test.beforeAll(() => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM surat WHERE perihal LIKE ${prefix() + '%'} AND status = 'DRAFT'`.catch(() => {});
    await sql.end();
  }
});

async function masuk(page: Page, akun: AkunUji = AKUN.sekum): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

async function bukaForm(page: Page, jenis?: string): Promise<void> {
  await page.goto(jenis ? `/surat/baru?jenis=${jenis}` : '/surat/baru', { waitUntil: 'load' });
  await expect(page.getByTestId('surat-form')).toBeVisible({ timeout: 30_000 });
}

/** Id draft dari URL setelah auto-save pertama memasangnya lewat replaceState. */
function idDariUrl(page: Page): string | null {
  return new URL(page.url()).searchParams.get('id');
}

test('mengganti jenis surat mengubah field tanpa reload, nilai bersama dipertahankan', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'PEMINJAMAN_BARANG');

  // Penanda di window: hilang bila halaman dimuat ulang.
  await page.evaluate(() => ((window as unknown as { __tanpaReload: number }).__tanpaReload = 1));

  await page.getByTestId('surat-field-perihal').fill(`${prefix()} Ganti jenis`);
  await page.getByTestId('surat-field-tanggal_surat').fill('2026-10-20');
  await page.getByTestId('surat-dinamis-nama_kegiatan').fill('AKSARA');
  await expect(page.getByTestId('surat-dinamis-items')).toBeVisible();

  await page.getByTestId('surat-jenis').selectOption('KERJA_SAMA');
  await expect(page.getByTestId('surat-dinamis-jenis_mitra')).toBeVisible();
  await expect(page.getByTestId('surat-dinamis-items')).toHaveCount(0);

  // Nilai bersama dan field khusus senama ikut pindah.
  await expect(page.getByTestId('surat-field-perihal')).toHaveValue(`${prefix()} Ganti jenis`);
  await expect(page.getByTestId('surat-field-tanggal_surat')).toHaveValue('2026-10-20');
  await expect(page.getByTestId('surat-dinamis-nama_kegiatan')).toHaveValue('AKSARA');

  // Keterangan Aktif tidak berperihal; kembali ke Kerja Sama, perihalnya masih ada.
  await page.getByTestId('surat-jenis').selectOption('KETERANGAN_AKTIF');
  await expect(page.getByTestId('surat-field-perihal')).toHaveCount(0);
  await expect(page.getByTestId('surat-dinamis-nim_pemohon')).toBeVisible();
  await page.getByTestId('surat-jenis').selectOption('KERJA_SAMA');
  await expect(page.getByTestId('surat-field-perihal')).toHaveValue(`${prefix()} Ganti jenis`);

  expect(await page.evaluate(() => (window as unknown as { __tanpaReload?: number }).__tanpaReload)).toBe(1);
});

test('preset BEM FT UNTIRTA mengisi nama dan alamat, tetap dapat diedit', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'PEMINJAMAN_RUANGAN');

  await page.getByTestId('surat-tujuan-preset').selectOption('BEM FT UNTIRTA');
  await expect(page.getByTestId('surat-field-tujuan_nama')).toHaveValue('Ketua BEM FT UNTIRTA');
  await expect(page.getByTestId('surat-field-tujuan_alamat')).toHaveValue('di Tempat');

  await page.getByTestId('surat-field-tujuan_nama').fill('Ketua BEM FT UNTIRTA Periode 2026');
  await expect(page.getByTestId('surat-field-tujuan_nama')).toHaveValue('Ketua BEM FT UNTIRTA Periode 2026');

  // "Lainnya" mengosongkan isian supaya sisa preset lama tidak terbawa.
  await page.getByTestId('surat-tujuan-preset').selectOption('Lainnya (isi manual)');
  await expect(page.getByTestId('surat-field-tujuan_nama')).toHaveValue('');
});

test('field wajib kosong: Ajukan nonaktif dan daftar field yang kurang tampil', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'KETERANGAN_AKTIF');

  await expect(page.getByTestId('surat-ajukan')).toBeDisabled();
  const kurang = page.getByTestId('surat-kurang');
  await expect(kurang).toBeVisible();
  await expect(kurang).toContainText('Nama mahasiswa');
  await expect(kurang).toContainText('Dipergunakan sebagai');

  await page.getByTestId('surat-dinamis-nama_pemohon').fill('Dicky Saputra');
  await page.getByTestId('surat-dinamis-nim_pemohon').fill('3337220032');
  await page.getByTestId('surat-dinamis-jabatan_pemohon').fill('Staff Departemen Kaderisasi');
  await expect(kurang).not.toContainText('Nama mahasiswa');
  await expect(page.getByTestId('surat-ajukan')).toBeDisabled();

  await page.getByTestId('surat-dinamis-keperluan').fill('Kelengkapan Persyaratan Administrasi Beasiswa');
  await expect(page.getByTestId('surat-kurang')).toHaveCount(0);
  await expect(page.getByTestId('surat-ajukan')).toBeEnabled();
});

test('auto-save tiap 10 detik tanpa blur, dan draft benar tersimpan', async ({ page }) => {
  test.setTimeout(90_000);
  await masuk(page);
  await bukaForm(page, 'PEMINJAMAN_BARANG');

  const perihal = `${prefix()} Auto-save`;
  const input = page.getByTestId('surat-field-perihal');
  await input.fill(perihal);
  // Fokus tetap di input: yang menyimpan harus interval, bukan blur.
  await expect(input).toBeFocused();

  const mulai = Date.now();
  await expect(page.getByTestId('surat-tersimpan')).toBeVisible({ timeout: 15_000 });
  const lama = Date.now() - mulai;
  expect(lama, 'auto-save terjadi terlalu cepat — kemungkinan bukan dari interval').toBeGreaterThan(5_000);
  await expect(input).toBeFocused();

  // Indikator "Tersimpan" hanya sebentar.
  await expect(page.getByTestId('surat-tersimpan')).toHaveCount(0, { timeout: 5_000 });

  await expect.poll(() => idDariUrl(page), { timeout: 5_000 }).not.toBeNull();
  const id = idDariUrl(page)!;
  const res = await page.request.get(`/api/surat/${id}`);
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { data: { status: string; nilai: { perihal: string; jenis: string } } };
  expect(body.data.status).toBe('DRAFT');
  expect(body.data.nilai.perihal).toBe(perihal);
  expect(body.data.nilai.jenis).toBe('PEMINJAMAN_BARANG');

  // Memuat ulang ?id= melanjutkan draft yang sama.
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByTestId('surat-field-perihal')).toHaveValue(perihal, { timeout: 30_000 });
});

test('field repeatable: tambah, urut ulang, hapus', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'PEMINJAMAN_BARANG');

  await page.getByTestId('surat-tambah-items').click();
  await page.getByTestId('surat-tambah-items').click();
  await page.getByTestId('surat-dinamis-items-0-kebutuhan').fill('Tandu');
  await page.getByTestId('surat-dinamis-items-1-kebutuhan').fill('Proyektor');

  await page.getByTestId('surat-dinamis-items-naik-1').click();
  await expect(page.getByTestId('surat-dinamis-items-0-kebutuhan')).toHaveValue('Proyektor');
  await expect(page.getByTestId('surat-dinamis-items-1-kebutuhan')).toHaveValue('Tandu');

  await page.getByTestId('surat-dinamis-items-hapus-0').click();
  await expect(page.getByTestId('surat-dinamis-items-0-kebutuhan')).toHaveValue('Tandu');
  await expect(page.getByTestId('surat-dinamis-items-1-kebutuhan')).toHaveCount(0);
});

test('opsi PDF tidak dirender saat PDF_ENABLED mati (ADR-010)', async ({ page }) => {
  test.skip(process.env.PDF_ENABLED === 'true', 'PDF aktif di lingkungan ini');
  await masuk(page);
  await bukaForm(page);
  await expect(page.getByTestId('surat-format-DOCX')).toBeVisible();
  await expect(page.getByTestId('surat-format-PDF')).toHaveCount(0);
  await expect(page.getByTestId('surat-format-BOTH')).toHaveCount(0);
});

test('draft orang lain tidak dapat dibuka atau ditimpa', async ({ page }) => {
  await masuk(page, AKUN.sekum);
  const res = await page.request.post('/api/surat', {
    data: { jenis: 'PIAGAM', perihal: `${prefix()} Milik Sekum` },
  });
  expect(res.status(), await res.text()).toBe(201);
  const id = ((await res.json()) as { data: { id: string } }).data.id;

  // ADR-036: hanya Sekum & Admin yang menyusun surat — pembanding yang juga
  // berhak membuat draft adalah Admin (Wakil kini ditolak lebih awal, 403).
  await page.context().clearCookies();
  await masuk(page, AKUN.admin);
  expect((await page.request.get(`/api/surat/${id}`)).status()).toBe(404);
  expect((await page.request.patch(`/api/surat/${id}`, { data: { jenis: 'PIAGAM', perihal: 'dibajak' } })).status()).toBe(404);
  const halaman = await page.goto(`/surat/baru?id=${id}`);
  expect(halaman?.status()).toBe(404);
});

test('ANGGOTA tidak punya halaman buat surat dan tidak dapat membuat draft', async ({ page }) => {
  await masuk(page, AKUN.anggota);
  const halaman = await page.goto('/surat/baru');
  expect(halaman?.status()).toBe(404);
  expect((await page.request.post('/api/surat', { data: { jenis: 'PIAGAM' } })).status()).toBe(403);
});

test('isi surat dibersihkan server sebelum disimpan', async ({ page }) => {
  await masuk(page);
  const res = await page.request.post('/api/surat', {
    data: {
      jenis: 'PENGAJUAN',
      perihal: `${prefix()} XSS`,
      isi_surat: '<p onclick="alert(1)">Halo<script>alert(1)</script> <strong>tebal</strong></p><img src=x onerror=alert(1)>',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const id = ((await res.json()) as { data: { id: string } }).data.id;
  const detail = (await (await page.request.get(`/api/surat/${id}`)).json()) as { data: { nilai: { isi_surat: string } } };
  expect(detail.data.nilai.isi_surat).toBe('<p>Halo <strong>tebal</strong></p>');
});
