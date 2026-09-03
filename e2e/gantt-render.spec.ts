/**
 * Gate E2E T-073 — komponen Gantt SVG.
 *
 * ===========================================================================
 * KENAPA ADA HALAMAN HARNESS, DAN KENAPA ITU BUKAN JALAN PINTAS
 * ===========================================================================
 * T-073 hanya membuat komponen di `components/gantt/`. Halaman yang memakainya
 * baru lahir di T-075. Karena itu gate `npm run test:e2e -- gantt-render`
 * tidak punya apa pun untuk dibuka — masalah yang ditemukan lane ui dan
 * dicatatnya di ADR-047.
 *
 * Jalan keluarnya BUKAN menunggu T-075, dan bukan pula melewati gate-nya.
 * Ketiga syarat "Selesai bila" T-073 — marker Hari-H, kolom label sticky,
 * tooltip enam baris — seluruhnya perilaku KOMPONEN. Mengujinya lewat beranda
 * sungguhan berarti ikut menyeret autentikasi, periode aktif, seed data, dan
 * RLS; satu di antaranya berubah dan test ini gagal karena hal yang tidak ada
 * hubungannya dengan Gantt.
 *
 * Halaman harness `/qa/gantt` memberi data tetap dan deterministik. Ia hanya
 * hidup di luar produksi, dan T-075 tetap punya gate `master-gantt` sendiri
 * yang menguji jalur sungguhannya.
 *
 * ===========================================================================
 * KONTRAK ANTARA BERKAS INI DAN HALAMAN HARNESS
 * ===========================================================================
 * Berkas ini milik lane data; halamannya milik lane ui. Yang menyambungkan
 * keduanya adalah daftar `data-testid` di bawah — bukan struktur DOM, bukan
 * nama kelas CSS. Selector berbasis kelas akan pecah setiap kali Tailwind
 * disusun ulang, dan test yang pecah karena hal kosmetik lama-lama diabaikan.
 *
 * Halaman `/qa/gantt` wajib menyediakan:
 *
 *   gantt-root            pembungkus terluar
 *   gantt-svg             SATU <svg> untuk seluruh area chart (kontrak 1)
 *   gantt-label-column    kolom label kiri yang sticky
 *   gantt-scroll          wadah yang menggulir horizontal
 *   gantt-today-line      garis "hari ini"
 *   gantt-bar-<id>        badan bar, satu per baris
 *   gantt-harih-<id>      marker Hari-H di atas bar
 *   gantt-tooltip         tooltip, muncul setelah 400 ms hover
 *   gantt-tooltip-baris   satu elemen per baris isi tooltip (harus 6)
 *   gantt-panel           panel samping setelah bar diklik
 *
 * Data fixture yang wajib dirender, tetap dan tidak acak:
 *
 *   grup   dept-kaderisasi   "Kaderisasi"
 *   anak   proker-sync       "SYNCHRONIZE 2026"
 *                            persiapan 2026-11-01, hari-H 2026-11-20..22
 *   anak   proker-upgrading  "UPGRADING 2026"
 *                            persiapan 2026-12-01, hari-H 2026-12-18..19
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-073 · DESIGN_SYSTEM §10.4, §10.5, §10.7
 */

import { expect, test } from '@playwright/test';

const HARNESS = '/qa/gantt';

/** Melewati seluruh berkas dengan pesan yang menyebut apa yang kurang. */
test.beforeEach(async ({ page }) => {
  const r = await page.goto(HARNESS, { waitUntil: 'domcontentloaded' });

  if (!r || r.status() === 404) {
    test.skip(
      true,
      `Halaman harness ${HARNESS} belum ada. Ia milik lane ui (T-073); ` +
        `lihat daftar data-testid di kepala berkas ini.`,
    );
  }

  // Bila middleware mengalihkan, status akhirnya 200 — halaman LOGIN, bukan
  // 404 — dan `waitForSelector` di bawah akan timeout 30 detik dengan pesan
  // "gantt-root tidak ditemukan" yang sama sekali tidak menyebut sebabnya.
  //
  // Ini pernah terjadi: middleware T-045 menjaga seluruh rute dan /qa/ belum
  // dikecualikan. Pemeriksaan di bawah mengubah kegagalan yang membingungkan
  // itu menjadi kalimat yang langsung menunjuk berkas yang salah.
  const tujuan = new URL(page.url()).pathname;
  if (tujuan !== HARNESS) {
    throw new Error(
      `${HARNESS} dialihkan ke ${tujuan}. Harness E2E harus dapat dibuka tanpa sesi; ` +
        `periksa PREFIX_HARNESS di middleware.ts (lane data).`,
    );
  }

  await page.waitForSelector('[data-testid="gantt-root"]');
});

test.describe('Gantt SVG — struktur', () => {
  test('memakai SATU elemen svg untuk seluruh area chart', async ({ page }) => {
    // Kontrak 1. Satu <svg> per baris akan membuat browser membuat ratusan
    // layer terpisah, dan scroll pada 60 proker menjadi tersendat di ponsel.
    const svg = page.locator('[data-testid="gantt-root"] svg');
    await expect(svg).toHaveCount(1);
    await expect(page.getByTestId('gantt-svg')).toBeVisible();
  });

  test('menampilkan garis hari ini', async ({ page }) => {
    await expect(page.getByTestId('gantt-today-line')).toBeVisible();
  });
});

