/**
 * Gate T-080 (lane data), bukan implementasi UI atau penanda T-080 DONE.
 * Skip hanya saat salah satu file tujuan T-080 belum ada di checkout.
 * Setelah semuanya ada, 404/401/403/500 yang tidak diharapkan adalah kegagalan;
 * fixture/login/selector gagal juga tidak boleh diubah menjadi skip.
 *
 * Antarmuka integrasi untuk lane UI:
 * GET /api/kanban?departemen_id=UUID -> K-02 data: KartuKanban[].
 * PATCH /api/kanban/{id} body { kolom, urutan } -> K-02, 403 bila di luar izin.
 * Filter form: label Penanggung jawab, Proker, Prioritas, Deadline (tanggal
 * paling lambat); select memakai ID/enum sebagai value, deadline input date.
 * Test ID: kanban-board, kanban-column-{TODO|IN_PROGRESS|REVIEW|DONE},
 * kanban-card-{id}, kanban-drag-{id}. Drag handle menerima Tab/Space/panah.
 * BPH: handle tidak dirender atau aria-disabled=true.
 * Master Gantt memakai aria-label progres yang sudah ada, tanpa selector baru.
 *
 * Request aplikasi selalu memakai cookie sesi. Koneksi owner hanya untuk
 * menyemai, membaca hasil simpan, dan membersihkan ID fixture yang eksak.
 */
import fs from 'node:fs';

import type { Locator, Page } from '@playwright/test';

import { AKUN } from './fixtures/akun';
import { test, expect, masukKanban, type KartuKanban } from './fixtures/kanban';

const belumAda = [
  'app/(dashboard)/departemen/[kode]/kanban/page.tsx',
  'app/api/kanban/route.ts',
  'app/api/kanban/[id]/route.ts',
].filter((file) => !fs.existsSync(file));

test.skip(
  belumAda.length > 0,
  `skip-until-UI T-080 / ADR-058: file belum tersedia: ${belumAda.join(', ')}`,
);

const kolom = (page: Page, kode: string) => page.getByTestId(`kanban-column-${kode}`);
const kartu = (page: Page, id: string) => page.getByTestId(`kanban-card-${id}`);
const handle = (page: Page, id: string) => page.getByTestId(`kanban-drag-${id}`);
const endpoint = (id: string) => `/api/kanban/${id}`;

async function buka(page: Page, kode: string): Promise<void> {
  const response = await page.goto(`/departemen/${kode}/kanban`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('kanban-board')).toBeVisible();
}

async function geserMouse(page: Page, sumber: Locator, tujuan: Locator): Promise<void> {
  await sumber.scrollIntoViewIfNeeded();
  const asal = await sumber.boundingBox();
  expect(asal).not.toBeNull();
  await page.mouse.move(asal!.x + asal!.width / 2, asal!.y + asal!.height / 2);
  await page.mouse.down();
  // PointerSensor dnd-kit diaktifkan dengan gerak sungguhan, bukan HTML5 drag.
  await page.mouse.move(asal!.x + asal!.width / 2 + 12, asal!.y + asal!.height / 2, { steps: 3 });
  await tujuan.scrollIntoViewIfNeeded();
  const akhir = await tujuan.boundingBox();
  expect(akhir).not.toBeNull();
  await page.mouse.move(akhir!.x + akhir!.width / 2, akhir!.y + Math.min(100, akhir!.height / 2), {
    steps: 12,
  });
  await page.mouse.up();
}

async function tabKe(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  await expect(target, 'Drag handle harus dapat dijangkau lewat Tab').toBeFocused();
}

test('empat kolom tetap tampil dan kartu asing tidak bocor', async ({ page, kanban }) => {
  await masukKanban(page);
  await buka(page, kanban.departemen.kode);
  const semua = page.getByTestId('kanban-board').locator('[data-testid^="kanban-column-"]');
  await expect(semua).toHaveCount(4);
  for (const [kode, nama] of [
    ['TODO', 'To Do'],
    ['IN_PROGRESS', 'In Progress'],
    ['REVIEW', 'Review'],
    ['DONE', 'Done'],
  ]) {
    await expect(kolom(page, kode!)).toContainText(nama!);
  }
  await expect(kartu(page, kanban.kartu.gerak.id)).toContainText(kanban.kartu.gerak.judul);
  await expect(kartu(page, kanban.kartu.asing.id)).toHaveCount(0);
});

