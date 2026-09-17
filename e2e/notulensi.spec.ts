/**
 * Gate T-106 (lane data) — notulensi rapat. BUKAN implementasi UI atau penanda
 * DONE. Skip HANYA saat file tujuan UI belum ada; sesudah ada, kegagalan
 * fixture/selector/HTTP tak boleh diubah menjadi skip.
 *
 * Menguji (PRD M13 · docs/ai/NOTULENSI_CONTRACT.md): ringkasan Hadir/Izin/Sakit/
 * Alfa · keputusan tersimpan terpisah · sanitasi konten · pencarian berdasarkan
 * ISI · action item menjadi kartu di departemen yang benar · tanpa duplikasi
 * konversi · generate DOCX · pembatasan role/lingkup.
 *
 * data-testid WAJIB (kontrak §6): notulensi-cari, notulensi-list,
 * notulensi-row-{id}, notulensi-editor, notulensi-hadir-{userId},
 * notulensi-hadir-ringkasan, notulensi-keputusan, notulensi-action-item-{id},
 * notulensi-action-dept-{id}, notulensi-action-konversi-{id}, notulensi-simpan,
 * notulensi-generate.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const belumAda = [
  'app/api/notulensi/route.ts',
  'components/notulensi/NotulensiEditor.tsx',
].filter((f) => !fs.existsSync(path.resolve(f)));
test.skip(belumAda.length > 0, `skip-until-UI T-106: file belum tersedia: ${belumAda.join(', ')}`);
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
  if (!url) throw new Error('Gate notulensi butuh DIRECT_URL/DATABASE_URL untuk fixture.');
  return url;
}

const prefix = () => `E2E106-${test.info().project.name}`;
let sql: ReturnType<typeof postgres>;
let deptA: string;
let adminId: string;
let anggotaId: string;

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  adminId = (await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email=${AKUN.admin.email} LIMIT 1`)[0]!.id;
  const [periode] = await sql<{ id: string }[]>`SELECT id FROM periode WHERE status='AKTIF' LIMIT 1`;
  const [ang] = await sql<{ id: string; departemen_id: string }[]>`
    SELECT u.id, ur.departemen_id FROM app_user u
    JOIN user_role ur ON ur.user_id=u.id AND ur.periode_id=${periode!.id}::uuid
    WHERE u.email=${AKUN.anggota.email} AND ur.role='ANGGOTA' ORDER BY ur.id LIMIT 1`;
  anggotaId = ang!.id;
  deptA = ang!.departemen_id;
});

test.afterAll(async () => {
  if (sql) {
    await sql`DELETE FROM notulensi WHERE judul LIKE ${prefix() + ' %'}`.catch(() => {});
    await sql`DELETE FROM kanban_card WHERE judul LIKE ${prefix() + ' %'}`.catch(() => {});
    await sql.end();
  }
});

async function masuk(page: Page, akun = AKUN.sekum): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

/** Buat notulensi via API sebagai SEKUM; kembalikan id. */
async function buat(req: APIRequestContext, body: Record<string, unknown>): Promise<string> {
  const res = await req.post('/api/notulensi', { data: body });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data.id as string;
}

const kontenIsi = (teks: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: teks }] }],
});

// ---------------------------------------------------------------------------
// 1 — ringkasan Hadir/Izin/Sakit/Alfa cocok status per orang
// ---------------------------------------------------------------------------

test('ringkasan kehadiran cocok dengan status per orang', async ({ page }) => {
  await masuk(page);
  const id = await buat(page.request, {
    judul: `${prefix()} Ringkasan`,
    tanggal: '2026-09-10',
    departemen_id: deptA,
    kehadiran: [
      { user_id: adminId, status: 'HADIR' },
      { user_id: anggotaId, status: 'IZIN' },
    ],
  });
  const res = await page.request.get(`/api/notulensi/${id}`);
  const d = (await res.json()).data;
  expect(d.ringkasan).toMatchObject({ hadir: 1, izin: 1, sakit: 0, alfa: 0 });

  // UI menampilkan ringkasan yang sama.
  await page.goto(`/sekretariat/notulensi/${id}`, { waitUntil: 'load' });
  await expect(page.getByTestId('notulensi-hadir-ringkasan')).toContainText(/1\s*Hadir/i);
  await expect(page.getByTestId('notulensi-hadir-ringkasan')).toContainText(/1\s*Izin/i);
});

// ---------------------------------------------------------------------------
// 2 — keputusan tersimpan terpisah dari isi
// ---------------------------------------------------------------------------

