/**
 * Gate T-060 — alur approval surat.
 *
 * Menguji (kontrak T-060):
 *   - Kadept mengajukan surat → muncul di antrian Ketua, Wakil, DAN Sekum;
 *   - BPH tidak punya antrian dan tidak dapat menyetujui (INV-04);
 *   - setelah satu approver menyetujui, surat hilang dari antrian yang sedang
 *     terbuka di layar approver lain TANPA reload, dan approver lain yang
 *     terlambat mendapat "sudah disetujui";
 *   - nomor final dialokasikan saat disetujui; bila dokumen gagal di-generate
 *     (di sini: Ketua belum mengunggah tanda tangan) surat berhenti di DISETUJUI
 *     dengan peringatan — nomor tetap sah;
 *   - (T-061) setelah tanda tangan diunggah, "Terbitkan ulang" → TERBIT, baris
 *     dokumen tercatat, dan DOCX dapat diunduh pembuat & pembaca arsip dengan
 *     nama berkas = nomor surat; ANGGOTA ditolak;
 *   - penolakan tanpa alasan ditolak server; dengan alasan → DITOLAK, pembuat
 *     melihat alasannya, menyuntingnya mengembalikan ke DRAFT;
 *   - transisi ilegal ditolak 409; pengajuan draft tak lengkap ditolak 422;
 *   - pembatalan TERBIT wajib beralasan, nomor tidak dikembalikan (INV-16).
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import PizZip from 'pizzip';
import postgres from 'postgres';
import sharp from 'sharp';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

function bacaEnv(): Record<string, string | undefined> {
  const env: Record<string, string> = {};
  const berkas = path.resolve('.env.local');
  if (fs.existsSync(berkas)) {
    for (const b of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const i = b.indexOf('=');
      if (i > 0 && !b.trimStart().startsWith('#')) env[b.slice(0, i).trim()] = b.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...process.env };
}

function bacaKoneksi(): string {
  const env = bacaEnv();
  const url = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error('Gate surat-approval butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

/** DOCX hasil generate ikut dibersihkan — baris dokumen terhapus kaskade, berkasnya tidak. */
async function hapusBerkasDokumen(ids: string[]): Promise<void> {
  const env = bacaEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const kunci = env.SUPABASE_SECRET_KEY;
  if (!url || !kunci || ids.length === 0) return;
  await fetch(`${url}/storage/v1/object/${env.STORAGE_BUCKET_PRIVATE ?? 'private'}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${kunci}`, apikey: kunci, 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: ids.map((id) => `dokumen/surat/${id}.docx`) }),
  }).catch(() => undefined);
}

let sql: ReturnType<typeof postgres>;
const dibuat: string[] = [];

/** Ketua yang menandatangani surat periode aktif — aturan `bacaPenandatanganKetua`. */
let idKetua = '';

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const [k] = await sql<{ id: string; email: string }[]>`
    SELECT u.id::text, u.email FROM user_role ur
    JOIN app_user u ON u.id = ur.user_id JOIN periode p ON p.id = ur.periode_id
    WHERE p.status = 'AKTIF' AND ur.role = 'KETUA' AND u.is_active
    ORDER BY ur.created_at LIMIT 1`;
  expect(k?.email, 'penandatangan surat harus akun Ketua uji').toBe(AKUN.aktif.email);
  idKetua = k!.id;
  // Jalur "generate gagal" butuh Ketua TANPA tanda tangan. Akun uji saja —
  // berkasnya di storage ditimpa unggahan test berikutnya.
  if (test.info().project.name === PROJECT_TTD) await sql`DELETE FROM signature WHERE user_id = ${idKetua}::uuid`;
});

/**
 * Tanda tangan Ketua adalah keadaan GLOBAL, sementara project desktop dan mobile
 * berjalan paralel. Bila keduanya mengubahnya, unggahan di satu worker membuat
 * "generate gagal karena belum ada tanda tangan" di worker lain malah terbit.
 * Hanya satu project yang menjalankan test yang bergantung padanya.
 */
const PROJECT_TTD = 'desktop';
function lewatiSelainDesktop(): void {
  test.skip(test.info().project.name !== PROJECT_TTD, 'tanda tangan Ketua global — hanya dijalankan project desktop');
}

