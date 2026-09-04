/**
 * bench-gantt — mengukur biaya menyiapkan satu frame Gantt, tanpa browser.
 *
 *   npx tsx scripts/bench-gantt.ts
 *
 * ===========================================================================
 * APA YANG DIUKUR, DAN APA YANG TIDAK
 * ===========================================================================
 * Yang diukur adalah seluruh pekerjaan yang mendahului render: transform baris
 * database menjadi view model, pembentukan kolom timeline, dan perhitungan
 * geometri setiap baris beserta marker Hari-H-nya. Itulah bagian yang tumbuh
 * seiring jumlah task, dan satu-satunya bagian yang dapat membuat chart 100
 * task melewati 500 ms karena aritmetika belaka.
 *
 * Yang TIDAK diukur adalah waktu cat browser: layout, style recalculation, dan
 * kompositing SVG. Bagian itu hanya jujur bila diukur di browser sungguhan, dan
 * di sanalah `e2e/gantt-perf.spec.ts` bekerja. Kedua angka melengkapi, bukan
 * menggantikan: skrip ini menyingkap regresi algoritmik dalam sedetik tanpa
 * dev server, gate E2E menyingkap regresi render.
 *
 * Karena itu angka di sini SELALU jauh di bawah 500 ms, dan itu memang
 * seharusnya. Ia bukan bukti "target tercapai" sendirian — ia batas bawahnya,
 * dan yang berguna adalah melihatnya tidak bergerak saat data membesar.
 *
 * ===========================================================================
 * KENAPA LAYOUT DISUSUN ULANG DI SINI, BUKAN DIIMPOR
 * ===========================================================================
 * `buildLayout` hidup di dalam `components/gantt/GanttChart.tsx` — komponen
 * klien React yang tidak dapat dijalankan di Node tanpa menyeret React DOM,
 * dan berkas milik lane ui yang tidak boleh disunting lane ini untuk
 * mengekspornya.
 *
 * Maka fungsi `susunLayout()` di bawah menyalin aritmetikanya memakai API
 * publik `lib/gantt/geometry.ts` — `barRect`, `dateToX`, `dateSpanWidth`, dan
 * `GANTT_DIMENSIONS` yang sama persis. Yang disalin hanya urutan pemanggilan;
 * seluruh perhitungannya tetap milik geometry.ts, sehingga perubahan di sana
 * langsung terukur di sini.
 *
 * Bila `buildLayout` suatu saat dipindahkan ke `lib/gantt/`, ganti salinan ini
 * dengan impor langsung.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-074 · PRD F-6.3 (AC), §11 tabel performa
 *         SYSTEM_DESIGN §10.3, §19.2
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  GANTT_DIMENSIONS,
  barRect,
  dateSpanWidth,
  dateToX,
  type GanttBarRect,
} from '../lib/gantt/geometry';
import { transformGanttRows } from '../lib/gantt/transform';
import type { GanttTaskVM, GanttViewModel } from '../lib/gantt/types';

// ---------------------------------------------------------------------------
// Target — angkanya dari PRD, bukan dari selera
// ---------------------------------------------------------------------------

/** PRD F-6.3 Acceptance Criteria dan PRD §11 tabel performa. */
const TARGET_MS = 500;

/** Jumlah ulangan per kasus. Median dilaporkan, bukan rata-rata. */
const ULANGAN = 30;

/**
 * Ulangan pemanasan yang dibuang.
 *
 * JIT V8 mengoptimalkan fungsi setelah beberapa panggilan pertama. Tanpa
 * pemanasan, ulangan pertama bisa 5-10x lebih lambat daripada sisanya, dan
 * angka yang dilaporkan menjadi tentang JIT alih-alih tentang kode.
 */
const PEMANASAN = 5;

const HARI_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Data uji
// ---------------------------------------------------------------------------

function tanggal(mulai: Date, plusHari: number): string {
  return new Date(mulai.getTime() + plusHari * HARI_MS).toISOString().slice(0, 10);
}

const AWAL = new Date('2026-09-01T00:00:00.000Z');
const HARI_INI = new Date('2026-11-15T00:00:00.000Z');

