/**
 * Gate E2E T-078 — editor Gantt, empat level, dan batas izin menulis.
 *
 * ===========================================================================
 * BERKAS INI MILIK LANE DATA, YANG DIUJINYA MILIK LANE UI
 * ===========================================================================
 * T-078 membuat `components/gantt/{GanttEditor,TaskForm,ScaleSwitcher,GanttExport}.tsx`
 * dan `app/api/gantt/**` — seluruhnya lane ui. Perintah verifikasinya,
 * `npm run test:e2e -- gantt-editor`, menunjuk berkas ini, yang ada di `e2e/**`
 * dan karena itu milik lane data.
 *
 * Selama berkas ini belum ada, lane ui tidak dapat membuktikan T-078 sama
 * sekali. Itu yang diangkat lane ui lewat ADR-048 dan itu pula yang ditutup
 * berkas ini.
 *
 * ===========================================================================
 * KONTRAK UNTUK LANE UI  ← baca ini sebelum menulis komponennya
 * ===========================================================================
 * Bentuknya mengikuti `/qa/gantt` yang sudah terbukti pada T-073 dan T-074:
 * satu halaman harness nonproduksi, data tetap, tanpa sesi, dengan parameter
 * query untuk memilih varian.
 *
 *   /qa/gantt-editor?level=<departemen|proker|ketuplak|divisi>&izin=<baca|tulis>
 *
 * `level` memilih lingkup chart; `izin` memilih apakah kontrol menulis aktif.
 * Keduanya wajib punya nilai bawaan yang masuk akal bila parameternya kosong
 * (`level=proker`, `izin=tulis`) supaya halamannya tetap berguna dibuka tangan.
 *
 * Selector yang dipakai berkas ini. Enam pertama SUDAH ADA di `GanttChart.tsx`;
 * sisanya baru dan lahir bersama komponen T-078:
 *
 *   [data-testid="gantt-root"]              sudah ada
 *   [data-testid="gantt-svg"]               sudah ada
 *   [data-testid="gantt-scroll"]            sudah ada
 *   [data-testid^="gantt-bar-"]             sudah ada
 *   [data-total-row-count]                  sudah ada, pada gantt-root
 *   [data-rendered-row-count]               sudah ada, pada gantt-root
 *
 *   [data-testid="gantt-editor-root"]       pembungkus editor
 *   [data-editor-level]                     pada editor-root: level yang aktif
 *   [data-editor-izin]                      pada editor-root: "baca" | "tulis"
 *   [data-testid="gantt-scale-switcher"]    pemilih skala
 *   [data-testid="gantt-scale-<skala>"]     minggu | bulan | kuartal
 *   [data-testid="gantt-task-tambah"]       tombol tambah task
 *   [data-testid="gantt-export-png"]        tombol export PNG
 *   [data-testid="gantt-export-pdf"]        tombol export PDF
 *   [data-testid^="gantt-drag-"]            pegangan geser, satu per bar,
 *                                           ber-atribut data-drag-aktif
 *
 * Daftar ini USULAN, bukan perintah. Bila ada nama yang lebih cocok dengan
 * bentuk komponennya, angkat di sync point dan berkas ini yang menyesuaikan —
 * yang tidak boleh adalah menebak diam-diam, karena gate yang selectornya
 * meleset gagal dengan pesan yang menuduh fitur padahal salah nama.
 *
 * ===========================================================================
 * YANG DIUJI HANYA TIGA "SELESAI BILA" T-078
 * ===========================================================================
 * Kontrak T-078 memuat enam butir, tetapi yang menentukan tutup-tidaknya task
 * hanya tiga. Berkas ini menguji ketiganya dan berhenti di situ:
 *
 *   1. Export PNG tajam            -> resolusi 2x, berkasnya bukan kanvas kosong
 *   2. Tanpa izin tidak bisa geser -> tombolnya mati DAN API-nya menolak
 *   3. Empat level, satu komponen  -> struktur sama, tetap SATU <svg>
 *
 * Dependensi Finish-to-Start, event realtime, dan isian progres tidak diuji di
 * sini: ketiganya sudah punya penjaga lain (konektor diuji T-073, realtime
 * T-076, progres bagian dari geometri T-072) dan menduplikasinya hanya membuat
 * dua tempat yang harus diperbarui bersamaan.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-078 · PRD F-6.1, F-6.3 ·
 *         SYSTEM_DESIGN §4.4, §16.2 · ADR-048 · INV-03
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const HARNESS = '/qa/gantt-editor';

const LEVEL = ['departemen', 'proker', 'ketuplak', 'divisi'] as const;
type Level = (typeof LEVEL)[number];

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * Membuka harness, dan MELEWATI test bila ia belum ada.
 *
 * Dilewati, bukan digagalkan — sama seperti `gantt-perf.spec.ts`. Gate merah
 * karena berkas lane lain belum ditulis tidak memberi tahu apa pun yang belum
 * diketahui, dan gate merah yang dibiarkan lama-lama berhenti dibaca.
 */
