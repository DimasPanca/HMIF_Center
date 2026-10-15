import { notFound } from 'next/navigation';

import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { KonteksDeadline } from '@/components/shared/KonteksDeadline';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can, lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { konteksDeadline } from '@/lib/deadline-config';

export const dynamic = 'force-dynamic';

export default async function KanbanDepartemenPage({
  params,
}: {
  params: Promise<{ kode: string }>;
}) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'kanban.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka Kanban.</main>;
  }
  const { kode } = await params;
  const departemen = await db.departemen.findUnique({
    where: { kode: kode.toUpperCase() },
    select: { id: true, nama: true },
  });
  if (!departemen) notFound();
  if (
    lingkupUntuk(konteks.roles, 'kanban.read') === 'DEPARTEMEN' &&
    !konteks.departemenIds.includes(departemen.id)
  ) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak memiliki akses ke Kanban departemen ini.</main>;
  }
  const bolehUbah = can(konteks.roles, 'kanban.update');
  const [proker, daftarRole] = bolehUbah
    ? await Promise.all([
        db.proker.findMany({
          where: { departemen_id: departemen.id, periode_id: konteks.periodeId, status: { in: ['DISETUJUI', 'BERJALAN'] } },
          select: { id: true, nama: true },
          orderBy: { nama: 'asc' },
        }),
        db.user_role.findMany({
          where: { departemen_id: departemen.id, periode_id: konteks.periodeId, app_user: { is_active: true } },
          select: { user_id: true, app_user: { select: { nama_lengkap: true } } },
        }),
      ])
    : [[], []];
  const pengurus = [...new Map(daftarRole.map((item) => [item.user_id, { id: item.user_id, nama: item.app_user.nama_lengkap }])).values()]
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'));
  return (
    <section aria-label={`Kanban ${departemen.nama}`}>
      <KonteksDeadline nilai={await konteksDeadline()}>
        <KanbanBoard departemenId={departemen.id} bolehUbah={bolehUbah} daftarProker={proker} pengurus={pengurus} />
      </KonteksDeadline>
    </section>
  );
}
