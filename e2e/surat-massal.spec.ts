/**
 * Gate T-064 — generate massal Surat Keterangan Aktif Organisasi.
 *
 * Data Pengurus (T-107) belum ada isinya; gate ini menyuntik 30 pengurus uji
 * (kontrak: "sementara boleh dari data seed dev") dan membersihkannya.
 * Menguji:
 *   - Sekum memilih 30 pengurus + satu keperluan → 30 surat diajukan dalam
 *     satu request, sebagai satu batch, TIDAK masuk antrian approval satuan;
 *   - Ketua menyetujui batch dalam SATU request → 30 nomor berbeda dan
 *     BERURUTAN (urut nama), progres per dokumen, seluruhnya TERBIT;
 *   - ZIP berisi 30 DOCX `{nomor}-{nama}.docx` yang masing-masing sah;
 *   - kegagalan dilaporkan per dokumen dan dapat diterbitkan ulang
 *     (tanda tangan Ketua dihapus sementara);
 *   - > 50 per batch ditolak; BPH tidak punya halaman maupun API-nya.
 *
 * Kegagalan SEBAGIAN (satu dari banyak) diuji di lib/surat/__tests__/batch.test.ts
 * dengan penerbit tiruan — sulit dipicu deterministik lewat data sungguhan.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import PizZip from 'pizzip';
import postgres from 'postgres';
import sharp from 'sharp';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';
import { kunciTtdKetua, type KunciTtd } from './fixtures/kunci-ttd';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

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
const env = bacaEnv();
const URL_DB = env.DIRECT_URL ?? env.DATABASE_URL ?? '';

let sql: ReturnType<typeof postgres>;
let kunci: KunciTtd | null = null;
let periode = '';
let idKetua = '';
const pengurus: { id: string; nama: string }[] = [];
const batchDibuat: string[] = [];
let batchUtama = '';

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

async function pastikanTtdKetua(page: Page): Promise<void> {
  const coretan = await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="600" height="300"><path d="M20 250 C 150 20, 300 280, 580 40" stroke="black" stroke-width="12" fill="none"/></svg>') }])
    .png()
    .toBuffer();
  const r = await page.request.post('/api/users/me/signature', { multipart: { file: { name: 'ttd.png', mimeType: 'image/png', buffer: coretan } } });
  expect(r.status(), await r.text()).toBe(200);
}

/** Baca respons NDJSON batch sampai habis. */
async function bacaProgres(body: string) {
  return body
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { tipe: string; ok?: boolean; total?: number; berhasil?: number; gagal?: number; pesan?: string });
}

