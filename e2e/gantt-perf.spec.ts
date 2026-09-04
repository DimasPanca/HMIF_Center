/**
 * Gate E2E T-074 — performa Gantt di browser sungguhan.
 *
 * ===========================================================================
 * KENAPA GATE INI ADA DI SAMPING `scripts/bench-gantt.ts`
 * ===========================================================================
 * Benchmark Node mengukur aritmetika: transform, kolom timeline, geometri tiap
 * baris. Ia selesai dalam pecahan milidetik dan menyingkap regresi algoritmik
 * dalam sedetik tanpa dev server.
 *
 * Yang TIDAK dapat diukurnya justru bagian yang paling mungkin melewati 500 ms:
 * hydration React, layout browser, style recalculation, dan kompositing SVG.
 * Chart yang geometrinya dihitung dalam 0,3 ms tetap bisa memakan 900 ms bila
 * ia menggambar 106 baris sekaligus alih-alih hanya yang terlihat.
 *
 * Karena itu angka yang menentukan lulus-tidaknya T-074 adalah yang di berkas
 * ini. Benchmark Node adalah batas bawahnya, bukan penggantinya.
 *
 * ===========================================================================
 * KONTRAK ANTARA BERKAS INI DAN HALAMAN HARNESS  ← untuk lane ui (Codex)
 * ===========================================================================
 * Berkas ini milik lane data; `app/qa/gantt/page.tsx` milik lane ui. Harness
 * yang ada sekarang merender fixture tetap berisi DUA proker — cukup untuk
 * `gantt-render.spec.ts` (T-073), tidak cukup untuk mengukur apa pun di sini.
 *
 * Yang dibutuhkan: **parameter query `dataset`** pada halaman yang sama.
 *
 *   /qa/gantt                  fixture 2 proker yang sekarang — JANGAN DIUBAH,
 *                              gantt-render.spec.ts bergantung padanya
 *   /qa/gantt?dataset=48bar    6 departemen x 8 proker = 48 bar (PRD §11)
 *   /qa/gantt?dataset=100task  100 task tersebar di 6 grup (PRD F-6.3 AC)
 *
 * Bentuk datanya sudah ada dan tidak perlu dikarang ulang: `scripts/bench-gantt.ts`
 * memuat `baris48Bar()` dan `baris100Task()` yang menghasilkan persis dua
 * susunan itu. Salin keduanya, atau pindahkan ke `lib/gantt/` bila lebih rapi —
 * yang penting jumlah dan sebarannya sama, supaya angka Node dan angka browser
 * berbicara tentang chart yang sama.
 *
 * Selector yang dipakai berkas ini, seluruhnya SUDAH ADA di `GanttChart.tsx`
 * dan tidak menuntut atribut baru satu pun:
 *
 *   [data-testid="gantt-root"]              pembungkus terluar
 *   [data-testid="gantt-svg"]               satu <svg> area chart
 *   [data-testid="gantt-scroll"]            wadah gulir horizontal
 *   [data-testid="gantt-vertical-scroll"]   wadah gulir vertikal
 *   [data-testid^="gantt-bar-"]             badan bar, satu per baris terender
 *   [data-total-row-count]                  pada gantt-root — jumlah baris data
 *   [data-rendered-row-count]               pada gantt-root — jumlah baris dirender
 *   [data-virtual-buffer]                   pada gantt-root — buffer virtualisasi
 *
 * `data-total-row-count` itulah yang dipakai berkas ini untuk mengetahui apakah
 * dataset yang diminta benar-benar dirender. Bila halaman mengabaikan parameter
 * `dataset` dan tetap merender dua proker, seluruh test di sini DILEWATI dengan
 * pesan yang menyebut alamat persisnya — bukan gagal dengan angka yang salah.
 *
 * ===========================================================================
 * MODE DEV MEMBEBANI ANGKA INI, DAN ITU DIUKUR — BUKAN DIASUMSIKAN
 * ===========================================================================
 * `playwright.config.ts` menjalankan `npm run dev`. Bundle pengembangan tidak
 * diminifikasi dan memakai React build pengembangan, sehingga waktu parse dan
 * hydration-nya beberapa kali lipat produksi.
 *
 * Diukur pada worktree ini, harness bawaan yang hanya berisi DUA proker:
 * 382,5 ms dari `responseEnd` sampai bar pertama tergambar. Itu 76% anggaran
 * 500 ms yang habis sebelum satu pun task tambahan dirender — dan hampir
 * seluruhnya milik kerangka kerja, bukan milik Gantt.
 *
 * Karena itu setiap pengukuran di bawah disertai BASELINE dari harness bawaan
 * yang sama, dan yang dilaporkan tiga angka: absolut, baseline, dan selisihnya.
 * Assertion tetap pada angka absolut karena begitulah bunyi PRD F-6.3 — tetapi
 * ketika ia merah, laporannya langsung memperlihatkan apakah yang membengkak
 * chart-nya atau bundle dev-nya.
 *
 * Untuk angka produksi yang sesungguhnya, jalankan gate ini terhadap build
 * produksi:
 *
 *     npm run build && npm run start
 *     NEXT_PUBLIC_APP_URL=http://localhost:3000 npx playwright test gantt-perf
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-074 · PRD F-6.3 (AC), §11 tabel performa
 *         SYSTEM_DESIGN §10.3, §19.2
 */

