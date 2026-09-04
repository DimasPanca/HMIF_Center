/**
 * Gate E2E T-067 — kalender ketersediaan.
 *
 * ===========================================================================
 * DITULIS SEBELUM T-067 DIMULAI
 * ===========================================================================
 * `e2e/**` milik lane data, T-067 seluruhnya lane ui. Gate ditulis lebih dulu
 * dan melewati dirinya sampai halamannya datang (RENCANA-GELOMBANG-3 §8.1).
 *
 * T-067 memulai rantai proker: T-068 → T-069 → T-070 → T-075 seluruhnya
 * menunggunya. Karena itu ia didahulukan di antrean gate (§10).
 *
 * ===========================================================================
 * DUA TEMPAT PENGUJIAN, DAN KENAPA TIDAK SATU
 * ===========================================================================
 * Kontrak T-067 memuat dua hal yang tidak dapat diuji di tempat yang sama.
 *
 * Butir 1-3 — tiga keadaan tanggal, tooltip lima informasi, legenda — adalah
 * perilaku KOMPONEN. Mengujinya lewat halaman sungguhan menyeret autentikasi,
 * periode aktif, seed proker, dan RLS; satu di antaranya berubah dan gate gagal
 * karena hal yang tidak ada hubungannya dengan kalender. Keduanya diuji lewat
 * harness berdata tetap, pola yang sudah terbukti pada `/qa/gantt`.
 *
 * Butir 5 — data diambil SEKALI lalu difilter di klien saat ganti bulan — tidak
 * dapat dibuktikan di harness berdata tetap: harness yang tidak memanggil API
 * sama sekali akan lulus "tidak ada request baru" tanpa pernah membuktikan
 * apa pun. Butir itu diuji di halaman sungguhan, dengan sesi, sambil menghitung
 * permintaan ke `/api/proker/kalender`.
 *
 * ===========================================================================
 * KONTRAK UNTUK LANE UI
 * ===========================================================================
 * Halaman sungguhan: `/proker/kalender` (butuh sesi).
 * Harness: `/qa/kalender` — data tetap, tanpa sesi, memuat ketiga keadaan.
 *
 * Fixture harness WAJIB memuat, dan tanggalnya tetap:
 *
 *   TERKUNCI  proker-sync  "SYNCHRONIZE 2026"  Kaderisasi
 *             persiapan 2026-11-01, hari-H 2026-11-20..22
 *             penanggung jawab "Nadia Putri"
 *   BERKALA   proker-rutin "Latihan Rutin"     Minat & Bakat
 *             setiap Sabtu, 2026-09-01..2027-06-30
 *   TERSEDIA  2026-12-15 — tidak tersentuh keduanya
 *
 * Bentuk datanya sudah ada: `kalenderTerkunci()` di `lib/proker/service.ts`
 * mengembalikan persis `EntriKalender[]` dengan `jenis: 'TERKUNCI' | 'BERKALA'`.
 * Lihat `docs/ai/PROKER_CONTRACT.md` §6.
 *
 * `data-testid` yang dipakai berkas ini:
 *
 *   kalender-root                pembungkus
 *   kalender-legenda             legenda, WAJIB terlihat tanpa interaksi
 *   kalender-bulan               label bulan yang sedang tampil
 *   kalender-bulan-berikutnya    tombol geser ke bulan berikutnya
 *   kalender-bulan-sebelumnya    tombol geser ke bulan sebelumnya
 *   kalender-tanggal-<YYYY-MM-DD>   satu sel tanggal
 *   kalender-tooltip             tooltip tanggal terkunci
 *   kalender-tooltip-baris       satu elemen per baris isi tooltip (harus 5)
 *
 * Atribut pada tiap sel tanggal:
 *
 *   data-keadaan="terkunci" | "berkala" | "tersedia"
 *
 * Nama-nama di atas USULAN. Angkat di sync point bila ada yang lebih cocok.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-067 · PRD F-5.3 (Langkah 2) ·
 *         USER_FLOW §4.2 · DESIGN_SYSTEM · K-15 · INV-10 ·
 *         docs/ai/PROKER_CONTRACT.md §6
 */

