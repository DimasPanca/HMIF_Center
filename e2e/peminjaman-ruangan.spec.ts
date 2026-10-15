/**
 * Gate T-108 — Peminjaman ruangan (PRD F-14.2, USER_FLOW §9.3).
 *
 * Menguji:
 *   - Sekretaris menambah ruangan lewat form input bebas;
 *   - booking yang bentrok menampilkan PERINGATAN berisi detail jadwal lain dan
 *     tetap dapat disimpan (bukan blokir);
 *   - "Buat Surat Peminjaman Ruangan" membuka form surat 05 yang terisi dari
 *     booking dan menautkan booking_ruangan.surat_id;
 *   - setelah surat terbit, booking menampilkan nomor suratnya;
 *   - Kadept dapat mencatat peminjaman tetapi tidak mengelola ruangan/menghapus;
 *     Anggota tidak punya akses.
 *
 * Setiap jalan memakai ruangan bertanda unik, jadi bentrok yang diuji hanya
 * bentrok buatan jalan itu sendiri — booking nyata di tanggal yang sama tidak
 * memengaruhinya.
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
  if (!url) throw new Error('Gate peminjaman-ruangan butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let tag = '';
let namaRuangan = '';
let suratId = '';
const BULAN = '2027-02';
const TANGGAL = '2027-02-10';

const kegiatan = (s: string) => `E2E108 ${tag} ${s}`;

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

async function bukaHalaman(page: Page): Promise<void> {
  await page.goto(`/sekretariat/ruangan?bulan=${BULAN}`, { waitUntil: 'load' });
  await expect(page.getByTestId('kalender-booking')).toBeVisible({ timeout: 60_000 });
}

async function isiBooking(page: Page, o: { kegiatan: string; mulai: string; selesai?: string }): Promise<void> {
  await page.getByTestId('booking-catat').click();
  await page.getByTestId('form-booking-ruangan').selectOption({ label: `${namaRuangan} (120 orang)` });
  await page.getByTestId('form-booking-kegiatan').fill(o.kegiatan);
  await page.getByTestId('form-booking-tanggal').fill(TANGGAL);
  await page.getByTestId('form-booking-mulai').fill(o.mulai);
  if (o.selesai) await page.getByTestId('form-booking-selesai').fill(o.selesai);
  await page.getByTestId('form-booking-peserta').fill('80');
  await page.getByTestId('form-booking-simpan').click();
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  namaRuangan = `E2E108 ${tag} Auditorium`;
});

test.afterAll(async () => {
  if (sql) {
    const ruangan = await sql<{ id: string }[]>`SELECT id::text FROM ruangan WHERE nama = ${namaRuangan}`;
    const ids = ruangan.map((r) => r.id);
    if (ids.length) {
      const surat = await sql<{ surat_id: string }[]>`
        SELECT surat_id::text FROM booking_ruangan WHERE ruangan_id = ANY(${ids}::uuid[]) AND surat_id IS NOT NULL`;
      await sql`DELETE FROM booking_ruangan WHERE ruangan_id = ANY(${ids}::uuid[])`.catch(() => {});
      const sid = surat.map((s) => s.surat_id);
      if (sid.length) await sql`DELETE FROM surat WHERE id = ANY(${sid}::uuid[])`.catch(() => {});
      await sql`DELETE FROM ruangan WHERE id = ANY(${ids}::uuid[])`.catch(() => {});
    }
    await sql.end();
  }
});

test('Sekretaris menambah ruangan lewat form input bebas', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  await bukaHalaman(sekum);
  await sekum.getByTestId('ruangan-tambah').click();
  await sekum.getByTestId('form-ruangan-nama').fill(namaRuangan);
  await sekum.getByTestId('form-ruangan-lokasi').fill('Gedung FT Lt.1');
  await sekum.getByTestId('form-ruangan-kapasitas').fill('120');
  await sekum.getByTestId('form-ruangan-pengelola').fill('Kepala Bagian Sekretariat FT');
  await sekum.getByTestId('form-ruangan-catatan').fill('Perlu izin H-7');
  await sekum.getByTestId('form-ruangan-simpan').click();

  await expect(sekum.getByTestId('ruangan-item').filter({ hasText: namaRuangan })).toContainText('Perlu izin H-7', { timeout: 30_000 });
  const [r] = await sql<{ kapasitas: number; pengelola: string }[]>`SELECT kapasitas, pengelola FROM ruangan WHERE nama = ${namaRuangan}`;
  expect(r).toEqual({ kapasitas: 120, pengelola: 'Kepala Bagian Sekretariat FT' });
  await sekum.context().close();
});

test('booking bentrok: peringatan berisi detail jadwal lain, tetap dapat disimpan, lalu surat terisi otomatis', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  await bukaHalaman(sekum);

  await isiBooking(sekum, { kegiatan: kegiatan('Seminar Nasional'), mulai: '14:00', selesai: '16:00' });
  await expect(sekum.getByText('Peminjaman tercatat')).toBeVisible({ timeout: 30_000 });
  await sekum.getByRole('button', { name: 'Nanti' }).click();
  await expect(sekum.getByTestId('booking-item').filter({ hasText: kegiatan('Seminar Nasional') })).toBeVisible({ timeout: 30_000 });

  await isiBooking(sekum, { kegiatan: kegiatan('MUSMAIF'), mulai: '16:00' });
  const peringatan = sekum.getByTestId('peringatan-bentrok');
  await expect(peringatan).toBeVisible({ timeout: 30_000 });
  await expect(peringatan.getByTestId('peringatan-bentrok-item')).toHaveCount(1);
  await expect(peringatan).toContainText(kegiatan('Seminar Nasional'));
  await expect(peringatan).toContainText('14.00 – 16.00 WIB');
  // Peringatan saja: belum ada yang tersimpan sebelum pengguna memutuskan.
  const [sebelum] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM booking_ruangan b JOIN ruangan r ON r.id = b.ruangan_id WHERE r.nama = ${namaRuangan}`;
  expect(sebelum!.n).toBe(1);

  await peringatan.getByTestId('peringatan-bentrok-lanjut').click();
  await expect(sekum.getByText('Peminjaman tercatat')).toBeVisible({ timeout: 30_000 });
  const [sesudah] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM booking_ruangan b JOIN ruangan r ON r.id = b.ruangan_id WHERE r.nama = ${namaRuangan}`;
  expect(sesudah!.n).toBe(2);

  await sekum.getByTestId('form-booking-buat-surat').click();
  await sekum.waitForURL(/\/surat\/baru\?id=/, { timeout: 60_000 });
  suratId = new URL(sekum.url()).searchParams.get('id') ?? '';
  await expect(sekum.locator('#surat-dinamis-ruangan')).toHaveValue(namaRuangan, { timeout: 60_000 });
  await expect(sekum.locator('#surat-dinamis-nama_kegiatan')).toHaveValue(kegiatan('MUSMAIF'));
  await expect(sekum.locator('#surat-dinamis-hari_tanggal')).toHaveValue('Rabu, 10 Februari 2027');
  await expect(sekum.locator('#surat-dinamis-waktu')).toHaveValue('16.00 WIB s.d. selesai');
  await expect(sekum.locator('#surat-dinamis-tujuan_jabatan')).toHaveValue('Kepala Bagian Sekretariat FT');

  const [b] = await sql<{ surat_id: string; kode_surat: string }[]>`
    SELECT b.surat_id::text, s.kode_surat FROM booking_ruangan b JOIN surat s ON s.id = b.surat_id
    WHERE b.kegiatan = ${kegiatan('MUSMAIF')}`;
  expect(b).toEqual({ surat_id: suratId, kode_surat: '05' });
  await sekum.context().close();
});

test('setelah surat terbit, booking menampilkan nomor suratnya', async ({ browser }) => {
  expect(suratId).not.toBe('');
  const [ketua] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${AKUN.aktif.email}`;
  // Alur approval diuji gate surat-approval; di sini cukup hasilnya: nomor resmi + TERBIT.
  await sql`UPDATE surat SET status = 'MENUNGGU_APPROVAL' WHERE id = ${suratId}::uuid`;
  const [n] = await sql<{ n: string }[]>`SELECT alokasi_nomor_surat(${suratId}::uuid, ${ketua!.id}::uuid) AS n`;
  await sql`UPDATE surat SET status = 'TERBIT' WHERE id = ${suratId}::uuid`;

  const sekum = await sesi(browser, AKUN.sekum);
  await bukaHalaman(sekum);
  const item = sekum.getByTestId('booking-item').filter({ hasText: kegiatan('MUSMAIF') });
  await expect(item.getByTestId('booking-nomor-surat')).toContainText(n!.n, { timeout: 30_000 });
  // Surat yang sudah terbit dibuka detailnya, tidak membuat draft baru.
  await item.getByTestId('booking-surat').click();
  await sekum.waitForURL(new RegExp(`/surat/${suratId}$`), { timeout: 60_000 });
  await sekum.context().close();
});

test('Kadept mencatat tetapi tidak mengelola ruangan; Anggota tidak punya akses', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  await bukaHalaman(kadept);
  await expect(kadept.getByTestId('booking-catat')).toBeVisible();
  await expect(kadept.getByTestId('ruangan-tambah')).toHaveCount(0);
  await expect(kadept.getByTestId('booking-item').first()).toBeVisible();
  await expect(kadept.getByTestId('booking-hapus')).toHaveCount(0);
  expect((await kadept.request.post('/api/ruangan', { data: { nama: 'X' } })).status()).toBe(403);
  await kadept.context().close();

  const anggota = await sesi(browser, AKUN.anggota);
  const r = await anggota.goto('/sekretariat/ruangan', { waitUntil: 'load' });
  expect(r?.status()).toBe(404);
  expect((await anggota.request.get('/api/ruangan/booking')).status()).toBe(403);
  await anggota.context().close();
});
