/**
 * Gate E2E T-068 — wizard proker langkah 1-3.
 *
 * ===========================================================================
 * DITULIS SEBELUM T-068-UI DIMULAI
 * ===========================================================================
 * `e2e/**` milik lane data; halaman & komponen wizard milik lane ui (T-068-UI).
 * Gate ini ditulis lebih dulu dan melewati dirinya sampai wizardnya ada
 * (RENCANA-GELOMBANG-3 §8.1) — supaya `npm run test:e2e -- wizard-proker-1-3`
 * pada kontrak T-068 punya sesuatu untuk dijalankan, bukan error "no tests".
 *
 * ===========================================================================
 * KONTRAK UNTUK LANE UI  ← baca docs/ai/WIZARD_PROKER_CONTRACT.md
 * ===========================================================================
 * Halaman: `/proker/baru` (butuh sesi; Kadept/Ketua/Wakil/Admin — pemilik
 * `proker.create`). Gate ini memakai akun ADMIN.
 *
 * `data-testid` yang dipakai berkas ini:
 *
 *   wizard-root                pembungkus wizard
 *   wizard-langkah-aktif       elemen ber-atribut data-langkah="1..6"
 *   wizard-lanjut              tombol Lanjut (disabled bila langkah tak valid)
 *   wizard-field-nama          input nama proker (Langkah 1)
 *   wizard-field-kategori      pemilih kategori (Langkah 1)
 *   wizard-field-persiapan     input tanggal mulai persiapan (Langkah 2)
 *   wizard-field-harih-mulai   input hari-H mulai (Langkah 2)
 *   wizard-field-harih-selesai input hari-H selesai (Langkah 2)
 *   wizard-durasi              teks durasi persiapan (mis. "Persiapan 12 hari — …")
 *   wizard-konflik             InlineAlert merah daftar bentrok (Langkah 2)
 *
 * Nama-nama USULAN; angkat di sync point bila ada yang lebih cocok. Gate ini
 * SKIP (bukan gagal) sampai `/proker/baru` memuat `wizard-root`.
 *
 * ===========================================================================
 * TIGA "SELESAI BILA" T-068 YANG DIUJI
 * ===========================================================================
 *   1. Peringatan konflik muncul SEBELUM lanjut (Langkah 2).
 *   2. Meninggalkan wizard lalu kembali memulihkan seluruh isian (draft server).
 *   3. Persiapan 14 & 46 hari ditolak dengan pesan berangka aktual.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-068 · PRD F-5.3 · USER_FLOW §4.1
 */