test.afterAll(async () => {
  if (sql) {
    if (dibuat.length) await sql`DELETE FROM surat WHERE id = ANY(${dibuat}::uuid[])`.catch(() => {});
    await hapusBerkasDokumen(dibuat);
    await sql.end();
  }
});

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

async function sesi(browser: Browser, akun: AkunUji): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await masuk(page, akun);
  return page;
}

const penanda = () => `E2E060-${test.info().project.name}-${Date.now()}`;

/** Surat Keterangan Aktif lengkap, dibuat dan diajukan lewat API sebagai Kadept. */
async function ajukanLewatApi(page: Page, nama: string): Promise<string> {
  const buat = await page.request.post('/api/surat', {
    data: {
      jenis: 'KETERANGAN_AKTIF',
      tanggal_surat: '2026-10-15',
      data_dinamis: { nama_pemohon: nama, nim_pemohon: '3337220032', jabatan_pemohon: 'Staff Departemen', keperluan: 'Kelengkapan Beasiswa' },
    },
  });
  expect(buat.status(), await buat.text()).toBe(201);
  const id = ((await buat.json()) as { data: { id: string } }).data.id;
  dibuat.push(id);
  const aju = await page.request.post(`/api/surat/${id}/submit`);
  expect(aju.status(), await aju.text()).toBe(200);
  return id;
}

let idSetuju = '';

test('Kadept mengajukan lewat form → muncul di antrian Ketua, Wakil, dan Sekum; tidak bagi BPH', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  await kadept.goto('/surat/baru?jenis=KETERANGAN_AKTIF', { waitUntil: 'load' });
  await expect(kadept.getByTestId('surat-form')).toBeVisible({ timeout: 60_000 });
  const nama = penanda();
  await kadept.getByTestId('surat-dinamis-nama_pemohon').fill(nama);
  await kadept.getByTestId('surat-dinamis-nim_pemohon').fill('3337220032');
  await kadept.getByTestId('surat-dinamis-jabatan_pemohon').fill('Staff Departemen Kaderisasi');
  await kadept.getByTestId('surat-dinamis-keperluan').fill('Kelengkapan Persyaratan Administrasi Beasiswa');
  await kadept.getByTestId('surat-ajukan').click();
  // Catat id untuk dibersihkan SEBELUM asersi apa pun — kalau tidak, draft
  // tertinggal di DB setiap kali test gagal, dan test SQL yang menghitung
  // seluruh tabel ikut gagal.
  await expect.poll(() => new URL(kadept.url()).searchParams.get('id'), { timeout: 20_000 }).toMatch(/^[0-9a-f-]{36}$/);
  idSetuju = new URL(kadept.url()).searchParams.get('id')!;
  dibuat.push(idSetuju);
  await expect(kadept.getByTestId('surat-diajukan')).toBeVisible({ timeout: 20_000 });

  for (const akun of [AKUN.aktif, AKUN.wakil, AKUN.sekum]) {
    const p = await sesi(browser, akun);
    await p.goto('/surat/approval', { waitUntil: 'load' });
    await expect(p.getByTestId(`surat-antrian-item-${idSetuju}`), `antrian ${akun.role}`).toBeVisible({ timeout: 60_000 });
    await p.context().close();
  }

  const bph = await sesi(browser, AKUN.bacaSaja);
  expect((await bph.goto('/surat/approval'))?.status()).toBe(404);
  expect((await bph.request.post(`/api/surat/${idSetuju}/approve`, { data: {} })).status()).toBe(403);
  await bph.context().close();
  await kadept.context().close();
});

