/**
 * Gate E2E T-075 — Master Gantt di beranda (kalender bersama).
 *
 * ===========================================================================
 * KRITERIA (docs/ai/tasks/P3-proker-gantt.md T-075 · PRD F-8.1 · SYSTEM_DESIGN §6.5)
 * ===========================================================================
 *   1. Kedelapan role melihat Master Gantt yang identik (matriks `master_gantt`
 *      memberi R tanpa kecuali — tak ada penyaringan per-role di data).
 *   2. Filter departemen, kategori, dan status menyaring bar.
 *   3. Skala bawaan Minggu.
 *   4. Mode Bulan dengan semua grup terlipat tidak menimbulkan scroll vertikal
 *      pada 1366×768.
 *   5. Marker Hari-H tampil.
 *   6. 48 bar dirender di bawah 500 ms (waktu render klien, bukan jaringan).
 *
 * ===========================================================================
 * ISOLASI — DEPARTEMEN KHUSUS PER-PROJECT
 * ===========================================================================
 * v_master_gantt menampilkan SELURUH proker DISETUJUI/BERJALAN periode aktif,
 * jadi hitungan global tak pernah deterministik: gate lain (approval, edit)
 * menaruh proker DISETUJUI di departemen bawaan. Karena itu tiap project
 * (desktop/mobile berjalan paralel) memakai DEPARTEMEN sendiri + PREFIX nama
 * sendiri; seluruh asersi hitungan memfilter ke departemen itu. Tanggal dijaga
 * di dalam jendela tampil (-3..+6 bulan) dan di luar jangkauan cron harian
 * (persiapan DISETUJUI di masa depan; hari-H BERJALAN di masa depan) supaya
 * `lepas_kunci_selesai` tak mengubah status seed di tengah jalan.
 *
 * Tanpa DIRECT_URL/DATABASE_URL (worktree ui) seluruh test SKIP — gate ini
 * butuh menyemai proker lewat koneksi owner (menembus RLS).
 *
 * Dipaksa 1366×768 (test.use) agar kriteria #4/#6 sahih di kedua project.
 */

import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

// Kriteria #4/#6 ditetapkan pada 1366×768 — paksakan di project mana pun.
test.use({ viewport: { width: 1366, height: 768 } });

// Serial: satu worker, satu beforeAll. Tanpa ini kedua worker (workers=2)
// menyemai 48 proker masing-masing ke departemen yang sama → hitungan ganda.
test.describe.configure({ mode: 'serial' });

const TOTAL = 48;
const BERKALA_DARI = 40; // indeks 40..47 → 8 proker BERKALA
const BERJALAN_DARI = 44; // indeks 44..47 → 4 proker BERJALAN

