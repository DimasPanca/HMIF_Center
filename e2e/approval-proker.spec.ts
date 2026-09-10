/**
 * Gate E2E T-070 — approval proker & pembentukan kepanitiaan.
 *
 * ===========================================================================
 * KONTRAK  ← docs/ai/APPROVAL_CONTRACT.md
 * ===========================================================================
 * Tiga "Selesai bila" T-070:
 *   1. Menyetujui proker TERJADWAL menghasilkan kepanitiaan + seluruh ruang
 *      kerja divisi tanpa aksi manual.
 *   2. Kalender terkunci HANYA setelah approval berhasil (INV-09/INV-10).
 *   3. Konflik saat approval menampilkan detail, bukan pesan generik.
 *
 * Gate-first: SKIP sampai halaman /proker/approval + aksinya (T-070-UI) ada.
 * Approver = KETUA (AKUN.aktif) — hanya Ketua/Wakil punya `proker.approve`
 * (INV-05). Fixture proker MENUNGGU_APPROVAL + rencana diseed lewat DB
 * (DIRECT_URL, menembus RLS sebagai owner) lalu dibersihkan per prefix nama;
 * menghapus proker meng-cascade ke rencana/lock/kepanitiaan/divisi/gantt.
 * Tanggal fixture di 2028 agar tak beririsan dengan fixture gate lain.
 * Tanpa DIRECT_URL (worktree ui), seluruh test SKIP.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-070 · PRD F-5.4, F-8.1 · INV-09
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const HAL = '/proker/approval';
const PREFIX = 'E2E70';

test.describe.configure({ mode: 'serial' });

function bacaKoneksi(): string | undefined {
  const berkas = path.resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(berkas)) {
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const t = baris.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  const g = { ...env, ...process.env };
  return g.DIRECT_URL ?? g.DATABASE_URL;
}

let sql: ReturnType<typeof postgres> | null = null;
let periodeId: string | null = null;
let deptA: string | null = null;
let ketuaPelaksana: string | null = null;

test.beforeAll(async () => {
  const k = bacaKoneksi();
  if (!k) return;
  sql = postgres(k, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  periodeId = (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`)[0]?.id ?? null;
  deptA = (await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan LIMIT 1`)[0]?.id ?? null;
  // Ketua Pelaksana: pengurus aktif mana pun (di sini akun approver sendiri).
  ketuaPelaksana =
    (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.aktif.email} LIMIT 1`)[0]?.id ?? null;
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM proker WHERE nama LIKE ${PREFIX + ' %'}`.catch(() => {});
    await sql.end();
  }
  sql = null;
});

test.beforeEach(async () => {
  if (sql) await sql`DELETE FROM proker WHERE nama LIKE ${PREFIX + ' %'}`.catch(() => {});
});

/** Seed proker TERJADWAL MENUNGGU_APPROVAL + rencana. Kembalikan id + rentang. */
async function seedMenunggu(
  nama: string,
  mulai: string,
  hariHMulai: string,
  hariHSelesai: string,
): Promise<string> {
  const [p] = await sql!<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh, diajukan_at)
    VALUES (${periodeId}::uuid, ${deptA}::uuid, ${nama}, 'TERJADWAL', 'MENUNGGU_APPROVAL',
      ${mulai}::date, ${hariHMulai}::date, ${hariHSelesai}::date, ${ketuaPelaksana}::uuid, now())
    RETURNING id`;
  const prokerId = p!.id;
  const kepanitiaan = { nama_acara: nama, ketua_pelaksana: ketuaPelaksana, divisi: [{ nama: 'Acara', anggota: [] }] };
  const gantt = { groups: [{ nama: 'Persiapan', tasks: [{ nama: 'Rapat', tanggal_mulai: mulai, tanggal_selesai: hariHMulai }] }] };
  await sql!`INSERT INTO proker_rencana (proker_id, periode_id, kepanitiaan, gantt)
    VALUES (${prokerId}::uuid, ${periodeId}::uuid, ${sql!.json(kepanitiaan)}, ${sql!.json(gantt)})`;
  return prokerId;
}

/** Seed proker terkunci (DISETUJUI) yang mengunci rentang, untuk memicu konflik. */
async function seedTerkunci(nama: string, mulai: string, hariHMulai: string, hariHSelesai: string): Promise<void> {
  const [p] = await sql!<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh, diajukan_at)
    VALUES (${periodeId}::uuid, ${deptA}::uuid, ${nama}, 'TERJADWAL', 'MENUNGGU_APPROVAL',
      ${mulai}::date, ${hariHMulai}::date, ${hariHSelesai}::date, ${ketuaPelaksana}::uuid, now())
    RETURNING id`;
  await sql!`SELECT setujui_proker(${p!.id}::uuid, ${ketuaPelaksana}::uuid)`;
}

async function jumlah(q: postgres.PendingQuery<postgres.Row[]>): Promise<number> {
  return Number((await q)[0]!.n);
}

function skip(pesan: string): false {
  test.skip(true, pesan);
  return false;
}