for (const filter of ['Penanggung jawab', 'Proker', 'Prioritas', 'Deadline'] as const) {
  test(`filter ${filter} menyaring kartu`, async ({ page, kanban }) => {
    await masukKanban(page);
    await buka(page, kanban.departemen.kode);
    await expect(kartu(page, kanban.kartu.filter.id)).toBeVisible();
    const field = page.getByLabel(filter, { exact: true });
    if (filter === 'Deadline') await field.fill(kanban.deadline);
    else
      await field.selectOption(
        filter === 'Penanggung jawab'
          ? kanban.anggotaId
          : filter === 'Proker'
            ? kanban.prokerId
            : 'TINGGI',
      );
    await expect(kartu(page, kanban.kartu.gerak.id)).toBeVisible();
    await expect(kartu(page, kanban.kartu.filter.id)).toHaveCount(0);
    if (filter === 'Proker') await expect(kartu(page, kanban.kartu.selesai.id)).toBeVisible();
    else await expect(kartu(page, kanban.kartu.selesai.id)).toHaveCount(0);
  });
}

test('drag mouse berpindah kolom dan tersimpan setelah reload', async ({ page, kanban }) => {
  await masukKanban(page);
  await buka(page, kanban.departemen.kode);
  const id = kanban.kartu.gerak.id;
  const respons = page.waitForResponse(
    (r) => r.url().endsWith(endpoint(id)) && r.request().method() === 'PATCH',
  );
  await geserMouse(page, handle(page, id), kolom(page, 'IN_PROGRESS'));
  expect((await respons).status()).toBe(200);
  await expect(kolom(page, 'IN_PROGRESS').getByTestId(`kanban-card-${id}`)).toBeVisible();
  expect((await kanban.sql`SELECT kolom FROM kanban_card WHERE id = ${id}::uuid`)[0]?.kolom).toBe(
    'IN_PROGRESS',
  );
  await page.reload();
  await expect(kolom(page, 'IN_PROGRESS').getByTestId(`kanban-card-${id}`)).toBeVisible();
});

test('drag keyboard memakai Tab, Space, panah dan Space', async ({ page, kanban }) => {
  await masukKanban(page);
  await buka(page, kanban.departemen.kode);
  const id = kanban.kartu.gerak.id;
  await tabKe(page, handle(page, id));
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  // Beri koordinat keyboard + collision dnd-kit settle sebelum menjatuhkan.
  // ArrowRight menghitung ulang posisi lalu `over` diperbarui pada siklus
  // pengukuran berikutnya; menjatuhkan (Space) seketika membuat selesaiDrag
  // menerima `over` yang belum menjadi IN_PROGRESS → tak ada PATCH. Emulasi
  // mobile lebih lambat menetap sehingga deterministik gagal tanpa jeda ini;
  // pengguna keyboard sungguhan pun tak menekan panah lalu Space dalam mili-
  // detik yang sama.
  await page.waitForTimeout(400);
  const respons = page.waitForResponse(
    (r) => r.url().endsWith(endpoint(id)) && r.request().method() === 'PATCH',
  );
  await page.keyboard.press('Space');
  expect((await respons).status()).toBe(200);
  await expect(kolom(page, 'IN_PROGRESS').getByTestId(`kanban-card-${id}`)).toBeVisible();
  await expect(handle(page, id)).toBeFocused();
  expect((await kanban.sql`SELECT kolom FROM kanban_card WHERE id = ${id}::uuid`)[0]?.kolom).toBe(
    'IN_PROGRESS',
  );
});