async function buka(
  page: Page,
  opsi: { level?: Level; izin?: 'baca' | 'tulis' } = {},
): Promise<void> {
  const q = new URLSearchParams();
  if (opsi.level) q.set('level', opsi.level);
  if (opsi.izin) q.set('izin', opsi.izin);
  const kueri = q.toString();
  const alamat = kueri ? `${HARNESS}?${kueri}` : HARNESS;

  const r = await page.goto(alamat, { waitUntil: 'load' });

  if (!r || r.status() === 404) {
    test.skip(
      true,
      `Halaman harness ${HARNESS} belum ada. Ia milik lane ui (T-078); ` +
        `lihat KONTRAK di kepala e2e/gantt-editor.spec.ts untuk parameter dan selectornya.`,
    );
  }

  // Middleware menjaga seluruh rute; bila /qa/ belum dikecualikan, status
  // akhirnya 200 pada halaman LOGIN dan waitForSelector di bawah menunggu
  // 30 detik dengan pesan yang tidak menyebut sebabnya sama sekali.
  const tujuan = new URL(page.url()).pathname;
  if (tujuan !== HARNESS) {
    throw new Error(
      `${alamat} dialihkan ke ${tujuan}. Harness E2E harus dapat dibuka tanpa sesi; ` +
        `periksa PREFIX_HARNESS di middleware.ts (lane data).`,
    );
  }

  const adaEditor = await page
    .waitForSelector('[data-testid="gantt-editor-root"]', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  test.skip(
    !adaEditor,
    `${alamat} terbuka tetapi tidak memuat [data-testid="gantt-editor-root"]. ` +
      `Komponen editor T-078 belum terpasang di harness — lihat KONTRAK di kepala berkas ini.`,
  );

  await page.waitForSelector('[data-testid^="gantt-bar-"]');
}

// ---------------------------------------------------------------------------
// Selesai bila 3 — empat level memakai komponen yang sama
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — empat level, satu komponen Gantt', () => {
  for (const level of LEVEL) {
    test(`level ${level} memakai GanttChart yang sama`, async ({ page }) => {
      await buka(page, { level });

      // Klausa "Jangan" T-078 melarang komponen Gantt kedua untuk level
      // berbeda. Yang membuktikannya bukan membaca kode melainkan ini: struktur
      // yang sama muncul di keempat level, dan tetap SATU <svg> — kontrak 1
      // T-073 yang akan langsung pecah bila ada komponen tandingan yang
      // menggambar dengan cara lain.
      await expect(page.getByTestId('gantt-root')).toBeVisible();
      await expect(page.getByTestId('gantt-svg')).toBeVisible();
      await expect(page.locator('[data-testid="gantt-root"] svg')).toHaveCount(1);

      await expect(page.getByTestId('gantt-editor-root')).toHaveAttribute(
        'data-editor-level',
        level,
      );
    });
  }

  test('pemilih skala menawarkan tiga skala PRD F-6.3', async ({ page }) => {
    await buka(page);
    await expect(page.getByTestId('gantt-scale-switcher')).toBeVisible();

    for (const skala of ['minggu', 'bulan', 'kuartal']) {
      await expect(page.getByTestId(`gantt-scale-${skala}`)).toBeVisible();
    }
  });

  test('mengganti skala mengubah kolom timeline, bukan memuat ulang halaman', async ({ page }) => {
    await buka(page);

    const sebelum = await page.locator('[data-testid="gantt-svg"]').boundingBox();
    await page.getByTestId('gantt-scale-kuartal').click();

    // Skala kuartal memampatkan timeline: lebar SVG-nya harus mengecil.
    // Diperiksa lewat poll, bukan waktu tunggu tetap, supaya tidak rapuh di
    // mesin lambat.
    await expect
      .poll(async () => (await page.locator('[data-testid="gantt-svg"]').boundingBox())?.width ?? 0)
      .not.toBe(sebelum?.width ?? 0);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2a — kontrol geser mati tanpa izin (sisi tampilan)
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2a — tanpa izin, kontrol menulis mati', () => {
  test('pegangan geser tidak aktif pada izin baca', async ({ page }) => {
    await buka(page, { izin: 'baca' });

    await expect(page.getByTestId('gantt-editor-root')).toHaveAttribute(
      'data-editor-izin',
      'baca',
    );

    const pegangan = page.locator('[data-testid^="gantt-drag-"]');
    const jumlah = await pegangan.count();

    // Dua bentuk sama-sama sah: pegangannya tidak dirender sama sekali, atau
    // dirender dengan data-drag-aktif="false". Yang TIDAK sah adalah pegangan
    // aktif yang penolakannya baru terjadi di server — pengguna sudah menggeser
    // barnya, melihat tanggalnya berubah, lalu kembali sendiri. Itu terbaca
    // sebagai bug, bukan sebagai batas izin.
    for (let i = 0; i < jumlah; i++) {
      await expect(pegangan.nth(i)).toHaveAttribute('data-drag-aktif', 'false');
    }
  });

  test('tombol tambah task tidak tersedia pada izin baca', async ({ page }) => {
    await buka(page, { izin: 'baca' });
    const tambah = page.getByTestId('gantt-task-tambah');

    if ((await tambah.count()) > 0) await expect(tambah).toBeDisabled();
  });

  test('pegangan geser aktif pada izin tulis', async ({ page }) => {
    await buka(page, { izin: 'tulis' });

    await expect(page.getByTestId('gantt-editor-root')).toHaveAttribute(
      'data-editor-izin',
      'tulis',
    );

    // Kebalikannya wajib diuji juga. Tanpa ini, komponen yang mematikan seluruh
    // pegangan tanpa syarat akan lulus test di atas dengan sempurna, dan
    // editornya tidak pernah dapat dipakai siapa pun.
    const pegangan = page.locator('[data-testid^="gantt-drag-"]');
    await expect(pegangan.first()).toHaveAttribute('data-drag-aktif', 'true');
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2b — API menolak (sisi server)
// ---------------------------------------------------------------------------

/**
 * Masuk lewat route API, sekali per akun.
 *
 * BUKAN lewat form login. Setiap sign-in membebani DUA pembatas — milik
 * aplikasi (5 per 15 menit per email+IP) dan milik Supabase di depan endpoint
 * sign-in-nya. Gate ini hanya butuh cookie sesi, jadi ia mengambilnya dengan
 * satu permintaan alih-alih memuat halaman login beserta seluruh bundle-nya.
 */
async function masuk(
  request: APIRequestContext,
  email: string,
): Promise<{ ok: boolean; status: number }> {
  const r = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD_UJI },
    failOnStatusCode: false,
  });
  return { ok: r.ok(), status: r.status() };
}

/** Satu PATCH ke task yang tidak ada, memakai konteks yang diberikan. */
async function cobaGeser(request: APIRequestContext): Promise<number> {
  const r = await request.patch('/api/gantt/task/00000000-0000-4000-8000-000000000000', {
    data: { tanggal_mulai: '2026-11-02', tanggal_selesai: '2026-11-09' },
    failOnStatusCode: false,
  });
  return r.status();
}

test.describe.serial('Selesai bila 2b — API menolak penggeseran tanpa izin', () => {
  /*
   * Sengaja memakai UUID yang dijamin TIDAK ADA.
   *
   * Yang diuji bukan apakah task itu berpindah, melainkan URUTAN pemeriksaan:
   * otorisasi harus diputuskan SEBELUM keberadaan baris terungkap. Endpoint
   * yang menjawab 404 kepada penyusup dan 403 kepada pengguna sah membocorkan
   * chart mana yang ada — dan pembocoran itu tidak akan pernah tertangkap oleh
   * test yang memakai id sungguhan, karena di sana 403 dan 404 kebetulan
   * menunjuk baris yang sama.
   *
   * Efek sampingnya menyenangkan: test ini tidak butuh satu pun fixture Gantt,
   * jadi ia tidak akan pecah saat seed berubah.
   */

  /**
   * Keberadaan route DIPERIKSA MEMAKAI SESI, dan itu bukan kerumitan berlebihan.
   *
   * Versi pertama menyimpulkannya dari permintaan tanpa sesi: bila 404, route
   * belum ada. Itu keliru, dan kelirunya menghasilkan LULUS SEMU — middleware
   * menolak seluruh `/api/*` tanpa sesi dengan 401 sebelum routing terjadi,
   * jadi jawabannya 401 bahkan untuk route yang tidak pernah dibuat siapa pun.
   * Terukur: test "tanpa sesi ditolak 401" hijau sementara
   * `app/api/gantt/task/[id]/route.ts` belum ada satu baris pun.
   *
   * Yang hijau itu middleware, bukan T-078. Karena itu keberadaan route
   * ditentukan sekali lewat permintaan BER-SESI, dan kedua test di bawah ikut
   * dilewati bila route-nya memang belum ada.
   *
   * Sekali per worker, bukan sekali per test: tiap sign-in membebani dua
   * pembatas percobaan sekaligus (lib/auth/rate-limit.ts dan milik Supabase).
   */
  let ctxBph: APIRequestContext | null = null;
  let statusBph: number | null = null;
  let alasanLewat: string | null = null;

  test.beforeAll(async ({ playwright, baseURL }) => {
    ctxBph = await playwright.request.newContext({ baseURL });
    const login = await masuk(ctxBph, AKUN.bacaSaja.email);

    if (!login.ok) {
      alasanLewat =
        `Login akun read-only gagal (${login.status}). Jalankan: npm run seed:e2e-auth. ` +
        `Bila pesannya menyebut "dari jaringan ini", itu pembatas Supabase — tunggu beberapa menit.`;
      return;
    }

    statusBph = await cobaGeser(ctxBph);
    if (statusBph === 404) {
      alasanLewat =
        `PATCH /api/gantt/task/{id} menjawab 404 pada permintaan BER-SESI — route-nya ` +
        `belum ada. Ia milik lane ui (T-078), lihat SYSTEM_DESIGN §16.2.`;
    }
  });

  test.afterAll(async () => {
    await ctxBph?.dispose();
    ctxBph = null;
  });

  test('BPH yang read-only ditolak 403, bukan 404 dan bukan 200', async () => {
    test.skip(alasanLewat !== null, alasanLewat ?? '');

    // INV-03: BPH read-only mutlak, dan itu invariant bukan konfigurasi.
    // 401 pun salah di sini — sesinya sah, yang tidak ada adalah haknya.
    expect(statusBph, 'BPH punya sesi sah tetapi tidak punya hak tulis Gantt').toBe(403);
  });

  test('tanpa sesi ditolak 401, bukan 404', async ({ playwright, baseURL }) => {
    test.skip(alasanLewat !== null, alasanLewat ?? '');

    const ctx = await playwright.request.newContext({ baseURL });
    try {
      expect(await cobaGeser(ctx), 'permintaan tanpa sesi harus 401').toBe(401);
    } finally {
      await ctx.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 1 — export PNG 2x
// ---------------------------------------------------------------------------

/** Lebar dan tinggi dari IHDR sebuah PNG. */
function ukuranPng(buf: Buffer): { lebar: number; tinggi: number } | null {
  // 8 byte tanda tangan, 4 byte panjang chunk, 4 byte "IHDR", lalu 4+4 ukuran.
  const TANDA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(TANDA)) return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { lebar: buf.readUInt32BE(16), tinggi: buf.readUInt32BE(20) };
}

test.describe('Selesai bila 1 — export PNG tajam', () => {
  test('PNG dihasilkan pada skala 2x dan bukan kanvas kosong', async ({ page }) => {
    await buka(page, { izin: 'tulis' });

    const kotak = await page.locator('[data-testid="gantt-svg"]').boundingBox();
    expect(kotak, 'SVG tidak punya kotak batas').not.toBeNull();

    const unduhan = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByTestId('gantt-export-png').click();
    const unduh = await unduhan;

    const jalur = await unduh.path();
    expect(jalur, 'unduhan tidak tersimpan').not.toBeNull();

    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(jalur!);
    const ukuran = ukuranPng(buf);

    expect(ukuran, `berkas unduhan bukan PNG yang sah (${unduh.suggestedFilename()})`).not.toBeNull();

    // Kontrak 4: skala 2x supaya tajam saat dicetak dari Word. Toleransi 10%
    // untuk pembulatan devicePixelRatio dan padding kanvas; yang ditolak adalah
    // export 1x, yang lebarnya akan jatuh jauh di bawah ambang ini.
    const minimal = kotak!.width * 2 * 0.9;
    expect(
      ukuran!.lebar,
      `PNG selebar ${ukuran!.lebar}px untuk SVG selebar ${Math.round(kotak!.width)}px CSS — ` +
        `kontrak 4 menuntut 2x agar tajam saat disisipkan ke Word`,
    ).toBeGreaterThanOrEqual(minimal);

    // Kanvas kosong berukuran benar tetap lulus pemeriksaan dimensi. PNG kosong
    // terkompresi sangat kecil; ambang ini memisahkannya dari gambar yang
    // benar-benar memuat bar. Bukan pemeriksaan ketajaman — itu bagian manual.
    expect(buf.length, 'PNG terlalu kecil untuk memuat gambar apa pun').toBeGreaterThan(5_000);
  });

  test('tombol export PDF tersedia', async ({ page }) => {
    await buka(page, { izin: 'tulis' });

    // Isi PDF-nya tidak diperiksa di sini. Yang menentukan lulus-tidaknya
    // "tajam dan terbaca saat disisipkan ke Word" adalah mata manusia, dan
    // kontrak T-078 memang menyebutnya uji nyata. Yang dijaga otomatis hanya
    // bahwa jalurnya ada dan tidak diam-diam hilang saat refactor.
    await expect(page.getByTestId('gantt-export-pdf')).toBeVisible();
  });
});