const DEPARTEMEN = [
  ['dept-kaderisasi', 'Kaderisasi'],
  ['dept-kominfo', 'Kominfo'],
  ['dept-minat-bakat', 'Minat & Bakat'],
  ['dept-eksternal', 'Eksternal'],
  ['dept-akademik', 'Akademik'],
  ['dept-kewirausahaan', 'Kewirausahaan'],
] as const;

/**
 * Master Gantt: 6 departemen x 8 proker = 48 bar.
 *
 * Bentuk ini bukan karangan — PRD §11 menyebut angkanya persis begitu, dan
 * itulah susunan beranda pada kepengurusan yang sedang berjalan penuh.
 */
function baris48Bar() {
  const rows = [];
  for (const [id, nama] of DEPARTEMEN) {
    for (let n = 0; n < 8; n++) {
      // Rentang disebar sepanjang satu kepengurusan supaya kolom timeline yang
      // terbentuk realistis. Proker yang menumpuk di satu bulan menghasilkan
      // timeline pendek, dan biaya pembentukan kolomnya ikut mengecil.
      const geser = n * 40 + DEPARTEMEN.findIndex((d) => d[0] === id) * 6;
      rows.push({
        departemen_id: id,
        departemen_nama: nama,
        departemen_warna: `var(--${id})`,
        departemen_urutan: DEPARTEMEN.findIndex((d) => d[0] === id) + 1,
        proker_id: `${id}-proker-${n}`,
        proker_nama: `${nama} Proker ${n + 1}`,
        status: 'PERSIAPAN',
        tanggal_mulai_persiapan: tanggal(AWAL, geser),
        tanggal_hari_h_mulai: tanggal(AWAL, geser + 25),
        tanggal_hari_h_selesai: tanggal(AWAL, geser + 27),
        pj_nama: `PJ ${nama} ${n + 1}`,
        progres: (n * 13) % 101,
      });
    }
  }
  return rows;
}

/**
 * Chart 100 task, tersebar di 6 grup.
 *
 * PRD F-6.3 menyebut "chart dengan 100 task", yaitu Gantt tingkat proker berisi
 * task pekerjaan — bukan Master Gantt. Grupnya tetap enam supaya jumlah baris
 * totalnya 106 dan bukan 100: baris grup ikut dirender dan ikut dihitung.
 */
function baris100Task() {
  const groups = DEPARTEMEN.map(([id, nama], i) => ({
    id,
    nama,
    warna: `var(--${id})`,
    urutan: i + 1,
  }));

  const tasks = [];
  for (let n = 0; n < 100; n++) {
    const grup = DEPARTEMEN[n % DEPARTEMEN.length]!;
    const geser = n * 3;
    tasks.push({
      id: `task-${n}`,
      group_id: grup[0],
      nama: `Task ${n + 1} — ${grup[1]}`,
      tanggal_mulai: tanggal(AWAL, geser),
      tanggal_selesai: tanggal(AWAL, geser + 12),
      progres: (n * 7) % 101,
      urutan: n,
      assignee_name: `Anggota ${n + 1}`,
      status: 'BERJALAN',
    });
  }

  return { groups, tasks };
}

// ---------------------------------------------------------------------------
// Layout — salinan aritmetika buildLayout, lihat kepala berkas
// ---------------------------------------------------------------------------

interface BarisLayout {
  kind: 'group' | 'task';
  y: number;
  height: number;
  rect?: GanttBarRect;
  hariH?: { x: number; width: number };
}

function rectHariH(
  task: GanttTaskVM,
  rectTask: GanttBarRect,
  model: GanttViewModel,
): { x: number; width: number } | undefined {
  const mulai = task.hariHStart ?? task.hariHEnd;
  const selesai = task.hariHEnd ?? task.hariHStart;
  if (!mulai || !selesai) return undefined;

  const konteks = { start: model.timeline.start, pxPerDay: model.timeline.pxPerDay };
  const x = dateToX(mulai, konteks);
  const akhir = x + dateSpanWidth(mulai, selesai, konteks);
  const kiri = Math.max(rectTask.x, x);
  const kanan = Math.min(rectTask.x + rectTask.width, akhir);

  return kanan > kiri ? { x: kiri, width: kanan - kiri } : undefined;
}

