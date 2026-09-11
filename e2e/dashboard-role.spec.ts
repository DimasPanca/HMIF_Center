/**
 * Gate integrasi E2E T-077 — dashboard kontekstual per role.
 *
 * ===========================================================================
 * KONTRAK ← docs/ai/DASHBOARD_CONTRACT.md · PRD F-3.2 · ADR-057
 * ===========================================================================
 * Membuktikan `app/api/dashboard/route.ts` (milik lane ui, T-077-UI) memenuhi
 * kontrak begitu dibangun:
 *   1. Tujuh susunan role melihat kartu yang benar (PRD F-3.2).
 *   2. Pengguna multi-role melihat GABUNGAN kartu TANPA duplikat.
 *   3. Badge approval akurat terhadap `v_antrian_approval`, dan
 *      DESTINATION-GATED: surat dikecualikan sampai T-060 (tak ada tautan 404).
 *   4. Item approval membawa tujuan navigasi yang benar-benar ada
 *      (`/proker/approval/{id}`).
 *
 * SKIP hingga route ada (probe 404) — T-077 BLOCKED oleh dependency T-060
 * (ADR-057). Tanpa DIRECT_URL seluruh test SKIP. Serial.
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

const API = '/api/dashboard';

test.describe.configure({ mode: 'serial' });

// Susunan kartu per role — kontrak DASHBOARD_CONTRACT.md §2 (PRD F-3.2).
const KARTU: Record<string, string[]> = {
  KETUA: ['approval-antrian', 'kendala-kritis', 'keuangan-ringkas', 'aktivitas-terbaru'],
  WAKIL: ['approval-antrian', 'kendala-kritis', 'keuangan-ringkas', 'aktivitas-terbaru'],
  SEKUM: ['approval-antrian', 'surat-terbit-bulan', 'notulensi-terakhir', 'nomor-surat-terakhir'],
  BENDUM: ['rab-rekap', 'nota-verifikasi', 'sisa-anggaran', 'lpj-progres'],
  KADEPT: ['proker-departemen', 'kanban-ringkas', 'kendala-terbuka', 'deadline-terdekat'],
  ANGGOTA: ['tugas-saya', 'deadline-terdekat', 'kendala-saya'],
  BPH: ['ringkasan-departemen', 'kendala-lintas', 'statistik-kepatuhan'],
  ADMIN: ['sistem-kesehatan', 'statistik-user', 'backup-terakhir', 'audit-terbaru'],
};

function urut(a: string[]): string[] {
  return [...new Set(a)].sort();
}

function bacaKoneksi(): string | undefined {
  const berkas = path.resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(berkas)) {
    for (const b of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const t = b.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  const g = { ...env, ...process.env };
  return g.DIRECT_URL ?? g.DATABASE_URL;
}

function prefix(): string {
  return `E2E77-${test.info().project.name}`;
}
function tahun(): number {
  return test.info().project.name === 'mobile' ? 2033 : 2032;
}

let sql: ReturnType<typeof postgres> | null = null;

test.beforeAll(async () => {
  const k = bacaKoneksi();
  if (!k) return;
  sql = postgres(k, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  const per = (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`)[0]?.id;
  const dep = (await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan LIMIT 1`)[0]?.id;
  const usr = (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`)[0]?.id;
  if (!per || !dep || !usr) return;

  await sql`DELETE FROM proker WHERE nama LIKE ${prefix() + ' %'}`.catch(() => {});
  // Dua proker MENUNGGU_APPROVAL → v_antrian_approval punya baris untuk KETUA/WAKIL.
  for (let i = 0; i < 2; i++) {
    await sql`
      INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh, diajukan_at)
      VALUES (${per}::uuid, ${dep}::uuid, ${`${prefix()} Approval ${i}`}, 'TERJADWAL', 'MENUNGGU_APPROVAL',
        '{}'::text[], ${`${tahun()}-03-01`}::date, ${`${tahun()}-03-21`}::date, ${`${tahun()}-03-23`}::date,
        ${usr}::uuid, now())`.catch(() => {});
  }
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM proker WHERE nama LIKE ${prefix() + ' %'}`.catch(() => {});
    await sql.end();
  }
  sql = null;
});

test.beforeEach(() => {
  if (!sql) test.skip(true, 'Butuh DIRECT_URL/DATABASE_URL untuk menyemai antrian approval.');
});

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

type Dashboard = {
  peran: string[];
  badgeApproval: number;
  kartu: Record<string, { kunci: string; data?: { jenis?: string; entitas_id?: string }[] }>;
};

/**
 * Login lalu ambil dashboard. SKIP bila route belum dibangun (T-077-UI).
 * Probe HARUS terautentikasi: `/api/*` tanpa sesi dijawab 401 oleh middleware,
 * jadi hanya request ber-sesi yang membedakan 404 (route belum ada) dari 401.
 */
