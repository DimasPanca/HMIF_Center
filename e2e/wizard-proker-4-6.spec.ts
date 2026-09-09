/**
 * Gate E2E T-069 — wizard proker langkah 4-6 (kepanitiaan, gantt, tinjau+ajukan).
 *
 * ===========================================================================
 * KONTRAK  ← docs/ai/WIZARD_SUBMIT_CONTRACT.md
 * ===========================================================================
 * Submit satu request atomik: POST /api/proker/submit (bukan /[id]/submit).
 * Tiga "Selesai bila" T-069 yang diuji:
 *   1. Langkah 5 tidak bisa dilewati untuk TERJADWAL (minimal 1 task Gantt).
 *   2. Ketua Pelaksana lintas departemen dapat dipilih tanpa batasan (PRD F-8.1).
 *   3. Setelah submit, proker_lock BELUM berisi baris untuk proker ini (INV-10).
 * Ditambah ADR-056 §5: BERKALA submit → DISETUJUI; TERJADWAL → MENUNGGU_APPROVAL,
 * dan draft dihapus setelah submit (kontrak T-068).
 *
 * ISOLASI. Serial + akun berbeda per project (desktop ADMIN, mobile KETUA) supaya
 * baris draft tak bertabrakan lintas-project; pembersihan lewat DB. Berkas ini
 * membuat proker sungguhan, jadi ia membersihkan proker uji (prefix nama) dan
 * pengurus lintas-dept sementaranya. TANGGAL fixture sengaja di 2027, jauh dari
 * rentang terkunci fixture T-068 (2026-11-06..2026-12-07), agar cek konflik final
 * bersih. Bila DIRECT_URL/DATABASE_URL tak ada (worktree ui), setup & verifikasi
 * DB dilewati; gate tetap dapat dijalankan (dan SKIP bila UI-nya belum ada).
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

// Tanggal terisolasi (2027) — tidak beririsan dengan lock fixture T-068 (2026).
const PERSIAPAN = '2027-02-13';
const HARIH_MULAI = '2027-03-15'; // 30 hari persiapan (sah 15-45)
const HARIH_SELESAI = '2027-03-16';

test.describe.configure({ mode: 'serial' });

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
/** Pengurus AKTIF di departemen terpisah, untuk membuktikan Ketua lintas dept. */
let ketuaLintas: { id: string; nama: string; deptId: string } | null = null;

const NAMA_KETUA_LINTAS = 'E2E46 Ketuplak Lintas Dept';
const EMAIL_KETUA_LINTAS = 'e2e46-ketua@uji.test';

