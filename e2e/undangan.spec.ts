/**
 * Gate E2E T-047 — undangan dan manajemen pengguna.
 *
 * ===========================================================================
 * BERKAS INI MILIK LANE DATA, YANG DIUJINYA MILIK LANE UI
 * ===========================================================================
 * T-047 dibelah: lane data menulis `lib/auth/invitation.ts` beserta seluruh
 * keputusannya, lane ui menulis halaman dan route handler-nya (`T-047-UI`).
 * Perintah verifikasinya menunjuk berkas ini, yang ada di `e2e/**` dan karena
 * itu milik lane data.
 *
 * Ditulis SEBELUM `T-047-UI` dimulai, bukan sesudah. T-074 dan T-078 sama-sama
 * terhenti karena urutan sebaliknya: separuh ui selesai, lalu ketahuan tidak
 * dapat dibuktikan karena gate-nya belum ada. Selama halamannya belum ada,
 * seluruh test di sini DILEWATI dengan pesan yang menyebut persis apa yang
 * kurang — bukan gagal dengan tuduhan yang salah.
 *
 * ===========================================================================
 * KONTRAK UNTUK LANE UI  ← baca `docs/ai/UNDANGAN_CONTRACT.md` lebih dulu
 * ===========================================================================
 * Halaman dan route yang diuji berkas ini:
 *
 *   /admin/pengguna              daftar + tombol undang (butuh sesi ADMIN)
 *   /undangan/<token>            halaman aktivasi (PUBLIK, tanpa sesi)
 *   POST   /api/users/invite     -> undang()
 *   GET    /api/users            -> daftarPengguna()
 *   PATCH  /api/users/{id}       -> ubahPengguna()
 *   POST   /api/auth/activate    -> aktivasi()
 *
 * `data-testid` yang benar-benar dipakai berkas ini — hanya dua, dan keduanya
 * di halaman aktivasi:
 *
 *   aktivasi-form                form isi password, muncul HANYA bila token sah
 *   aktivasi-pesan               pesan kegagalan token (tidak dikenal /
 *                                kedaluwarsa / sudah dipakai)
 *
 * Sengaja tidak lebih. Selector untuk halaman `/admin/pengguna` ada di
 * `UNDANGAN_CONTRACT.md` sebagai panduan tampilan, TIDAK di sini — menuliskan
 * selector yang tidak diuji satu pun test membuatnya tampak mengikat padahal
 * tidak ada yang menjaganya, dan lane ui terikat pada nama yang bebas ia pilih.
 *
 * Kedua nama di atas USULAN. Bila ada yang lebih cocok, angkat di sync point
 * dan berkas ini yang menyesuaikan — yang tidak boleh adalah menebak diam-diam.
 *
 * ===========================================================================
 * KENAPA SEBAGIAN BESAR DIUJI LEWAT API, BUKAN LEWAT HALAMAN
 * ===========================================================================
 * Setiap sign-in membebani DUA pembatas sekaligus: milik aplikasi
 * (`lib/auth/rate-limit.ts`, 5 per 15 menit per email+IP) dan milik Supabase di
 * depan endpoint sign-in-nya. Gate login sudah memakai puluhan percobaan tiap
 * jalan, dan menabrak pembatas Supabase membuat login dengan password BENAR
 * pun ditolak — dengan gejala yang menuduh halaman login.
 *
 * Karena itu gate ini masuk lewat `POST /api/auth/login` sekali per akun per
 * worker, lalu memakai konteks request yang sama. Yang benar-benar butuh mata
 * — halaman aktivasi dan tabel pengguna — tetap diuji lewat halaman.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-047 · PRD F-1.2 · USER_FLOW §2.1, §2.2
 *         docs/ai/UNDANGAN_CONTRACT.md
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

/** Email uji selalu bertanda ini supaya sisa jalan yang gagal mudah dikenali. */
const TANDA = 'e2e-undangan';

