/**
 * Gate T-093 — Job Desk & Gantt divisi (PRD F-8.2, INV-30).
 *
 * Menguji:
 *   - halaman divisi TIDAK memuat TipTap sampai "Ubah job desk" ditekan
 *     (tidak ada chunk JS berisi kode ProseMirror sebelum klik);
 *   - koordinator menulis job desk: auto-save 10 detik → "Tersimpan ✓",
 *     konten tersimpan di DB sebagai JSON dan tampil di mode baca;
 *   - konten berbahaya (node asing, tautan javascript:) disanitasi sebelum disimpan;
 *   - divisi lain: job desk terbaca, tombol ubah tidak ada di DOM, PUT → 403;
 *   - Gantt divisi = editor T-078 scope DIVISI: tulis di divisi sendiri, baca
 *     di divisi lain; divisi tanpa chart dapat dibuatkan timeline-nya.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './fixtures/akun';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

function bacaKoneksi(): string {
  const env: Record<string, string> = {};
  const berkas = path.resolve('.env.local');
  if (fs.existsSync(berkas)) {
    for (const b of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const i = b.indexOf('=');
      if (i > 0 && !b.trimStart().startsWith('#'))
        env[b.slice(0, i).trim()] = b
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
    }
  }
  const url =
    process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error('Gate job-desk butuh DIRECT_URL/DATABASE_URL.');
  return url;
}

/** Penanda kode prosemirror-view (dipakai TipTap) — ada di build dev maupun produksi. */
const PENANDA_TIPTAP = 'ProseMirror-hideselection';

let sql: ReturnType<typeof postgres>;
let prokerId = '';
let acaraId = '';
const div = { konsumsi: '', pdd: '', acara: '' };

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function sesi(browser: Browser, akun: AkunUji): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await masuk(page, akun);
  return page;
}

const idAkun = async (akun: AkunUji) =>
  (await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${akun.email}`)[0]!.id;

async function chartDivisi(divisiId: string, nama: string): Promise<void> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO gantt_chart (scope, divisi_id, judul) VALUES ('DIVISI', ${divisiId}::uuid, ${`Gantt Divisi ${nama}`}) RETURNING id::text`;
  const [g] = await sql<{ id: string }[]>`
    INSERT INTO gantt_group (chart_id, nama, warna) VALUES (${c!.id}::uuid, 'Persiapan', '#2563EB') RETURNING id::text`;
  await sql`
    INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai, progres)
    VALUES (${g!.id}::uuid, ${`Tugas ${nama}`}, '2028-11-02', '2028-11-10', 20)`;
}

test.beforeAll(async () => {
  sql = postgres(bacaKoneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
  const tag = `${test.info().project.name === 'mobile' ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const nama = `E2E093 ${tag} SYNCHRONIZE`;
  const [p] = await sql<
    { id: string }[]
  >`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await idAkun(AKUN.kadept);
  const anggota = await idAkun(AKUN.anggota);
  const ketuplak = await idAkun(AKUN.sekum);
  const [d] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role
    WHERE user_id = ${kadept}::uuid AND periode_id = ${p!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;

  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${p!.id}::uuid, ${d!.id}::uuid, ${nama}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      '2028-11-01', '2028-12-06', '2028-12-07', ${kadept}::uuid)
    RETURNING id::text`;
  prokerId = pr!.id;
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
    VALUES (${prokerId}::uuid, ${nama}, ${`JD${tag}`}, ${ketuplak}::uuid) RETURNING id::text`;
  acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${acaraId}::uuid)`;

  const [dk] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${acaraId}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  const [dp] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${acaraId}::uuid, 'PDD', 2) RETURNING id::text`;
  const [da] = await sql<{ id: string }[]>`
    INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${acaraId}::uuid, 'Acara', 3) RETURNING id::text`;
  div.konsumsi = dk!.id;
  div.pdd = dp!.id;
  div.acara = da!.id;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${div.konsumsi}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;

  // Job desk PDD sudah berisi; Konsumsi kosong seperti hasil bentuk_kepanitiaan().
  const pdd = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tugas PDD' }] },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Siapkan kamera' }] }],
          },
        ],
      },
    ],
  };
  await sql`INSERT INTO job_desk (divisi_id, konten, updated_by) VALUES
    (${div.pdd}::uuid, ${sql.json(pdd)}, ${ketuplak}::uuid),
    (${div.konsumsi}::uuid, ${sql.json({ type: 'doc', content: [{ type: 'paragraph' }] })}, ${ketuplak}::uuid)`;

  await chartDivisi(div.konsumsi, 'Konsumsi');
  await chartDivisi(div.pdd, 'PDD');
});