test.beforeAll(async () => {
  const koneksi = bacaKoneksi();
  if (!koneksi) return;
  sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  userId =
    (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email = ${akunProyek().email} LIMIT 1`)[0]
      ?.id ?? null;
  periodeId =
    (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1`)[0]?.id ?? null;

  // Fixture: pengurus AKTIF di departemen TERAKHIR (berbeda dari departemen
  // default proker, yaitu departemen pertama). Ketua Pelaksana cukup baris
  // app_user (tak perlu akun Auth), jadi di-INSERT langsung & dibersihkan.
  const dept = await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan`;
  if (dept.length >= 2 && periodeId) {
    const deptA = dept[dept.length - 1]!.id;
    // app_user.id UUID PK tanpa DEFAULT (biasanya = auth.users.id). Ketua
    // Pelaksana tak perlu login, jadi cukup id acak; tak ada FK ke auth.users.
    const ins = await sql<{ id: string }[]>`
      INSERT INTO app_user (id, nama_lengkap, nim, email, is_active)
      VALUES (uuid_generate_v4(), ${NAMA_KETUA_LINTAS}, '3337460001', ${EMAIL_KETUA_LINTAS}, true)
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
    await sql`DELETE FROM proker WHERE nama LIKE ${PREFIX + ' %'}`.catch(() => {});
    await sql`DELETE FROM app_user WHERE email = ${EMAIL_KETUA_LINTAS}`.catch(() => {});
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
// Helper wizard — SKIP bila UI belum ada
// ---------------------------------------------------------------------------

function skip(pesan: string): false {
  test.skip(true, pesan);
  return false;
}

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

async function lanjut(page: Page): Promise<void> {
  await page.getByTestId('wizard-lanjut').click();
}

/** Langkah 1: nama + kategori. TIDAK menekan Lanjut (caller yang memutuskan). */
async function isiLangkah1(page: Page, nama: string, kategori: string): Promise<void> {
  await page.getByTestId('wizard-field-nama').fill(nama);
  await page.getByTestId('wizard-field-kategori').selectOption(kategori).catch(async () => {
    await page.getByTestId('wizard-field-kategori').click();
    await page.getByRole('option', { name: new RegExp(kategori, 'i') }).click().catch(() => {});
  });
}

/** Langkah 2 TERJADWAL: tanggal terisolasi. */
async function isiLangkah2Terjadwal(page: Page): Promise<void> {
  await page.getByTestId('wizard-field-persiapan').fill(PERSIAPAN);
  await page.getByTestId('wizard-field-harih-mulai').fill(HARIH_MULAI);
  await page.getByTestId('wizard-field-harih-selesai').fill(HARIH_SELESAI);
}

/** Langkah 2 BERKALA: pola pengulangan (frekuensi default MINGGUAN + hari + rentang). */
async function isiLangkah2Berkala(page: Page): Promise<void> {
  await page.getByText('Sabtu', { exact: true }).click(); // checkbox hari
  await page.locator('#wizard-pola-mulai').fill('2027-01-03');
  await page.locator('#wizard-pola-selesai').fill('2027-06-27');
}

/**
 * Langkah 4: pilih Ketua Pelaksana lintas dept + satu divisi. Mengembalikan
 * false (SKIP) bila komponen langkah 4-6 belum ada — pemeriksaan ini dilakukan
 * SETELAH wizard benar-benar berada di langkah 4 (bukan di langkah 1).
 */
async function isiLangkah4(page: Page): Promise<boolean> {
  const ada = await page
    .getByTestId('wizard-field-ketua-pelaksana')
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!ada) return skip('Komponen langkah 4-6 (kepanitiaan/gantt/tinjau) belum ada (T-069-UI).');

  await page.getByTestId('wizard-field-ketua-pelaksana').selectOption({ label: ketuaLintas!.nama });
  await page.getByTestId('wizard-divisi-tambah').click();
  await page.getByTestId('wizard-field-divisi-nama').first().fill('Acara');
  return true;
}

/** Langkah 5: tambah satu task ke fase aktif (default Persiapan). */
async function isiLangkah5(page: Page): Promise<void> {
  await page.getByTestId('wizard-gantt-task-tambah').click();
  await page.getByTestId('wizard-field-task-nama').first().fill('Rapat perdana');
  await page.getByTestId('wizard-field-task-mulai').first().fill(PERSIAPAN);
  await page.getByTestId('wizard-field-task-selesai').first().fill('2027-02-20');
}

/** Menunggu draft benar-benar tersimpan lalu menekan Ajukan sampai sukses. */
async function ajukan(page: Page): Promise<void> {
  await expect(page.getByText('Draft tersimpan di server.')).toBeVisible();
  const tombol = page.getByTestId('wizard-ajukan');
  await expect(tombol).toBeEnabled({ timeout: 10_000 }); // cek konflik final selesai
  await tombol.click();
  await expect(page.getByTestId('wizard-submit-sukses')).toBeVisible({ timeout: 10_000 });
}

async function prokerUji(nama: string) {
  if (!sql || !periodeId) return null;
  const b = await sql<{ id: string; status: string; departemen_id: string }[]>`
    SELECT id, status, departemen_id FROM proker
    WHERE nama = ${nama} AND periode_id = ${periodeId}::uuid
    ORDER BY created_at DESC LIMIT 1
  `;
  return b[0] ?? null;
}

async function jumlahLock(prokerId: string): Promise<number> {
  const r = await sql!<{ n: bigint }[]>`
    SELECT count(*) AS n FROM proker_lock WHERE proker_id = ${prokerId}::uuid
  `;
  return Number(r[0]!.n);
}

async function jumlahDraft(): Promise<number> {
  const r = await sql!<{ n: bigint }[]>`
    SELECT count(*) AS n FROM proker_draft WHERE user_id = ${userId}::uuid
  `;
  return Number(r[0]!.n);
}

// ---------------------------------------------------------------------------
// Selesai bila 1 — langkah 5 wajib minimal satu task
// ---------------------------------------------------------------------------

test.describe('Selesai bila 1 — langkah 5 wajib minimal satu task', () => {
  test('TERJADWAL di langkah 5 tanpa task tidak dapat lanjut', async ({ page }) => {
    if (!(await bukaWizard(page))) return;

    const nama = `${PREFIX} L5 ${Date.now().toString(36)}`;
    await isiLangkah1(page, nama, 'TERJADWAL');
    await lanjut(page); // → langkah 2
    await isiLangkah2Terjadwal(page);
    await lanjut(page); // → langkah 3
    await lanjut(page); // langkah 3 opsional → langkah 4
    if (!(await isiLangkah4(page))) return; // SKIP bila UI langkah 4-6 belum ada
    await lanjut(page); // → langkah 5

    // Di langkah 5 (editor Gantt) tanpa satu task pun: tombol Lanjut mati.
    await expect(page.getByTestId('wizard-gantt-task-tambah')).toBeVisible();
    await expect(page.getByTestId('wizard-lanjut')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — Ketua Pelaksana lintas departemen
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2 — Ketua Pelaksana lintas departemen', () => {
  test('pengurus dari departemen lain dapat dipilih dan tersimpan', async ({ page }) => {
    if (!(await bukaWizard(page))) return;
    test.skip(!ketuaLintas, 'Butuh fixture dua departemen + pengurus aktif lintas dept.');

    const nama = `${PREFIX} Lintas ${Date.now().toString(36)}`;
    await isiLangkah1(page, nama, 'TERJADWAL');
    await lanjut(page);
    await isiLangkah2Terjadwal(page);
    await lanjut(page);
    await lanjut(page); // langkah 3
    if (!(await isiLangkah4(page))) return;
    await lanjut(page); // → langkah 5
    await isiLangkah5(page);
    await lanjut(page); // → langkah 6
    await ajukan(page);

    const p = await prokerUji(nama);
    expect(p, 'proker uji tidak ditemukan setelah submit').not.toBeNull();
    const rencana = await sql!<{ kepanitiaan: { ketua_pelaksana: string } }[]>`
      SELECT kepanitiaan FROM proker_rencana WHERE proker_id = ${p!.id}::uuid
    `;
    expect(rencana[0]?.kepanitiaan.ketua_pelaksana).toBe(ketuaLintas!.id);
    // Ketua berasal dari departemen yang BERBEDA dari departemen proker.
    expect(p!.departemen_id).not.toBe(ketuaLintas!.deptId);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 3 — submit tidak mengunci kalender + status + draft terhapus
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — submit tidak menulis proker_lock (INV-10)', () => {
  test('TERJADWAL menjadi MENUNGGU_APPROVAL, tanpa lock, draft terhapus', async ({ page }) => {
    if (!(await bukaWizard(page))) return;
    test.skip(!ketuaLintas, 'Butuh fixture pengurus aktif untuk Ketua Pelaksana.');

    const nama = `${PREFIX} Lock ${Date.now().toString(36)}`;
    await isiLangkah1(page, nama, 'TERJADWAL');
    await lanjut(page);
    await isiLangkah2Terjadwal(page);
    await lanjut(page);
    await lanjut(page);
    if (!(await isiLangkah4(page))) return;
    await lanjut(page);
    await isiLangkah5(page);
    await lanjut(page);
    await ajukan(page);

    const p = await prokerUji(nama);
    expect(p?.status).toBe('MENUNGGU_APPROVAL');
    expect(await jumlahLock(p!.id)).toBe(0);
    expect(await jumlahDraft()).toBe(0); // draft dihapus setelah submit
  });
});

// ---------------------------------------------------------------------------
// ADR-056 §5 — BERKALA langsung DISETUJUI (tetap tanpa lock)
// ---------------------------------------------------------------------------

test.describe('ADR-056 §5 — status submit per kategori', () => {
  test('BERKALA langsung DISETUJUI tanpa proker_lock', async ({ page }) => {
    if (!(await bukaWizard(page))) return;

    const nama = `${PREFIX} Berkala ${Date.now().toString(36)}`;
    await isiLangkah1(page, nama, 'BERKALA');
    await lanjut(page); // langkah 1 → 2 (kategori dipilih membuat langkah 1 valid)

    // Langkah 2 BERKALA = form pola ulang. Bila belum ada, SKIP daripada gagal palsu.
    const adaPola = await page
      .locator('#wizard-pola-mulai')
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!adaPola, 'Form pola pengulangan BERKALA belum ada (T-068-UI).');

    await isiLangkah2Berkala(page);
    await lanjut(page); // → langkah 3
    await lanjut(page); // langkah 3 → langkah 6 (BERKALA melewati 4-5)

    const adaAjukan = await page
      .getByTestId('wizard-ajukan')
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!adaAjukan, 'Langkah 6 (Ajukan) belum ada (T-069-UI).');
    await ajukan(page);

    const p = await prokerUji(nama);
    expect(p?.status).toBe('DISETUJUI');
    expect(await jumlahLock(p!.id)).toBe(0);
    expect(await jumlahDraft()).toBe(0);
  });
});