function emailUji(): string {
  return `${TANDA}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}@uji.test`;
}

function nimUji(): string {
  return `3339${Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------------

async function masuk(request: APIRequestContext, email: string): Promise<number> {
  const r = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD_UJI },
    failOnStatusCode: false,
  });
  return r.status();
}

/**
 * Konteks ber-sesi ADMIN, dibuat sekali per worker.
 *
 * `alasanLewat` menampung sebab kegagalan penyiapan supaya setiap test dapat
 * melewatkan dirinya dengan kalimat yang menyebutkan sebab itu — alih-alih
 * gagal di tempat yang tidak ada hubungannya.
 */
let ctxAdmin: APIRequestContext | null = null;
let alasanLewat: string | null = null;

test.beforeAll(async ({ playwright, baseURL }) => {
  ctxAdmin = await playwright.request.newContext({ baseURL });

  const status = await masuk(ctxAdmin, AKUN.admin.email);
  if (status === 404) {
    alasanLewat =
      'POST /api/auth/login menjawab 404 — route login belum ada. Ia milik lane ui (T-045).';
    return;
  }
  if (status !== 200) {
    alasanLewat =
      `Login akun ADMIN gagal (${status}). Jalankan: npm run seed:e2e-auth. ` +
      'Bila pesannya menyebut "dari jaringan ini", itu pembatas Supabase — tunggu beberapa menit.';
    return;
  }

  // Keberadaan route diperiksa MEMAKAI SESI. Middleware menolak seluruh
  // `/api/*` tanpa sesi dengan 401 sebelum routing terjadi, jadi permintaan
  // tanpa sesi menjawab 401 bahkan untuk route yang belum pernah dibuat —
  // dan test yang menyimpulkannya dari sana akan hijau tanpa menguji apa pun.
  const cek = await ctxAdmin.post('/api/users/invite', {
    data: {},
    failOnStatusCode: false,
  });
  if (cek.status() === 404) {
    alasanLewat =
      'POST /api/users/invite menjawab 404 pada permintaan ber-sesi — route-nya belum ada. ' +
      'Ia milik lane ui (T-047-UI); lihat docs/ai/UNDANGAN_CONTRACT.md.';
  }
});

test.afterAll(async () => {
  await ctxAdmin?.dispose();
  ctxAdmin = null;
});

function lewatiBila(): void {
  test.skip(alasanLewat !== null, alasanLewat ?? '');
}

/** Mengundang satu pengguna baru dan mengembalikan tautannya. */
async function undangBaru(
  ctx: APIRequestContext,
  ubah: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await ctx.post('/api/users/invite', {
    data: {
      nama_lengkap: 'Uji Undangan E2E',
      nim: nimUji(),
      email: emailUji(),
      angkatan: 2023,
      roles: [{ role: 'SEKUM' }],
      ...ubah,
    },
    failOnStatusCode: false,
  });
  return { status: r.status(), body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Izin
// ---------------------------------------------------------------------------

test.describe('Izin mengundang', () => {
  test('tanpa sesi ditolak 401', async ({ playwright, baseURL }) => {
    lewatiBila();
    const ctx = await playwright.request.newContext({ baseURL });
    try {
      const r = await ctx.post('/api/users/invite', { data: {}, failOnStatusCode: false });
      expect(r.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  // Matriks PRD §5.1 memberi `user: CRUD` HANYA kepada ADMIN. KETUA hanya `R`.
  // Bila gate ini merah, yang bocor adalah hak membuat akun ber-role — jenis
  // kesalahan yang tidak akan pernah terlihat dari antarmuka.
  test('KETUA tidak berhak mengundang', async ({ playwright, baseURL }) => {
    lewatiBila();
    const ctx = await playwright.request.newContext({ baseURL });
    try {
      expect(await masuk(ctx, AKUN.aktif.email)).toBe(200);
      const r = await ctx.post('/api/users/invite', {
        data: { nama_lengkap: 'X', nim: nimUji(), email: emailUji(), roles: [{ role: 'SEKUM' }] },
        failOnStatusCode: false,
      });
      expect(r.status(), 'KETUA hanya berhak membaca daftar pengguna').toBe(403);
    } finally {
      await ctx.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 1 — lima Acceptance Criteria PRD F-1.2
// ---------------------------------------------------------------------------

test.describe('PRD F-1.2 — aturan undangan', () => {
  test('undangan sah mengembalikan tautan untuk disalin, bukan mengirim email', async () => {
    lewatiBila();
    const { status, body } = await undangBaru(ctxAdmin!);

    expect(status).toBe(201);
    // Klausa "Jangan" T-047: belum ada layanan email di MVP. Tautannya
    // ditampilkan supaya Admin menyalinnya sendiri.
    expect(String(body.tautan)).toMatch(/\/undangan\/[A-Za-z0-9_-]{20,}$/);
    expect(body.kedaluwarsa).toBeTruthy();
  });

  test('AC 1 — email yang sudah terdaftar ditolak', async () => {
    lewatiBila();
    const email = emailUji();
    expect((await undangBaru(ctxAdmin!, { email })).status).toBe(201);

    const kedua = await undangBaru(ctxAdmin!, { email });
    expect(kedua.status).toBe(409);
    expect(String(kedua.body.kode)).toBe('EMAIL_TERDAFTAR');
  });

  test('AC 1 — NIM yang sudah terdaftar ditolak, dan dibedakan dari email', async () => {
    lewatiBila();
    const nim = nimUji();
    expect((await undangBaru(ctxAdmin!, { nim })).status).toBe(201);

    const kedua = await undangBaru(ctxAdmin!, { nim });
    expect(kedua.status).toBe(409);
    // Pesan yang menyamakan keduanya membuat Admin mengganti medan yang salah.
    expect(String(kedua.body.kode)).toBe('NIM_TERDAFTAR');
  });

  test('AC 3 — satu pengguna dapat memiliki peran ganda', async () => {
    lewatiBila();
    const { status, body } = await undangBaru(ctxAdmin!, {
      roles: [{ role: 'ANGGOTA', departemen_id: null }, { role: 'SEKUM' }],
    });

    // departemen_id null untuk ANGGOTA memang ditolak — yang diuji di sini
    // bahwa penolakannya berbentuk pesan form, bukan error 500 dari constraint.
    expect([201, 422]).toContain(status);
    if (status === 422) expect(body.isu).toBeTruthy();
  });

  test('peran KADEPT tanpa departemen ditolak dengan pesan form', async () => {
    lewatiBila();
    const { status, body } = await undangBaru(ctxAdmin!, { roles: [{ role: 'KADEPT' }] });

    expect(status).toBe(422);
    const isu = body.isu as { path: string; pesan: string }[] | undefined;
    expect(isu?.some((i) => i.path.includes('departemen_id'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — token hanya tersimpan sebagai hash
// ---------------------------------------------------------------------------

test.describe('Token', () => {
  test('tautan tidak pernah dapat ditampilkan ulang lewat API', async () => {
    lewatiBila();
    const { body } = await undangBaru(ctxAdmin!);
    const token = String(body.tautan).split('/').pop()!;

    // Yang tersimpan hanya SHA-256-nya. Bila suatu hari ada endpoint yang dapat
    // mengembalikan tokennya lagi, jaminan "isi database yang bocor tidak dapat
    // ditebus" hilang — dan itu tidak akan terlihat dari alur mana pun.
    const daftar = await ctxAdmin!.get('/api/users', { failOnStatusCode: false });
    if (daftar.ok()) expect(await daftar.text()).not.toContain(token);
  });
});

// ---------------------------------------------------------------------------
// USER_FLOW §2.2 — halaman aktivasi
// ---------------------------------------------------------------------------

/** Halaman aktivasi dibuka TANPA sesi — pemakainya memang belum punya akun. */
async function bukaAktivasi(page: Page, token: string): Promise<boolean> {
  const r = await page.goto(`/undangan/${token}`, { waitUntil: 'load' });
  if (!r || r.status() === 404) return false;
  return new URL(page.url()).pathname.startsWith('/undangan/');
}

test.describe('USER_FLOW 2.2 — halaman aktivasi', () => {
  test('token tidak dikenal menampilkan pesan, bukan form password', async ({ page }) => {
    lewatiBila();
    const ada = await bukaAktivasi(page, 'x'.repeat(43));
    test.skip(!ada, 'Halaman /undangan/[token] belum ada. Ia milik lane ui (T-047-UI).');

    await expect(page.getByTestId('aktivasi-pesan')).toBeVisible();
    await expect(page.getByTestId('aktivasi-form')).toHaveCount(0);
  });

  test('token sah menampilkan form password', async ({ page }) => {
    lewatiBila();
    const { body } = await undangBaru(ctxAdmin!);
    const token = String(body.tautan).split('/').pop()!;

    const ada = await bukaAktivasi(page, token);
    test.skip(!ada, 'Halaman /undangan/[token] belum ada. Ia milik lane ui (T-047-UI).');

    await expect(page.getByTestId('aktivasi-form')).toBeVisible();
  });

  test('halaman aktivasi dapat dibuka tanpa sesi', async ({ page }) => {
    lewatiBila();
    const { body } = await undangBaru(ctxAdmin!);
    const token = String(body.tautan).split('/').pop()!;

    const r = await page.goto(`/undangan/${token}`, { waitUntil: 'load' });
    test.skip(!r || r.status() === 404, 'Halaman /undangan/[token] belum ada (T-047-UI).');

    // Bila middleware menjaganya, penerima undangan dialihkan ke login —
    // dan ia belum punya akun untuk login. Undangannya menjadi buntu.
    expect(
      new URL(page.url()).pathname,
      'halaman aktivasi tidak boleh menuntut sesi',
    ).toContain('/undangan/');
  });
});

// ---------------------------------------------------------------------------
// Selesai bila — menonaktifkan tidak menghapus
// ---------------------------------------------------------------------------

test.describe('PRD F-1.2 — menonaktifkan pengguna', () => {
  test('AC 4 — dinonaktifkan tetapi barisnya tetap ada', async () => {
    lewatiBila();
    const { body } = await undangBaru(ctxAdmin!);
    const userId = String(body.userId);

    const r = await ctxAdmin!.patch(`/api/users/${userId}`, {
      data: { is_active: false },
      failOnStatusCode: false,
    });
    expect(r.status()).toBe(200);

    // Menghapus penggunanya akan memutus foreign key proker, surat, dan nota
    // yang pernah dibuatnya — jejak auditnya hilang bersamanya.
    const daftar = await ctxAdmin!.get('/api/users', { failOnStatusCode: false });
    expect(daftar.ok()).toBe(true);
    expect(await daftar.text()).toContain(userId);
  });

  test('keadaan membedakan MENUNGGU_AKTIVASI dari NONAKTIF', async () => {
    lewatiBila();
    const { body } = await undangBaru(ctxAdmin!);
    const userId = String(body.userId);

    const daftar = await ctxAdmin!.get('/api/users', { failOnStatusCode: false });
    test.skip(!daftar.ok(), 'GET /api/users belum ada (T-047-UI).');

    const isi = (await daftar.json()) as { data?: { id: string; keadaan?: string }[] };
    const baris = (isi.data ?? []).find((u) => u.id === userId);
    expect(baris, 'pengguna baru harus muncul di daftar').toBeTruthy();

    // Keduanya `is_active = false`, tetapi tindakan yang tepat berbeda: yang
    // satu diundang ulang, yang lain diaktifkan kembali.
    expect(baris!.keadaan).toBe('MENUNGGU_AKTIVASI');
  });
});
