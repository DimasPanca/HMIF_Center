/**
 * Gate integrasi E2E T-079-UI — endpoint cron harian `/api/cron/harian`.
 *
 * ===========================================================================
 * KONTRAK ← docs/ai/CRON_CONTRACT.md
 * ===========================================================================
 * Lane data memiliki logika (`lib/cron/**`, terbukti unit `cron-harian` + smoke
 * DB) dan jadwalnya (`vercel.json`). Lane ui merakit route tipis. Gate ini —
 * milik lane data — membuktikan route itu memenuhi kontrak begitu Codex
 * membangunnya:
 *
 *   1. Tanpa / dengan bearer salah → 401 berbentuk K-02.
 *   2. Bearer benar → menjalankan cron, respons K-02 berisi ringkasan.
 *   3. Dipanggil dua kali tidak menggandakan transisi (ADR-009, idempoten).
 *   4. Audit CRON tercatat sebagai sistem (user NULL, user_agent 'sistem').
 *
 * Endpoint cron DIKECUALIKAN dari middleware sesi (`matcher` menampik
 * `api/cron`) — penjaganya CRON_SECRET, bukan cookie. Karena itu gate memanggil
 * lewat `request` (tanpa login).
 *
 * SKIP bila route belum ada (T-079-UI belum di-merge) → probe 404. Uji jalur-
 * benar & DB SKIP tambahan bila CRON_SECRET / DIRECT_URL tak tersedia.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-079 · ADR-009 · SYSTEM_DESIGN §15.2
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type APIRequestContext } from '@playwright/test';
import postgres from 'postgres';

import { AKUN } from './fixtures/akun';

const CRON = '/api/cron/harian';

function bacaEnv(): Record<string, string> {
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
  return { ...env, ...process.env } as Record<string, string>;
}

const ENV = bacaEnv();
const RAHASIA = ENV.CRON_SECRET;
const KONEKSI = ENV.DIRECT_URL ?? ENV.DATABASE_URL;

function prefix(): string {
  return `E2E79-${test.info().project.name}`;
}

/** Tanggal `YYYY-MM-DD` n hari dari hari ini (tengah malam UTC). */
function hariTambah(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let sql: ReturnType<typeof postgres> | null = null;
let periodeId: string | null = null;
let deptId: string | null = null;
let pembuat: string | null = null;

test.beforeAll(async () => {
  if (!KONEKSI) return;
  sql = postgres(KONEKSI, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  periodeId = (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`)[0]?.id ?? null;
  deptId = (await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan LIMIT 1`)[0]?.id ?? null;
  pembuat = (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`)[0]?.id ?? null;
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM proker WHERE nama LIKE ${prefix() + ' %'}`.catch(() => {});
    await sql.end();
  }
  sql = null;
});

/** SKIP bila route belum dibangun lane ui (Next menjawab 404). */
async function pastikanRute(request: APIRequestContext): Promise<boolean> {
  const probe = await request.get(CRON, { headers: { Authorization: 'Bearer probe-tidak-sah' } });
  if (probe.status() === 404) {
    test.skip(true, `${CRON} belum ada (T-079-UI belum di-merge).`);
    return false;
  }
  return true;
}

async function bacaProker(id: string): Promise<{ status: string; updated_at: string } | null> {
  const r = await sql!<{ status: string; updated_at: string }[]>`
    SELECT status::text, updated_at::text FROM proker WHERE id = ${id}::uuid`;
  return r[0] ?? null;
}

// ---------------------------------------------------------------------------
// 1 — tanpa / bearer salah → 401 K-02
// ---------------------------------------------------------------------------

test('tanpa bearer menghasilkan 401 berbentuk K-02', async ({ request }) => {
  if (!(await pastikanRute(request))) return;
  const res = await request.get(CRON);
  expect(res.status()).toBe(401);
  const body = (await res.json()) as { ok: boolean; error?: { code?: string; message?: string } };
  expect(body.ok).toBe(false);
  expect(typeof body.error?.code).toBe('string');
  expect(typeof body.error?.message).toBe('string');
});

test('bearer salah menghasilkan 401 berbentuk K-02', async ({ request }) => {
  if (!(await pastikanRute(request))) return;
  const res = await request.get(CRON, { headers: { Authorization: 'Bearer jelas-salah-999' } });
  expect(res.status()).toBe(401);
  const body = (await res.json()) as { ok: boolean; error?: { code?: string; message?: string } };
  expect(body.ok).toBe(false);
  expect(typeof body.error?.code).toBe('string');
  expect(typeof body.error?.message).toBe('string');
});

// ---------------------------------------------------------------------------
// 2 — bearer benar → menjalankan cron, respons K-02 berisi ringkasan
// ---------------------------------------------------------------------------

test('bearer benar menjalankan cron dan mengembalikan ringkasan K-02', async ({ request }) => {
  if (!(await pastikanRute(request))) return;
  if (!RAHASIA) {
    test.skip(true, 'CRON_SECRET tak diset — jalur-benar tak dapat diuji (fail-closed).');
    return;
  }
  const res = await request.get(CRON, { headers: { Authorization: `Bearer ${RAHASIA}` } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    data?: {
      tanggal?: unknown;
      tanggal_1?: unknown;
      lepas?: { jadi_selesai?: unknown; kunci_dilepas?: unknown; jadi_berjalan?: unknown };
      deadline?: { mendekati?: unknown; kritis?: unknown; terlambat?: unknown };
    };
  };
  expect(body.ok).toBe(true);
  expect(typeof body.data?.tanggal).toBe('string');
  expect(typeof body.data?.tanggal_1).toBe('boolean');
  expect(typeof body.data?.lepas?.jadi_selesai).toBe('number');
  expect(typeof body.data?.lepas?.kunci_dilepas).toBe('number');
  expect(typeof body.data?.lepas?.jadi_berjalan).toBe('number');
  expect(typeof body.data?.deadline?.mendekati).toBe('number');
  expect(typeof body.data?.deadline?.kritis).toBe('number');
  expect(typeof body.data?.deadline?.terlambat).toBe('number');
});

// ---------------------------------------------------------------------------
// 3 & 4 — dua panggilan idempoten + audit CRON sebagai sistem
// ---------------------------------------------------------------------------

test('dua panggilan tidak menggandakan transisi; audit CRON tercatat sebagai sistem', async ({
  request,
}) => {
  if (!(await pastikanRute(request))) return;
  if (!RAHASIA || !sql || !periodeId || !deptId || !pembuat) {
    test.skip(true, 'Butuh CRON_SECRET + DIRECT_URL untuk membuktikan transisi & audit.');
    return;
  }

  // Proker BERJALAN yang hari-H terakhirnya sudah lewat → HARUS jadi SELESAI
  // saat cron jalan. Prefix per-project menjaga isolasi lintas-project. Durasi
  // persiapan 20 hari memenuhi CONSTRAINT durasi_persiapan_15_45 (migrasi 004);
  // hari-H selesai tetap di masa lalu agar cron rule-1 menyelesaikannya.
  await sql`DELETE FROM proker WHERE nama LIKE ${prefix() + ' %'}`.catch(() => {});
  const [p] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, penanggung_jawab, dibuat_oleh)
    VALUES (${periodeId}::uuid, ${deptId}::uuid, ${prefix() + ' Lewat'}, 'TERJADWAL'::proker_kategori,
      'BERJALAN'::proker_status, '{}'::text[],
      ${hariTambah(-45)}::date, ${hariTambah(-25)}::date, ${hariTambah(-23)}::date,
      ${pembuat}::uuid, ${pembuat}::uuid)
    RETURNING id`;
  const id = p!.id;

  const bearer = { Authorization: `Bearer ${RAHASIA}` };

  // Panggilan 1 — proker lewat menjadi SELESAI.
  const r1 = await request.get(CRON, { headers: bearer });
  expect(r1.status()).toBe(200);
  const setelah1 = await bacaProker(id);
  expect(setelah1?.status, 'proker lewat menjadi SELESAI setelah cron').toBe('SELESAI');
  const stempel1 = setelah1!.updated_at;

  // Panggilan 2 — idempoten: tetap SELESAI, updated_at tak berubah (UPDATE
  // rule-1 menjaring 0 baris pada panggilan kedua).
  const r2 = await request.get(CRON, { headers: bearer });
  expect(r2.status()).toBe(200);
  const setelah2 = await bacaProker(id);
  expect(setelah2?.status, 'tetap SELESAI pada panggilan kedua').toBe('SELESAI');
  expect(setelah2?.updated_at, 'updated_at tak berubah → tak ada transisi ganda').toBe(stempel1);

  // Audit CRON tercatat sebagai sistem: user NULL, user_agent 'sistem'.
  const audit = await sql<{ n: number }[]>`
    SELECT count(*)::int n FROM audit_log
    WHERE aksi = 'CRON' AND user_agent = 'sistem' AND user_id IS NULL`;
  expect(Number(audit[0]!.n), 'ada baris audit CRON sebagai sistem').toBeGreaterThanOrEqual(1);
});
