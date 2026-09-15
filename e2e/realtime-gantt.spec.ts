/**
 * Gate T-076-UI: lintas tab <3 detik, putus koneksi, data terakhir tetap ada.
 * ADR-059: skip-until-UI spesifik; jangan menyebut gate lulus jika masih skip.
 * Endpoint submit dipanggil DARI tab kedua dengan cookie sesi, bukan koneksi
 * owner. Koneksi owner hanya menyemai baseline dan membersihkan fixture.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const masterUi = fs.readFileSync(path.resolve('components/gantt/MasterGantt.tsx'), 'utf8');
const uiSiap =
  masterUi.includes('useMasterGanttRealtime') &&
  fs.existsSync(path.resolve('components/shared/KoneksiBanner.tsx'));
test.skip(
  !uiSiap,
  'skip-until-UI T-076-UI: MasterGantt belum memasang useMasterGanttRealtime dan KoneksiBanner.',
);
test.describe.configure({ mode: 'serial' });

function koneksi(): string {
  const envPath = path.resolve('.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const baris of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const i = baris.indexOf('=');
      if (i > 0 && !baris.trimStart().startsWith('#'))
        env[baris.slice(0, i).trim()] = baris.slice(i + 1).trim();
    }
  }
  const value =
    process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!value) throw new Error('Gate realtime-gantt butuh DIRECT_URL/DATABASE_URL untuk fixture.');
  return value;
}

function tanggal(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const namaFixture = (project: string) => `E2E76-${project}`;
const kodeFixture = (project: string) => (project === 'mobile' ? 'Z76M' : 'Z76D');
let sql: ReturnType<typeof postgres>;
let periodeId: string;
let deptId: string;
let baselineId: string;

test.beforeAll(async () => {
  sql = postgres(koneksi(), { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  const project = test.info().project.name;
  const periode = await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`;
  const admin = await sql<
    { id: string }[]
  >`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`;
  if (!periode[0] || !admin[0]) throw new Error('Fixture E2E auth/periode aktif belum disiapkan.');
  periodeId = periode[0].id;
  const [dept] = await sql<{ id: string }[]>`
    INSERT INTO departemen (kode,nama,warna,urutan)
    VALUES (${kodeFixture(project)},${namaFixture(project)},'#3B6EA5',901)
    ON CONFLICT (kode) DO UPDATE SET nama=EXCLUDED.nama RETURNING id`;
  deptId = dept!.id;
  await sql`DELETE FROM proker WHERE nama LIKE ${namaFixture(project) + ' %'}`;
  const [proker] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id,departemen_id,nama,kategori,status,sumber_dana,
      tanggal_mulai_persiapan,tanggal_hari_h_mulai,tanggal_hari_h_selesai,dibuat_oleh)
    VALUES (${periodeId}::uuid,${deptId}::uuid,${namaFixture(project) + ' baseline'},
      'TERJADWAL','DISETUJUI','{}'::text[],${tanggal(10)}::date,
      ${tanggal(30)}::date,${tanggal(32)}::date,${admin[0].id}::uuid)
    RETURNING id`;
  baselineId = proker!.id;
});

test.afterAll(async () => {
  if (!sql) return;
  const project = test.info().project.name;
  await sql`DELETE FROM proker WHERE nama LIKE ${namaFixture(project) + ' %'}`;
  await sql`DELETE FROM departemen WHERE kode=${kodeFixture(project)}`;
  await sql.end();
});

// Akun per-project: desktop & mobile berjalan paralel dan submit lintas-tab
// menulis draft proker per-PENGGUNA. Memakai akun sama membuat kedua project
// saling menimpa draft → gate flaky. Akun berbeda memberi tiap project draft
// sendiri. Keduanya berhak membuat proker (ADMIN & KETUA punya proker.create).
function akunProyek() {
  return test.info().project.name === 'mobile' ? AKUN.aktif : AKUN.admin;
}

async function masuk(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akunProyek().email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  // Tunggu redirect keluar dari /login, BUKAN networkidle: MasterGantt membuka
  // WebSocket realtime yang tetap hidup, jadi 'networkidle' tak pernah tercapai
  // dan menggantung sampai timeout tes. Sesi terpasang saat redirect terjadi.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function bukaMaster(page: Page): Promise<void> {
  await masuk(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByTestId('master-gantt')).toBeVisible();
  await expect(page.getByTestId(`gantt-bar-${baselineId}`)).toBeVisible();
  // UI harus mengekspos status ini agar gate tidak berlomba dengan handshake WS.
  await expect(page.getByTestId('master-gantt-realtime-status')).toHaveAttribute(
    'data-state',
    'terhubung',
    { timeout: 10_000 },
  );
}

test('bar baru dari tab lain muncul dalam kurang dari 3 detik', async ({ page, context }) => {
  await bukaMaster(page);
  const tabLain = await context.newPage();
  await tabLain.goto('/', { waitUntil: 'load' });
  const nama = `${namaFixture(test.info().project.name)} lintas-tab ${Date.now()}`;
  // SERIALISASI LINTAS-PROJECT. desktop & mobile berjalan paralel; dua submit
  // proker yang bersamaan berebut kunci di alur submit dan saling menggantung
  // (masing-masing LULUS saat dijalankan sendiri). Advisory lock sesi bersifat
  // global seluruh cluster, jadi ia memaksa satu project menuntaskan submit +
  // verifikasi bar sebelum yang lain mulai. Tiap project tetap menguji jalur
  // realtime penuh, hanya tak lagi tumpang-tindih.
  await sql`SELECT pg_advisory_lock(76076)`;
  try {
    // Tab kedua menyimpan draft lalu submit BERKALA. Kategori ini langsung
    // DISETUJUI dan tanggal eksplisit membuat bar terlihat pada timeline.
    const hasil = await tabLain.evaluate(
      async ({ dept, namaProker, mulai, hariH, akhir }) => {
        const draft = await fetch('/api/proker/draft', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            langkah: 6,
            data: {
              departemen_id: dept,
              nama: namaProker,
              kategori: 'BERKALA',
              tanggal_mulai_persiapan: mulai,
              tanggal_hari_h_mulai: hariH,
              tanggal_hari_h_selesai: akhir,
              pola_ulang: { frekuensi: 'MINGGUAN', hari: ['SENIN'], mulai, selesai: akhir },
            },
          }),
        });
        if (!draft.ok) throw new Error(`simpan draft: HTTP ${draft.status}`);
        const submit = await fetch('/api/proker/submit', { method: 'POST' });
        const body = await submit.json();
        if (!submit.ok || !body.ok)
          throw new Error(`submit proker: HTTP ${submit.status} ${JSON.stringify(body.error ?? {})}`);
        return { id: body.data.proker_id as string, status: body.data.status as string };
      },
      { dept: deptId, namaProker: nama, mulai: tanggal(10), hariH: tanggal(30), akhir: tanggal(32) },
    );
    expect(hasil.status).toBe('DISETUJUI');
    const mulaiTunggu = Date.now();
    await expect(page.getByTestId(`gantt-bar-${hasil.id}`)).toBeVisible({ timeout: 3_000 });
    expect(Date.now() - mulaiTunggu, 'bar muncul sesudah commit lintas tab').toBeLessThan(3_000);
  } finally {
    await sql`SELECT pg_advisory_unlock(76076)`;
    await tabLain.close();
  }
});

test('koneksi putus menampilkan banner, chart dan data terakhir tetap ada', async ({
  page,
  context,
}) => {
  await bukaMaster(page);
  const bar = page.getByTestId(`gantt-bar-${baselineId}`);
  const namaSebelum = await bar.evaluate((el) =>
    el.closest('[role="button"]')?.getAttribute('aria-label'),
  );
  expect(namaSebelum).toContain(namaFixture(test.info().project.name));
  await context.setOffline(true);
  try {
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Pembaruan langsung terputus. Muat ulang untuk data terbaru.' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-slot="gantt-chart"]')).toBeVisible();
    await expect(bar).toBeVisible();
    expect(
      await bar.evaluate((el) => el.closest('[role="button"]')?.getAttribute('aria-label')),
    ).toBe(namaSebelum);
  } finally {
    await context.setOffline(false);
  }
});
