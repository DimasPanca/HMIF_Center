import { GanttEditor } from '@/components/gantt/GanttEditor';
import { LEVEL, type Level } from '@/lib/gantt/skema';
import type { DataChart } from '@/lib/gantt/service';

/**
 * Harness e2e editor Gantt (T-078) — nonproduksi, tanpa sesi, data tetap.
 *
 *   /qa/gantt-editor?level=<departemen|proker|ketuplak|divisi>&izin=<baca|tulis>
 *
 * Editor berjalan dalam mode lokal (`chartId = null`): mutasi hanya di
 * memori. Kontrak selector: kepala e2e/gantt-editor.spec.ts.
 */

const HARI_INI = '2026-10-20';

const JUDUL: Record<Level, string> = {
  departemen: 'Gantt Departemen Kaderisasi',
  proker: 'Gantt SYNCHRONIZE 2026',
  ketuplak: 'Timeline Ketua Pelaksana SYNCHRONIZE 2026',
  divisi: 'Gantt Divisi Acara',
};

const GRUP = [
  { id: '00000000-0000-4000-8000-0000000000a1', nama: 'Persiapan', warna: '#2563EB' },
  { id: '00000000-0000-4000-8000-0000000000a2', nama: 'Publikasi', warna: '#16A34A' },
  { id: '00000000-0000-4000-8000-0000000000a3', nama: 'Pelaksanaan', warna: '#D97706' },
];

const TASK: [string, number, string, string, string, number][] = [
  ['01', 0, 'Rapat perdana panitia', '2026-10-01', '2026-10-03', 100],
  ['02', 0, 'Penyusunan proposal', '2026-10-04', '2026-10-14', 80],
  ['03', 0, 'Pengajuan perizinan', '2026-10-15', '2026-10-24', 40],
  ['04', 0, 'Survei venue', '2026-10-10', '2026-10-17', 60],
  ['05', 1, 'Desain poster', '2026-10-12', '2026-10-20', 70],
  ['06', 1, 'Open registration', '2026-10-21', '2026-11-10', 10],
  ['07', 1, 'Teaser media sosial', '2026-10-25', '2026-11-12', 0],
  ['08', 2, 'Gladi resik', '2026-11-18', '2026-11-19', 0],
  ['09', 2, 'Hari H', '2026-11-20', '2026-11-22', 0],
  ['10', 2, 'Evaluasi & LPJ', '2026-11-23', '2026-12-05', 0],
];

function data(level: Level, tulis: boolean): DataChart {
  const id = (n: string) => `00000000-0000-4000-8000-0000000000${n}`;
  return {
    chart: { id: '00000000-0000-4000-8000-000000000001', judul: JUDUL[level], level, periode_id: '00000000-0000-4000-8000-000000000002', arsip: false },
    grup: GRUP.map((g, i) => ({ ...g, pj_nama: null, urutan: i, collapsed: false })),
    task: TASK.map(([n, g, nama, mulai, selesai, progres], i) => ({
      id: id(n),
      group_id: GRUP[g]!.id,
      nama,
      tanggal_mulai: mulai,
      tanggal_selesai: selesai,
      progres,
      is_milestone: n === '09',
      urutan: i,
      assignee_name: null,
    })),
    dependensi: [
      { dari: id('02'), ke: id('03') },
      { dari: id('05'), ke: id('06') },
      { dari: id('08'), ke: id('09') },
    ],
    hak: { baca: true, tulis, tambah: tulis, hapus: tulis },
  };
}

export default async function HarnessGanttEditor({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const level = (LEVEL as readonly string[]).includes(sp.level ?? '') ? (sp.level as Level) : 'proker';
  const tulis = sp.izin !== 'baca';
  return (
    <main className="min-h-dvh bg-app p-4 text-primary">
      <GanttEditor key={`${level}-${tulis}`} awal={data(level, tulis)} chartId={null} hariIni={HARI_INI} />
    </main>
  );
}