test.afterAll(async () => {
  if (sql) {
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    await sql.end();
  }
});

test('koordinator: TipTap baru dimuat saat editor dibuka, auto-save → Tersimpan ✓', async ({
  browser,
}) => {
  const koor = await sesi(browser, AKUN.anggota);
  const skripTiptap: string[] = [];
  koor.on('response', async (res) => {
    if (res.request().resourceType() !== 'script') return;
    const isi = await res.text().catch(() => '');
    if (isi.includes(PENANDA_TIPTAP)) skripTiptap.push(res.url());
  });

  await koor.goto(`/acara/${acaraId}/divisi/${div.konsumsi}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('ruang-divisi')).toHaveAttribute('data-mode', 'tulis', {
    timeout: 60_000,
  });
  await expect(koor.getByTestId('job-desk-kosong')).toBeVisible();
  await koor.waitForLoadState('networkidle');
  expect(skripTiptap, 'TipTap termuat sebelum editor dibuka').toEqual([]);
  await expect(koor.locator('.ProseMirror')).toHaveCount(0);

  await koor.getByTestId('job-desk-ubah').click();
  const editor = koor.getByRole('textbox', { name: 'Isi job desk' });
  await expect(editor).toBeVisible({ timeout: 60_000 });
  expect(skripTiptap.length, 'chunk TipTap dimuat setelah editor dibuka').toBeGreaterThan(0);

  await editor.click();
  await koor.keyboard.type('Belanja snack peserta');
  await koor.getByRole('button', { name: 'Checklist' }).click();
  await koor.keyboard.type('Pesan katering H-3');
  await expect(koor.getByTestId('job-desk-status')).toHaveAttribute('data-status', 'berubah');
  // Auto-save tiap 10 detik — tanpa menekan apa pun.
  await expect(koor.getByTestId('job-desk-status')).toHaveAttribute('data-status', 'tersimpan', {
    timeout: 25_000,
  });
  await expect(koor.getByTestId('job-desk-status')).toContainText('Tersimpan');

  const [j] = await sql<
    { konten: unknown }[]
  >`SELECT konten FROM job_desk WHERE divisi_id = ${div.konsumsi}::uuid`;
  const teks = JSON.stringify(j!.konten);
  expect(teks).toContain('Belanja snack peserta');
  expect(teks).toContain('"taskItem"');

  await koor.getByTestId('job-desk-selesai').click();
  await expect(koor.getByTestId('job-desk')).toHaveAttribute('data-mode', 'baca');
  await expect(koor.getByTestId('konten-prosa')).toContainText('Pesan katering H-3');
  // Muat ulang: tersimpan permanen, dirender tanpa TipTap.
  await koor.reload({ waitUntil: 'load' });
  await expect(koor.getByTestId('konten-prosa')).toContainText('Belanja snack peserta', {
    timeout: 60_000,
  });
  await expect(koor.locator('.ProseMirror')).toHaveCount(0);
  await koor.context().close();
});

test('konten berbahaya disanitasi sebelum disimpan', async ({ browser }) => {
  const koor = await sesi(browser, AKUN.anggota);
  const r = await koor.request.put(`/api/divisi/${div.konsumsi}/job-desk`, {
    data: {
      konten: {
        type: 'doc',
        content: [
          { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
          {
            type: 'paragraph',
            attrs: { onclick: 'alert(1)' },
            content: [
              {
                type: 'text',
                text: 'klik',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      },
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  const [j] = await sql<
    { konten: unknown }[]
  >`SELECT konten FROM job_desk WHERE divisi_id = ${div.konsumsi}::uuid`;
  const teks = JSON.stringify(j!.konten);
  expect(teks).not.toContain('script');
  expect(teks).not.toContain('javascript:');
  expect(teks).not.toContain('onclick');
  expect(teks).toContain('klik');
  await koor.context().close();
});

test('divisi lain: job desk terbaca, tombol ubah tidak ada, PUT ditolak 403', async ({
  browser,
}) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto(`/acara/${acaraId}/divisi/${div.pdd}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('ruang-divisi')).toHaveAttribute('data-mode', 'baca', {
    timeout: 60_000,
  });
  await expect(koor.getByTestId('konten-prosa')).toContainText('Tugas PDD');
  await expect(koor.getByTestId('konten-prosa').locator('[data-checked="true"]')).toContainText(
    'Siapkan kamera',
  );
  await expect(koor.getByTestId('job-desk-ubah')).toHaveCount(0);

  const r = await koor.request.put(`/api/divisi/${div.pdd}/job-desk`, {
    data: { konten: { type: 'doc', content: [{ type: 'paragraph' }] } },
  });
  expect(r.status(), await r.text()).toBe(403);
  const [j] = await sql<
    { konten: unknown }[]
  >`SELECT konten FROM job_desk WHERE divisi_id = ${div.pdd}::uuid`;
  expect(JSON.stringify(j!.konten)).toContain('Tugas PDD');
  await koor.context().close();
});

