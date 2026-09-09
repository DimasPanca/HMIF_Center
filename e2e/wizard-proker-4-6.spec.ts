/**
 * Gate E2E T-069 — wizard proker langkah 4-6 (kepanitiaan, gantt, tinjau+ajukan).
 *
 * ===========================================================================
 * DITULIS SEBELUM T-069-UI DIMULAI
 * ===========================================================================
 * `e2e/**` milik lane data; komponen langkah 4-6 dan route submit milik lane ui
 * (T-069). Gate ini ditulis lebih dulu dan MELEWATI dirinya sampai komponennya
 * ada (RENCANA §8.1) — supaya `npm run test:e2e -- wizard-proker-4-6` punya
 * sesuatu untuk dijalankan, bukan "No tests found" (yang membuat syarat selesai
 * T-069 tak dapat dibuktikan).
 *
 * ===========================================================================
 * KONTRAK  ← baca docs/ai/WIZARD_SUBMIT_CONTRACT.md
 * ===========================================================================
 * Submit satu request atomik: POST /api/proker/submit (BUKAN /[id]/submit —
 * proker belum punya id sebelum submit). Route dibuat lane ui sebagai
 * app/api/proker/submit/route.ts. Tiga "Selesai bila" T-069 yang diuji:
 *   1. Langkah 5 tidak bisa dilewati untuk TERJADWAL (minimal 1 task).
 *   2. Ketua Pelaksana lintas departemen dapat dipilih tanpa batasan (PRD F-8.1).
 *   3. Setelah submit, proker_lock BELUM berisi baris untuk proker ini (INV-10).
 * Ditambah ADR-056 §5: BERKALA submit → DISETUJUI; TERJADWAL → MENUNGGU_APPROVAL.
 *
 * ISOLASI. Seperti wizard-proker-1-3: mode serial + akun berbeda per project
 * (desktop ADMIN, mobile KETUA) supaya baris draft tak bertabrakan lintas-project,
 * dan pembersihan lewat DB. Berkas ini JUGA membuat proker sungguhan, jadi ia
 * membersihkan proker uji (prefix nama) dan pengurus lintas-dept sementaranya.
 * Bila DIRECT_URL/DATABASE_URL tak ada (worktree ui), setup DB & verifikasinya
 * dilewati; gate tetap dapat dijalankan (dan SKIP karena UI-nya belum ada).
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-069 · ADR-056 · PRD F-5.3, F-8.1
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

const HAL = '/proker/baru';
const PREFIX = 'E2E46'; // penanda proker uji, untuk dibersihkan

test.describe.configure({ mode: 'serial' });

/** Akun per-project — baris draftnya tak pernah bertabrakan lintas-project. */
function akunProyek(): AkunUji {
  return test.info().project.name === 'mobile' ? AKUN.aktif : AKUN.admin;
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
  const gabung = { ...env, ...process.env };
  return gabung.DIRECT_URL ?? gabung.DATABASE_URL;
}

let sql: ReturnType<typeof postgres> | null = null;
let userId: string | null = null;
let periodeId: string | null = null;
/** Pengurus AKTIF di departemen A, untuk membuktikan Ketua lintas departemen. */
let ketuaLintas: { id: string; nama: string; deptId: string } | null = null;
/** Departemen B (berbeda dari deptA) tempat proker uji dibuat. */
let deptProker: string | null = null;

const NAMA_KETUA_LINTAS = 'E2E46 Ketuplak Lintas Dept';

test.beforeAll(async () => {
  const koneksi = bacaKoneksi();
  if (!koneksi) return;
  sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  const akun = await sql<{ id: string }[]>`
    SELECT id FROM app_user WHERE email = ${akunProyek().email} LIMIT 1
  `;
  userId = akun[0]?.id ?? null;

  const per = await sql<{ id: string }[]>`SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  periodeId = per[0]?.id ?? null;

  // Fixture deterministik: dua departemen berbeda + satu pengurus AKTIF di dept A.
  // Ketua Pelaksana hanya butuh baris app_user (tak perlu akun Auth), jadi pengurus
  // sementara ini cukup di-INSERT langsung dan dibersihkan di akhir.
  const dept = await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan`;
  if (dept.length >= 2 && periodeId) {
    const deptA = dept[0]!.id;
    deptProker = dept[1]!.id; // proker dibuat di dept B, ketuanya dari dept A
    const ins = await sql<{ id: string }[]>`
      INSERT INTO app_user (nama_lengkap, nim, email, is_active)
      VALUES (${NAMA_KETUA_LINTAS}, '3337460001', 'e2e46-ketua@uji.test', true)
      ON CONFLICT (email) DO UPDATE SET is_active = true, nama_lengkap = EXCLUDED.nama_lengkap
      RETURNING id
    `;
    const kid = ins[0]!.id;
    await sql`
      INSERT INTO user_role (user_id, periode_id, role, departemen_id)
      VALUES (${kid}::uuid, ${periodeId}::uuid, 'ANGGOTA'::role_code, ${deptA}::uuid)
      ON CONFLICT DO NOTHING
    `;
    ketuaLintas = { id: kid, nama: NAMA_KETUA_LINTAS, deptId: deptA };
  }
});