function proj(): string {
  return test.info().project.name;
}
function prefix(): string {
  return `E2E75-${proj()}`;
}
function kodeDept(): string {
  return proj() === 'mobile' ? 'Z75M' : 'Z75D';
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

/** Tanggal `YYYY-MM-DD` n hari dari hari ini (tengah malam UTC). */
function hariTambah(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let sql: ReturnType<typeof postgres> | null = null;
let deptId: string | null = null;
const idSaya = new Set<string>();

test.beforeAll(async () => {
  const k = bacaKoneksi();
  if (!k) return;
  sql = postgres(k, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  const periodeId = (await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`)[0]?.id;
  const pembuat = (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`)[0]?.id;
  if (!periodeId || !pembuat) {
    await sql.end();
    sql = null;
    return;
  }

  // Departemen khusus per-project — sekat isolasi hitungan. urutan tinggi agar
  // tersusun paling akhir dan tak mengganggu asumsi urutan gate lain.
  const [dep] = await sql<{ id: string }[]>`
    INSERT INTO departemen (kode, nama, warna, urutan)
    VALUES (${kodeDept()}, ${`E2E75 ${proj()}`}, '#3B6EA5', 900)
    ON CONFLICT (kode) DO UPDATE SET nama = EXCLUDED.nama, urutan = EXCLUDED.urutan
    RETURNING id`;
  deptId = dep!.id;

  // Bersihkan sisa jalan sebelumnya milik project ini.
  await sql`DELETE FROM proker WHERE nama LIKE ${prefix() + ' %'}`.catch(() => {});

  for (let i = 0; i < TOTAL; i++) {
    const berjalan = i >= BERJALAN_DARI;
    // Durasi persiapan TERJADWAL wajib 15-45 hari (CONSTRAINT durasi_persiapan_15_45,
    // migrasi 004) → dipatok 20 hari. BERKALA/BERJALAN bebas dari aturan itu.
    //   DISETUJUI → persiapan di masa depan (cron rule-3 tak menyentuhnya).
    //   BERJALAN  → persiapan di masa lalu, hari-H di masa depan (cron rule-1
    //               hanya menyelesaikan yang hari-H-nya sudah lewat).
    const mulai = berjalan ? hariTambah(-12 + (i - BERJALAN_DARI)) : hariTambah(10 + i);
    const hhMulai = berjalan ? hariTambah(24 + (i - BERJALAN_DARI)) : hariTambah(30 + i);
    const hhSelesai = berjalan ? hariTambah(26 + (i - BERJALAN_DARI)) : hariTambah(32 + i);
    const kategori = i < BERKALA_DARI ? 'TERJADWAL' : 'BERKALA';
    const status = berjalan ? 'BERJALAN' : 'DISETUJUI';
    const nama = `${prefix()} ${String(i + 1).padStart(2, '0')}`;

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
        penanggung_jawab, dibuat_oleh)
      VALUES (${periodeId}::uuid, ${deptId}::uuid, ${nama}, ${kategori}::proker_kategori,
        ${status}::proker_status, '{}'::text[],
        ${mulai}::date, ${hhMulai}::date, ${hhSelesai}::date, ${pembuat}::uuid, ${pembuat}::uuid)
      RETURNING id`;
    idSaya.add(p!.id);
  }
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM proker WHERE nama LIKE ${prefix() + ' %'}`.catch(() => {});
    await sql`DELETE FROM departemen WHERE kode = ${kodeDept()}`.catch(() => {});
    await sql.end();
  }
  sql = null;
  deptId = null;
  idSaya.clear();
});

test.beforeEach(() => {
  if (!sql || !deptId) test.skip(true, 'Butuh DIRECT_URL/DATABASE_URL untuk menyemai Master Gantt.');
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
  // Tunggu redirect keluar dari /login, BUKAN networkidle: networkidle dapat
  // terpenuhi sebelum permintaan login berangkat, sehingga goto('/') berikutnya
  // berjalan tanpa sesi dan mendarat kembali di /login. Beranda juga membuka
  // WebSocket realtime yang membuat networkidle tidak stabil.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

/** Buka beranda & tunggu Master Gantt selesai memuat (bukan loading/empty). */
async function bukaBeranda(page: Page, akun: AkunUji): Promise<void> {
  await masuk(page, akun);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByTestId('master-gantt')).toBeVisible();
  await page.getByTestId('master-gantt-loading').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await expect(page.locator('[data-slot="gantt-chart"]')).toBeVisible({ timeout: 15_000 });
}

const chart = (page: Page) => page.locator('[data-slot="gantt-chart"]');

// ---------------------------------------------------------------------------
// Kriteria 1 — kedelapan role melihat Master Gantt yang identik
// ---------------------------------------------------------------------------

test('kedelapan role melihat Master Gantt yang identik', async ({ page }) => {
  test.setTimeout(180_000);
  const roles: AkunUji[] = [
    AKUN.admin, // ADMIN
    AKUN.aktif, // KETUA
    AKUN.wakil, // WAKIL
    AKUN.sekum, // SEKUM
    AKUN.bendum, // BENDUM
    AKUN.kadept, // KADEPT
    AKUN.anggota, // ANGGOTA
    AKUN.bacaSaja, // BPH
  ];

  let acuan: string | null = null;
  for (const akun of roles) {
    await bukaBeranda(page, akun);

    // Tangkap data sebagai role ini (page.request berbagi cookie sesi).
    const res = await page.request.get('/api/gantt/master');
    expect(res.status(), `role ${akun.role} harus 200 (punya master_gantt.read)`).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown>[] };
    expect(body.ok, `role ${akun.role} respons K-02 ok`).toBe(true);

    const milikku = body.data
      .filter((r) => idSaya.has(r.proker_id as string))
      .map((r) => ({
        id: r.proker_id,
        nama: r.proker_nama,
        kategori: r.kategori,
        status: r.status,
        dep: r.departemen_id,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    expect(milikku.length, `role ${akun.role} melihat ${TOTAL} proker seed`).toBe(TOTAL);
    const snap = JSON.stringify(milikku);
    if (acuan === null) acuan = snap;
    else expect(snap, `role ${akun.role} identik dengan role acuan`).toBe(acuan);
  }
});

// ---------------------------------------------------------------------------
// Kriteria 2 — filter departemen, kategori, status
// ---------------------------------------------------------------------------

test('filter departemen, kategori, dan status menyaring bar', async ({ page }) => {
  await bukaBeranda(page, AKUN.admin);

  // departemen = milikku → 1 grup + 48 task = 49 baris
  await page.getByTestId('master-gantt-departemen').selectOption(deptId!);
  await expect(chart(page)).toHaveAttribute('data-total-row-count', String(TOTAL + 1));

  // + kategori BERKALA → 1 grup + 8 task = 9 baris
  await page.getByTestId('master-gantt-kategori').selectOption('BERKALA');
  await expect(chart(page)).toHaveAttribute('data-total-row-count', '9');

  // kategori kembali SEMUA, status BERJALAN → 1 grup + 4 task = 5 baris
  await page.getByTestId('master-gantt-kategori').selectOption('SEMUA');
  await page.getByTestId('master-gantt-status').selectOption('BERJALAN');
  await expect(chart(page)).toHaveAttribute('data-total-row-count', '5');
});

// ---------------------------------------------------------------------------
// Kriteria 3 — skala bawaan Minggu
// ---------------------------------------------------------------------------

test('skala bawaan adalah Minggu', async ({ page }) => {
  await bukaBeranda(page, AKUN.admin);
  await expect(page.getByTestId('master-gantt-skala')).toHaveValue('week');
});

// ---------------------------------------------------------------------------
// Kriteria 4 — Bulan + semua grup terlipat: tak ada scroll vertikal (1366×768)
// ---------------------------------------------------------------------------

test('mode Bulan dengan semua grup terlipat tidak menimbulkan scroll vertikal', async ({ page }) => {
  await bukaBeranda(page, AKUN.admin);

  await page.getByTestId('master-gantt-skala').selectOption('month');
  const lipat = page.getByTestId('master-gantt-lipat-semua');
  await lipat.click();
  await expect(lipat).toHaveAttribute('aria-pressed', 'true');

  // Jumlah departemen berproker terbatas (≤ 6 bawaan + departemen uji), jadi
  // tinggi terlipat selalu muat dalam calc(100vh - 320px) pada 768 px.
  const scroll = page.getByTestId('gantt-vertical-scroll');
  const ukuran = await scroll.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(ukuran.sh, `scrollHeight ${ukuran.sh} ≤ clientHeight ${ukuran.ch}`).toBeLessThanOrEqual(
    ukuran.ch + 1,
  );
});

// ---------------------------------------------------------------------------
// Kriteria 5 — marker Hari-H tampil
// ---------------------------------------------------------------------------

test('marker Hari-H tampil pada bar proker', async ({ page }) => {
  await bukaBeranda(page, AKUN.admin);
  // Saring ke departemen uji: hanya task milikku yang terrender, tiap task
  // menyandang hari-H dalam jendela tampil.
  await page.getByTestId('master-gantt-departemen').selectOption(deptId!);
  await expect(chart(page)).toHaveAttribute('data-total-row-count', String(TOTAL + 1));

  const marker = page.locator('[data-testid^="gantt-harih-"]').first();
  await expect(marker).toBeAttached();
  expect(Number(await marker.getAttribute('width')), 'lebar marker Hari-H > 0').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Kriteria 6 — 48 bar dirender di bawah 500 ms (waktu render klien)
// ---------------------------------------------------------------------------

test('48 bar dirender di bawah 500 ms', async ({ page }) => {
  await bukaBeranda(page, AKUN.admin);

  // Ukur MURNI waktu klien: dari saat filter departemen di-dispatch sampai
  // chart melaporkan 49 baris (1 grup + 48 task) terender — tanpa ongkos
  // jaringan (data sudah di state) maupun round-trip CDP Playwright.
  const ms = await page.evaluate(
    ({ id, target }) =>
      new Promise<number>((resolve, reject) => {
        const select = document.querySelector<HTMLSelectElement>(
          '[data-testid="master-gantt-departemen"]',
        );
        if (!select) {
          reject(new Error('select departemen tak ditemukan'));
          return;
        }
        const t0 = performance.now();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          'value',
        )!.set!;
        setter.call(select, id);
        select.dispatchEvent(new Event('change', { bubbles: true }));

        const batas = t0 + 5000;
        const tick = () => {
          const c = document.querySelector('[data-slot="gantt-chart"]');
          if (c && c.getAttribute('data-total-row-count') === target) {
            requestAnimationFrame(() => resolve(performance.now() - t0));
          } else if (performance.now() > batas) {
            reject(new Error('timeout menunggu render 49 baris'));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    { id: deptId!, target: String(TOTAL + 1) },
  );

  expect(ms, `render 48 bar memakan ${Math.round(ms)} ms`).toBeLessThan(500);
});