test('Gantt divisi: editor T-078 — tulis di divisi sendiri, baca di divisi lain', async ({
  browser,
}) => {
  const koor = await sesi(browser, AKUN.anggota);
  await koor.goto(`/acara/${acaraId}/divisi/${div.konsumsi}`, { waitUntil: 'load' });
  const sendiri = koor.getByTestId('divisi-gantt');
  await expect(sendiri.getByTestId('gantt-editor-root')).toHaveAttribute(
    'data-editor-izin',
    'tulis',
    { timeout: 60_000 },
  );
  await expect(sendiri).toContainText('Tugas Konsumsi');

  await koor.goto(`/acara/${acaraId}/divisi/${div.pdd}`, { waitUntil: 'load' });
  const lain = koor.getByTestId('divisi-gantt');
  await expect(lain.getByTestId('gantt-editor-root')).toHaveAttribute('data-editor-izin', 'baca', {
    timeout: 60_000,
  });
  await expect(lain).toContainText('Tugas PDD');
  await expect(lain.getByTestId('gantt-task-tambah')).toHaveCount(0);
  await expect(lain.getByTestId('gantt-grup-tambah')).toHaveCount(0);

  // Divisi tanpa chart: pembaca tidak mendapat tombol, API menolak.
  await koor.goto(`/acara/${acaraId}/divisi/${div.acara}`, { waitUntil: 'load' });
  await expect(koor.getByTestId('ruang-divisi')).toHaveAttribute('data-mode', 'baca', {
    timeout: 60_000,
  });
  await expect(koor.getByTestId('divisi-gantt-buat')).toHaveCount(0);
  const r = await koor.request.post(`/api/divisi/${div.acara}/gantt`);
  expect(r.status(), await r.text()).toBe(403);
  await koor.context().close();
});

test('Kadept PIC membuat timeline divisi yang belum punya chart; Sekum (Ketua Pelaksana) tidak', async ({
  browser,
}) => {
  // Sekum sebagai Ketua Pelaksana: job desk boleh ditulis, tetapi Gantt Sekum baca saja (PRD §5.1).
  const ketuplak = await sesi(browser, AKUN.sekum);
  await ketuplak.goto(`/acara/${acaraId}/divisi/${div.acara}`, { waitUntil: 'load' });
  await expect(ketuplak.getByTestId('ruang-divisi')).toHaveAttribute('data-mode', 'tulis', {
    timeout: 60_000,
  });
  await expect(ketuplak.getByTestId('job-desk-ubah')).toBeVisible();
  await expect(ketuplak.getByTestId('divisi-gantt-buat')).toHaveCount(0);
  await ketuplak.context().close();

  const kadept = await sesi(browser, AKUN.kadept);
  await kadept.goto(`/acara/${acaraId}/divisi/${div.acara}`, { waitUntil: 'load' });
  await kadept.getByTestId('divisi-gantt-buat').click({ timeout: 60_000 });
  await expect(kadept.getByTestId('divisi-gantt').getByTestId('gantt-editor-root')).toHaveAttribute(
    'data-editor-izin',
    'tulis',
    {
      timeout: 60_000,
    },
  );
  await expect(kadept.getByTestId('divisi-gantt')).toContainText('Gantt Divisi Acara');
  const [c] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM gantt_chart WHERE scope = 'DIVISI' AND divisi_id = ${div.acara}::uuid`;
  expect(c!.n).toBe(1);
  await kadept.context().close();
});
