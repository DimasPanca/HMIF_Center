import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { GanttEditor } from '@/components/gantt/GanttEditor';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
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

  // Chart milik acara/divisi: remah roti kembali ke ruang kerja acara, bukan indeks Gantt
  // umum — pengguna datang dari tab Gantt acara (ADR-039). Hak baca sudah dicek muatChart.
  const pemilik = await db.gantt_chart.findUnique({
    where: { id: chartId },
    select: {
      kepanitiaan: { select: { id: true, nama_acara: true } },
      divisi: { select: { id: true, nama: true, kepanitiaan: { select: { id: true, nama_acara: true } } } },
    },
  });
  const acara = pemilik?.kepanitiaan ?? pemilik?.divisi?.kepanitiaan ?? null;

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <header>
        <nav aria-label="Breadcrumb" className="text-xs text-secondary">
          {acara ? (
            <>
              <Link href="/acara" className="hover:underline">
                Acara Besar
              </Link>
              {' / '}
              <Link href={`/acara/${acara.id}?tab=gantt`} className="hover:underline">
                {acara.nama_acara}
              </Link>
              {pemilik?.divisi ? (
                <>
                  {' / '}
                  <Link href={`/acara/${acara.id}/divisi/${pemilik.divisi.id}`} className="hover:underline">
                    Divisi {pemilik.divisi.nama}
                  </Link>
                </>
              ) : null}
              {' / Gantt'}
            </>
          ) : (
            <>
              <Link href="/proker/gantt" className="hover:underline">
                Gantt
              </Link>
              {` / ${LABEL_LEVEL[data.chart.level]}`}
            </>
          )}
        </nav>
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
