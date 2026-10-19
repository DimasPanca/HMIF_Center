/**
 * Gate T-060 — alur approval surat.
 *
 * Menguji (kontrak T-060):
 *   - Kadept mengajukan SK Aktif dirinya → muncul di antrian Ketua, Wakil, DAN Sekum;
 *   - BPH tidak punya antrian dan tidak dapat menyetujui (INV-04);
 *   - setelah satu approver menyetujui, surat hilang dari antrian yang sedang
 *     terbuka di layar approver lain TANPA reload, dan approver lain yang
 *     terlambat mendapat "sudah disetujui";
 *   - nomor final dialokasikan saat disetujui; bila dokumen gagal di-generate
 *     (di sini: Ketua belum mengunggah tanda tangan) surat berhenti di DISETUJUI
 *     dengan peringatan — nomor tetap sah;
 *   - (T-061) setelah tanda tangan diunggah, "Terbitkan ulang" → TERBIT, baris
 *     dokumen tercatat, dan DOCX dapat diunduh pembuat & pembaca arsip dengan
 *     nama berkas = nomor surat; surat orang lain tidak ada bagi ANGGOTA;
 *   - penolakan tanpa alasan ditolak server; dengan alasan → DITOLAK, pemohon
 *     melihat alasannya di halaman pengajuannya dan dapat mengajukan ulang;
 *   - transisi ilegal ditolak 409; pengajuan draft tak lengkap ditolak 422;
 *     formulir surat hanya untuk Sekum (ADR-036);
 *   - pembatalan TERBIT wajib beralasan, nomor tidak dikembalikan (INV-16).
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import PizZip from 'pizzip';
import postgres from 'postgres';
import sharp from 'sharp';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';
import { kunciTtdKetua, type KunciTtd } from './fixtures/kunci-ttd';

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

let kunci: KunciTtd | null = null;

/**
 * NIM baris Data Pengurus Kadept uji — satu per project, karena project desktop
 * dan mobile berjalan paralel dan afterAll masing-masing menghapus barisnya.
 */
let nimKadept = '';

test.beforeAll(async () => {
  test.setTimeout(600_000);
  // Gate surat-massal juga mengubah tanda tangan Ketua — jangan berjalan bersamaan.
  if (test.info().project.name === PROJECT_TTD) kunci = await kunciTtdKetua(bacaKoneksi());
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const [k] = await sql<{ id: string; email: string }[]>`
    SELECT u.id::text, u.email FROM user_role ur
    JOIN app_user u ON u.id = ur.user_id JOIN periode p ON p.id = ur.periode_id
    WHERE p.status = 'AKTIF' AND ur.role = 'KETUA' AND u.is_active
    ORDER BY ur.created_at LIMIT 1`;
  expect(k?.email, 'penandatangan surat harus akun Ketua uji').toBe(AKUN.aktif.email);
  idKetua = k!.id;
  // ADR-036: Kadept uji mengajukan SK Aktif atas nama dirinya — identitasnya
  // diambil dari Data Pengurus, jadi ia harus tercatat di periode aktif.
  nimKadept = test.info().project.name === PROJECT_TTD ? '9902899036' : '9902899037';
  await sql`
    INSERT INTO pengurus (periode_id, user_id, nama_lengkap, nim, jabatan, is_aktif)
    SELECT p.id, u.id, u.nama_lengkap, ${nimKadept}, 'Kepala Departemen Kaderisasi', true
    FROM app_user u, periode p WHERE u.email = ${AKUN.kadept.email} AND p.status = 'AKTIF'
    ON CONFLICT (periode_id, nim) DO NOTHING`;

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
  await kunci?.lepas();
  if (sql) {
    if (dibuat.length) await sql`DELETE FROM surat WHERE id = ANY(${dibuat}::uuid[])`.catch(() => {});
    if (nimKadept) await sql`DELETE FROM pengurus WHERE nim = ${nimKadept}`.catch(() => {});
    await hapusBerkasDokumen(dibuat);
    await sql.end();
  }
});

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function sesi(browser: Browser, akun: AkunUji): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await masuk(page, akun);
  return page;
}