import { expect, test, type Page } from '@playwright/test';

const HARNESS = '/qa/gantt';

/** PRD F-6.3 Acceptance Criteria dan PRD §11. */
const TARGET_RENDER_MS = 500;

/** 60 fps = 16,67 ms per frame. */
const TARGET_FRAME_MS = 1000 / 60;

/**
 * Ambang frame tersendat.
 *
 * 1,5x anggaran satu frame, bukan tepat 16,67 ms. Satu frame yang meleset
 * sepersekian milidetik tidak terlihat mata; yang terlihat adalah frame yang
 * memakan jatah frame berikutnya sehingga ada gambar yang benar-benar hilang.
 */
const AMBANG_TERSENDAT_MS = TARGET_FRAME_MS * 1.5;

interface Dataset {
  param: string;
  /** Jumlah baris minimum yang membuktikan dataset-nya benar dimuat. */
  minBaris: number;
  keterangan: string;
}

const DATASET = {
  master48: {
    param: '48bar',
    // 48 proker + 6 baris grup = 54. Ambangnya 48 supaya susunan grup yang
    // sedikit berbeda tidak membuat gate ini rewel soal hal yang bukan intinya.
    minBaris: 48,
    keterangan: '6 departemen x 8 proker = 48 bar (PRD §11)',
  },
  task100: {
    param: '100task',
    minBaris: 100,
    keterangan: '100 task di 6 grup (PRD F-6.3 Acceptance Criteria)',
  },
} as const satisfies Record<string, Dataset>;

// ---------------------------------------------------------------------------
// Pengukuran render
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __ganttPerf?: { chartTampil: number | null };
  }
}

/**
 * Menanam pencatat SEBELUM skrip halaman berjalan.
 *
 * Waktu render tidak dapat diukur setelah `page.goto()` selesai — saat itu
 * chart-nya sudah terlanjur tergambar dan yang tersisa hanya tebakan. Init
 * script berjalan pada dokumen kosong, jadi MutationObserver-nya sempat melihat
 * bar pertama muncul.
 *
 * Yang dicatat adalah `performance.now()` pada saat bar PERTAMA masuk DOM.
 * Baseline-nya `responseEnd` dari navigation timing, bukan awal navigasi:
 * waktu server dan jaringan bukan milik komponen Gantt, dan di mode dev Next
 * mengkompilasi rute saat pertama diminta — memasukkannya berarti mengukur
 * webpack, bukan chart.
 */
async function tanamPencatat(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__ganttPerf = { chartTampil: null };

    const pengamat = new MutationObserver(() => {
      if (window.__ganttPerf?.chartTampil !== null) return;
      const root = document.querySelector('[data-testid="gantt-root"]');
      if (!root) return;
      if (root.querySelector('[data-testid^="gantt-bar-"]') === null) return;

      window.__ganttPerf!.chartTampil = performance.now();
      pengamat.disconnect();
    });

    pengamat.observe(document, { childList: true, subtree: true });
  });
}

interface HasilRender {
  renderMs: number;
  barisTotal: number;
  barisDirender: number;
  buffer: number;
}

async function bacaRender(page: Page): Promise<HasilRender> {
  const hasil = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const root = document.querySelector('[data-testid="gantt-root"]');
    const angka = (nama: string) => Number(root?.getAttribute(nama) ?? '0');

    return {
      chartTampil: window.__ganttPerf?.chartTampil ?? null,
      responseEnd: nav?.responseEnd ?? 0,
      barisTotal: angka('data-total-row-count'),
      barisDirender: angka('data-rendered-row-count'),
      buffer: angka('data-virtual-buffer'),
    };
  });

  if (hasil.chartTampil === null) {
    throw new Error(
      'Pencatat tidak pernah melihat bar muncul. Periksa data-testid="gantt-bar-<id>" di GanttChart.tsx.',
    );
  }

  return {
    renderMs: Math.max(0, hasil.chartTampil - hasil.responseEnd),
    barisTotal: hasil.barisTotal,
    barisDirender: hasil.barisDirender,
    buffer: hasil.buffer,
  };
}