function susunLayout(model: GanttViewModel): { rows: BarisLayout[]; height: number } {
  const rows: BarisLayout[] = [];
  const konteks = { start: model.timeline.start, pxPerDay: model.timeline.pxPerDay };
  let y = GANTT_DIMENSIONS.groupGap;

  for (const group of model.groups) {
    const ringkas = group.bars[0];
    const rectGrup = ringkas
      ? barRect({ start: ringkas.start, end: ringkas.end, y, kind: 'group' }, konteks)
      : undefined;

    rows.push({ kind: 'group', y, height: GANTT_DIMENSIONS.groupRowHeight, rect: rectGrup });
    y += GANTT_DIMENSIONS.groupRowHeight;

    for (const task of group.tasks) {
      const rectTask = barRect({ start: task.start, end: task.end, y, kind: 'task' }, konteks);
      rows.push({
        kind: 'task',
        y,
        height: GANTT_DIMENSIONS.taskRowHeight,
        rect: rectTask,
        hariH: rectHariH(task, rectTask, model),
      });
      y += GANTT_DIMENSIONS.taskRowHeight;
    }

    y += GANTT_DIMENSIONS.groupGap;
  }

  return { rows, height: y };
}

// ---------------------------------------------------------------------------
// Pengukuran
// ---------------------------------------------------------------------------

interface Hasil {
  nama: string;
  keterangan: string;
  median: number;
  p95: number;
  min: number;
  maks: number;
  barisTotal: number;
  kolomTimeline: number;
}

function persentil(urut: number[], p: number): number {
  // Nearest-rank. Pada 30 sampel, interpolasi tidak menambah ketelitian apa pun
  // dan hanya membuat angkanya sulit dicocokkan dengan daftar mentah.
  const i = Math.min(urut.length - 1, Math.ceil((p / 100) * urut.length) - 1);
  return urut[Math.max(0, i)]!;
}

function ukur(nama: string, keterangan: string, siapkan: () => GanttViewModel): Hasil {
  for (let i = 0; i < PEMANASAN; i++) susunLayout(siapkan());

  const waktu: number[] = [];
  let terakhir!: { rows: BarisLayout[]; height: number };
  let model!: GanttViewModel;

  for (let i = 0; i < ULANGAN; i++) {
    // Transform IKUT diukur, bukan disiapkan di luar loop. Di aplikasi, data
    // datang dari API setiap kali filter berubah, dan biaya transform-nya nyata
    // dibayar pada frame yang sama dengan layout-nya.
    const t0 = performance.now();
    model = siapkan();
    terakhir = susunLayout(model);
    waktu.push(performance.now() - t0);
  }

  const urut = [...waktu].sort((a, b) => a - b);
  return {
    nama,
    keterangan,
    median: persentil(urut, 50),
    p95: persentil(urut, 95),
    min: urut[0]!,
    maks: urut.at(-1)!,
    barisTotal: terakhir.rows.length,
    kolomTimeline: model.timeline.columns.length,
  };
}

// ---------------------------------------------------------------------------
// Virtualisasi — hanya bila modulnya ada
// ---------------------------------------------------------------------------

/**
 * `lib/gantt/use-virtual-rows.ts` lahir di T-074 bagian ui dan mungkin belum
 * ada di worktree ini. Impornya dinamis supaya benchmark tetap berjalan dan
 * MENGATAKAN modulnya belum ada, alih-alih gagal dengan jejak resolusi modul
 * yang tidak menyebut sebabnya.
 */