test('optimistic update tampil sebelum server merespons', async ({ page, kanban }) => {
  await masukKanban(page);
  await buka(page, kanban.departemen.kode);
  const id = kanban.kartu.gerak.id;
  let lepas!: () => void;
  const tahan = new Promise<void>((resolve) => {
    lepas = resolve;
  });
  let diterima = false;
  await page.route(`**${endpoint(id)}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    diterima = true;
    await tahan;
    await route.continue();
  });
  const respons = page.waitForResponse(
    (r) => r.url().endsWith(endpoint(id)) && r.request().method() === 'PATCH',
  );
  try {
    await geserMouse(page, handle(page, id), kolom(page, 'IN_PROGRESS'));
    await expect.poll(() => diterima).toBe(true);
    await expect(kolom(page, 'IN_PROGRESS').getByTestId(`kanban-card-${id}`)).toBeVisible();
    expect((await kanban.sql`SELECT kolom FROM kanban_card WHERE id = ${id}::uuid`)[0]?.kolom).toBe(
      'TODO',
    );
  } finally {
    lepas();
  }
  expect((await respons).status()).toBe(200);
  await expect
    .poll(
      async () =>
        (await kanban.sql`SELECT kolom FROM kanban_card WHERE id = ${id}::uuid`)[0]?.kolom,
    )
    .toBe('IN_PROGRESS');
});

test('penolakan API me-rollback optimistic update dan menampilkan alasan', async ({
  page,
  kanban,
}) => {
  await masukKanban(page);
  await buka(page, kanban.departemen.kode);
  const id = kanban.kartu.gerak.id;
  const alasan = 'Perubahan Kanban ditolak oleh server uji.';
  let lepas!: () => void;
  const tahan = new Promise<void>((resolve) => {
    lepas = resolve;
  });
  let diterima = false;
  await page.route(`**${endpoint(id)}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    diterima = true;
    await tahan;
    await route.fulfill({
      status: 403,
      json: { ok: false, error: { code: 'TIDAK_BERWENANG', message: alasan } },
    });
  });
  try {
    await geserMouse(page, handle(page, id), kolom(page, 'IN_PROGRESS'));
    await expect.poll(() => diterima).toBe(true);
    await expect(kolom(page, 'IN_PROGRESS').getByTestId(`kanban-card-${id}`)).toBeVisible();
  } finally {
    lepas();
  }
  await expect(kolom(page, 'TODO').getByTestId(`kanban-card-${id}`)).toBeVisible();
  await expect(page.getByText(alasan, { exact: true })).toBeVisible();
  expect((await kanban.sql`SELECT kolom FROM kanban_card WHERE id = ${id}::uuid`)[0]?.kolom).toBe(
    'TODO',
  );
  await page.reload();
  await expect(kolom(page, 'TODO').getByTestId(`kanban-card-${id}`)).toBeVisible();
});

test('BPH membaca dua departemen tetapi tidak dapat menggeser kartu', async ({ page, kanban }) => {
  await masukKanban(page, AKUN.bacaSaja);
  await buka(page, kanban.departemenLain.kode);
  await expect(kartu(page, kanban.kartu.asing.id)).toBeVisible();
  await buka(page, kanban.departemen.kode);
  const id = kanban.kartu.gerak.id;
  if (await handle(page, id).count())
    await expect(handle(page, id)).toHaveAttribute('aria-disabled', 'true');
  let mutasi = 0;
  page.on('request', (req) => {
    if (req.url().endsWith(endpoint(id)) && req.method() === 'PATCH') mutasi++;
  });
  await geserMouse(page, kartu(page, id), kolom(page, 'IN_PROGRESS'));
  await expect(kolom(page, 'TODO').getByTestId(`kanban-card-${id}`)).toBeVisible();
  expect(mutasi).toBe(0);
  expect((await kanban.sql`SELECT kolom FROM kanban_card WHERE id = ${id}::uuid`)[0]?.kolom).toBe(
    'TODO',
  );
});

for (const kasus of ['anggota sendiri', 'anggota asing', 'BPH'] as const) {
  test(`API mutasi ${kasus} menegakkan permission sesi`, async ({ page, kanban }) => {
    await masukKanban(page, kasus === 'BPH' ? AKUN.bacaSaja : AKUN.anggota);
    const id = kasus === 'anggota asing' ? kanban.kartu.asing.id : kanban.kartu.gerak.id;
    const boleh = kasus === 'anggota sendiri';
    const res = await page.request.patch(endpoint(id), {
      data: { kolom: 'IN_PROGRESS', urutan: 0 },
    });
    expect(res.status()).toBe(boleh ? 200 : 403);
    const body = await res.json();
    expect(body.ok).toBe(boleh);
    if (!boleh) expect(body.error.code).toBe('TIDAK_BERWENANG');
    expect((await kanban.sql`SELECT kolom FROM kanban_card WHERE id = ${id}::uuid`)[0]?.kolom).toBe(
      boleh ? 'IN_PROGRESS' : 'TODO',
    );
  });
}