/**
 * Biaya kerangka kerja: waktu render harness BAWAAN yang hanya berisi 2 proker.
 *
 * Diukur di halaman yang sama, di browser yang sama, pada jalan yang sama —
 * jadi ia memuat persis bundle dan hydration yang sama dengan pengukuran
 * dataset besar. Selisih keduanya adalah biaya yang benar-benar dibawa oleh
 * task tambahan.
 *
 * Mengembalikan `null` bila gagal diukur; laporan lalu menyebut "baseline tidak
 * terukur" alih-alih menggagalkan test karena hal yang bukan intinya.
 */
async function ukurBaseline(page: Page): Promise<number | null> {
  try {
    await page.goto(HARNESS, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid^="gantt-bar-"]');
    return (await bacaRender(page)).renderMs;
  } catch {
    return null;
  }
}

/**
 * Membuka harness, dan MELEWATI test bila dataset yang diminta tidak dirender.
 *
 * Dilewati, bukan digagalkan. Gate yang merah karena berkas milik lane lain
 * belum ada tidak memberi tahu apa pun yang belum diketahui, dan gate merah
 * yang dibiarkan lama-lama berhenti dibaca. Pesannya menyebut alamat persis
 * yang harus dibuat supaya yang membacanya tahu langkah berikutnya tanpa
 * membuka berkas lain.
 */
async function bukaHarness(page: Page, ds: Dataset): Promise<number | null> {
  await tanamPencatat(page);

  // Baseline diambil LEBIH DULU supaya rute `/qa/gantt` sudah dikompilasi Next
  // saat pengukuran sebenarnya berjalan. Tanpa itu, angka dataset besar ikut
  // memuat kompilasi sekali-jalan yang tidak pernah terjadi di produksi.
  const baseline = await ukurBaseline(page);

  const alamat = `${HARNESS}?dataset=${ds.param}`;
  const r = await page.goto(alamat, { waitUntil: 'load' });

  if (!r || r.status() === 404) {
    test.skip(true, `Halaman harness ${HARNESS} belum ada. Ia milik lane ui (T-073/T-074).`);
  }

  const tujuan = new URL(page.url()).pathname;
  if (tujuan !== HARNESS) {
    throw new Error(
      `${alamat} dialihkan ke ${tujuan}. Harness E2E harus dapat dibuka tanpa sesi; ` +
        `periksa PREFIX_HARNESS di middleware.ts (lane data).`,
    );
  }

  await page.waitForSelector('[data-testid="gantt-root"]');
  await page.waitForSelector('[data-testid^="gantt-bar-"]');

  const total = Number(
    (await page.getAttribute('[data-testid="gantt-root"]', 'data-total-row-count')) ?? '0',
  );

  test.skip(
    total < ds.minBaris,
    `${alamat} merender ${total} baris, dibutuhkan minimal ${ds.minBaris} ` +
      `(${ds.keterangan}). Halaman harness belum mengenal parameter "dataset" — ` +
      `lihat KONTRAK di kepala e2e/gantt-perf.spec.ts. Bentuk datanya sudah ada di ` +
      `scripts/bench-gantt.ts sebagai baris48Bar() dan baris100Task().`,
  );

  return baseline;
}

/** Satu baris ringkas yang menyebut ketiga angka sekaligus. */
function ringkasRender(h: HasilRender, baseline: number | null): string {
  const selisih =
    baseline === null ? 'baseline tidak terukur' : `+${(h.renderMs - baseline).toFixed(1)} ms di atas baseline ${baseline.toFixed(1)} ms`;
  return (
    `render ${h.renderMs.toFixed(1)} ms (${selisih}) · ` +
    `${h.barisDirender}/${h.barisTotal} baris dirender, buffer ${h.buffer}`
  );
}

// ---------------------------------------------------------------------------
// Target 1 & 2 — render awal < 500 ms
// ---------------------------------------------------------------------------

test.describe('Target render awal', () => {
  test('Master Gantt 48 bar ter-render < 500 ms', async ({ page }, info) => {
    const baseline = await bukaHarness(page, DATASET.master48);
    const h = await bacaRender(page);
    const ringkas = ringkasRender(h, baseline);

    info.annotations.push({ type: 'ukuran', description: ringkas });
    console.log(`    48 bar   : ${ringkas}`);

    expect(h.renderMs).toBeLessThan(TARGET_RENDER_MS);
  });

  test('Chart 100 task ter-render < 500 ms', async ({ page }, info) => {
    const baseline = await bukaHarness(page, DATASET.task100);
    const h = await bacaRender(page);
    const ringkas = ringkasRender(h, baseline);

    info.annotations.push({ type: 'ukuran', description: ringkas });
    console.log(`    100 task : ${ringkas}`);

    expect(h.renderMs).toBeLessThan(TARGET_RENDER_MS);
  });
});

// ---------------------------------------------------------------------------
// Kontrak 1 — virtualisasi baris
// ---------------------------------------------------------------------------

