/**
 * Gate T-100 — Kamera & auto-scan dokumen (PRD F-11.3, DESIGN_SYSTEM §9.6).
 *
 * Harness: /qa/kamera (nonproduksi) — `CameraCapture` yang sama dengan yang
 * akan dipasang T-101 di /keuangan/nota/upload. Kamera palsu Chromium memutar
 * `fixtures/nota-kamera.mjpeg`: nota putih miring di atas meja gelap.
 *
 * Menguji:
 *   - OpenCV/jscanify TIDAK dimuat sebelum kamera dibuka (galeri pun tidak);
 *   - kamera → overlay tepi → jepret → pratinjau terpindai → Gunakan;
 *   - OpenCV gagal dimuat → foto apa adanya, tidak memblokir;
 *   - Ambil Ulang kembali ke kamera;
 *   - izin ditolak → pesan jelas + "Pilih dari galeri" dengan pratinjau sama;
 *   - alur lengkap di layar 375 px tanpa gulir horizontal.
 *
 * Selector: kepala components/nota/{CameraCapture,ScanPreview,ScanOverlay}.tsx
 * dan app/qa/kamera/HarnessKamera.tsx (harness-hasil-*).
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const VIDEO = path.resolve('e2e/fixtures/nota-kamera.mjpeg');

test.use({
  permissions: ['camera'],
  // playwright.config menambahkan `x-forwarded-for` ke SEMUA permintaan, termasuk
  // lintas origin; jsDelivr menolak preflight CORS-nya dan skrip ber-SRI gagal
  // dimuat. Harness ini tanpa login, jadi pemisah IP rate-limit tidak dibutuhkan.
  extraHTTPHeaders: {},
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${VIDEO}`],
  },
});
test.describe.configure({ timeout: 150_000 });

/** Bingkai pertama MJPEG = satu JPEG utuh, dipakai sebagai "foto galeri". */
function fotoGaleri(): Buffer {
  const isi = fs.readFileSync(VIDEO);
  const kedua = isi.indexOf(Buffer.from([0xff, 0xd8, 0xff]), 3);
  return kedua > 0 ? isi.subarray(0, kedua) : isi;
}

function catatCdn(page: Page): string[] {
  const daftar: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('cdn.jsdelivr.net') || /jscanify|opencv/i.test(r.url())) daftar.push(r.url());
  });
  return daftar;
}

async function buka(page: Page): Promise<void> {
  await page.goto('/qa/kamera', { waitUntil: 'load' });
  await expect(page.getByTestId('kamera-buka')).toBeVisible({ timeout: 60_000 });
}

async function hasil(page: Page, kunci: string) {
  return page.getByTestId(`harness-hasil-${kunci}`).innerText();
}

test('OpenCV tidak dimuat sebelum kamera dibuka — galeri pun tidak memuatnya', async ({ page }) => {
  const cdn = catatCdn(page);
  await buka(page);
  await page.waitForTimeout(1_500);
  expect(cdn, 'skrip pemindai dimuat sebelum kamera dibuka').toEqual([]);

  const [pemilih] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('kamera-galeri').click()]);
  await pemilih.setFiles({ name: 'nota.jpg', mimeType: 'image/jpeg', buffer: fotoGaleri() });
  await expect(page.getByTestId('scan-preview')).toBeVisible();
  expect(cdn).toEqual([]);

  await page.goto('/qa/kamera', { waitUntil: 'load' });
  await page.getByTestId('kamera-buka').click();
  await expect.poll(() => cdn.some((u) => u.endsWith('/opencv.js')), { timeout: 30_000 }).toBe(true);
});