test.describe('Selesai bila 1 — marker Hari-H berbeda jelas dari badan bar', () => {
  test('marker Hari-H tergambar di atas bar dan berbeda warnanya', async ({ page }) => {
    // Inti DESIGN_SYSTEM §10.4. Panitia membaca Gantt untuk satu pertanyaan
    // lebih dulu: kapan acaranya. Bila marker Hari-H menyatu dengan badan bar
    // persiapan, jawaban itu hilang dan seluruh chart kehilangan gunanya.
    const bar = page.getByTestId('gantt-bar-proker-sync');
    const harih = page.getByTestId('gantt-harih-proker-sync');

    await expect(bar).toBeVisible();
    await expect(harih).toBeVisible();

    const kBar = await bar.boundingBox();
    const kHariH = await harih.boundingBox();
    expect(kBar).not.toBeNull();
    expect(kHariH).not.toBeNull();

    // Marker berada DI DALAM rentang bar, bukan di sebelahnya.
    expect(kHariH!.x).toBeGreaterThanOrEqual(kBar!.x - 1);
    expect(kHariH!.x + kHariH!.width).toBeLessThanOrEqual(kBar!.x + kBar!.width + 1);

    // Dan benar-benar berbeda warna, bukan sekadar elemen terpisah.
    const warnaBar = await bar.evaluate((el) => getComputedStyle(el).fill);
    const warnaHariH = await harih.evaluate((el) => getComputedStyle(el).fill);
    expect(warnaHariH).not.toBe(warnaBar);
  });

  test('setiap proker punya marker Hari-H sendiri', async ({ page }) => {
    await expect(page.getByTestId('gantt-harih-proker-sync')).toBeVisible();
    await expect(page.getByTestId('gantt-harih-proker-upgrading')).toBeVisible();
  });
});

test.describe('Selesai bila 2 — kolom label tetap terlihat saat scroll horizontal', () => {
  test('kolom label tidak ikut bergeser', async ({ page }) => {
    const kolom = page.getByTestId('gantt-label-column');
    const sebelum = await kolom.boundingBox();
    expect(sebelum).not.toBeNull();

    await page.getByTestId('gantt-scroll').evaluate((el) => {
      el.scrollLeft = 800;
    });
    // Menunggu posisi scroll benar-benar diterapkan, bukan menebak dengan
    // waktu tunggu tetap yang akan rapuh di mesin lambat.
    await expect
      .poll(async () => page.getByTestId('gantt-scroll').evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);

    const sesudah = await kolom.boundingBox();
    expect(sesudah).not.toBeNull();

    // Toleransi 1px untuk pembulatan sub-piksel.
    expect(Math.abs(sesudah!.x - sebelum!.x)).toBeLessThanOrEqual(1);
    await expect(kolom).toBeVisible();
  });

  test('nama proker tetap terbaca setelah digulir', async ({ page }) => {
    await page.getByTestId('gantt-scroll').evaluate((el) => {
      el.scrollLeft = 1200;
    });
    await expect(page.getByTestId('gantt-label-column')).toContainText('SYNCHRONIZE 2026');
  });

  test('lebar kolom label 200px di desktop', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Lebar 140px diuji di proyek mobile.');
    const k = await page.getByTestId('gantt-label-column').boundingBox();
    expect(Math.round(k!.width)).toBe(200);
  });

  test('lebar kolom label 140px di mobile', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'Lebar 200px diuji di proyek desktop.');
    const k = await page.getByTestId('gantt-label-column').boundingBox();
    expect(Math.round(k!.width)).toBe(140);
  });
});

test.describe('Selesai bila 3 — tooltip memuat enam baris', () => {
  test('tooltip muncul setelah jeda, bukan seketika', async ({ page }) => {
    // §10.7 menetapkan 400 ms. Tooltip yang muncul seketika akan berkedip
    // mengikuti gerak kursor melintasi chart yang padat.
    const bar = page.getByTestId('gantt-bar-proker-sync');
    await bar.hover();

    await expect(page.getByTestId('gantt-tooltip')).toBeHidden({ timeout: 250 });
    await expect(page.getByTestId('gantt-tooltip')).toBeVisible({ timeout: 2000 });
  });

  test('isinya tepat enam baris', async ({ page }) => {
    await page.getByTestId('gantt-bar-proker-sync').hover();
    await expect(page.getByTestId('gantt-tooltip')).toBeVisible({ timeout: 2000 });

    await expect(page.getByTestId('gantt-tooltip-baris')).toHaveCount(6);
  });

  test('menyebut nama proker dan tanggal hari-H', async ({ page }) => {
    await page.getByTestId('gantt-bar-proker-sync').hover();
    const tip = page.getByTestId('gantt-tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    await expect(tip).toContainText('SYNCHRONIZE 2026');
    await expect(tip).toContainText('2026');
  });
});

test.describe('Interaksi', () => {
  test('klik bar membuka panel samping', async ({ page }) => {
    await expect(page.getByTestId('gantt-panel')).toBeHidden();
    await page.getByTestId('gantt-bar-proker-sync').click();
    await expect(page.getByTestId('gantt-panel')).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId('gantt-panel')).toContainText('SYNCHRONIZE 2026');
  });

  test('grup dapat dilipat dan dibentangkan kembali', async ({ page }) => {
    const anak = page.getByTestId('gantt-bar-proker-sync');
    await expect(anak).toBeVisible();

    await page.getByTestId('gantt-group-toggle-dept-kaderisasi').click();
    await expect(anak).toBeHidden({ timeout: 2000 });

    await page.getByTestId('gantt-group-toggle-dept-kaderisasi').click();
    await expect(anak).toBeVisible({ timeout: 2000 });
  });
});
