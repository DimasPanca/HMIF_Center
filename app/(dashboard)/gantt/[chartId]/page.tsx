import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { GanttEditor } from '@/components/gantt/GanttEditor';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { LABEL_LEVEL } from '@/lib/gantt/skema';
import { muatChart } from '@/lib/gantt/service';

export const dynamic = 'force-dynamic';

/** Editor satu chart Gantt — level apa pun (T-078). */
export default async function GanttChartPage({ params }: { params: Promise<{ chartId: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'gantt.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka Gantt.</main>;
  }
  const { chartId } = await params;
  if (!z.uuid().safeParse(chartId).success) notFound();
  const data = await muatChart(konteks, chartId);
  if (!data) notFound();

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <header>
        <p className="text-xs text-secondary">
          <Link href="/proker/gantt" className="hover:underline">
            Gantt
          </Link>
          {` / ${LABEL_LEVEL[data.chart.level]}`}
        </p>
        <h1 className="text-2xl font-semibold text-primary">{data.chart.judul}</h1>
      </header>
      <GanttEditor
        awal={data}
        chartId={chartId}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
        supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null}
      />
    </main>
  );
}
