/**
 * Gate integrasi E2E T-053 — audit log viewer.
 *
 * ===========================================================================
 * KONTRAK ← docs/ai/tasks/P1-fondasi.md T-053 · PRD M15 · SYSTEM_DESIGN §4.11
 * ===========================================================================
 *   1. Akses: role global ber-`audit.read` melihat semua; role tanpa hak
 *      ditolak; Kadept (R*) hanya melihat entitas departemennya.
 *   2. Filter user, entitas, tindakan, rentang tanggal.
 *   3. Paginasi berbasis CURSOR (bukan offset) — tabel akan besar.
 *   4. Ekspor CSV mengikuti filter aktif.
 *   5. Detail menampilkan nilai_lama vs nilai_baru; field berubah disorot.
 *   6. UI tidak punya aksi ubah/hapus (INV-06); dan UPDATE/DELETE/TRUNCATE
 *      langsung ke audit_log ditolak database.
 *
 * ===========================================================================
 * ISOLASI — MARKER PER-RUN
 * ===========================================================================
 * audit_log APPEND-ONLY: baris seed tak bisa dihapus (justru itu yang diuji).
 * Agar asersi tetap deterministik di DB bersama & lintas-project paralel, tiap
 * jalan memakai marker `entitas` unik (project + timestamp); seluruh filter
 * mengunci ke marker itu. Baris menumpuk sedikit demi sedikit — konsekuensi
 * wajar append-only, semuanya bertanda `e2e53*`.
 *
 * Tanpa DIRECT_URL/DATABASE_URL (worktree ui) seluruh test SKIP.
 * Serial: satu worker per project → beforeAll (seed) sekali per project.
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

const HAL = '/admin/audit';
const API = '/api/audit';

// Tanggal seed yang berjauhan agar filter rentang tanggal deterministik.
const TS_LAMA = '2019-03-10 05:00:00+07';
const TS_BARU = '2021-08-20 05:00:00+07';

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
let adminId: string | null = null;
let kadeptDept: string | null = null;
let otherDept: string | null = null;

// Marker per-run (diisi di beforeAll — butuh nama project).
let E1 = '';
let E2 = '';
let ESCOPE = '';
let EINV = '';
let idR1 = ''; // baris E1 dengan perubahan field (untuk uji detail)

async function seedAudit(baris: {
  entitas: string;
  aksi: string;
  userId?: string | null;
  createdAt?: string | null;
  nilaiLama?: unknown;
  nilaiBaru?: unknown;
  entitasId?: string | null;
}): Promise<string> {
  const [r] = await sql!<{ id: string }[]>`
    INSERT INTO audit_log (user_id, periode_id, aksi, entitas, entitas_id, nilai_lama, nilai_baru, created_at)
    VALUES (
      ${baris.userId ?? null}::uuid,
      NULL,
      ${baris.aksi},
      ${baris.entitas},
      ${baris.entitasId ?? null},
      ${baris.nilaiLama == null ? null : sql!.json(baris.nilaiLama as never)},
      ${baris.nilaiBaru == null ? null : sql!.json(baris.nilaiBaru as never)},
      ${baris.createdAt ?? new Date().toISOString()}::timestamptz
    )
    RETURNING id::text AS id`;
  return r!.id;
}

test.beforeAll(async () => {
  const k = bacaKoneksi();
  if (!k) return;
  sql = postgres(k, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  adminId = (await sql<{ id: string }[]>`SELECT id::text AS id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`)[0]?.id ?? null;
  const per = (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`)[0]?.id ?? null;
  kadeptDept =
    (
      await sql<{ id: string }[]>`
        SELECT ur.departemen_id::text AS id FROM user_role ur
        JOIN app_user u ON u.id = ur.user_id
        WHERE u.email=${AKUN.kadept.email} AND ur.role='KADEPT' AND ur.periode_id=${per}::uuid
        LIMIT 1`
    )[0]?.id ?? null;
  otherDept =
    (
      await sql<{ id: string }[]>`
        SELECT id::text AS id FROM departemen WHERE id::text <> ${kadeptDept} ORDER BY urutan LIMIT 1`
    )[0]?.id ?? null;

  if (!adminId) {
    await sql.end();
    sql = null;
    return;
  }

  const run = `${test.info().project.name}-${Date.now().toString(36)}`;
  E1 = `e2e53a-${run}`;
  E2 = `e2e53b-${run}`;
  ESCOPE = `e2e53s-${run}`;
  EINV = `e2e53x-${run}`;

  // E1 — 4 baris: 2 CREATE (admin, lama), 1 DELETE (admin, lama), 1 UPDATE (sistem, baru).
  idR1 = await seedAudit({
    entitas: E1,
    aksi: 'CREATE',
    userId: adminId,
    createdAt: TS_LAMA,
    nilaiLama: { status: 'DRAFT', catatan: 'awal' },
    nilaiBaru: { status: 'DISETUJUI', catatan: 'awal' },
  });
  await seedAudit({ entitas: E1, aksi: 'CREATE', userId: adminId, createdAt: TS_LAMA });
  await seedAudit({ entitas: E1, aksi: 'DELETE', userId: adminId, createdAt: TS_LAMA });
  await seedAudit({ entitas: E1, aksi: 'UPDATE', userId: null, createdAt: TS_BARU });

  // E2 — 2 baris (untuk membuktikan filter entitas menyaring).
  await seedAudit({ entitas: E2, aksi: 'CREATE', userId: adminId });
  await seedAudit({ entitas: E2, aksi: 'CREATE', userId: adminId });

  // Scope — 1 baris di departemen Kadept, 1 di departemen lain.
  if (kadeptDept) {
    await seedAudit({ entitas: ESCOPE, aksi: 'UPDATE', userId: adminId, nilaiBaru: { departemen_id: kadeptDept } });
  }
  if (otherDept) {
    await seedAudit({ entitas: ESCOPE, aksi: 'UPDATE', userId: adminId, nilaiBaru: { departemen_id: otherDept } });
  }
});

test.afterAll(async () => {
  if (sql) await sql.end();
  sql = null;
});

test.beforeEach(() => {
  if (!sql || !adminId) test.skip(true, 'Butuh DIRECT_URL/DATABASE_URL untuk menyemai audit_log.');
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  // Tunggu redirect keluar dari /login — memastikan sesi benar-benar terpasang
  // sebelum navigasi berikutnya (networkidle bisa selesai saat POST masih jalan).
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function bukaViewer(page: Page, akun: AkunUji): Promise<void> {
  await masuk(page, akun);
  await page.goto(HAL, { waitUntil: 'load' });
  await expect(page.getByTestId('audit-viewer')).toBeVisible();
}

const baris = (page: Page) => page.locator('[data-testid^="audit-row-"]');

async function terapkan(
  page: Page,
  f: { entitas?: string; aksi?: string; user?: string; dari?: string; sampai?: string },
): Promise<void> {
  // Opsi dropdown baru terisi setelah fetch awal (pilihan). Tunggu opsi yang
  // dituju hadir dulu agar selectOption tak balapan dengan pemuatan.
  const entitasSel = page.getByTestId('audit-filter-entitas');
  if (f.entitas) {
    await expect(entitasSel.locator(`option[value="${f.entitas}"]`)).toBeAttached({ timeout: 15_000 });
  }
  await entitasSel.selectOption(f.entitas ?? '');

  const aksiSel = page.getByTestId('audit-filter-aksi');
  if (f.aksi) {
    await expect(aksiSel.locator(`option[value="${f.aksi}"]`)).toBeAttached({ timeout: 15_000 });
  }
  await aksiSel.selectOption(f.aksi ?? '');

  await page.getByTestId('audit-filter-user').selectOption(f.user ?? '');
  await page.getByTestId('audit-filter-dari').fill(f.dari ?? '');
  await page.getByTestId('audit-filter-sampai').fill(f.sampai ?? '');
  await page.getByTestId('audit-filter-terapkan').click();
}

// ---------------------------------------------------------------------------
// 1a — role global ber-audit.read melihat viewer
// ---------------------------------------------------------------------------

test('ADMIN (role global audit.read) membuka audit viewer', async ({ page }) => {
  await bukaViewer(page, AKUN.admin);
  await terapkan(page, { entitas: E1 });
  await expect(baris(page)).toHaveCount(4);
});

// ---------------------------------------------------------------------------
// 1b — role tanpa hak ditolak (halaman 404 + API 403)
// ---------------------------------------------------------------------------

test('ANGGOTA (tanpa audit.read) ditolak: halaman 404 dan API 403', async ({ page }) => {
  await masuk(page, AKUN.anggota);
  const resp = await page.goto(HAL, { waitUntil: 'load' });
  // Sudah login sebagai ANGGOTA (bukan redirect ke /login) → halaman menolak
  // dengan notFound (404), dan konten audit tak pernah tampil.
  expect(page.url(), 'tetap di /admin/audit, bukan dialihkan ke /login').toContain('/admin/audit');
  expect(resp?.status(), 'halaman audit → 404 (notFound)').toBe(404);
  await expect(page.getByTestId('audit-viewer')).toHaveCount(0);
  await expect(page.getByTestId('audit-page')).toHaveCount(0);

  const api = await page.request.get(API);
  expect(api.status(), 'API audit → 403').toBe(403);
  const body = (await api.json()) as { ok: boolean };
  expect(body.ok).toBe(false);
});

// ---------------------------------------------------------------------------
// 1c — Kadept hanya melihat entitas departemennya
// ---------------------------------------------------------------------------

test('KADEPT hanya melihat entitas departemennya', async ({ page }) => {
  test.skip(!kadeptDept || !otherDept, 'Butuh dua departemen untuk membedakan lingkup.');

  // ADMIN (global) melihat kedua baris scope.
  await masuk(page, AKUN.admin);
  const resAdmin = await page.request.get(`${API}?entitas=${encodeURIComponent(ESCOPE)}`);
  expect(resAdmin.status()).toBe(200);
  const bodyAdmin = (await resAdmin.json()) as { data: { items: { nilai_baru: { departemen_id?: string } }[] } };
  expect(bodyAdmin.data.items.length, 'ADMIN melihat kedua baris scope').toBe(2);

  // KADEPT hanya melihat baris departemennya.
  await masuk(page, AKUN.kadept);
  const resKadept = await page.request.get(`${API}?entitas=${encodeURIComponent(ESCOPE)}`);
  expect(resKadept.status()).toBe(200);
  const bodyKadept = (await resKadept.json()) as {
    data: { items: { nilai_baru: { departemen_id?: string } }[] };
  };
  expect(bodyKadept.data.items.length, 'KADEPT hanya melihat 1 baris (departemennya)').toBe(1);
  expect(bodyKadept.data.items[0]!.nilai_baru.departemen_id).toBe(kadeptDept);
});

// ---------------------------------------------------------------------------
// 2 — filter user, entitas, tindakan, rentang tanggal
// ---------------------------------------------------------------------------

test('filter pengguna, entitas, tindakan, dan rentang tanggal', async ({ page }) => {
  await bukaViewer(page, AKUN.admin);

  // entitas — E1 (4) vs E2 (2)
  await terapkan(page, { entitas: E1 });
  await expect(baris(page)).toHaveCount(4);
  await terapkan(page, { entitas: E2 });
  await expect(baris(page)).toHaveCount(2);

  // tindakan — E1 + DELETE = 1
  await terapkan(page, { entitas: E1, aksi: 'DELETE' });
  await expect(baris(page)).toHaveCount(1);

  // pengguna — E1 + sistem (user NULL) = 1
  await terapkan(page, { entitas: E1, user: 'sistem' });
  await expect(baris(page)).toHaveCount(1);

  // rentang tanggal — E1 sejak 2021 = 1 (baris TS_BARU); hingga 2019 = 3 (baris TS_LAMA)
  await terapkan(page, { entitas: E1, dari: '2021-01-01' });
  await expect(baris(page)).toHaveCount(1);
  await terapkan(page, { entitas: E1, sampai: '2019-12-31' });
  await expect(baris(page)).toHaveCount(3);
});

// ---------------------------------------------------------------------------
// 3 — paginasi berbasis cursor (bukan offset)
// ---------------------------------------------------------------------------

test('paginasi memakai cursor, bukan offset', async ({ page }) => {
  await masuk(page, AKUN.admin);

  const res1 = await page.request.get(`${API}?entitas=${encodeURIComponent(E1)}&limit=2`);
  const b1 = (await res1.json()) as { data: { items: { id: string }[]; next_cursor: string | null } };
  expect(b1.data.items.length).toBe(2);
  expect(b1.data.next_cursor, 'ada cursor halaman berikutnya').toBeTruthy();

  // Cursor adalah token opak {createdAt,id} base64url — BUKAN angka offset.
  const dikodekan = JSON.parse(Buffer.from(b1.data.next_cursor!, 'base64url').toString('utf8')) as {
    createdAt?: unknown;
    id?: unknown;
  };
  expect(typeof dikodekan.createdAt).toBe('string');
  expect(typeof dikodekan.id).toBe('string');

  // Halaman 2 lewat cursor → 2 baris sisanya, id disjoint dari halaman 1.
  const res2 = await page.request.get(
    `${API}?entitas=${encodeURIComponent(E1)}&limit=2&cursor=${encodeURIComponent(b1.data.next_cursor!)}`,
  );
  const b2 = (await res2.json()) as { data: { items: { id: string }[]; next_cursor: string | null } };
  expect(b2.data.items.length).toBe(2);
  expect(b2.data.next_cursor, 'tak ada halaman ketiga').toBeNull();
  const id1 = new Set(b1.data.items.map((x) => x.id));
  expect(b2.data.items.some((x) => id1.has(x.id)), 'halaman 2 tak menumpuk halaman 1').toBe(false);

  // Bukti bukan offset: parameter offset tak berpengaruh → sama dengan halaman 1.
  const resOffset = await page.request.get(`${API}?entitas=${encodeURIComponent(E1)}&limit=2&offset=2`);
  const bOffset = (await resOffset.json()) as { data: { items: { id: string }[] } };
  expect(bOffset.data.items.map((x) => x.id)).toEqual(b1.data.items.map((x) => x.id));
});

// ---------------------------------------------------------------------------
// 4 — ekspor CSV mengikuti filter aktif
// ---------------------------------------------------------------------------

test('ekspor CSV mengikuti filter aktif', async ({ page }) => {
  await masuk(page, AKUN.admin);

  const semua = await page.request.get(`${API}?entitas=${encodeURIComponent(E1)}&format=csv`);
  expect(semua.status()).toBe(200);
  expect(semua.headers()['content-type']).toContain('text/csv');
  const teksSemua = await semua.text();
  const barisSemua = teksSemua.replace(/^﻿/, '').split('\r\n').filter((l) => l.length > 0);
  expect(barisSemua.length - 1, 'E1 → 4 baris data + 1 header').toBe(4);

  // Filter aktif diikuti: E1 + DELETE → hanya 1 baris data.
  const filtered = await page.request.get(
    `${API}?entitas=${encodeURIComponent(E1)}&aksi=DELETE&format=csv`,
  );
  const teksFiltered = await filtered.text();
  const barisFiltered = teksFiltered.replace(/^﻿/, '').split('\r\n').filter((l) => l.length > 0);
  expect(barisFiltered.length - 1, 'E1 + DELETE → 1 baris data').toBe(1);
  expect(teksFiltered).toContain(E1);
  expect(teksFiltered).toContain('DELETE');
});

// ---------------------------------------------------------------------------
// 5 — detail nilai lama/baru + tak ada aksi ubah/hapus
// ---------------------------------------------------------------------------

test('detail menampilkan nilai lama vs baru; UI tanpa aksi ubah/hapus', async ({ page }) => {
  await bukaViewer(page, AKUN.admin);

  // Tak ada kontrol ubah/hapus di seluruh viewer (INV-06).
  await expect(page.getByRole('button', { name: /hapus|edit|ubah|delete/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /hapus|edit|ubah|delete/i })).toHaveCount(0);

  await terapkan(page, { entitas: E1 });
  await expect(baris(page)).toHaveCount(4);

  await page.getByTestId(`audit-detail-${idR1}`).click();
  const detail = page.getByTestId('audit-detail-perubahan');
  await expect(detail).toBeVisible();

  // Field 'status' berubah (DRAFT → DISETUJUI) dan disorot; 'catatan' tak berubah.
  const fieldStatus = detail.locator('div[data-changed]', { hasText: 'status' });
  await expect(fieldStatus).toHaveAttribute('data-changed', 'true');
  await expect(fieldStatus).toContainText('DRAFT');
  await expect(fieldStatus).toContainText('DISETUJUI');

  const fieldCatatan = detail.locator('div[data-changed]', { hasText: 'catatan' });
  await expect(fieldCatatan).toHaveAttribute('data-changed', 'false');
});

// ---------------------------------------------------------------------------
// 6 — INV-06: UPDATE/DELETE/TRUNCATE audit_log ditolak database
// ---------------------------------------------------------------------------

test('INV-06: UPDATE, DELETE, dan TRUNCATE audit_log ditolak', async () => {
  const id = await seedAudit({ entitas: EINV, aksi: 'CREATE', userId: adminId, nilaiBaru: { a: 1 } });

  let updateDitolak = false;
  await sql!`UPDATE audit_log SET aksi='PERETASAN' WHERE id=${id}::bigint`.catch(() => {
    updateDitolak = true;
  });
  expect(updateDitolak, 'UPDATE audit_log ditolak').toBe(true);

  let deleteDitolak = false;
  await sql!`DELETE FROM audit_log WHERE id=${id}::bigint`.catch(() => {
    deleteDitolak = true;
  });
  expect(deleteDitolak, 'DELETE audit_log ditolak').toBe(true);

  let truncateDitolak = false;
  await sql!`TRUNCATE audit_log`.catch(() => {
    truncateDitolak = true;
  });
  expect(truncateDitolak, 'TRUNCATE audit_log ditolak').toBe(true);

  // Baris tetap ada — append-only terbukti.
  const tetap = await sql!<{ n: number }[]>`SELECT count(*)::int n FROM audit_log WHERE id=${id}::bigint`;
  expect(Number(tetap[0]!.n)).toBe(1);
});