test('role dan departemen palsu di body tidak memberi izin', async ({ page, kanban }) => {
  await masukKanban(page);
  const id = kanban.kartu.asing.id;
  const res = await page.request.patch(endpoint(id), {
    data: { kolom: 'DONE', urutan: 0, role: 'ADMIN', departemen_id: kanban.departemen.id },
  });
  expect([400, 403]).toContain(res.status());
  expect((await res.json()).ok).toBe(false);
  const [tersimpan] =
    await kanban.sql`SELECT kolom, departemen_id FROM kanban_card WHERE id = ${id}::uuid`;
  expect(tersimpan?.kolom).toBe('TODO');
  expect(tersimpan?.departemen_id).toBe(kanban.departemenLain.id);
});

test('API daftar Anggota menolak lingkup departemen asing', async ({ page, kanban }) => {
  await masukKanban(page);
  const sendiri = await page.request.get(`/api/kanban?departemen_id=${kanban.departemen.id}`);
  expect(sendiri.status()).toBe(200);
  const body = (await sendiri.json()) as { ok: boolean; data: KartuKanban[] };
  expect(body.ok).toBe(true);
  expect(body.data.some((c) => c.id === kanban.kartu.gerak.id)).toBe(true);
  expect(body.data.some((c) => c.id === kanban.kartu.asing.id)).toBe(false);
  const asing = await page.request.get(`/api/kanban?departemen_id=${kanban.departemenLain.id}`);
  expect(asing.status()).toBe(403);
  expect((await asing.json()).ok).toBe(false);
});

test('Anggota tidak dapat membuka board departemen asing', async ({ page, kanban }) => {
  await masukKanban(page);
  const res = await page.goto(`/departemen/${kanban.departemenLain.kode}/kanban`);
  expect(res?.status()).not.toBe(404);
  await expect(page.getByTestId('kanban-board')).toHaveCount(0);
  await expect(kartu(page, kanban.kartu.asing.id)).toHaveCount(0);
  await expect(
    page.getByText(/tidak berwenang|tidak memiliki (akses|izin)|akses ditolak/i).first(),
  ).toBeVisible();
});

test('kartu Done mengubah progres 50 ke 100 pada Master Gantt yang sudah terbuka', async ({
  page,
  kanban,
}) => {
  await masukKanban(page);
  const master = await page.context().newPage();
  await master.goto('/');
  await expect(master.getByTestId('master-gantt')).toBeVisible();
  await master.getByTestId('master-gantt-departemen').selectOption(kanban.departemen.id);
  const bar = master.getByRole('button', { name: new RegExp(kanban.prokerNama) });
  await expect(bar).toHaveAttribute('aria-label', /progres 50 persen/);
  await buka(page, kanban.departemen.kode);
  const id = kanban.kartu.gerak.id;
  const respons = page.waitForResponse(
    (r) => r.url().endsWith(endpoint(id)) && r.request().method() === 'PATCH',
  );
  await geserMouse(page, handle(page, id), kolom(page, 'DONE'));
  expect((await respons).status()).toBe(200);
  await expect(kolom(page, 'DONE').getByTestId(`kanban-card-${id}`)).toBeVisible();
  // Tanpa reload/goto ulang: gate ini membuktikan penyegaran tampilan hidup.
  await expect(bar).toHaveAttribute('aria-label', /progres 100 persen/, { timeout: 5000 });
  const res = await master.request.get('/api/gantt/master');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    data: { proker_id: string; progres: number }[];
  };
  expect(body.ok).toBe(true);
  expect(Number(body.data.find((p) => p.proker_id === kanban.prokerId)?.progres)).toBe(100);
  expect(
    Number(
      (
        await kanban.sql`SELECT progres FROM v_master_gantt WHERE proker_id = ${kanban.prokerId}::uuid`
      )[0]?.progres,
    ),
  ).toBe(100);
  await master.close();
});