/** Login KETUA lalu buka antrian; SKIP bila halaman/aksi approval belum ada. */
async function bukaAntrian(page: Page): Promise<boolean> {
  const masuk = await page.goto('/login', { waitUntil: 'load' });
  if (!masuk || masuk.status() === 404) return skip('Halaman /login belum ada.');
  await page.getByLabel(/email/i).fill(AKUN.aktif.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForLoadState('networkidle');

  const r = await page.goto(HAL, { waitUntil: 'load' });
  if (!r || r.status() === 404) return skip(`Halaman ${HAL} belum ada (T-070-UI).`);
  const ada = await page
    .getByTestId('approval-antrian')
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  return ada ? true : skip(`${HAL} terbuka tetapi approval-antrian belum ada (T-070-UI).`);
}

/** Buka detail satu proker & pastikan tombol Setujui ada; SKIP bila belum. */
async function bukaDetail(page: Page, prokerId: string): Promise<boolean> {
  const item = page.getByTestId(`approval-item-${prokerId}`);
  const ada = await item.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (!ada) return skip('Item antrian/aksi approval belum ada (T-070-UI).');
  await item.click();
  const bisa = await page
    .getByTestId('approval-setujui')
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  return bisa ? true : skip('Detail approval (tombol Setujui) belum ada (T-070-UI).');
}

// ---------------------------------------------------------------------------
// Selesai bila 1 — setujui TERJADWAL membentuk kepanitiaan + ruang kerja
// ---------------------------------------------------------------------------

test.describe('Selesai bila 1 — approval membentuk kepanitiaan', () => {
  test('menyetujui TERJADWAL menghasilkan kepanitiaan + divisi tanpa aksi manual', async ({ page }) => {
    if (!(await bukaAntrian(page))) return;
    const id = await seedMenunggu(`${PREFIX} Bentuk ${Date.now().toString(36)}`, '2028-05-01', '2028-05-31', '2028-06-01');
    await page.reload();
    if (!(await bukaDetail(page, id))) return;

    await page.getByTestId('approval-setujui').click();
    await expect(page.getByTestId('approval-sukses')).toBeVisible({ timeout: 10_000 });

    const kepan = await jumlah(sql!`SELECT count(*) n FROM kepanitiaan WHERE proker_id=${id}::uuid`);
    const divisi = await jumlah(sql!`SELECT count(*) n FROM divisi d JOIN kepanitiaan k ON k.id=d.kepanitiaan_id WHERE k.proker_id=${id}::uuid`);
    const rab = await jumlah(sql!`SELECT count(*) n FROM rab_meta r JOIN kepanitiaan k ON k.id=r.kepanitiaan_id WHERE k.proker_id=${id}::uuid`);
    expect(kepan).toBe(1);
    expect(divisi).toBeGreaterThanOrEqual(1);
    expect(rab).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — kalender terkunci hanya setelah approval
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2 — lock hanya setelah approval', () => {
  test('tidak ada lock sebelum, ada lock sesudah setujui', async ({ page }) => {
    if (!(await bukaAntrian(page))) return;
    const id = await seedMenunggu(`${PREFIX} Lock ${Date.now().toString(36)}`, '2028-07-01', '2028-07-31', '2028-08-01');

    expect(await jumlah(sql!`SELECT count(*) n FROM proker_lock WHERE proker_id=${id}::uuid`)).toBe(0);

    await page.reload();
    if (!(await bukaDetail(page, id))) return;
    await page.getByTestId('approval-setujui').click();
    await expect(page.getByTestId('approval-sukses')).toBeVisible({ timeout: 10_000 });

    expect(await jumlah(sql!`SELECT count(*) n FROM proker_lock WHERE proker_id=${id}::uuid`)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 3 — konflik menampilkan detail
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — konflik menampilkan detail', () => {
  test('menyetujui proker yang bentrok memunculkan panel konflik, bukan pesan generik', async ({ page }) => {
    if (!(await bukaAntrian(page))) return;
    // Satu proker sudah mengunci rentang; proker kedua di rentang yang sama.
    await seedTerkunci(`${PREFIX} Pengunci ${Date.now().toString(36)}`, '2028-09-01', '2028-09-30', '2028-10-01');
    const id = await seedMenunggu(`${PREFIX} Bentrok ${Date.now().toString(36)}`, '2028-09-05', '2028-09-30', '2028-10-01');

    await page.reload();
    if (!(await bukaDetail(page, id))) return;
    await page.getByTestId('approval-setujui').click();

    // Panel konflik inline (berisi nama proker pengunci), bukan pesan generik.
    await expect(page.getByTestId('approval-konflik')).toBeVisible({ timeout: 10_000 });
    // Proker jatuh ke PERLU_REVISI dan TIDAK terbentuk kepanitiaan.
    const status = (await sql!<{ status: string }[]>`SELECT status FROM proker WHERE id=${id}::uuid`)[0]!.status;
    expect(status).toBe('PERLU_REVISI');
    expect(await jumlah(sql!`SELECT count(*) n FROM kepanitiaan WHERE proker_id=${id}::uuid`)).toBe(0);
  });
});