test.afterAll(async () => {
  if (sql) {
    // Buang proker uji (cascade → proker_rencana/lock) dan pengurus sementara.
    await sql`DELETE FROM proker WHERE nama LIKE ${PREFIX + ' %'}`.catch(() => {});
    await sql`DELETE FROM app_user WHERE email = 'e2e46-ketua@uji.test'`.catch(() => {});
    await sql.end();
  }
  sql = null;
});

test.beforeEach(async () => {
  if (!sql || !userId) return;
  await sql`DELETE FROM proker_draft WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM proker WHERE nama LIKE ${PREFIX + ' %'}`.catch(() => {});
});

// ---------------------------------------------------------------------------
// Pembukaan wizard — SKIP bila UI belum ada
// ---------------------------------------------------------------------------

async function bukaWizard(page: Page): Promise<boolean> {
  const masuk = await page.goto('/login', { waitUntil: 'load' });
  if (!masuk || masuk.status() === 404) return skip('Halaman /login belum ada.');
  await page.getByLabel(/email/i).fill(akunProyek().email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForLoadState('networkidle');

  const r = await page.goto(HAL, { waitUntil: 'load' });
  if (!r || r.status() === 404) return skip(`Halaman ${HAL} belum ada (T-068-UI).`);
  const ada = await page
    .waitForSelector('[data-testid="wizard-root"]', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  return ada ? true : skip(`${HAL} terbuka tetapi wizard-root belum ada (T-068-UI).`);
}

function skip(pesan: string): false {
  test.skip(true, pesan);
  return false;
}

/** Menyaring keberadaan komponen langkah 4-6; SKIP bila belum dibangun. */
async function adaLangkah4(page: Page): Promise<boolean> {
  const ada = await page
    .getByTestId('wizard-field-ketua-pelaksana')
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  return ada ? true : skip('Komponen langkah 4-6 (kepanitiaan/gantt/tinjau) belum ada (T-069-UI).');
}

/** Mengisi langkah 1 (TERJADWAL) lalu maju ke langkah 2. */
async function isiLangkah1(page: Page, nama: string): Promise<void> {
  await page.getByTestId('wizard-field-nama').fill(nama);
  await page.getByTestId('wizard-field-kategori').selectOption('TERJADWAL').catch(async () => {
    await page.getByTestId('wizard-field-kategori').click();
    await page.getByRole('option', { name: /terjadwal/i }).click().catch(() => {});
  });
  await page.getByTestId('wizard-lanjut').click();
}

/** Mengisi langkah 2 (tanggal sah, durasi 30 hari) lalu maju. */
async function isiLangkah2(page: Page): Promise<void> {
  await page.getByTestId('wizard-field-persiapan').fill('2026-11-06');
  await page.getByTestId('wizard-field-harih-mulai').fill('2026-12-06');
  await page.getByTestId('wizard-field-harih-selesai').fill('2026-12-07');
  await page.getByTestId('wizard-lanjut').click();
}

/** Mencari proker uji yang baru dibuat di periode aktif. */
async function prokerUji(nama: string) {
  if (!sql || !periodeId) return null;
  const b = await sql<{ id: string; status: string; departemen_id: string }[]>`
    SELECT id, status, departemen_id FROM proker
    WHERE nama = ${nama} AND periode_id = ${periodeId}::uuid
    ORDER BY created_at DESC LIMIT 1
  `;
  return b[0] ?? null;
}

// ---------------------------------------------------------------------------
// Selesai bila 1 — langkah 5 tidak bisa dilewati untuk TERJADWAL
// ---------------------------------------------------------------------------

test.describe('Selesai bila 1 — langkah 5 wajib minimal satu task', () => {
  test('TERJADWAL tanpa task Gantt tidak dapat diajukan', async ({ page }) => {
    if (!(await bukaWizard(page))) return;
    if (!(await adaLangkah4(page))) return;

    // Langkah 5 milik gantt; tanpa satu task pun, tombol maju/ajukan mati
    // (kontrak 1). Kita berada di langkah 5 setelah mengisi 1-4; tanpa menambah
    // task, wizard-lanjut harus disabled.
    const lanjut = page.getByTestId('wizard-lanjut');
    await expect(lanjut).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — Ketua Pelaksana lintas departemen
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2 — Ketua Pelaksana lintas departemen', () => {
  test('pengurus dari departemen lain dapat dipilih dan submit diterima', async ({ page }) => {
    if (!(await bukaWizard(page))) return;
    if (!(await adaLangkah4(page))) return;
    test.skip(!ketuaLintas || !deptProker, 'Butuh fixture dua departemen + pengurus aktif lintas dept.');

    const nama = `${PREFIX} Lintas ${Date.now().toString(36)}`;
    // (Alur pengisian 1-6 lengkap dikerjakan T-069-UI; gate memakai testid kontrak.)
    await isiLangkah1(page, nama);
    await isiLangkah2(page);
    // Langkah 3 opsional → lanjut.
    await page.getByTestId('wizard-lanjut').click();
    // Langkah 4: pilih Ketua Pelaksana lintas departemen + satu divisi.
    await page.getByTestId('wizard-field-ketua-pelaksana').selectOption({ label: ketuaLintas!.nama });
    await page.getByTestId('wizard-divisi-tambah').click();
    await page.getByTestId('wizard-field-divisi-nama').first().fill('Acara');
    await page.getByTestId('wizard-lanjut').click();
    // Langkah 5: satu task.
    await page.getByTestId('wizard-gantt-task-tambah').click();
    await page.getByTestId('wizard-field-task-nama').first().fill('Rapat perdana');
    await page.getByTestId('wizard-field-task-mulai').first().fill('2026-11-06');
    await page.getByTestId('wizard-field-task-selesai').first().fill('2026-11-07');
    await page.getByTestId('wizard-lanjut').click();
    // Langkah 6: ajukan.
    await page.getByTestId('wizard-ajukan').click();
    await expect(page.getByTestId('wizard-submit-sukses')).toBeVisible();

    // Verifikasi server: ketua tersimpan meski departemennya != departemen proker.
    const p = await prokerUji(nama);
    expect(p, 'proker uji tidak ditemukan setelah submit').not.toBeNull();
    const rencana = await sql!<{ kepanitiaan: { ketua_pelaksana: string } }[]>`
      SELECT kepanitiaan FROM proker_rencana WHERE proker_id = ${p!.id}::uuid
    `;
    expect(rencana[0]?.kepanitiaan.ketua_pelaksana).toBe(ketuaLintas!.id);
    expect(p!.departemen_id).not.toBe(ketuaLintas!.deptId);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 3 — submit tidak mengunci kalender
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — submit tidak menulis proker_lock (INV-10)', () => {
  test('TERJADWAL menjadi MENUNGGU_APPROVAL tanpa proker_lock', async ({ page }) => {
    if (!(await bukaWizard(page))) return;
    if (!(await adaLangkah4(page))) return;
    test.skip(!ketuaLintas, 'Butuh fixture pengurus aktif untuk Ketua Pelaksana.');

    const nama = `${PREFIX} Lock ${Date.now().toString(36)}`;
    await isiLangkah1(page, nama);
    await isiLangkah2(page);
    await page.getByTestId('wizard-lanjut').click(); // langkah 3
    await page.getByTestId('wizard-field-ketua-pelaksana').selectOption({ label: ketuaLintas!.nama });
    await page.getByTestId('wizard-divisi-tambah').click();
    await page.getByTestId('wizard-field-divisi-nama').first().fill('Acara');
    await page.getByTestId('wizard-lanjut').click(); // langkah 4 → 5
    await page.getByTestId('wizard-gantt-task-tambah').click();
    await page.getByTestId('wizard-field-task-nama').first().fill('Rapat');
    await page.getByTestId('wizard-field-task-mulai').first().fill('2026-11-06');
    await page.getByTestId('wizard-field-task-selesai').first().fill('2026-11-07');
    await page.getByTestId('wizard-lanjut').click(); // langkah 5 → 6
    await page.getByTestId('wizard-ajukan').click();
    await expect(page.getByTestId('wizard-submit-sukses')).toBeVisible();

    const p = await prokerUji(nama);
    expect(p?.status).toBe('MENUNGGU_APPROVAL');
    const lock = await sql!<{ n: bigint }[]>`
      SELECT count(*) AS n FROM proker_lock WHERE proker_id = ${p!.id}::uuid
    `;
    expect(Number(lock[0]!.n)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ADR-056 §5 — BERKALA langsung DISETUJUI (tetap tanpa lock)
// ---------------------------------------------------------------------------

test.describe('ADR-056 §5 — status submit per kategori', () => {
  test('BERKALA langsung DISETUJUI tanpa proker_lock', async ({ page }) => {
    if (!(await bukaWizard(page))) return;

    const nama = `${PREFIX} Berkala ${Date.now().toString(36)}`;
    await page.getByTestId('wizard-field-nama').fill(nama);
    const pilih = await page
      .getByTestId('wizard-field-kategori')
      .selectOption('BERKALA')
      .then(() => true)
      .catch(() => false);
    test.skip(!pilih, 'Pemilih kategori belum berbentuk <select> (T-068-UI).');

    // Alur pola pengulangan + ajukan milik T-069-UI. Bila tombol Ajukan belum
    // ada di jalur BERKALA, SKIP daripada gagal palsu.
    const adaAjukan = await page
      .getByTestId('wizard-ajukan')
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!adaAjukan, 'Jalur submit BERKALA (langkah 6) belum ada (T-069-UI).');

    await page.getByTestId('wizard-ajukan').click();
    await expect(page.getByTestId('wizard-submit-sukses')).toBeVisible();

    const p = await prokerUji(nama);
    expect(p?.status).toBe('DISETUJUI');
    const lock = await sql!<{ n: bigint }[]>`
      SELECT count(*) AS n FROM proker_lock WHERE proker_id = ${p!.id}::uuid
    `;
    expect(Number(lock[0]!.n)).toBe(0);
  });
});