async function dashboardAtauSkip(page: Page, akun: AkunUji): Promise<Dashboard | null> {
  await masuk(page, akun);
  const res = await page.request.get(API);
  if (res.status() === 404) {
    test.skip(true, `${API} belum ada (T-077 BLOCKED oleh T-060 — ADR-057).`);
    return null;
  }
  expect(res.status(), 'dashboard 200 K-02').toBe(200);
  const body = (await res.json()) as { ok: boolean; data: Dashboard };
  expect(body.ok).toBe(true);
  return body.data;
}

// ---------------------------------------------------------------------------
// 1 — tujuh susunan role
// ---------------------------------------------------------------------------

const KASUS: Array<[AkunUji, string]> = [
  [AKUN.aktif, 'KETUA'],
  [AKUN.wakil, 'WAKIL'],
  [AKUN.sekum, 'SEKUM'],
  [AKUN.bendum, 'BENDUM'],
  [AKUN.kadept, 'KADEPT'],
  [AKUN.anggota, 'ANGGOTA'],
  [AKUN.bacaSaja, 'BPH'],
  [AKUN.admin, 'ADMIN'],
];

for (const [akun, role] of KASUS) {
  test(`role ${role} melihat kartu yang benar`, async ({ page }) => {
    const data = await dashboardAtauSkip(page, akun);
    if (!data) return;
    expect(data.peran).toContain(role);
    expect(urut(Object.keys(data.kartu)), `kartu ${role}`).toEqual(urut(KARTU[role]!));
  });
}

// ---------------------------------------------------------------------------
// 2 — multi-role: gabungan tanpa duplikat
// ---------------------------------------------------------------------------

test('pengguna multi-role (KETUA+SEKUM) melihat gabungan tanpa kartu duplikat', async ({ page }) => {
  const data = await dashboardAtauSkip(page, AKUN.multi);
  if (!data) return;

  expect(urut(data.peran)).toEqual(urut(['KETUA', 'SEKUM']));
  const gabungan = urut([...KARTU.KETUA!, ...KARTU.SEKUM!]);
  expect(urut(Object.keys(data.kartu)), 'gabungan kartu Ketua ∪ Sekum').toEqual(gabungan);
  // approval-antrian hanya sekali (kunci unik) — dedup terbukti.
  expect(Object.keys(data.kartu).filter((k) => k === 'approval-antrian')).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// 3 — badge approval akurat + destination-gated (surat dikecualikan)
// ---------------------------------------------------------------------------

test('badge approval akurat terhadap v_antrian_approval dan mengecualikan surat', async ({ page }) => {
  const data = await dashboardAtauSkip(page, AKUN.aktif); // KETUA
  if (!data) return;

  const prokerAktif = (
    await sql!<{ n: number }[]>`
      SELECT count(*)::int n FROM v_antrian_approval
      WHERE periode_id = (SELECT id FROM periode WHERE status='AKTIF')
        AND approver_roles && ARRAY['KETUA']::role_code[] AND jenis = 'PROKER'`
  )[0]!.n;
  expect(data.badgeApproval, 'badge = jumlah proker menunggu (destination-gated)').toBe(prokerAktif);

  const antrian = data.kartu['approval-antrian']?.data ?? [];
  expect(antrian.every((i) => i.jenis === 'PROKER'), 'antrian tak memuat SURAT (tujuan 404)').toBe(
    true,
  );
});

// ---------------------------------------------------------------------------
// 4 — item approval punya tujuan navigasi yang ada
// ---------------------------------------------------------------------------

test('item approval proker menautkan ke halaman detail yang ada', async ({ page }) => {
  const data = await dashboardAtauSkip(page, AKUN.aktif);
  if (!data) return;
  const item = (data.kartu['approval-antrian']?.data ?? [])[0];
  expect(item, 'ada minimal satu item approval proker').toBeTruthy();
  expect(item!.jenis).toBe('PROKER');
  expect(item!.entitas_id).toBeTruthy();

  // Tujuan yang dijanjikan kontrak benar-benar ada (bukan 404).
  const tujuan = await page.goto(`/proker/approval/${item!.entitas_id}`, { waitUntil: 'load' });
  expect(tujuan?.status(), 'halaman detail approval proker ada').not.toBe(404);
});
