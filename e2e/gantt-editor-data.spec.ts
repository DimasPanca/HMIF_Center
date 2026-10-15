/**
 * Gate T-078 (data sungguhan) — melengkapi `gantt-editor.spec.ts` (harness):
 *
 *   - Kadept membuka/membuat Gantt departemennya, menambah grup & task;
 *   - drag bar di layar menggeser tanggal di DB sebanyak hari yang di-snap,
 *     drag tepi kanan mengubah durasi;
 *   - Kadept departemen lain mendapat 404 (chart tak bocor), BPH 403;
 *   - dependensi Finish-to-Start digambar; siklus ditolak 422;
 *   - route export menghasilkan PNG 2x.
 *
 * Chart departemen yang dibuat test dihapus di akhir; chart yang sudah ada
 * sebelumnya hanya dibersihkan dari grup bertanda test.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

// Chart DEPARTEMEN unik per departemen+periode (migrasi 037): desktop & mobile
// yang berjalan paralel akan berbagi lalu saling menghapus chart yang sama.
// State global → hanya di proyek desktop (pola gate global lain).
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'Chart departemen adalah state global; diuji di desktop saja.');
});

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
  if (!url) throw new Error('Gate gantt-editor-data butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let tag = '';
let dept = { id: '', kode: '' };
let chartId = '';
let chartDibuatTest = false;
let chartLain = '';

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

async function tambah(page: Page, jenis: 'task' | 'grup', data: Record<string, unknown>): Promise<string> {
  const r = await page.request.post(`/api/gantt/${chartId}`, { data: { jenis, data } });
  expect(r.status(), await r.text()).toBe(201);
  return ((await r.json()) as { data: { id: string } }).data.id;
}

const tanggalDb = async (id: string) =>
  (await sql<{ m: string; s: string }[]>`SELECT to_char(tanggal_mulai,'YYYY-MM-DD') AS m, to_char(tanggal_selesai,'YYYY-MM-DD') AS s FROM gantt_task WHERE id = ${id}::uuid`)[0]!;

test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'desktop') return;
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  tag = `${test.info().project.name === 'mobile' ? 'm' : 'd'}${Date.now().toString().slice(-6)}`;
  const [d] = await sql<{ id: string; kode: string }[]>`
    SELECT d.id::text, d.kode FROM user_role ur
    JOIN app_user u ON u.id = ur.user_id JOIN periode p ON p.id = ur.periode_id AND p.status = 'AKTIF'
    JOIN departemen d ON d.id = ur.departemen_id
    WHERE u.email = ${AKUN.kadept.email} AND ur.role = 'KADEPT' LIMIT 1`;
  dept = d!;
  // Chart departemen LAIN (bukan milik Kadept uji) untuk uji kebocoran.
  const [lain] = await sql<{ id: string }[]>`
    INSERT INTO gantt_chart (scope, departemen_id, judul)
    SELECT 'DEPARTEMEN', id, ${`E2E078 ${tag} lain`} FROM departemen
    WHERE is_active AND id <> ${dept.id}::uuid ORDER BY urutan LIMIT 1
    ON CONFLICT (departemen_id, periode_id) WHERE scope = 'DEPARTEMEN' DO UPDATE SET judul = gantt_chart.judul
    RETURNING id::text`;
  chartLain = lain!.id;
});

test.afterAll(async () => {
  if (!sql) return;
  if (chartDibuatTest && chartId) await sql`DELETE FROM gantt_chart WHERE id = ${chartId}::uuid`.catch(() => {});
  else if (chartId) await sql`DELETE FROM gantt_group WHERE chart_id = ${chartId}::uuid AND nama LIKE ${`E2E078 ${tag}%`}`.catch(() => {});
  await sql`DELETE FROM gantt_chart WHERE id = ${chartLain}::uuid AND judul = ${`E2E078 ${tag} lain`}`.catch(() => {});
  await sql.end();
});

test('Kadept membuat Gantt departemen, menambah grup & task, lalu menggeser bar', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const [ada] = await sql<{ id: string }[]>`
    SELECT c.id::text FROM gantt_chart c JOIN periode p ON p.id = c.periode_id AND p.status = 'AKTIF'
    WHERE c.scope = 'DEPARTEMEN' AND c.departemen_id = ${dept.id}::uuid`;
  await kadept.goto(`/departemen/${dept.kode}/gantt`, { waitUntil: 'load' });
  if (!ada) {
    await kadept.getByTestId('gantt-departemen-buat').click({ timeout: 60_000 });
    chartDibuatTest = true;
  }
  await kadept.waitForURL(/\/gantt\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  chartId = kadept.url().split('/').pop()!;
  await expect(kadept.getByTestId('gantt-editor-root')).toHaveAttribute('data-editor-izin', 'tulis', { timeout: 60_000 });
  await expect(kadept.getByTestId('gantt-editor-root')).toHaveAttribute('data-editor-level', 'departemen');

  // Grup lewat form.
  await kadept.getByTestId('gantt-grup-tambah').click();
  await kadept.getByTestId('grup-form-nama').fill(`E2E078 ${tag} Persiapan`);
  await kadept.getByTestId('grup-form-simpan').click();
  await expect(kadept.getByText(`E2E078 ${tag} Persiapan`).first()).toBeVisible({ timeout: 30_000 });
  const [g] = await sql<{ id: string }[]>`SELECT id::text FROM gantt_group WHERE chart_id = ${chartId}::uuid AND nama = ${`E2E078 ${tag} Persiapan`}`;

  // Task lewat API supaya tanggalnya pasti, lalu muat ulang.
  const hariIni = new Date().toISOString().slice(0, 10);
  const plus = (n: number) => new Date(Date.parse(`${hariIni}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const t = await tambah(kadept, 'task', { group_id: g!.id, nama: `E2E078 ${tag} Rapat`, tanggal_mulai: hariIni, tanggal_selesai: plus(5), progres: 50 });
  await kadept.reload({ waitUntil: 'load' });
  const pegangan = kadept.getByTestId(`gantt-drag-${t}`);
  await expect(pegangan).toHaveAttribute('data-drag-aktif', 'true', { timeout: 60_000 });

  // Skala minggu = 6 px/hari. Geser 3 hari ke kanan.
  const kotak = (await pegangan.boundingBox())!;
  await kadept.mouse.move(kotak.x + kotak.width / 2, kotak.y + kotak.height / 2);
  await kadept.mouse.down();
  await kadept.mouse.move(kotak.x + kotak.width / 2 + 9, kotak.y + kotak.height / 2, { steps: 3 });
  await kadept.mouse.move(kotak.x + kotak.width / 2 + 18, kotak.y + kotak.height / 2, { steps: 3 });
  await kadept.mouse.up();
  await expect.poll(async () => (await tanggalDb(t)).m, { timeout: 15_000 }).toBe(plus(3));
  expect((await tanggalDb(t)).s).toBe(plus(8));

  // Tepi kanan: durasi +2 hari, mulai tetap. Tunggu pegangan pindah ke posisi baru.
  await expect(kadept.getByTestId('gantt-editor-galat')).toHaveCount(0);
  const tepi = kadept.getByTestId(`gantt-resize-akhir-${t}`);
  const kt = (await tepi.boundingBox())!;
  await kadept.mouse.move(kt.x + kt.width / 2, kt.y + kt.height / 2);
  await kadept.mouse.down();
  await kadept.mouse.move(kt.x + kt.width / 2 + 12, kt.y + kt.height / 2, { steps: 4 });
  await kadept.mouse.up();
  await expect.poll(async () => (await tanggalDb(t)).s, { timeout: 15_000 }).toBe(plus(10));
  expect((await tanggalDb(t)).m).toBe(plus(3));
  await kadept.context().close();
});

test('dependensi FS digambar; siklus ditolak; validasi tanggal', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const [g] = await sql<{ id: string }[]>`SELECT id::text FROM gantt_group WHERE chart_id = ${chartId}::uuid AND nama = ${`E2E078 ${tag} Persiapan`}`;
  const a = await tambah(kadept, 'task', { group_id: g!.id, nama: `E2E078 ${tag} A`, tanggal_mulai: '2026-11-01', tanggal_selesai: '2026-11-03' });
  const b = await tambah(kadept, 'task', { group_id: g!.id, nama: `E2E078 ${tag} B`, tanggal_mulai: '2026-11-04', tanggal_selesai: '2026-11-06', bergantung_pada: [a] });
  const siklus = await kadept.request.patch(`/api/gantt/task/${a}`, { data: { bergantung_pada: [b] } });
  expect(siklus.status()).toBe(422);
  expect(await siklus.text()).toContain('siklus');
  const mundur = await kadept.request.patch(`/api/gantt/task/${a}`, { data: { tanggal_selesai: '2026-10-01' } });
  expect(mundur.status()).toBe(422);

  await kadept.goto(`/gantt/${chartId}`, { waitUntil: 'load' });
  await expect(kadept.getByTestId(`dep-${a}-${b}`)).toBeAttached({ timeout: 60_000 });

  // Kanal gantt:{chart_id}: perubahan dari luar halaman tampil tanpa muat ulang.
  await kadept.waitForTimeout(4_000);
  const namaBaru = `E2E078 ${tag} A diubah`;
  expect((await kadept.request.patch(`/api/gantt/task/${a}`, { data: { nama: namaBaru } })).status()).toBe(200);
  await expect(kadept.getByTestId('gantt-label-column').getByText(namaBaru)).toBeVisible({ timeout: 5_000 });
  await kadept.context().close();
});

test('chart departemen lain tidak bocor (404); BPH baca saja (403); Anggota tak dapat menambah', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  expect((await kadept.request.get(`/api/gantt/${chartLain}`)).status()).toBe(404);
  expect((await kadept.request.post(`/api/gantt/${chartLain}`, { data: { jenis: 'grup', data: { nama: 'x' } } })).status()).toBe(404);
  await kadept.context().close();

  const [t] = await sql<{ id: string }[]>`SELECT id::text FROM gantt_task WHERE chart_id = ${chartId}::uuid AND nama = ${`E2E078 ${tag} A diubah`}`;
  const bph = await sesi(browser, AKUN.bacaSaja);
  expect((await bph.request.get(`/api/gantt/${chartId}`)).status()).toBe(200);
  expect((await bph.request.patch(`/api/gantt/task/${t!.id}`, { data: { progres: 10 } })).status()).toBe(403);
  await bph.goto(`/gantt/${chartId}`, { waitUntil: 'load' });
  await expect(bph.getByTestId('gantt-editor-root')).toHaveAttribute('data-editor-izin', 'baca', { timeout: 60_000 });
  await expect(bph.getByTestId(`gantt-drag-${t!.id}`)).toHaveAttribute('data-drag-aktif', 'false');
  await expect(bph.getByTestId('gantt-task-tambah')).toBeDisabled();
  await bph.context().close();

  const anggota = await sesi(browser, AKUN.anggota);
  const [sama] = await sql<{ ada: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM user_role ur JOIN app_user u ON u.id = ur.user_id
      JOIN periode p ON p.id = ur.periode_id AND p.status = 'AKTIF'
      WHERE u.email = ${AKUN.anggota.email} AND ur.departemen_id = ${dept.id}::uuid) AS ada`;
  if (sama!.ada) {
    // Anggota: RU* — boleh mengubah task departemennya, tidak boleh menambah.
    expect((await anggota.request.patch(`/api/gantt/task/${t!.id}`, { data: { progres: 30 } })).status()).toBe(200);
    expect((await anggota.request.post(`/api/gantt/${chartId}`, { data: { jenis: 'grup', data: { nama: 'x' } } })).status()).toBe(403);
  }
  await anggota.context().close();
});

test('route export menghasilkan PNG 2x', async ({ browser }) => {
  const kadept = await sesi(browser, AKUN.kadept);
  const r = await kadept.request.get(`/api/gantt/${chartId}/export?skala=bulan`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('image/png');
  const buf = Buffer.from(await r.body());
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(buf.readUInt32BE(16)).toBeGreaterThan(600); // 2x dari lebar label + timeline
  await kadept.context().close();
});