test('satu approver menyetujui → hilang dari antrian approver lain tanpa reload; yang terlambat ditolak', async ({ browser }) => {
  test.skip(!idSetuju, 'butuh surat dari test sebelumnya');
  lewatiSelainDesktop();
  const ketua = await sesi(browser, AKUN.aktif);
  await ketua.goto('/surat/approval', { waitUntil: 'load' });
  await expect(ketua.getByTestId(`surat-antrian-item-${idSetuju}`)).toBeVisible({ timeout: 60_000 });
  await ketua.evaluate(() => ((window as unknown as { __tanpaReload: number }).__tanpaReload = 1));

  const wakil = await sesi(browser, AKUN.wakil);
  await wakil.goto(`/surat/approval?id=${idSetuju}`, { waitUntil: 'load' });
  await wakil.getByTestId('surat-approve').click();
  const hasil = wakil.getByTestId('surat-hasil-approve');
  await expect(hasil).toBeVisible({ timeout: 20_000 });
  // Ketua belum punya tanda tangan: dokumen tidak di-generate, surat berhenti di
  // DISETUJUI, nomor sah (T-060 butir 5, PRD F-4.3).
  await expect(hasil).toHaveAttribute('data-status', 'DISETUJUI');
  await expect(wakil.getByTestId('surat-peringatan-terbit')).toContainText(/belum mengunggah tanda tangan/);
  await expect(hasil.getByTestId('nomor-surat-final')).toContainText(/^.*02\/\d{3}\/[^/]+\/[A-Z0-9]+\/X\/2026/);

  // Layar Ketua yang sejak tadi terbuka ikut berubah, tanpa reload: surat keluar
  // dari daftar MENUNGGU (pindah ke "Disetujui, dokumen belum terbit").
  await expect(ketua.getByTestId('surat-antrian').getByTestId(`surat-antrian-item-${idSetuju}`)).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(ketua.getByTestId('surat-gagal-terbit').getByTestId(`surat-antrian-item-${idSetuju}`)).toBeVisible();
  expect(await ketua.evaluate(() => (window as unknown as { __tanpaReload?: number }).__tanpaReload)).toBe(1);

  // Sekum yang terlambat menekan Setujui mendapat penjelasan, bukan nomor kedua.
  const sekum = await sesi(browser, AKUN.sekum);
  const telat = await sekum.request.post(`/api/surat/${idSetuju}/approve`, { data: {} });
  expect(telat.status()).toBe(409);
  expect(((await telat.json()) as { error: { message: string } }).error.message).toMatch(/sudah disetujui/);

  const [row] = await sql<{ status: string; nomor_urut: number | null }[]>`SELECT status::text, nomor_urut FROM surat WHERE id = ${idSetuju}::uuid`;
  expect(row?.status).toBe('DISETUJUI');
  expect(row?.nomor_urut).not.toBeNull();

  for (const p of [ketua, wakil, sekum]) await p.context().close();
});