test('kamera → tepi terdeteksi → pratinjau terpindai → Gunakan', async ({ page }) => {
  await buka(page);
  await page.getByTestId('kamera-buka').click();
  await expect(page.getByTestId('kamera-video')).toBeVisible();
  await expect(page.getByTestId('kamera-status-pemindai')).toHaveAttribute('data-status', 'siap', { timeout: 90_000 });
  await expect(page.getByTestId('scan-overlay')).toHaveAttribute('data-terdeteksi', '1', { timeout: 20_000 });

  await page.getByTestId('kamera-jepret').click();
  await expect(page.getByTestId('scan-preview')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('scan-preview-status')).toHaveAttribute('data-terpindai', '1');
  await expect(page.getByTestId('scan-ambil-ulang')).toBeVisible();

  await page.getByTestId('scan-gunakan').click();
  await expect(page.getByTestId('harness-hasil')).toBeVisible();
  expect(await hasil(page, 'sumber')).toBe('KAMERA');
  expect(await hasil(page, 'terpindai')).toBe('true');
  expect(await hasil(page, 'tipe')).toBe('image/jpeg');
  // Nota di fixture tegak (±500 × ±570 px) — hasil potong potret, jauh lebih kecil dari bingkai 1280 × 720.
  const lebar = Number(await hasil(page, 'lebar'));
  const tinggi = Number(await hasil(page, 'tinggi'));
  expect(tinggi).toBeGreaterThan(lebar);
  expect(lebar).toBeLessThan(1280);
});

test('OpenCV gagal dimuat: foto apa adanya, tidak memblokir; Ambil Ulang kembali ke kamera', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await buka(page);
  await page.getByTestId('kamera-buka').click();
  await expect(page.getByTestId('kamera-status-pemindai')).toHaveAttribute('data-status', 'gagal', { timeout: 30_000 });

  await page.getByTestId('kamera-jepret').click();
  await expect(page.getByTestId('scan-preview-status')).toHaveAttribute('data-terpindai', '0', { timeout: 30_000 });
  await expect(page.getByTestId('scan-preview-status')).toContainText('apa adanya');

  await page.getByTestId('scan-ambil-ulang').click();
  await expect(page.getByTestId('kamera-video')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('kamera-jepret').click();
  await page.getByTestId('scan-gunakan').click();
  expect(await hasil(page, 'terpindai')).toBe('false');
  expect(await hasil(page, 'lebar')).toBe('1280');
  expect(await hasil(page, 'tinggi')).toBe('720');
});

test('izin kamera ditolak: pesan jelas + "Pilih dari galeri" dengan pratinjau yang sama', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await buka(page);
  await page.getByTestId('kamera-buka').click();
  const tolak = page.getByTestId('kamera-ditolak');
  await expect(tolak).toBeVisible();
  await expect(tolak).toContainText('Izin kamera ditolak');

  const [pemilih] = await Promise.all([page.waitForEvent('filechooser'), tolak.getByTestId('kamera-galeri').click()]);
  await pemilih.setFiles({ name: 'nota.jpg', mimeType: 'image/jpeg', buffer: fotoGaleri() });
  await expect(page.getByTestId('scan-preview')).toBeVisible();
  await expect(page.getByTestId('scan-gunakan')).toBeVisible();
  await expect(page.getByTestId('scan-ambil-ulang')).toBeVisible();
  await page.getByTestId('scan-gunakan').click();
  expect(await hasil(page, 'sumber')).toBe('GALERI');
});

test('alur lengkap di layar 375 px tanpa gulir horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await buka(page);

  const tanpaGulir = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const dalamLayar = async (testid: string) => {
    const kotak = await page.getByTestId(testid).boundingBox();
    expect(kotak, testid).not.toBeNull();
    expect(kotak!.x).toBeGreaterThanOrEqual(0);
    expect(kotak!.x + kotak!.width).toBeLessThanOrEqual(375);
    expect(kotak!.height, `${testid} terlalu kecil untuk jari`).toBeGreaterThanOrEqual(44);
  };

  await dalamLayar('kamera-buka');
  await dalamLayar('kamera-galeri');
  expect(await tanpaGulir()).toBe(true);

  await page.getByTestId('kamera-buka').click();
  await expect(page.getByTestId('kamera-video')).toBeVisible();
  await expect(page.getByTestId('kamera-jepret')).toBeEnabled({ timeout: 30_000 });
  await dalamLayar('kamera-jepret');
  expect(await tanpaGulir()).toBe(true);

  await page.getByTestId('kamera-jepret').click();
  await expect(page.getByTestId('scan-preview')).toBeVisible({ timeout: 30_000 });
  await dalamLayar('scan-ambil-ulang');
  await dalamLayar('scan-gunakan');
  expect(await tanpaGulir()).toBe(true);
  await page.getByTestId('scan-gunakan').click();
  await expect(page.getByTestId('harness-hasil')).toBeVisible();
});