test.beforeAll(async () => {
  // Satu project saja: seluruh gate ini mengubah data global (nomor, tanda tangan).
  test.skip(test.info().project.name !== 'desktop', 'aksi massal mengubah data global — satu project cukup');
  test.setTimeout(600_000);
  if (!URL_DB) throw new Error('Gate surat-massal butuh DIRECT_URL/DATABASE_URL.');
  kunci = await kunciTtdKetua(URL_DB);
  sql = postgres(URL_DB, { ssl: 'require', max: 1, onnotice: () => {} });
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  periode = p!.id;
  const [k] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${AKUN.aktif.email}`;
  idKetua = k!.id;
  const [dep] = await sql<{ id: string }[]>`SELECT id::text FROM departemen ORDER BY urutan LIMIT 1`;

  const tag = Date.now().toString().slice(-6);
  // Nama sengaja tidak urut abjad saat disisipkan — nomor harus mengikuti urutan NAMA.
  const urutan = Array.from({ length: 30 }, (_, i) => (i * 7) % 30);
  for (const n of urutan) {
    const [r] = await sql<{ id: string }[]>`
      INSERT INTO pengurus (periode_id, nama_lengkap, nim, jabatan, departemen_id)
      VALUES (${periode}::uuid, ${`E2E064 Pengurus ${String(n + 1).padStart(2, '0')}`}, ${`99${tag}${String(n).padStart(2, '0')}`},
              'Staff Departemen Uji', ${dep!.id}::uuid)
      RETURNING id::text`;
    pengurus.push({ id: r!.id, nama: `E2E064 Pengurus ${String(n + 1).padStart(2, '0')}` });
  }
});

test.afterAll(async () => {
  if (sql) {
    const surat = batchDibuat.length
      ? await sql<{ id: string }[]>`SELECT id::text FROM surat WHERE batch_id = ANY(${batchDibuat}::uuid[])`
      : [];
    if (surat.length) {
      await sql`DELETE FROM surat WHERE id = ANY(${surat.map((s) => s.id)}::uuid[])`.catch(() => {});
      const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
      const rahasia = env.SUPABASE_SECRET_KEY;
      if (url && rahasia) {
        await fetch(`${url}/storage/v1/object/${env.STORAGE_BUCKET_PRIVATE ?? 'private'}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${rahasia}`, apikey: rahasia, 'content-type': 'application/json' },
          body: JSON.stringify({ prefixes: surat.map((s) => `dokumen/surat/${s.id}.docx`) }),
        }).catch(() => undefined);
      }
    }
    if (pengurus.length) await sql`DELETE FROM pengurus WHERE id = ANY(${pengurus.map((p) => p.id)}::uuid[])`.catch(() => {});
    await sql.end();
  }
  await kunci?.lepas();
});

test('Sekum memilih 30 pengurus → satu batch diajukan; tidak masuk antrian satuan', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  await sekum.goto('/surat/massal', { waitUntil: 'load' });
  await expect(sekum.getByTestId('massal-pengurus')).toBeVisible({ timeout: 60_000 });
  for (const p of pengurus) await sekum.getByTestId(`massal-pilih-${p.id}`).check();
  await expect(sekum.getByTestId('massal-terpilih')).toContainText('30');
  await expect(sekum.getByTestId('massal-buat')).toBeDisabled();
  await sekum.getByTestId('massal-keperluan').fill('Kelengkapan Persyaratan Administrasi Beasiswa');
  await sekum.getByTestId('massal-tanggal').fill('2026-10-15');
  await sekum.getByTestId('massal-buat').click();
  await expect(sekum.getByTestId('massal-pratinjau')).toContainText('Ajukan 30 Surat Keterangan Aktif');
  await sekum.getByTestId('massal-konfirmasi').click();
  await expect(sekum.getByTestId('massal-dibuat')).toContainText('30 surat diajukan', { timeout: 60_000 });

  const baris = await sql<{ batch_id: string; status: string; n: number }[]>`
    SELECT batch_id::text, status::text, count(*)::int AS n FROM surat
    WHERE periode_id = ${periode}::uuid AND data_dinamis->>'nama_pemohon' LIKE 'E2E064%' AND batch_id IS NOT NULL
    GROUP BY 1, 2`;
  expect(baris).toHaveLength(1);
  expect(baris[0]).toMatchObject({ status: 'MENUNGGU_APPROVAL', n: 30 });
  batchUtama = baris[0]!.batch_id;
  batchDibuat.push(batchUtama);

  // Tidak muncul satu per satu di antrian approval; ditautkan ke halaman massal.
  const ketua = await sesi(browser, AKUN.aktif);
  await ketua.goto('/surat/approval', { waitUntil: 'load' });
  await expect(ketua.getByTestId('surat-antrian-batch')).toContainText('30 surat', { timeout: 60_000 });
  const [satu] = await sql<{ id: string }[]>`SELECT id::text FROM surat WHERE batch_id = ${batchUtama}::uuid LIMIT 1`;
  await expect(ketua.getByTestId(`surat-antrian-item-${satu!.id}`)).toHaveCount(0);
  // ...dan tidak dapat disetujui satu per satu (nomor akan disela).
  const r = await ketua.request.post(`/api/surat/${satu!.id}/approve`, { data: {} });
  expect(r.status()).toBe(409);
  expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/batch generate massal/);

  for (const p of [sekum, ketua]) await p.context().close();
});

test('Ketua menyetujui batch: 30 nomor berurutan, progres per dokumen, ZIP 30 DOCX sah', async ({ browser }) => {
  test.skip(!batchUtama, 'butuh batch dari test sebelumnya');
  // 30 generate + unggah di dev server yang sedang melayani gate lain.
  test.setTimeout(420_000);
  const ketua = await sesi(browser, AKUN.aktif);
  await pastikanTtdKetua(ketua);

  await ketua.goto('/surat/massal', { waitUntil: 'load' });
  await ketua.getByTestId(`batch-setujui-${batchUtama}`).click({ timeout: 60_000 });
  await expect(ketua.getByTestId('batch-progres')).toBeVisible({ timeout: 30_000 });
  await expect(ketua.getByTestId('batch-ringkasan')).toContainText('30 dokumen terbit', { timeout: 300_000 });
  await expect(ketua.locator('[data-testid^="batch-item-"][data-ok="ya"]')).toHaveCount(30);

  const rows = await sql<{ nama: string; nomor_urut: number; nomor_lengkap: string; status: string; dok: number }[]>`
    SELECT s.data_dinamis->>'nama_pemohon' AS nama, s.nomor_urut, s.nomor_lengkap, s.status::text,
           (SELECT count(*)::int FROM dokumen d WHERE d.surat_id = s.id AND d.format = 'DOCX') AS dok
    FROM surat s WHERE s.batch_id = ${batchUtama}::uuid ORDER BY s.nomor_urut`;
  expect(rows).toHaveLength(30);
  expect(new Set(rows.map((r) => r.nomor_urut)).size).toBe(30);
  // Berurutan TANPA disela: 30 angka berturut-turut.
  expect(rows.at(-1)!.nomor_urut - rows[0]!.nomor_urut).toBe(29);
  // Urutan nomor = urutan nama.
  expect(rows.map((r) => r.nama)).toEqual([...rows.map((r) => r.nama)].sort());
  expect(rows.every((r) => r.status === 'TERBIT' && r.dok === 1)).toBe(true);

  const zip = await ketua.request.get(`/api/surat/batch?batch=${batchUtama}`);
  expect(zip.status()).toBe(200);
  expect(zip.headers()['content-type']).toBe('application/zip');
  const isi = await zip.body();
  fs.writeFileSync(test.info().outputPath('surat-aktif-organisasi.zip'), isi);
  const z = new PizZip(isi);
  const berkas = Object.keys(z.files).filter((n) => !z.files[n]!.dir).sort();
  expect(berkas).toHaveLength(30);
  for (const r of rows) {
    const nama = `${r.nomor_lengkap.replaceAll('/', '-')}-${r.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`;
    expect(berkas).toContain(nama);
    const docx = new PizZip(z.file(nama)!.asNodeBuffer());
    const xml = docx.file('word/document.xml')!.asText();
    expect(xml).toContain(r.nomor_lengkap);
    expect(xml).toContain(r.nama);
    expect(xml).toContain('<w:drawing>');
  }
  await ketua.context().close();
});

test('dokumen yang gagal dilaporkan per dokumen, tetap bernomor, dan dapat diterbitkan ulang', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  const buat = await sekum.request.post('/api/surat/batch', {
    data: { aksi: 'buat', pengurus: pengurus.slice(0, 3).map((p) => p.id), keperluan: 'Uji kegagalan', tanggal_surat: '2026-10-15' },
  });
  expect(buat.status(), await buat.text()).toBe(201);
  const batch = ((await buat.json()) as { data: { batchId: string } }).data.batchId;
  batchDibuat.push(batch);

  // Tanpa tanda tangan Ketua, setiap dokumen gagal — tetapi nomornya sudah sah.
  await sql`DELETE FROM signature WHERE user_id = ${idKetua}::uuid`;
  const ketua = await sesi(browser, AKUN.aktif);
  const r = await ketua.request.post('/api/surat/batch', { data: { aksi: 'setujui', batch }, timeout: 120_000 });
  expect(r.status()).toBe(200);
  const ev = await bacaProgres(await r.text());
  const dok = ev.filter((e) => e.tipe === 'dokumen');
  expect(dok).toHaveLength(3);
  expect(dok.every((e) => e.ok === false && /belum mengunggah tanda tangan/.test(e.pesan ?? ''))).toBe(true);
  expect(ev.at(-1)).toMatchObject({ tipe: 'selesai', berhasil: 0, gagal: 3 });
  const st = await sql<{ status: string; nomor_urut: number | null }[]>`SELECT status::text, nomor_urut FROM surat WHERE batch_id = ${batch}::uuid`;
  expect(st.every((s) => s.status === 'DISETUJUI' && s.nomor_urut !== null)).toBe(true);

  // Disetujui lagi → ditolak (sudah diproses); diterbitkan ulang setelah TTD ada → semua terbit.
  expect((await ketua.request.post('/api/surat/batch', { data: { aksi: 'setujui', batch } })).status()).toBe(409);
  await pastikanTtdKetua(ketua);
  const ulang = await ketua.request.post('/api/surat/batch', { data: { aksi: 'terbitkan', batch }, timeout: 120_000 });
  const ev2 = await bacaProgres(await ulang.text());
  expect(ev2.at(-1)).toMatchObject({ tipe: 'selesai', berhasil: 3, gagal: 0 });
  const zip = new PizZip(await (await ketua.request.get(`/api/surat/batch?batch=${batch}`)).body());
  expect(Object.keys(zip.files)).toHaveLength(3);

  for (const p of [sekum, ketua]) await p.context().close();
});

test('lebih dari 50 per batch ditolak; BPH tidak punya akses', async ({ browser }) => {
  const sekum = await sesi(browser, AKUN.sekum);
  const id51 = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const r = await sekum.request.post('/api/surat/batch', {
    data: { aksi: 'buat', pengurus: id51, keperluan: 'Uji', tanggal_surat: '2026-10-15' },
  });
  expect(r.status()).toBe(422);
  expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/pecah menjadi beberapa batch/);

  const bph = await sesi(browser, AKUN.bacaSaja);
  expect((await bph.goto('/surat/massal'))?.status()).toBe(404);
  expect((await bph.request.post('/api/surat/batch', { data: { aksi: 'buat', pengurus: [], keperluan: 'x', tanggal_surat: '2026-10-15' } })).status()).toBe(403);
  expect((await bph.request.post('/api/surat/batch', { data: { aksi: 'setujui', batch: batchUtama || id51[0] } })).status()).toBe(403);
  for (const p of [sekum, bph]) await p.context().close();
});