test.describe('Virtualisasi baris (kontrak 1)', () => {
  /*
   * Diuji bersama performa, bukan terpisah, karena keduanya satu pernyataan:
   * angka 500 ms hanya berarti bila chart-nya memang memuat 100 task. Chart
   * yang cepat karena merender seluruh 106 baris akan tetap lulus target hari
   * ini di mesin pengembang, lalu tersendat di ponsel — dan tidak ada satu pun
   * test yang menyebut sebabnya.
   */
  test('hanya baris di dalam viewport (+ buffer) yang dirender', async ({ page }) => {
    await bukaHarness(page, DATASET.task100);
    const h = await bacaRender(page);

    expect(h.barisTotal).toBeGreaterThanOrEqual(DATASET.task100.minBaris);
    expect(h.barisDirender).toBeLessThan(h.barisTotal);
    expect(h.buffer).toBe(5);
  });

  test('menggulir vertikal mengganti baris yang dirender, bukan menambahnya', async ({ page }) => {
    await bukaHarness(page, DATASET.task100);
    const sebelum = await bacaRender(page);

    await page.getByTestId('gantt-vertical-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await expect
      .poll(async () =>
        page.getByTestId('gantt-vertical-scroll').evaluate((el) => el.scrollTop),
      )
      .toBeGreaterThan(0);

    const sesudah = Number(
      (await page.getAttribute('[data-testid="gantt-root"]', 'data-rendered-row-count')) ?? '0',
    );

    // Jumlahnya tetap sekitar sebesar viewport; yang berubah adalah baris mana.
    // Bila ia bertambah mengikuti scroll, baris lama tidak pernah dilepas dan
    // virtualisasinya hanya menunda biaya, tidak menghilangkannya.
    expect(sesudah).toBeLessThan(sebelum.barisTotal);
    expect(sesudah).toBeLessThanOrEqual(sebelum.barisDirender * 2);
  });
});

// ---------------------------------------------------------------------------
// Target 3 — scroll horizontal 60 fps
// ---------------------------------------------------------------------------

test.describe('Target scroll horizontal', () => {
  test('scroll horizontal berjalan 60 fps', async ({ page }, info) => {
    await bukaHarness(page, DATASET.task100);

    /*
     * Diukur dari `requestAnimationFrame`, bukan dari total waktu.
     *
     * Rata-rata menyembunyikan persis hal yang membuat scroll terasa patah:
     * satu frame 80 ms di tengah 90 frame mulus tetap menghasilkan rata-rata
     * yang lulus. Karena itu yang dilaporkan median, p95, dan JUMLAH frame yang
     * melewati anggaran — tiga angka yang tidak dapat saling menutupi.
     */
    const delta = await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="gantt-scroll"]');
      if (!el) return [] as number[];

      const maksKiri = el.scrollWidth - el.clientWidth;
      const langkah = Math.max(6, maksKiri / 90);
      const hasil: number[] = [];
      let x = 0;
      let lalu = performance.now();

      await new Promise<void>((selesai) => {
        const frame = (sekarang: number) => {
          hasil.push(sekarang - lalu);
          lalu = sekarang;
          x += langkah;
          el.scrollLeft = Math.min(x, maksKiri);
          if (hasil.length >= 90) selesai();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });

      return hasil;
    });

    expect(delta.length).toBeGreaterThan(60);

    // Lima frame pertama dibuang: frame pertama setelah interaksi selalu
    // memuat biaya sekali-jalan (style recalc pertama, layer promotion) yang
    // tidak berulang selama scroll.
    const bersih = delta.slice(5);
    const urut = [...bersih].sort((a, b) => a - b);
    const median = urut[Math.floor(urut.length / 2)]!;
    const p95 = urut[Math.min(urut.length - 1, Math.ceil(0.95 * urut.length) - 1)]!;
    const tersendat = bersih.filter((d) => d > AMBANG_TERSENDAT_MS).length;
    const fps = 1000 / median;

    const ringkas =
      `${fps.toFixed(1)} fps · median ${median.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · ` +
      `${tersendat}/${bersih.length} frame > ${AMBANG_TERSENDAT_MS.toFixed(1)} ms`;
    info.annotations.push({ type: 'ukuran', description: ringkas });
    console.log(`    scroll   : ${ringkas}`);

    // 55 fps, bukan 60: rAF terikat vsync dan satu frame yang terlewat pada
    // 90 sampel sudah menurunkan median di bawah 60 tanpa ada yang terlihat.
    expect(fps).toBeGreaterThanOrEqual(55);

    // Dan tidak boleh ada frame yang benar-benar hilang lebih dari sepersepuluh.
    expect(tersendat / bersih.length).toBeLessThanOrEqual(0.1);
  });
});
