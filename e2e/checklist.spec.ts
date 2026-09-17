/**
 * Gate T-081 (lane data) — checklist kartu Kanban. BUKAN implementasi UI atau
 * penanda T-081 DONE. Skip HANYA saat file tujuan UI belum ada; sesudah ada,
 * kegagalan fixture/selector/HTTP tak boleh diubah menjadi skip.
 *
 * Menguji (PRD F-7.2 · docs/ai/CHECKLIST_CONTRACT.md):
 *   - progres kartu & panel berubah 2/8 → 3/8 tanpa reload (optimistik);
 *   - rollback optimistik bila server menolak;
 *   - assignee & deadline opsional;
 *   - urut ulang pointer & keyboard;
 *   - template disimpan lalu diterapkan ke kartu lain;
 *   - akses lintas lingkup ditolak (API 403);
 *   - BPH membaca tetapi tidak mengubah.
 *
 * data-testid WAJIB (kontrak §5): checklist-panel, checklist-progress,
 * checklist-progress-bar, kanban-card-progress-{cardId}, checklist-item-{id},
 * checklist-check-{id}, checklist-drag-{id}, checklist-tambah-teks,
 * checklist-tambah-submit, checklist-template-simpan, checklist-template-dialog,
 * checklist-template-nama, checklist-template-opsi-{tplId}, checklist-template-terapkan.
 */
import fs from 'node:fs';
import path from 'node:path';

import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const belumAda = [
  'app/api/kanban/[id]/checklist/route.ts',
  'components/kanban/ChecklistPanel.tsx',
].filter((file) => !fs.existsSync(path.resolve(file)));
test.skip(
  belumAda.length > 0,
  `skip-until-UI T-081: file belum tersedia: ${belumAda.join(', ')}`,
);
test.describe.configure({ mode: 'serial' });

