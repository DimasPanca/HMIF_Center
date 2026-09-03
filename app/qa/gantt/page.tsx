import { notFound } from 'next/navigation';

import { GanttChart } from '@/components/gantt/GanttChart';
import { transformGanttRows } from '@/lib/gantt/transform';

const model = transformGanttRows({
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

function GanttQaPage() {
  if (process.env.NODE_ENV === 'production') notFound();

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