test('keputusan tersimpan terpisah dari konten', async ({ page }) => {
  await masuk(page);
  const id = await buat(page.request, {
    judul: `${prefix()} Keputusan`,
    tanggal: '2026-09-10',
    departemen_id: deptA,
    konten: kontenIsi('Pembahasan agenda utama'),
    keputusan: ['Proker X disetujui', 'Deadline LPJ diperpanjang'],
  });
  const d = (await (await page.request.get(`/api/notulensi/${id}`)).json()).data;
  expect(d.keputusan).toEqual(['Proker X disetujui', 'Deadline LPJ diperpanjang']);
  // Keputusan TIDAK dilebur ke konten.
  expect(JSON.stringify(d.konten)).not.toContain('Proker X disetujui');
});

// ---------------------------------------------------------------------------
// 3 — sanitasi konten (node/mark asing dibuang)
// ---------------------------------------------------------------------------

test('konten disanitasi sebelum disimpan', async ({ page }) => {
  await masuk(page);
  const id = await buat(page.request, {
    judul: `${prefix()} Sanitasi`,
    tanggal: '2026-09-10',
    departemen_id: deptA,
    konten: {
      type: 'doc',
      content: [
        { type: 'script', content: [{ type: 'text', text: 'jahat()' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'aman', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
      ],
    },
  });
  const d = (await (await page.request.get(`/api/notulensi/${id}`)).json()).data;
  const s = JSON.stringify(d.konten);
  expect(s).not.toContain('script');
  expect(s).not.toContain('javascript:');
});

// ---------------------------------------------------------------------------
// 4 — pencarian berdasarkan isi (bukan hanya judul)
// ---------------------------------------------------------------------------

test('pencarian menemukan notulensi berdasarkan isi', async ({ page }) => {
  await masuk(page);
  const kataUnik = `zephyrus${Date.now()}`;
  const id = await buat(page.request, {
    judul: `${prefix()} Cari`,
    tanggal: '2026-09-10',
    departemen_id: deptA,
    konten: kontenIsi(`Rapat membahas ${kataUnik} anggaran`),
  });
  const res = await page.request.get(`/api/notulensi?q=${kataUnik}`);
  const data = (await res.json()).data as { id: string }[];
  expect(data.some((n) => n.id === id)).toBe(true);
});

// ---------------------------------------------------------------------------
// 5 & 6 — action item → kartu di dept benar; tanpa duplikasi konversi
// ---------------------------------------------------------------------------

test('konversi action item membuat kartu di departemen benar, tanpa duplikasi', async ({ page }) => {
  await masuk(page);
  const id = await buat(page.request, {
    judul: `${prefix()} Action`,
    tanggal: '2026-09-10',
    departemen_id: deptA,
    action_items: [{ tugas: `${prefix()} Revisi RAB` }],
  });
  const d = (await (await page.request.get(`/api/notulensi/${id}`)).json()).data;
  const aid = d.action_items[0].id as string;

  const r1 = await page.request.post(`/api/notulensi/${id}/action-item/${aid}/convert`, { data: {} });
  expect(r1.status()).toBe(200);
  const cardId = (await r1.json()).data.kanban_card_id as string;
  // Kartu berada di departemen notulensi.
  expect((await sql`SELECT departemen_id FROM kanban_card WHERE id=${cardId}::uuid`)[0]!.departemen_id).toBe(deptA);

  // Konversi kedua ditolak (anti duplikasi), tanpa kartu baru.
  const r2 = await page.request.post(`/api/notulensi/${id}/action-item/${aid}/convert`, { data: {} });
  expect(r2.status()).toBe(409);
  expect(Number((await sql`SELECT count(*)::int n FROM kanban_card WHERE judul=${prefix() + ' Revisi RAB'}`)[0]!.n)).toBe(1);
});

// ---------------------------------------------------------------------------
// 7 — generate DOCX
// ---------------------------------------------------------------------------

test('generate DOCX mengembalikan berkas .docx', async ({ page }) => {
  await masuk(page);
  const id = await buat(page.request, {
    judul: `${prefix()} DOCX`,
    tanggal: '2026-09-10',
    departemen_id: deptA,
    konten: kontenIsi('Isi untuk dokumen'),
    keputusan: ['Keputusan satu'],
  });
  const res = await page.request.post(`/api/notulensi/${id}/generate`, { data: {} });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/wordprocessingml|officedocument|application\/octet-stream/);
  const buf = await res.body();
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.slice(0, 2).toString()).toBe('PK'); // zip/docx
});

// ---------------------------------------------------------------------------
// 8 — pembatasan role/lingkup
// ---------------------------------------------------------------------------

test('ANGGOTA (read-only) ditolak membuat notulensi', async ({ page }) => {
  await masuk(page, AKUN.anggota);
  const res = await page.request.post('/api/notulensi', {
    data: { judul: `${prefix()} Tolak`, tanggal: '2026-09-10', departemen_id: deptA },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).ok).toBe(false);
});