test('Ketua mengunggah tanda tangan → terbitkan ulang → TERBIT; DOCX dapat diunduh', async ({ browser }) => {
  test.skip(!idSetuju, 'butuh surat dari test sebelumnya');
  lewatiSelainDesktop();
  const ketua = await sesi(browser, AKUN.aktif);

  const coretan = await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="600" height="300"><path d="M20 250 C 150 20, 300 280, 580 40" stroke="black" stroke-width="12" fill="none"/></svg>') }])
    .png()
    .toBuffer();
  const unggah = await ketua.request.post('/api/users/me/signature', {
    multipart: { file: { name: 'ttd.png', mimeType: 'image/png', buffer: coretan } },
  });
  expect(unggah.status(), await unggah.text()).toBe(200);

  await ketua.goto(`/surat/approval?id=${idSetuju}`, { waitUntil: 'load' });
  await ketua.getByTestId('surat-terbitkan-ulang').click();
  const hasil = ketua.getByTestId('surat-hasil-approve');
  await expect(hasil).toHaveAttribute('data-status', 'TERBIT', { timeout: 30_000 });
  await expect(ketua.getByTestId('surat-peringatan-terbit')).toHaveCount(0);
  await expect(ketua.getByTestId('surat-unduh-docx')).toHaveAttribute('href', `/api/surat/${idSetuju}/download`);

  const [row] = await sql<{ status: string; nomor_lengkap: string }[]>`
    SELECT status::text, nomor_lengkap FROM surat WHERE id = ${idSetuju}::uuid`;
  expect(row?.status).toBe('TERBIT');
  const dok = await sql<{ format: string; storage_key: string; generated_by: string; file_size: string }[]>`
    SELECT format, storage_key, generated_by::text, file_size::text FROM dokumen WHERE surat_id = ${idSetuju}::uuid AND jenis = 'SURAT'`;
  expect(dok).toHaveLength(1);
  expect(dok[0]).toMatchObject({ format: 'DOCX', storage_key: `dokumen/surat/${idSetuju}.docx`, generated_by: idKetua });

  // Pembuat (Kadept) mengunduh: lampiran DOCX bernama nomor surat, isinya surat itu.
  const kadept = await sesi(browser, AKUN.kadept);
  const r = await kadept.request.get(`/api/surat/${idSetuju}/download`);
  expect(r.status(), await r.text()).toBe(200);
  expect(r.headers()['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const namaBerkas = `${row!.nomor_lengkap.replaceAll('/', '-')}.docx`;
  expect(r.headers()['content-disposition']).toBe(`attachment; filename="${namaBerkas}"`);
  const isi = await r.body();
  expect(String(dok[0]!.file_size)).toBe(String(isi.length));
  const xml = new PizZip(isi).file('word/document.xml')!.asText();
  expect(xml).toContain(row!.nomor_lengkap);
  expect(xml).toContain('<w:drawing>');

  // PDF_ENABLED=false: PDF ditolak terang-terangan, bukan diganti DOCX (T-062, ADR-010).
  if (process.env.PDF_ENABLED !== 'true') {
    const pdf = await kadept.request.get(`/api/surat/${idSetuju}/download?format=pdf`);
    expect(pdf.status()).toBe(409);
    expect(((await pdf.json()) as { error: { code: string } }).error.code).toBe('PDF_NONAKTIF');
    await expect(ketua.getByTestId('surat-unduh-pdf')).toHaveCount(0);
  }

  // Pembaca arsip (BPH) boleh; ANGGOTA tidak punya surat.read.
  const bph = await sesi(browser, AKUN.bacaSaja);
  expect((await bph.request.get(`/api/surat/${idSetuju}/download`)).status()).toBe(200);
  const anggota = await sesi(browser, AKUN.anggota);
  expect((await anggota.request.get(`/api/surat/${idSetuju}/download`)).status()).toBe(403);

  for (const p of [ketua, kadept, bph, anggota]) await p.context().close();
});

test('penolakan wajib beralasan; pembuat melihat alasan dan menyunting → DRAFT', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const id = await ajukanLewatApi(kadept, penanda());

  const sekum = await sesi(browser, AKUN.sekum);
  for (const alasan of [undefined, '', '  ', 'ok']) {
    const r = await sekum.request.post(`/api/surat/${id}/reject`, { data: { alasan } });
    expect(r.status(), `alasan ${JSON.stringify(alasan)}`).toBe(422);
  }

  await sekum.goto(`/surat/approval?id=${id}`, { waitUntil: 'load' });
  await sekum.getByTestId('surat-reject').click();
  await expect(sekum.getByTestId('surat-reject-kirim')).toBeDisabled();
  await sekum.getByTestId('surat-alasan').fill('NIM pemohon tidak sesuai data pengurus');
  await sekum.getByTestId('surat-reject-kirim').click();
  await expect(sekum.getByTestId(`surat-antrian-item-${id}`)).toHaveCount(0, { timeout: 20_000 });

  await kadept.goto(`/surat/baru?id=${id}`, { waitUntil: 'load' });
  await expect(kadept.getByTestId('surat-alasan-tolak')).toContainText('NIM pemohon tidak sesuai data pengurus', { timeout: 60_000 });
  const keperluan = kadept.getByTestId('surat-dinamis-keperluan');
  await keperluan.fill('Kelengkapan Persyaratan Administrasi Beasiswa');
  await keperluan.blur();
  await expect(kadept.getByTestId('surat-tersimpan')).toBeVisible({ timeout: 15_000 });
  const [row] = await sql<{ status: string; alasan_penolakan: string | null }[]>`SELECT status::text, alasan_penolakan FROM surat WHERE id = ${id}::uuid`;
  expect(row?.status).toBe('DRAFT');
  expect(row?.alasan_penolakan).toBe('NIM pemohon tidak sesuai data pengurus');

  await kadept.context().close();
  await sekum.context().close();
});

test('transisi ilegal ditolak 409; draft tak lengkap tidak dapat diajukan', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const sekum = await sesi(browser, AKUN.sekum);

  const kosong = await kadept.request.post('/api/surat', { data: { jenis: 'KETERANGAN_AKTIF' } });
  const idKosong = ((await kosong.json()) as { data: { id: string } }).data.id;
  dibuat.push(idKosong);
  const tidakLengkap = await kadept.request.post(`/api/surat/${idKosong}/submit`);
  expect(tidakLengkap.status()).toBe(422);
  expect(((await tidakLengkap.json()) as { error: { code: string } }).error.code).toBe('VALIDASI_GAGAL');
  expect((await sekum.request.post(`/api/surat/${idKosong}/approve`, { data: {} })).status()).toBe(409);

  const id = await ajukanLewatApi(kadept, penanda());
  expect((await kadept.request.post(`/api/surat/${id}/submit`)).status()).toBe(409);
  expect((await sekum.request.post(`/api/surat/${id}/cancel`, { data: { alasan: 'Uji pembatalan ilegal' } })).status()).toBe(409);
  // Surat yang sudah diajukan tidak dapat disunting lewat auto-save.
  expect((await kadept.request.patch(`/api/surat/${id}`, { data: { jenis: 'KETERANGAN_AKTIF' } })).status()).toBe(409);

  await kadept.context().close();
  await sekum.context().close();
});

