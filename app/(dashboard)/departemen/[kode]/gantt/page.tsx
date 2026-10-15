import { notFound, redirect } from 'next/navigation';

import { BuatChartDepartemen } from '@/components/gantt/BuatChartDepartemen';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** Gantt level Departemen periode berjalan: buka bila ada, tawarkan buat bila belum. */
export default async function GanttDepartemenPage({ params }: { params: Promise<{ kode: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'gantt.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka Gantt.</main>;
  }
  const { kode } = await params;
  const departemen = await db.departemen.findFirst({
    where: { kode: { equals: kode, mode: 'insensitive' }, is_active: true },
    select: { id: true, nama: true },
  });
  if (!departemen) notFound();
  const chart = await db.gantt_chart.findFirst({
    where: { scope: 'DEPARTEMEN', departemen_id: departemen.id, periode_id: konteks.periodeId },
    select: { id: true },
  });
  if (chart) redirect(`/gantt/${chart.id}`);

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-primary">Gantt {departemen.nama}</h1>
      <p className="text-[13px] text-secondary">Belum ada Gantt departemen untuk periode ini.</p>
      {can(konteks.roles, 'gantt.create') ? <BuatChartDepartemen departemenId={departemen.id} /> : null}
    </main>
  );
}