const penanda = () => `E2E060-${test.info().project.name}-${Date.now()}`;

/**
 * Surat Keterangan Aktif atas nama Kadept uji, diajukan lewat API pengajuan
 * mandiri (ADR-036): identitas dari Data Pengurus, langsung berstatus menunggu.
 */
async function ajukanLewatApi(page: Page, nama: string): Promise<string> {
  const aju = await page.request.post('/api/surat/keterangan-aktif', {
    data: { keperluan: `Kelengkapan Beasiswa ${nama}` },
  });
  const teks = await aju.text();
  expect(aju.status(), teks).toBe(201);
  const id = (JSON.parse(teks) as { data: { id: string } }).data.id;
  dibuat.push(id);
  return id;
}

let idSetuju = '';

test('Kadept mengajukan SK Aktif dirinya → muncul di antrian Ketua, Wakil, dan Sekum; tidak bagi BPH (ADR-036)', async ({ browser }) => {
  // ADR-036: pengurus selain Sekum hanya mengajukan Surat Keterangan Aktif atas
  // nama dirinya; identitasnya diambil server dari Data Pengurus (beforeAll).
  const kadept = await sesi(browser, AKUN.kadept);
  await kadept.goto('/surat/keterangan-aktif', { waitUntil: 'load' });
  await kadept.getByLabel('Keperluan surat').fill(`Kelengkapan Persyaratan Administrasi Beasiswa ${penanda()}`);
  const [res] = await Promise.all([
    kadept.waitForResponse((r) => r.url().endsWith('/api/surat/keterangan-aktif') && r.request().method() === 'POST', { timeout: 60_000 }),
    kadept.getByRole('button', { name: 'Ajukan surat' }).click(),
  ]);
  const teks = await res.text();
  expect(res.status(), teks).toBe(201);
  // Catat id untuk dibersihkan SEBELUM asersi lain (lihat afterAll).
  idSetuju = (JSON.parse(teks) as { data: { id: string } }).data.id;
  dibuat.push(idSetuju);
  await expect(kadept.getByText('Pengajuan terkirim.', { exact: false })).toBeVisible({ timeout: 20_000 });

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
    // "Buat PDF" untuk surat terbit juga ditolak terang-terangan selama PDF mati.
    const buatPdf = await ketua.request.post(`/api/surat/${idSetuju}/pdf`);
    expect(buatPdf.status()).toBe(409);
    expect(((await buatPdf.json()) as { error: { code: string } }).error.code).toBe('PDF_NONAKTIF');
    await expect(ketua.getByTestId('surat-unduh-pdf')).toHaveCount(0);
  }

  // Pembaca arsip (BPH) boleh; ANGGOTA tidak punya surat.read dan hanya boleh
  // mengunduh SK Aktif miliknya sendiri — surat orang lain tidak ada baginya (ADR-036).
  const bph = await sesi(browser, AKUN.bacaSaja);
  expect((await bph.request.get(`/api/surat/${idSetuju}/download`)).status()).toBe(200);
  const anggota = await sesi(browser, AKUN.anggota);
  expect((await anggota.request.get(`/api/surat/${idSetuju}/download`)).status()).toBe(404);

  for (const p of [ketua, kadept, bph, anggota]) await p.context().close();
});

