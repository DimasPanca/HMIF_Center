/**
 * Gate T-085 — Visibilitas cross-divisi (PRD F-8.3, USER_FLOW §6.3, INV-30).
 *
 * Menguji:
 *   - panitia Konsumsi membuka divisi PDD: banner "Tampilan baca saja", RAB PDD
 *     terbaca lengkap, dan tombol tulis TIDAK ADA di DOM (bukan disabled);
 *   - divisinya sendiri: mode tulis, tanpa banner;
 *   - API tulis Gantt divisi lain ditolak 403; divisinya sendiri diterima;
 *   - editor Gantt divisi lain tidak merender tombol tambah sama sekali;
 *   - Ketua Pelaksana menulis di seluruh divisi.
 *
 * Penolakan oleh RLS untuk jalur langsung (PostgREST + JWT pengguna) diuji
 * `npm run db:test -- 015c_rls_negatif` skenario 11–14 (migrasi 039/040).
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
  if (!url) throw new Error('Gate cross-divisi butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
const div = { konsumsi: '', pdd: '' };
const chart = { konsumsi: '', pdd: '' };
const task = { konsumsi: '', pdd: '' };

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

async function chartDivisi(divisiId: string, nama: string): Promise<{ chart: string; task: string }> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO gantt_chart (scope, divisi_id, judul) VALUES ('DIVISI', ${divisiId}::uuid, ${`Gantt Divisi ${nama}`}) RETURNING id::text`;
  const [g] = await sql<{ id: string }[]>`
    INSERT INTO gantt_group (chart_id, nama, warna) VALUES (${c!.id}::uuid, 'Persiapan', '#2563EB') RETURNING id::text`;
  const [t] = await sql<{ id: string }[]>`
    INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai, progres)
    VALUES (${g!.id}::uuid, ${`Tugas ${nama}`}, '2028-11-02', '2028-11-10', 20) RETURNING id::text`;
  return { chart: c!.id, task: t!.id };
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E085 ${tag} SYNCHRONIZE`;
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
    VALUES (${prokerId}::uuid, ${nama}, ${`SYNC${tag}`}, ${ketuplak}::uuid) RETURNING id::text`;
  acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${acaraId}::uuid)`;

  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  const [dp] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${acaraId}::uuid, 'PDD', 2) RETURNING id::text`;
  div.konsumsi = dk!.id;
  div.pdd = dp!.id;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${div.konsumsi}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;

  const [s] = await sql<{ id: string }[]>`
    INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${div.pdd}::uuid, 'DOKUMENTASI', 1) RETURNING id::text`;
  await sql`INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual) VALUES
    (${s!.id}::uuid, 1, 'Sewa kamera', '2 Hari 1 Malam', NULL, 0, 400000, true),
    (${s!.id}::uuid, 2, 'Baterai cadangan', '4', 4, 50000, 200000, false)`;

  const ck = await chartDivisi(div.konsumsi, 'Konsumsi');
  const cp = await chartDivisi(div.pdd, 'PDD');
  chart.konsumsi = ck.chart;
  task.konsumsi = ck.task;
  chart.pdd = cp.chart;
  task.pdd = cp.task;
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('divisi lain: banner baca saja, RAB terbaca lengkap, tombol tulis tidak ada di DOM', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto(`/acara/${acaraId}/divisi/${div.pdd}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('ruang-divisi')).toHaveAttribute('data-mode', 'baca', { timeout: 60_000 });
  await expect(koor.getByTestId('mode-baca-saja')).toContainText('Tampilan baca saja — Divisi PDD');
  await expect(koor.getByTestId('rab-item')).toHaveCount(2);
  await expect(koor.getByTestId('rab-item').first()).toContainText('Sewa kamera');
  // Grid RAB (T-087) divisi lain: tanpa satu pun input atau tombol (INV-30).
  await expect(koor.getByTestId('rab-divisi')).toHaveAttribute('data-boleh-tulis', '0');
  await expect(
    koor.locator(
      '[data-testid="rab-divisi"] :is(input, [data-testid="rab-hapus-item"], [data-testid="rab-tambah-item"], [data-testid="rab-hapus-section"], [data-testid="rab-total-manual"], [data-testid="rab-tambah-section"])',
    ),
  ).toHaveCount(0);
  await expect(koor.getByTestId('rab-divisi-total')).toContainText('Rp600.000');
  // Tidak dirender — bukan disabled.
  await expect(koor.getByTestId('divisi-aksi-tulis')).toHaveCount(0);
  await expect(koor.getByRole('link', { name: /Gantt Divisi PDD/ })).toBeVisible();
  await koor.context().close();
});

test('divisi sendiri: mode tulis, tanpa banner, aksi tulis tersedia', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto(`/acara/${acaraId}/divisi/${div.konsumsi}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('ruang-divisi')).toHaveAttribute('data-mode', 'tulis', { timeout: 60_000 });
  await expect(koor.getByTestId('mode-baca-saja')).toHaveCount(0);
  await expect(koor.getByTestId('divisi-aksi-tulis')).toBeVisible();
  await koor.context().close();
});

test('API tulis Gantt divisi lain ditolak 403; editor divisi lain tanpa tombol tambah', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  const lain = await koor.request.patch(`/api/gantt/task/${task.pdd}`, { data: { progres: 90 } });
  expect(lain.status(), await lain.text()).toBe(403);
  const sendiri = await koor.request.patch(`/api/gantt/task/${task.konsumsi}`, { data: { progres: 60 } });
  expect(sendiri.status(), await sendiri.text()).toBe(200);
  const [t] = await sql<{ pdd: number; konsumsi: number }[]>`
    SELECT (SELECT progres FROM gantt_task WHERE id = ${task.pdd}::uuid)::int AS pdd,
           (SELECT progres FROM gantt_task WHERE id = ${task.konsumsi}::uuid)::int AS konsumsi`;
  expect(t).toEqual({ pdd: 20, konsumsi: 60 });

  await koor.goto(`/gantt/${chart.pdd}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('gantt-editor-root')).toHaveAttribute('data-editor-izin', 'baca', { timeout: 60_000 });
  await expect(koor.getByTestId('gantt-task-tambah')).toHaveCount(0);
  await expect(koor.getByTestId('gantt-grup-tambah')).toHaveCount(0);
  await expect(koor.getByTestId(`gantt-drag-${task.pdd}`)).toHaveAttribute('data-drag-aktif', 'false');

  await koor.goto(`/gantt/${chart.konsumsi}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('gantt-editor-root')).toHaveAttribute('data-editor-izin', 'tulis', { timeout: 60_000 });
  // Anggota memegang Gantt `RU*` (tanpa C): menggeser boleh, menambah task tidak.
  await expect(koor.getByTestId(`gantt-drag-${task.konsumsi}`)).toHaveAttribute('data-drag-aktif', 'true');
  await koor.context().close();
});

test('Ketua Pelaksana menulis di seluruh divisi', async ({ browser }) => {
  const ketuplak = await sesi(browser, AKUN.sekum);
  for (const id of [div.konsumsi, div.pdd]) {
    await ketuplak.goto(`/acara/${acaraId}/divisi/${id}`, { waitUntil: 'load' });
    await expect(ketuplak.getByTestId('ruang-divisi')).toHaveAttribute('data-mode', 'tulis', { timeout: 60_000 });
    await expect(ketuplak.getByTestId('mode-baca-saja')).toHaveCount(0);
  }
  await ketuplak.context().close();
});