async function ukurVirtualisasi(
  rows: BarisLayout[],
): Promise<{ tersedia: false } | { tersedia: true; median: number; dirender: number }> {
  type HitungRentang = (
    rows: readonly { y: number; height: number }[],
    scrollTop: number,
    viewportHeight: number,
    overscan?: number,
  ) => { startIndex: number; endIndex: number };

  // Keberadaannya diperiksa lewat berkas, bukan lewat try/catch di sekitar
  // impor: `import()` dengan literal string membuat TypeScript menuntut
  // modulnya ada saat `npm run typecheck`, dan itu akan menggagalkan verify di
  // worktree yang memang belum memilikinya.
  const jalur = path.join(import.meta.dirname, '..', 'lib', 'gantt', 'use-virtual-rows.ts');
  if (!fs.existsSync(jalur)) return { tersedia: false };

  const modul = (await import(pathToFileURL(jalur).href)) as {
    calculateVirtualRange?: HitungRentang;
  };
  const calculateVirtualRange = modul.calculateVirtualRange;
  if (typeof calculateVirtualRange !== 'function') return { tersedia: false };

  const viewport = 520;
  const geometri = rows.map((r) => ({ y: r.y, height: r.height }));
  const posisi = Array.from({ length: 60 }, (_, i) => i * 40);

  for (let i = 0; i < PEMANASAN; i++) {
    for (const top of posisi) calculateVirtualRange(geometri, top, viewport, 5);
  }

  const waktu: number[] = [];
  let dirender = 0;
  for (let i = 0; i < ULANGAN; i++) {
    const t0 = performance.now();
    for (const top of posisi) {
      const r = calculateVirtualRange(geometri, top, viewport, 5);
      dirender = r.endIndex - r.startIndex;
    }
    waktu.push(performance.now() - t0);
  }

  const urut = [...waktu].sort((a, b) => a - b);
  return { tersedia: true, median: persentil(urut, 50), dirender };
}

// ---------------------------------------------------------------------------

function baris(h: Hasil): string {
  const status = h.median < TARGET_MS ? 'OK  ' : 'LEWAT';
  return (
    `    [${status}] ${h.nama.padEnd(26)} ` +
    `median ${h.median.toFixed(2).padStart(7)} ms   ` +
    `p95 ${h.p95.toFixed(2).padStart(7)} ms   ` +
    `${h.barisTotal} baris, ${h.kolomTimeline} kolom`
  );
}

async function main(): Promise<void> {
  console.log('\n  bench-gantt — biaya menyiapkan satu frame Gantt');
  console.log(`  ${ULANGAN} ulangan, ${PEMANASAN} pemanasan dibuang, target < ${TARGET_MS} ms\n`);
  console.log(`  Node ${process.version} · ${process.platform}/${process.arch}\n`);

  const master = ukur('Master Gantt 48 bar', '6 departemen x 8 proker (PRD §11)', () =>
    transformGanttRows({
      masterRows: baris48Bar(),
      scale: 'month',
      today: HARI_INI,
    }),
  );

  const { groups, tasks } = baris100Task();
  const seratus = ukur('Chart 100 task', 'PRD F-6.3 Acceptance Criteria', () =>
    transformGanttRows({
      groupRows: groups,
      taskRows: tasks,
      scale: 'week',
      today: HARI_INI,
    }),
  );

  console.log(baris(master));
  console.log(baris(seratus));

  // Virtualisasi diukur pada chart 100 task: di sanalah bedanya terasa.
  const modelSeratus = transformGanttRows({
    groupRows: groups,
    taskRows: tasks,
    scale: 'week',
    today: HARI_INI,
  });
  const virt = await ukurVirtualisasi(susunLayout(modelSeratus).rows);

  console.log('');
  if (virt.tersedia) {
    console.log(
      `    [OK  ] Virtualisasi baris        median ${virt.median.toFixed(2)} ms untuk 60 posisi scroll, ` +
        `${virt.dirender} dari ${seratus.barisTotal} baris dirender`,
    );
  } else {
    console.log(
      '    [ -- ] Virtualisasi baris        lib/gantt/use-virtual-rows.ts belum ada di worktree ini.',
    );
    console.log(
      '                                     Ia lahir di T-074 bagian ui; benchmark lain tetap sah.',
    );
  }

  const gagal = [master, seratus].filter((h) => h.median >= TARGET_MS);

  console.log('\n  Catatan: angka di atas TIDAK memuat waktu cat browser.');
  console.log('  Target 500 ms dan 60 fps diukur utuh di `npm run test:e2e -- gantt-perf`.\n');

  if (gagal.length) {
    console.log('  MELEWATI TARGET:');
    gagal.forEach((h) => console.log(`    ${h.nama}: median ${h.median.toFixed(2)} ms`));
    console.log('');
    process.exit(1);
  }
}

void main();