test('penolakan wajib beralasan; pemohon melihat alasannya lalu dapat mengajukan ulang (ADR-036)', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const nama = penanda();
  const id = await ajukanLewatApi(kadept, nama);

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

  // Pemohon melihat alasannya di halaman pengajuannya sendiri.
  await kadept.goto('/surat/keterangan-aktif', { waitUntil: 'load' });
  await expect(kadept.getByTestId(`sk-aktif-${id}`)).toContainText('Alasan ditolak: NIM pemohon tidak sesuai data pengurus', {
    timeout: 60_000,
  });
  // Formulir surat hanya untuk Sekum: pemohon tidak menyunting draft (ADR-036).
  expect((await kadept.goto(`/surat/baru?id=${id}`))?.status()).toBe(404);
  const [row] = await sql<{ status: string; alasan_penolakan: string | null }[]>`SELECT status::text, alasan_penolakan FROM surat WHERE id = ${id}::uuid`;
  expect(row?.status).toBe('DITOLAK');
  expect(row?.alasan_penolakan).toBe('NIM pemohon tidak sesuai data pengurus');

  // Yang ditolak tidak lagi menunggu: keperluan yang sama boleh diajukan lagi.
  const ulang = await ajukanLewatApi(kadept, nama);
  expect(ulang).not.toBe(id);

  await kadept.context().close();
  await sekum.context().close();
});

test('transisi ilegal ditolak 409; draft tak lengkap tidak dapat diajukan', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const sekum = await sesi(browser, AKUN.sekum);

  // ADR-036: formulir surat (semua jenis) hanya untuk Sekum.
  expect((await kadept.request.post('/api/surat', { data: { jenis: 'KETERANGAN_AKTIF' } })).status()).toBe(403);

  const kosong = await sekum.request.post('/api/surat', { data: { jenis: 'KETERANGAN_AKTIF' } });
  const idKosong = ((await kosong.json()) as { data: { id: string } }).data.id;
  dibuat.push(idKosong);
  const tidakLengkap = await sekum.request.post(`/api/surat/${idKosong}/submit`);
  expect(tidakLengkap.status()).toBe(422);
  expect(((await tidakLengkap.json()) as { error: { code: string } }).error.code).toBe('VALIDASI_GAGAL');
  expect((await sekum.request.post(`/api/surat/${idKosong}/approve`, { data: {} })).status()).toBe(409);

  // Draft lengkap milik Sekum: diajukan sekali, kedua kalinya 409.
  const lengkap = await sekum.request.post('/api/surat', {
    data: {
      jenis: 'KETERANGAN_AKTIF',
      tanggal_surat: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10),
      format_output: 'DOCX',
      data_dinamis: {
        nama_pemohon: `E2E060 Pemohon ${test.info().project.name}`,
        nim_pemohon: '3337220032',
        jabatan_pemohon: 'Staf Departemen',
        keperluan: 'Kelengkapan Persyaratan Administrasi Beasiswa',
      },
    },
  });
  const idLengkap = ((await lengkap.json()) as { data: { id: string } }).data.id;
  dibuat.push(idLengkap);
  const aju = await sekum.request.post(`/api/surat/${idLengkap}/submit`);
  expect(aju.status(), await aju.text()).toBe(200);
  expect((await sekum.request.post(`/api/surat/${idLengkap}/submit`)).status()).toBe(409);
  expect((await sekum.request.post(`/api/surat/${idLengkap}/cancel`, { data: { alasan: 'Uji pembatalan ilegal' } })).status()).toBe(409);
  // Surat yang sudah diajukan tidak dapat disunting lewat auto-save.
  expect((await sekum.request.patch(`/api/surat/${idLengkap}`, { data: { jenis: 'KETERANGAN_AKTIF' } })).status()).toBe(409);

  // Pengajuan mandiri: keperluan yang sama selagi masih menunggu ditolak 409,
  // dan pemohon tidak dapat menyunting lewat formulir surat (403).
  const nama = penanda();
  const id = await ajukanLewatApi(kadept, nama);
  const dobel = await kadept.request.post('/api/surat/keterangan-aktif', { data: { keperluan: `Kelengkapan Beasiswa ${nama}` } });
  expect(dobel.status()).toBe(409);
  expect((await kadept.request.patch(`/api/surat/${id}`, { data: { jenis: 'KETERANGAN_AKTIF' } })).status()).toBe(403);

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