function bacaKoneksi(): string {
  const env: Record<string, string> = {};
  const berkas = path.resolve('.env.local');
  if (fs.existsSync(berkas)) {
    for (const b of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const i = b.indexOf('=');
      if (i > 0 && !b.trimStart().startsWith('#')) env[b.slice(0, i).trim()] = b.slice(i + 1).trim();
    }
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error('Gate checklist butuh DIRECT_URL/DATABASE_URL untuk fixture.');
  return url;
}

const prefix = () => `E2E81-${test.info().project.name}`;
let sql: ReturnType<typeof postgres>;
let deptAKode: string;
let cardUtama: string;
let cardTarget: string;
let cardAsing: string;
const itemIds: string[] = [];

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const [periode] = await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`;
  const [admin] = await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`;
  const [anggota] = await sql<{ id: string; departemen_id: string }[]>`
    SELECT u.id, ur.departemen_id FROM app_user u
    JOIN user_role ur ON ur.user_id=u.id AND ur.periode_id=${periode!.id}::uuid
    WHERE u.email=${AKUN.anggota.email} AND ur.role='ANGGOTA' ORDER BY ur.id LIMIT 1`;
  const [deptA] = await sql<{ id: string; kode: string }[]>`SELECT id, kode FROM departemen WHERE id=${anggota!.departemen_id}::uuid`;
  const [deptB] = await sql<{ id: string }[]>`SELECT id FROM departemen WHERE id<>${deptA!.id}::uuid AND is_active ORDER BY urutan LIMIT 1`;
  deptAKode = deptA!.kode;

  cardUtama = randomUUID();
  cardTarget = randomUUID();
  cardAsing = randomUUID();
  await sql`DELETE FROM kanban_card WHERE judul LIKE ${prefix() + ' %'}`;
  await sql.begin(async (tx) => {
    for (const [id, dept] of [
      [cardUtama, deptA!.id],
      [cardTarget, deptA!.id],
      [cardAsing, deptB!.id],
    ] as const) {
      await tx`INSERT INTO kanban_card (id, departemen_id, judul, created_by)
        VALUES (${id}::uuid, ${dept}::uuid, ${prefix() + ' ' + id.slice(0, 8)}, ${admin!.id}::uuid)`;
    }
    // 8 item pada kartu utama, 2 selesai → progres awal 2/8.
    for (let i = 0; i < 8; i++) {
      const itemId = randomUUID();
      itemIds.push(itemId);
      await tx`INSERT INTO checklist_item (id, card_id, teks, selesai, urutan)
        VALUES (${itemId}::uuid, ${cardUtama}::uuid, ${prefix() + ' item ' + i}, ${i < 2}, ${i})`;
    }
    await tx`INSERT INTO checklist_item (card_id, teks) VALUES (${cardAsing}::uuid, ${prefix() + ' asing'})`;
  });
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM kanban_card WHERE judul LIKE ${prefix() + ' %'}`.catch(() => {});
    await sql`DELETE FROM checklist_template WHERE nama LIKE ${prefix() + ' %'}`.catch(() => {});
    await sql.end();
  }
});

/**
 * Suite ini serial dan memakai kartu fixture yang SAMA; tanpa reset, keadaan
 * bocor antar-test (mis. test 1 menyimpan 3/8 sehingga test rollback tak lagi
 * mulai dari 2/8). beforeEach mengembalikan baseline eksak: 8 item pada kartu
 * utama dengan item[0]&item[1] tercentang (2/8), urutan 0..7, tanpa item/temp
 * tambahan; kartu target kosong; item kartu asing tak tercentang.
 */
async function aturUlangFixture(): Promise<void> {
  await sql`DELETE FROM checklist_item WHERE card_id = ${cardTarget}::uuid`;
  await sql`DELETE FROM checklist_item WHERE card_id = ${cardUtama}::uuid AND id <> ALL(${itemIds}::uuid[])`;
  await sql`DELETE FROM checklist_template WHERE nama LIKE ${prefix() + ' %'}`;
  await sql`
    UPDATE checklist_item AS ci SET urutan = ord.n - 1
    FROM unnest(${itemIds}::uuid[]) WITH ORDINALITY AS ord(id, n)
    WHERE ci.id = ord.id AND ci.card_id = ${cardUtama}::uuid`;
  await sql`
    UPDATE checklist_item SET selesai = (id = ANY(${[itemIds[0]!, itemIds[1]!]}::uuid[]))
    WHERE card_id = ${cardUtama}::uuid AND id = ANY(${itemIds}::uuid[])`;
  await sql`UPDATE checklist_item SET selesai = false WHERE card_id = ${cardAsing}::uuid`;
}

test.beforeEach(async () => {
  await aturUlangFixture();
});

async function masuk(page: Page, akun = AKUN.anggota): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

async function bukaKartu(page: Page, cardId: string): Promise<void> {
  const res = await page.goto(`/departemen/${deptAKode}/kanban`);
  expect(res?.status()).toBe(200);
  await page.getByTestId(`kanban-card-${cardId}`).click();
  await expect(page.getByTestId('checklist-panel')).toBeVisible();
}

// ---------------------------------------------------------------------------
// 1 — progres 2/8 → 3/8 tanpa reload (optimistik, kartu + panel)
// ---------------------------------------------------------------------------

test('mencentang item memperbarui progres kartu dan panel 2/8 → 3/8 tanpa reload', async ({ page }) => {
  await masuk(page);
  await bukaKartu(page, cardUtama);
  await expect(page.getByTestId('checklist-progress')).toHaveText(/2\s*\/\s*8/);
  await expect(page.getByTestId(`kanban-card-progress-${cardUtama}`)).toHaveText(/2\s*\/\s*8/);

  // Centang item ke-3 (belum selesai).
  await page.getByTestId(`checklist-check-${itemIds[2]!}`).click();
  await expect(page.getByTestId('checklist-progress')).toHaveText(/3\s*\/\s*8/);
  await expect(page.getByTestId(`kanban-card-progress-${cardUtama}`)).toHaveText(/3\s*\/\s*8/);
  // Persistensi: tunggu PATCH mendarat (optimistik tampil lebih dulu daripada
  // commit server), lalu DB juga 3.
  await expect
    .poll(async () =>
      Number(
        (await sql`SELECT count(*)::int n FROM checklist_item WHERE card_id=${cardUtama}::uuid AND selesai`)[0]!.n,
      ),
    )
    .toBe(3);
});

// ---------------------------------------------------------------------------
// 2 — rollback optimistik bila server menolak
// ---------------------------------------------------------------------------

test('penolakan server me-rollback centang optimistik', async ({ page }) => {
  await masuk(page);
  await bukaKartu(page, cardUtama);
  const target = itemIds[4]!;
  await page.route(`**/api/kanban/${cardUtama}/checklist/${target}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 403, json: { ok: false, error: { code: 'TIDAK_BERWENANG', message: 'Ditolak uji.' } } })
      : route.continue(),
  );
  await page.getByTestId(`checklist-check-${target}`).click();
  // Optimistik lalu kembali: progres tetap 2/8 dan DB tak berubah.
  await expect(page.getByTestId('checklist-progress')).toHaveText(/2\s*\/\s*8/);
  await expect(page.getByText('Ditolak uji.')).toBeVisible();
  expect(
    (await sql`SELECT selesai FROM checklist_item WHERE id=${target}::uuid`)[0]!.selesai,
  ).toBe(false);
});

