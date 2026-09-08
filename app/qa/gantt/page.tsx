import { notFound } from 'next/navigation';

import { GanttChart } from '@/components/gantt/GanttChart';
import { transformGanttRows } from '@/lib/gantt/transform';

const HARI_MS = 86_400_000;
const AWAL = new Date('2026-09-01T00:00:00.000Z');
const HARI_INI = new Date('2026-11-15T00:00:00.000Z');

const DEPARTEMEN = [
  ['dept-kaderisasi', 'Kaderisasi', 'var(--dept-kaderisasi)'],
  ['dept-kominfo', 'Kominfo', 'var(--dept-kominfo)'],
  ['dept-minat-bakat', 'Minat & Bakat', 'var(--dept-mikat)'],
  ['dept-eksternal', 'Eksternal', 'var(--dept-eksternal)'],
  ['dept-akademik', 'Akademik', 'var(--dept-internal)'],
  ['dept-kewirausahaan', 'Kewirausahaan', 'var(--dept-rnd)'],
] as const;

function tanggal(plusHari: number): string {
  return new Date(AWAL.getTime() + plusHari * HARI_MS).toISOString().slice(0, 10);
}

const modelBawaan = transformGanttRows({
  masterRows: [
    {
      departemen_id: 'dept-kaderisasi',
      departemen_nama: 'Kaderisasi',
      departemen_warna: 'var(--dept-kaderisasi)',
      departemen_urutan: 1,
      proker_id: 'proker-sync',
      proker_nama: 'SYNCHRONIZE 2026',
      status: 'PERSIAPAN',
      tanggal_mulai_persiapan: '2026-11-01',
      tanggal_hari_h_mulai: '2026-11-20',
      tanggal_hari_h_selesai: '2026-11-22',
      pj_nama: 'Nadia Putri',
      progres: 68,
    },
    {
      departemen_id: 'dept-kaderisasi',
      departemen_nama: 'Kaderisasi',
      departemen_warna: 'var(--dept-kaderisasi)',
      departemen_urutan: 1,
      proker_id: 'proker-upgrading',
      proker_nama: 'UPGRADING 2026',
      status: 'PERSIAPAN',
      tanggal_mulai_persiapan: '2026-12-01',
      tanggal_hari_h_mulai: '2026-12-18',
      tanggal_hari_h_selesai: '2026-12-19',
      pj_nama: 'Raka Pratama',
      progres: 42,
    },
  ],
  scale: 'week',
  range: {
    start: new Date('2026-10-25T00:00:00.000Z'),
    end: new Date('2027-12-31T00:00:00.000Z'),
  },
  today: new Date('2026-11-15T00:00:00.000Z'),
});

const model48Bar = transformGanttRows({
  masterRows: DEPARTEMEN.flatMap(([id, nama, warna], departemenIndex) =>
    Array.from({ length: 8 }, (_, prokerIndex) => {
      const geser = prokerIndex * 40 + departemenIndex * 6;

      return {
        departemen_id: id,
        departemen_nama: nama,
        departemen_warna: warna,
        departemen_urutan: departemenIndex + 1,
        proker_id: `${id}-proker-${prokerIndex}`,
        proker_nama: `${nama} Proker ${prokerIndex + 1}`,
        status: 'PERSIAPAN',
        tanggal_mulai_persiapan: tanggal(geser),
        tanggal_hari_h_mulai: tanggal(geser + 25),
        tanggal_hari_h_selesai: tanggal(geser + 27),
        pj_nama: `PJ ${nama} ${prokerIndex + 1}`,
        progres: (prokerIndex * 13) % 101,
      };
    }),
  ),
  scale: 'month',
  today: HARI_INI,
});

const grup100Task = DEPARTEMEN.map(([id, nama, warna], departemenIndex) => ({
  id,
  nama,
  warna,
  urutan: departemenIndex + 1,
}));

const model100Task = transformGanttRows({
  groupRows: grup100Task,
  taskRows: Array.from({ length: 100 }, (_, taskIndex) => {
    const [groupId, groupName] = DEPARTEMEN[taskIndex % DEPARTEMEN.length]!;
    const geser = taskIndex * 3;

    return {
      id: `task-${taskIndex}`,
      group_id: groupId,
      nama: `Task ${taskIndex + 1} — ${groupName}`,
      tanggal_mulai: tanggal(geser),
      tanggal_selesai: tanggal(geser + 12),
      progres: (taskIndex * 7) % 101,
      urutan: taskIndex,
      assignee_name: `Anggota ${taskIndex + 1}`,
      status: 'BERJALAN',
    };
  }),
  scale: 'week',
  today: HARI_INI,
});

type GanttQaPageProps = {
  searchParams: Promise<{ dataset?: string | string[] }>;
};

async function GanttQaPage({ searchParams }: GanttQaPageProps) {
  if (process.env.NODE_ENV === 'production') notFound();

  const requestedDataset = (await searchParams).dataset;
  const dataset = Array.isArray(requestedDataset) ? requestedDataset[0] : requestedDataset;
  const model =
    dataset === '48bar' ? model48Bar : dataset === '100task' ? model100Task : modelBawaan;

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[96rem] space-y-4">
        <header>
          <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
            Halaman verifikasi nonproduksi
          </p>
          <h1 className="mt-1 text-xl font-semibold">Harness Gantt</h1>
        </header>
        <GanttChart model={model} maxHeight={420} />
      </div>
    </main>
  );
}

export default GanttQaPage;