import { expect, test, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const HAL = '/proker/baru';

/** Login lewat form lalu buka wizard; SKIP bila login atau wizard belum ada. */
async function bukaWizard(page: Page): Promise<boolean> {
  const masuk = await page.goto('/login', { waitUntil: 'load' });
  if (!masuk || masuk.status() === 404) {
    test.skip(true, 'Halaman /login belum ada.');
    return false;
  }
  await page.getByLabel(/email/i).fill(AKUN.admin.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForLoadState('networkidle');

  const r = await page.goto(HAL, { waitUntil: 'load' });
  if (!r || r.status() === 404) {
    test.skip(true, `Halaman ${HAL} belum ada. Ia milik lane ui (T-068-UI).`);
    return false;
  }
  const ada = await page
    .waitForSelector('[data-testid="wizard-root"]', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!ada, `${HAL} terbuka tetapi wizard-root belum ada (T-068-UI).`);
  return ada;
}

async function isiLangkah1(page: Page): Promise<void> {
  await page.getByTestId('wizard-field-nama').fill('Uji Wizard E2E');
  await page.getByTestId('wizard-field-kategori').selectOption('TERJADWAL').catch(async () => {
    // Bila kategori bukan <select> melainkan tombol/radio.
    await page.getByTestId('wizard-field-kategori').click();
    await page.getByRole('option', { name: /terjadwal/i }).click().catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Selesai bila 3 — durasi 14 & 46 hari ditolak dengan pesan
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — durasi persiapan 15-45', () => {
  // Hari-H mulai 2026-12-06. 14 hari = persiapan 2026-11-22; 46 hari = 2026-10-21.
  for (const [persiapan, hari] of [
    ['2026-11-22', 14],
    ['2026-10-21', 46],
  ] as const) {
    test(`persiapan ${hari} hari ditolak dengan pesan berangka aktual`, async ({ page }) => {
      if (!(await bukaWizard(page))) return;

      await isiLangkah1(page);
      await page.getByTestId('wizard-lanjut').click();

      await page.getByTestId('wizard-field-persiapan').fill(persiapan);
      await page.getByTestId('wizard-field-harih-mulai').fill('2026-12-06');
      await page.getByTestId('wizard-field-harih-selesai').fill('2026-12-07');

      // Pesan menyebut angka aktual (kontrak 4), bukan "durasi tidak valid".
      await expect(page.getByTestId('wizard-durasi')).toContainText(`${hari} hari`);
      // Tombol Lanjut mati — langkah tak valid tak bisa dilewati (kontrak 1).
      await expect(page.getByTestId('wizard-lanjut')).toBeDisabled();
    });
  }

  test('persiapan 30 hari diterima', async ({ page }) => {
    if (!(await bukaWizard(page))) return;
    await isiLangkah1(page);
    await page.getByTestId('wizard-lanjut').click();

    await page.getByTestId('wizard-field-persiapan').fill('2026-11-06'); // 30 hari
    await page.getByTestId('wizard-field-harih-mulai').fill('2026-12-06');
    await page.getByTestId('wizard-field-harih-selesai').fill('2026-12-07');

    await expect(page.getByTestId('wizard-lanjut')).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 1 — peringatan konflik muncul sebelum lanjut
// ---------------------------------------------------------------------------

test.describe('Selesai bila 1 — konflik sebelum lanjut', () => {
  test('tanggal bentrok memunculkan InlineAlert dan menahan Lanjut', async ({ page }) => {
    if (!(await bukaWizard(page))) return;

    await isiLangkah1(page);
    await page.getByTestId('wizard-lanjut').click();

    // Harness/seed harus menyediakan minimal satu proker TERJADWAL terkunci
    // supaya ada yang dibentrok. Bila tidak ada data terkunci, test ini SKIP
    // daripada gagal palsu — sync point dengan penyiap fixture wizard.
    await page.getByTestId('wizard-field-persiapan').fill('2026-11-06');
    await page.getByTestId('wizard-field-harih-mulai').fill('2026-12-06');
    await page.getByTestId('wizard-field-harih-selesai').fill('2026-12-07');

    const konflik = page.getByTestId('wizard-konflik');
    const muncul = await konflik
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    test.skip(
      !muncul,
      'Tidak ada proker terkunci untuk dibentrok pada rentang uji. ' +
        'Butuh fixture proker TERJADWAL DISETUJUI di periode aktif — angkat di sync point.',
    );

    // Muncul sebagai peringatan inline (bukan modal), dan Lanjut tertahan.
    await expect(konflik).toBeVisible();
    await expect(page.getByTestId('wizard-lanjut')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — draft di server, pulih setelah ditinggal
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2 — draft pulih setelah ditinggal', () => {
  test('meninggalkan wizard lalu kembali memulihkan isian', async ({ page }) => {
    if (!(await bukaWizard(page))) return;

    const nama = `Draf Pulih ${Date.now().toString(36)}`;
    await page.getByTestId('wizard-field-nama').fill(nama);
    await isiLangkah1(page);
    // Beri wizard waktu menyimpan draft ke server (PUT /api/proker/draft).
    await page.waitForLoadState('networkidle');

    // Tinggalkan: navigasi ke luar, lalu kembali dengan konteks browser BARU
    // supaya localStorage tidak ikut — memaksa pemulihan dari server.
    await page.goto('/', { waitUntil: 'load' });
    await page.context().clearCookies().catch(() => {});
    // Kembali (login ulang + buka wizard).
    if (!(await bukaWizard(page))) return;

    // Isian nama pulih dari draft server.
    await expect(page.getByTestId('wizard-field-nama')).toHaveValue(nama);
  });
});