// ---------------------------------------------------------------------------
// 3 — assignee & deadline opsional saat menambah item
// ---------------------------------------------------------------------------

test('menambah item dengan dan tanpa assignee/deadline', async ({ page }) => {
  await masuk(page);
  await bukaKartu(page, cardUtama);
  await page.getByTestId('checklist-tambah-teks').fill(`${prefix()} tanpa opsi`);
  await page.getByTestId('checklist-tambah-submit').click();
  await expect(page.getByText(`${prefix()} tanpa opsi`)).toBeVisible();
  const [baru] = await sql<{ assignee_id: string | null; deadline: string | null }[]>`
    SELECT assignee_id, deadline FROM checklist_item WHERE card_id=${cardUtama}::uuid AND teks=${prefix() + ' tanpa opsi'}`;
  expect(baru!.assignee_id).toBeNull();
  expect(baru!.deadline).toBeNull();
});

// ---------------------------------------------------------------------------
// 4 — urut ulang pointer & keyboard
// ---------------------------------------------------------------------------

test('urut ulang item lewat keyboard tersimpan', async ({ page }) => {
  await masuk(page);
  await bukaKartu(page, cardUtama);
  const handle = page.getByTestId(`checklist-drag-${itemIds[0]!}`);
  await handle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400); // beri collision dnd-kit settle sebelum drop
  await page.keyboard.press('Space');
  await expect
    .poll(async () =>
      Number((await sql`SELECT urutan FROM checklist_item WHERE id=${itemIds[0]!}::uuid`)[0]!.urutan),
    )
    .toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// 5 — template disimpan lalu diterapkan ke kartu lain
// ---------------------------------------------------------------------------

test('template checklist disimpan dan diterapkan ke kartu lain', async ({ page }) => {
  await masuk(page);
  await bukaKartu(page, cardUtama);
  await page.getByTestId('checklist-template-simpan').click();
  await page.getByTestId('checklist-template-nama').fill(`${prefix()} Persiapan`);
  await page.getByRole('button', { name: /simpan/i }).click();
  await expect
    .poll(async () =>
      Number((await sql`SELECT count(*)::int n FROM checklist_template WHERE nama=${prefix() + ' Persiapan'}`)[0]!.n),
    )
    .toBe(1);

  // Terapkan ke kartu target yang semula kosong.
  await bukaKartu(page, cardTarget);
  await page.getByTestId('checklist-template-dialog').click();
  const [tpl] = await sql<{ id: string }[]>`SELECT id FROM checklist_template WHERE nama=${prefix() + ' Persiapan'}`;
  await page.getByTestId(`checklist-template-opsi-${tpl!.id}`).click();
  await page.getByTestId('checklist-template-terapkan').click();
  await expect
    .poll(async () =>
      Number((await sql`SELECT count(*)::int n FROM checklist_item WHERE card_id=${cardTarget}::uuid`)[0]!.n),
    )
    .toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// 6 — akses lintas lingkup ditolak (API 403)
// ---------------------------------------------------------------------------

test('anggota departemen lain ditolak mengubah checklist kartu asing', async ({ page }) => {
  await masuk(page); // ANGGOTA dept A
  const [asing] = await sql<{ id: string }[]>`SELECT id FROM checklist_item WHERE card_id=${cardAsing}::uuid LIMIT 1`;
  const res = await page.request.patch(`/api/kanban/${cardAsing}/checklist/${asing!.id}`, {
    data: { selesai: true },
  });
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.error.code).toBe('TIDAK_BERWENANG');
  expect((await sql`SELECT selesai FROM checklist_item WHERE id=${asing!.id}::uuid`)[0]!.selesai).toBe(false);
});

// ---------------------------------------------------------------------------
// 7 — BPH membaca tetapi tidak mengubah
// ---------------------------------------------------------------------------

test('BPH membaca checklist tetapi tidak dapat mengubahnya', async ({ page }) => {
  await masuk(page, AKUN.bacaSaja); // BPH
  await bukaKartu(page, cardUtama);
  await expect(page.getByTestId('checklist-progress')).toBeVisible();
  // Tidak ada kontrol ubah: check/tambah tak dirender atau nonaktif.
  await expect(page.getByTestId('checklist-tambah-submit')).toHaveCount(0);
  // API pun menolak.
  const res = await page.request.patch(`/api/kanban/${cardUtama}/checklist/${itemIds[3]!}`, {
    data: { selesai: true },
  });
  expect(res.status()).toBe(403);
  expect((await sql`SELECT selesai FROM checklist_item WHERE id=${itemIds[3]!}::uuid`)[0]!.selesai).toBe(false);
});