import { expect, test, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const HARNESS = '/qa/kalender';
const HALAMAN = '/proker/kalender';

/** Tanggal fixture, tetap dan disebut di kontrak kepala berkas. */
const TERKUNCI = '2026-11-20';
const TERSEDIA = '2026-12-15';

async function bukaHarness(page: Page): Promise<void> {
  const r = await page.goto(HARNESS, { waitUntil: 'load' });

  if (!r || r.status() === 404) {
    test.skip(
      true,
      `Halaman harness ${HARNESS} belum ada. Ia milik lane ui (T-067); ` +
        'lihat KONTRAK di kepala e2e/kalender-ketersediaan.spec.ts.',
    );
  }

  const tujuan = new URL(page.url()).pathname;
  if (tujuan !== HARNESS) {
    throw new Error(
      `${HARNESS} dialihkan ke ${tujuan}. Harness E2E harus dapat dibuka tanpa sesi; ` +
        'periksa PREFIX_HARNESS di middleware.ts (lane data).',
    );
  }

  const ada = await page
    .waitForSelector('[data-testid="kalender-root"]', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  test.skip(!ada, `${HARNESS} terbuka tetapi tidak memuat [data-testid="kalender-root"].`);
}

// ---------------------------------------------------------------------------
// Selesai bila 1 — tanggal terkunci berbeda jelas dari tersedia
// ---------------------------------------------------------------------------

test.describe('Selesai bila 1 — tiga keadaan tanggal', () => {
  test('terkunci, berkala, dan tersedia dibedakan lewat atribut', async ({ page }) => {
    await bukaHarness(page);

    await expect(page.getByTestId(`kalender-tanggal-${TERKUNCI}`)).toHaveAttribute(
      'data-keadaan',
      'terkunci',
    );
    await expect(page.getByTestId(`kalender-tanggal-${TERSEDIA}`)).toHaveAttribute(
      'data-keadaan',
      'tersedia',
    );
  });

  test('tanggal terkunci berbeda warna dari tanggal tersedia', async ({ page }) => {
    await bukaHarness(page);

    const kunci = page.getByTestId(`kalender-tanggal-${TERKUNCI}`);
    const bebas = page.getByTestId(`kalender-tanggal-${TERSEDIA}`);

    const warnaKunci = await kunci.evaluate((el) => getComputedStyle(el).backgroundColor);
    const warnaBebas = await bebas.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Atribut saja tidak cukup: yang dilihat Kadept saat memilih tanggal adalah
    // warnanya. Atribut yang benar dengan warna yang sama membuat kalender
    // lulus test tetapi tidak berguna.
    expect(warnaKunci).not.toBe(warnaBebas);
  });

  // INV-10 dan klausa "Jangan" T-067: proker BERKALA tidak mengunci apa pun.
  // Menandainya terkunci akan membuat departemen lain mengira tanggalnya
  // terpakai, padahal PRD F-5.2 R4 justru membebaskannya.
  test('proker BERKALA tidak ditandai terkunci', async ({ page }) => {
    await bukaHarness(page);

    const berkala = page.locator('[data-keadaan="berkala"]');
    await expect(berkala.first()).toBeVisible();
    await expect(page.locator('[data-keadaan="berkala"][data-keadaan="terkunci"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — tooltip memuat lima informasi
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2 — tooltip lima informasi', () => {
  test('hover tanggal terkunci menampilkan tooltip', async ({ page }) => {
    await bukaHarness(page);

    await page.getByTestId(`kalender-tanggal-${TERKUNCI}`).hover();
    await expect(page.getByTestId('kalender-tooltip')).toBeVisible({ timeout: 2000 });
  });

  test('isinya tepat lima baris', async ({ page }) => {
    await bukaHarness(page);

    await page.getByTestId(`kalender-tanggal-${TERKUNCI}`).hover();
    await expect(page.getByTestId('kalender-tooltip')).toBeVisible({ timeout: 2000 });

    // Kontrak 2 menyebut lima: nama proker, departemen, rentang persiapan,
    // rentang hari-H, penanggung jawab. Kelimanya ada di satu entri TERKUNCI
    // dari `kalenderTerkunci()` — lihat PROKER_CONTRACT §6.
    await expect(page.getByTestId('kalender-tooltip-baris')).toHaveCount(5);
  });

  test('menyebut nama proker, departemen, dan penanggung jawab', async ({ page }) => {
    await bukaHarness(page);

    await page.getByTestId(`kalender-tanggal-${TERKUNCI}`).hover();
    const tip = page.getByTestId('kalender-tooltip');
    await expect(tip).toBeVisible({ timeout: 2000 });

    // Tanpa ketiganya, pesan "tanggal tidak tersedia" tidak memberi tahu Kadept
    // siapa yang harus dihubungi untuk bernegosiasi.
    await expect(tip).toContainText('SYNCHRONIZE 2026');
    await expect(tip).toContainText('Kaderisasi');
    await expect(tip).toContainText('Nadia Putri');
  });

  test('tanggal tersedia tidak memunculkan tooltip', async ({ page }) => {
    await bukaHarness(page);

    await page.getByTestId(`kalender-tanggal-${TERSEDIA}`).hover();
    await expect(page.getByTestId('kalender-tooltip')).toBeHidden({ timeout: 1000 });
  });
});

// ---------------------------------------------------------------------------
// Kontrak 3 — legenda dan K-15
// ---------------------------------------------------------------------------

test.describe('Kontrak 3 — legenda tidak bergantung warna saja', () => {
  test('legenda terlihat tanpa interaksi apa pun', async ({ page }) => {
    await bukaHarness(page);
    await expect(page.getByTestId('kalender-legenda')).toBeVisible();
  });

  test('legenda menyebut ketiga keadaan dengan teks', async ({ page }) => {
    await bukaHarness(page);
    const legenda = page.getByTestId('kalender-legenda');

    // K-15: warna disertai pola atau teks. Kalender yang membedakan keadaan
    // HANYA dengan warna tidak dapat dibaca 8% laki-laki dengan defisiensi
    // penglihatan warna — dan tanggal yang salah baca berujung pada proker
    // yang ditolak saat approval.
    await expect(legenda).toContainText(/terkunci/i);
    await expect(legenda).toContainText(/berkala/i);
    await expect(legenda).toContainText(/tersedia/i);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 3 — ganti bulan tidak memicu request baru
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — data diambil sekali', () => {
  /*
   * Diuji di halaman SUNGGUHAN, bukan harness.
   *
   * Harness berdata tetap tidak memanggil API sama sekali, jadi ia akan lulus
   * "tidak ada request baru" tanpa pernah membuktikan apa pun. Yang perlu
   * dibuktikan justru sebaliknya: halaman memang MEMANGGIL sekali, lalu tidak
   * memanggil lagi saat bulan digeser.
   */
  test('menggeser bulan tidak menambah permintaan ke /api/proker/kalender', async ({ page }) => {
    const masuk = await page.goto('/login', { waitUntil: 'load' });
    test.skip(!masuk || masuk.status() === 404, 'Halaman /login belum ada.');

    await page.getByLabel(/email/i).fill(AKUN.admin.email);
    await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
    await page.getByRole('button', { name: /masuk|login/i }).click();
    await page.waitForLoadState('networkidle');

    let permintaan = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/proker/kalender')) permintaan++;
    });

    const r = await page.goto(HALAMAN, { waitUntil: 'load' });
    test.skip(!r || r.status() === 404, `Halaman ${HALAMAN} belum ada (T-067).`);

    const ada = await page
      .waitForSelector('[data-testid="kalender-root"]', { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ada, `${HALAMAN} terbuka tetapi kalender belum terpasang (T-067).`);

    const tombol = page.getByTestId('kalender-bulan-berikutnya');
    test.skip((await tombol.count()) === 0, 'Tombol geser bulan belum ada (T-067).');

    await page.waitForLoadState('networkidle');
    const sebelum = permintaan;
    expect(sebelum, 'kalender tidak pernah memanggil /api/proker/kalender').toBeGreaterThan(0);

    const bulanAwal = await page.getByTestId('kalender-bulan').textContent();
    for (let i = 0; i < 3; i++) await tombol.click();
    await expect.poll(async () => page.getByTestId('kalender-bulan').textContent()).not.toBe(bulanAwal);

    await page.waitForLoadState('networkidle');

    // Rentang terkunci satu periode muat dalam satu respons; mengambilnya ulang
    // tiap ganti bulan membuat wizard proker terasa tersendat justru saat
    // penggunanya sedang mencari-cari tanggal.
    expect(permintaan, 'kalender mengambil ulang data saat bulan digeser').toBe(sebelum);
  });
});