test('pembatalan TERBIT wajib beralasan dan tidak mengembalikan nomor (INV-16)', async ({ browser }) => {
  test.skip(!idSetuju, 'butuh surat dari test sebelumnya');
  lewatiSelainDesktop();
  // Sudah TERBIT lewat alur sungguhan di test sebelumnya.
  const [st] = await sql<{ status: string }[]>`SELECT status::text FROM surat WHERE id = ${idSetuju}::uuid`;
  expect(st?.status).toBe('TERBIT');
  const [sebelum] = await sql<{ nomor_urut: number; nomor_lengkap: string; counter: number }[]>`
    SELECT s.nomor_urut, s.nomor_lengkap, c.nomor_terakhir AS counter
    FROM surat s JOIN surat_counter c ON c.periode_id = s.periode_id WHERE s.id = ${idSetuju}::uuid`;

  const ketua = await sesi(browser, AKUN.aktif);
  expect((await ketua.request.post(`/api/surat/${idSetuju}/cancel`, { data: { alasan: '' } })).status()).toBe(422);
  const r = await ketua.request.post(`/api/surat/${idSetuju}/cancel`, { data: { alasan: 'Tujuan surat salah, diganti surat baru' } });
  expect(r.status(), await r.text()).toBe(200);

  const [sesudah] = await sql<{ status: string; nomor_urut: number; nomor_lengkap: string; alasan_pembatalan: string; counter: number }[]>`
    SELECT s.status::text, s.nomor_urut, s.nomor_lengkap, s.alasan_pembatalan, c.nomor_terakhir AS counter
    FROM surat s JOIN surat_counter c ON c.periode_id = s.periode_id WHERE s.id = ${idSetuju}::uuid`;
  expect(sesudah?.status).toBe('DIBATALKAN');
  expect(sesudah?.nomor_urut).toBe(sebelum?.nomor_urut);
  expect(sesudah?.nomor_lengkap).toBe(sebelum?.nomor_lengkap);
  expect(sesudah?.counter).toBe(sebelum?.counter);
  expect(sesudah?.alasan_pembatalan).toBe('Tujuan surat salah, diganti surat baru');

  // Yang sudah dibatalkan tidak dapat dibatalkan atau disetujui lagi.
  expect((await ketua.request.post(`/api/surat/${idSetuju}/cancel`, { data: { alasan: 'Kedua kali' } })).status()).toBe(409);
  // Dokumennya tetap diarsipkan dan tetap dapat diunduh (T-061).
  expect((await ketua.request.get(`/api/surat/${idSetuju}/download`)).status()).toBe(200);
  await ketua.context().close();
});
