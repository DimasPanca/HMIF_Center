/**
 * Gate T-059 — pratinjau surat langsung.
 *
 * Menguji (kontrak T-059 · PRD F-4.2 Acceptance Criteria):
 *   - waktu dari berhenti mengetik sampai pratinjau berubah < 300 ms, DIUKUR di
 *     browser (event `input` terakhir → mutasi DOM pratinjau), bukan dari sisi Node;
 *   - tidak ada panggilan server per ketikan;
 *   - bagian yang belum diisi tampil sebagai penanda abu berlabel, lalu hilang
 *     setelah diisi;
 *   - kertas A4 (794 px) diskala ke lebar panel;
 *   - nomor tampil sebagai NomorSuratBadge sementara;
 *   - mengganti jenis memperbarui tata letak (judul Keterangan Aktif, lampiran Aspirasi).
 *
 * data-testid: surat-pratinjau, surat-pratinjau-kertas, surat-pratinjau-perihal,
 * surat-pratinjau-nomor, surat-pratinjau-tujuan, surat-pratinjau-isi,
 * surat-pratinjau-ttd, surat-pratinjau-lampiran, nomor-surat-sementara.
 */
import { expect, test, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

// 90 dtk: halaman memuat editor TipTap yang di-compile saat diminta pertama kali.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

async function masuk(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(AKUN.sekum.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

async function bukaForm(page: Page, jenis: string): Promise<void> {
  // Draft tidak dibuat selama tidak ada perubahan, jadi test ini tidak meninggalkan data.
  await page.goto(`/surat/baru?jenis=${jenis}`, { waitUntil: 'load' });
  await expect(page.getByTestId('surat-pratinjau-kertas')).toBeVisible({ timeout: 30_000 });
}

/**
 * Satu pengukuran: pasang pengamat di pratinjau, ketik, lalu hitung selisih
 * antara event `input` TERAKHIR dan mutasi DOM yang memuat penanda.
 */
async function ukurLatensi(page: Page, penanda: string): Promise<number> {
  await page.evaluate((p) => {
    const w = window as unknown as { __ketik?: number; __tampil?: number };
    w.__ketik = undefined;
    w.__tampil = undefined;
    document.addEventListener('input', () => (w.__ketik = performance.now()), true);
    const target = document.querySelector('[data-testid="surat-pratinjau-perihal"]')!;
    new MutationObserver(() => {
      if (w.__tampil === undefined && target.textContent?.includes(p)) w.__tampil = performance.now();
    }).observe(target, { subtree: true, childList: true, characterData: true });
  }, penanda);

  const input = page.getByTestId('surat-field-perihal');
  await input.fill('');
  await input.pressSequentially(penanda, { delay: 40 });

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __tampil?: number }).__tampil), { timeout: 3_000 })
    .toBeDefined();
  return page.evaluate(() => {
    const w = window as unknown as { __ketik: number; __tampil: number };
    return w.__tampil - w.__ketik;
  });
}

test('pratinjau berubah < 300 ms setelah berhenti mengetik, tanpa panggilan server per ketikan', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'PEMINJAMAN_RUANGAN');

  const permintaan: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) permintaan.push(r.url());
  });

  const hasil: number[] = [];
  for (const p of ['LATENSI-SATU', 'LATENSI-DUA', 'LATENSI-TIGA']) hasil.push(await ukurLatensi(page, p));
  const urut = [...hasil].sort((a, b) => a - b);
  const median = urut[1]!;
  test.info().annotations.push({ type: 'latensi-ms', description: hasil.map((x) => x.toFixed(0)).join(', ') });

  expect(median, `latensi terukur: ${hasil.map((x) => x.toFixed(0)).join(', ')} ms`).toBeLessThan(300);
  // Debounce benar-benar menunggu: perubahan tidak tampil seketika per huruf.
  expect(urut[0]!, 'pratinjau berubah tanpa jeda — debounce tidak bekerja').toBeGreaterThan(150);

  // 36 ketikan; yang boleh ke server hanya auto-save (paling banyak satu-dua).
  expect(permintaan.length, `permintaan API selama mengetik: ${permintaan.join(', ')}`).toBeLessThanOrEqual(2);
});

test('bagian kosong tampil sebagai penanda abu, lalu hilang setelah diisi', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'PEMINJAMAN_RUANGAN');
  const kertas = page.getByTestId('surat-pratinjau-kertas');

  for (const label of ['Perihal', 'Nama/jabatan tujuan', 'Nama kegiatan', 'Nama ruangan', 'Pukul']) {
    await expect(kertas.locator(`[data-kosong="${label}"]`).first(), label).toBeVisible();
  }

  await page.getByTestId('surat-field-perihal').fill('Permohonan Peminjaman Ruang Auditorium FT');
  await page.getByTestId('surat-dinamis-ruangan').fill('Ruangan Auditorium FT');
  await page.getByTestId('surat-tujuan-preset').selectOption('Kepala Bagian Sekretariat FT');

  await expect(page.getByTestId('surat-pratinjau-perihal')).toHaveText('Permohonan Peminjaman Ruang Auditorium FT');
  await expect(kertas.locator('[data-kosong="Perihal"]')).toHaveCount(0);
  await expect(kertas.locator('[data-kosong="Nama ruangan"]')).toHaveCount(0);
  await expect(page.getByTestId('surat-pratinjau-isi')).toContainText('meminjam Ruangan Auditorium FT guna menunjang');
  await expect(page.getByTestId('surat-pratinjau-tujuan')).toContainText('Kepala Bagian Sekretariat Fakultas Teknik UNTIRTA');
});

test('kertas A4 diskala ke lebar panel, nomor sebagai badge sementara', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'KERJA_SAMA');
  const kertas = page.getByTestId('surat-pratinjau-kertas');
  // Kertas tersembunyi sampai skalanya terukur setelah hidrasi.
  await expect(kertas).toHaveAttribute('data-terukur', 'ya');

  const ukuran = await kertas.evaluate((el) => ({
    lebarAsli: (el as HTMLElement).offsetWidth,
    transform: getComputedStyle(el).transform,
    lebarTampil: el.getBoundingClientRect().width,
    panel: el.closest('[data-testid="surat-pratinjau"]')!.getBoundingClientRect().width,
  }));
  expect(ukuran.lebarAsli).toBe(794);
  expect(ukuran.lebarTampil).toBeLessThanOrEqual(ukuran.panel + 1);
  expect(ukuran.transform).not.toBe('none');

  const nomor = page.getByTestId('surat-pratinjau-nomor').getByTestId('nomor-surat-sementara');
  await expect(nomor).toBeVisible();
  await expect(nomor).toContainText('/???/');
  await expect(nomor).toContainText('nomor sementara');
});

test('mengganti jenis memperbarui tata letak pratinjau', async ({ page }) => {
  await masuk(page);
  await bukaForm(page, 'PEMINJAMAN_BARANG');
  const kertas = page.getByTestId('surat-pratinjau-kertas');

  await page.getByTestId('surat-jenis').selectOption('KETERANGAN_AKTIF');
  await expect(kertas).toContainText('SURAT KETERANGAN AKTIF BERORGANISASI');
  await expect(page.getByTestId('surat-pratinjau-tujuan')).toHaveCount(0);

  await page.getByTestId('surat-jenis').selectOption('ASPIRASI');
  await expect(page.getByTestId('surat-pratinjau-lampiran')).toContainText('ASPIRASI KEORGANISASIAN MAHASISWA');
  await expect(kertas).not.toContainText('SURAT KETERANGAN AKTIF BERORGANISASI');
});
