/**
 * Gate E2E T-071 — edit proker yang sudah terkunci.
 *
 * ===========================================================================
 * KONTRAK  ← docs/ai/EDIT_TERKUNCI_CONTRACT.md
 * ===========================================================================
 * "Selesai bila" T-071 yang diuji:
 *   1. Perubahan MINOR tidak memicu re-approval (tetap DISETUJUI).
 *   2. Perubahan MAYOR → MENUNGGU_APPROVAL_REVISI dengan kunci LAMA dipertahankan
 *      (tak ada jendela tanpa kunci, INV-13).
 *   3. Revisi ditolak → tanggal lama pulih, status DISETUJUI, kunci lama utuh.
 *
 * Gate-first: SKIP sampai halaman edit `/proker/[id]` (T-071-UI) + percabangan
 * tolak-revisi di route approval tersedia. Editor = ADMIN (proker.update global);
 * penolak revisi = KETUA (proker.approve). Fixture proker DISETUJUI + kunci
 * diseed via DB (setujui_proker), dibersihkan per prefix. Tahun per-project
 * mencegah lock antar-project bentrok. Tanpa DIRECT_URL, seluruh test SKIP.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-071 · USER_FLOW §4.4 · INV-13
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial' });

function prefixProyek(): string {
  return `E2E71-${test.info().project.name}`;
}
function tahun(): number {
  return test.info().project.name === 'mobile' ? 2031 : 2029;
}
function tgl(bulanHari: string): string {
  return `${tahun()}-${bulanHari}`;
}

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
let pembuat: string | null = null;

test.beforeAll(async () => {
  const k = bacaKoneksi();
  if (!k) return;
  sql = postgres(k, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  periodeId = (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`)[0]?.id ?? null;
  deptA = (await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan LIMIT 1`)[0]?.id ?? null;
  pembuat = (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`)[0]?.id ?? null;
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM proker WHERE nama LIKE ${prefixProyek() + ' %'}`.catch(() => {});
    await sql.end();
  }
  sql = null;
});

test.beforeEach(async () => {
  // Tanpa DB (mis. worktree lane ui), SKIP sebelum login/seed/dereferensi sql —
  // seluruh test bergantung pada fixture DB. Ini mencegah `sql is not a function`.
  test.skip(!sql, 'Butuh DIRECT_URL/DATABASE_URL untuk fixture DB.');
  await sql!`DELETE FROM proker WHERE nama LIKE ${prefixProyek() + ' %'}`.catch(() => {});
});

/** Seed proker DISETUJUI + kunci kalender (lewat setujui_proker). Kembalikan id. */
async function seedDisetujui(nama: string, mulai: string, hm: string, hs: string): Promise<string> {
  const [p] = await sql!<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh, diajukan_at)
    VALUES (${periodeId}::uuid, ${deptA}::uuid, ${nama}, 'TERJADWAL', 'MENUNGGU_APPROVAL', '{}'::text[],
      ${mulai}::date, ${hm}::date, ${hs}::date, ${pembuat}::uuid, now())
    RETURNING id`;
  await sql!`SELECT setujui_proker(${p!.id}::uuid, ${pembuat}::uuid)`;
  return p!.id;
}

async function lockRentang(id: string): Promise<string | null> {
  const r = await sql!<{ rentang: string }[]>`SELECT rentang::text AS rentang FROM proker_lock WHERE proker_id=${id}::uuid`;
  return r[0]?.rentang ?? null;
}
async function status(id: string): Promise<string> {
  return (await sql!<{ status: string }[]>`SELECT status FROM proker WHERE id=${id}::uuid`)[0]!.status;
}

function skip(pesan: string): false {
  test.skip(true, pesan);
  return false;
}

async function login(page: Page, akun: AkunUji): Promise<boolean> {
  // Bersihkan sesi lebih dulu — test 3 berganti dari ADMIN (penyunting) ke KETUA
  // (penolak revisi); tanpa ini /login mengalihkan sesi lama dan form tak muncul.
  await page.context().clearCookies();
  const masuk = await page.goto('/login', { waitUntil: 'load' });
  if (!masuk || masuk.status() === 404) return skip('Halaman /login belum ada.');
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForLoadState('networkidle');
  return true;
}

/** Buka halaman edit; SKIP bila belum ada (T-071-UI). */
async function bukaEdit(page: Page, id: string): Promise<boolean> {
  const r = await page.goto(`/proker/${id}`, { waitUntil: 'load' });
  if (!r || r.status() === 404) return skip(`Halaman edit /proker/${id} belum ada (T-071-UI).`);
  const ada = await page
    .getByTestId('edit-simpan')
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  return ada ? true : skip('Halaman edit (edit-simpan) belum ada (T-071-UI).');
}

/**
 * Mengisi input tanggal (type=date) dengan andal. `.fill()` saja kadang tak
 * memicu onChange React kecuali field diinteraksi lebih dulu; klik lalu tunggu
 * nilainya benar-benar ter-commit (input terkontrol memantulkan state React).
 */
async function isiTanggal(page: Page, testid: string, nilai: string): Promise<void> {
  const field = page.getByTestId(testid);
  await field.click();
  await field.fill(nilai);
  await expect(field).toHaveValue(nilai);
}

// ---------------------------------------------------------------------------
// Selesai bila 1 — MINOR tidak memicu re-approval
// ---------------------------------------------------------------------------

test.describe('Selesai bila 1 — minor tetap DISETUJUI', () => {
  test('menyunting deskripsi tidak mengubah status maupun kunci', async ({ page }) => {
    if (!(await login(page, AKUN.admin))) return;
    const id = await seedDisetujui(`${prefixProyek()} Minor`, tgl('03-01'), tgl('04-01'), tgl('04-02'));
    const lockAwal = await lockRentang(id);
    if (!(await bukaEdit(page, id))) return;

    await page.getByTestId('edit-field-deskripsi').fill(`Deskripsi baru ${Date.now().toString(36)}`);
    await page.getByTestId('edit-simpan').click();
    await expect(page.getByTestId('edit-sukses')).toBeVisible({ timeout: 15_000 });

    expect(await status(id)).toBe('DISETUJUI');
    expect(await lockRentang(id)).toBe(lockAwal); // kunci tak tersentuh
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — MAYOR → revisi, kunci lama dipertahankan
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2 — mayor minta approval ulang, kunci lama tetap', () => {
  test('mengubah tanggal → MENUNGGU_APPROVAL_REVISI dengan kunci lama utuh', async ({ page }) => {
    if (!(await login(page, AKUN.admin))) return;
    const id = await seedDisetujui(`${prefixProyek()} Mayor`, tgl('05-01'), tgl('06-01'), tgl('06-02'));
    const lockAwal = await lockRentang(id);
    if (!(await bukaEdit(page, id))) return;

    await isiTanggal(page, 'edit-field-harih-selesai', tgl('06-05'));
    // Peringatan mayor muncul sebelum menyimpan (kontrak §4).
    await expect(page.getByTestId('edit-peringatan-mayor')).toBeVisible();
    await page.getByTestId('edit-simpan').click();
    await expect(page.getByTestId('edit-sukses')).toBeVisible({ timeout: 15_000 });

    expect(await status(id)).toBe('MENUNGGU_APPROVAL_REVISI');
    // INV-13: kunci LAMA dipertahankan, belum bergeser ke tanggal baru.
    expect(await lockRentang(id)).toBe(lockAwal);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 3 — revisi ditolak mengembalikan tanggal lama & kunci utuh
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — tolak revisi memulihkan tanggal lama', () => {
  test('penolakan revisi kembali ke tanggal lama, DISETUJUI, kunci lama tetap', async ({ page }) => {
    if (!(await login(page, AKUN.admin))) return;
    const id = await seedDisetujui(`${prefixProyek()} TolakRev`, tgl('07-01'), tgl('08-01'), tgl('08-02'));
    const lockAwal = await lockRentang(id);
    const hsLama = tgl('08-02');
    if (!(await bukaEdit(page, id))) return;

    // Ajukan revisi mayor.
    await isiTanggal(page, 'edit-field-harih-selesai', tgl('08-06'));
    await expect(page.getByTestId('edit-peringatan-mayor')).toBeVisible();
    await page.getByTestId('edit-simpan').click();
    await expect(page.getByTestId('edit-sukses')).toBeVisible({ timeout: 15_000 });
    expect(await status(id)).toBe('MENUNGGU_APPROVAL_REVISI');

    // Ketua menolak revisi di halaman approval detail.
    if (!(await login(page, AKUN.aktif))) return;
    const r = await page.goto(`/proker/approval/${id}`, { waitUntil: 'load' });
    const adaTolak = await page
      .getByTestId('approval-tolak')
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!r || !adaTolak, 'Halaman/aksi tolak revisi belum ada (T-070/T-071-UI).');

    await Promise.all([
      page.waitForResponse((x) => x.url().includes('/reject') && x.request().method() === 'POST', { timeout: 15_000 }),
      page.getByTestId('approval-tolak').click(),
    ]);

    // Tanggal lama pulih, status DISETUJUI, kunci lama tak pernah dilepas.
    const p = await sql!<{ hs: string; status: string }[]>`
      SELECT to_char(tanggal_hari_h_selesai,'YYYY-MM-DD') AS hs, status FROM proker WHERE id=${id}::uuid`;
    expect(p[0]!.hs).toBe(hsLama);
    expect(p[0]!.status).toBe('DISETUJUI');
    expect(await lockRentang(id)).toBe(lockAwal);
  });
});
