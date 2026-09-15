import Link from 'next/link';

import { konteksSaatIni } from '@/lib/auth/guard';
import { can, lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function PilihKanbanDepartemenPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'kanban.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka Kanban.</main>;
  }
  const lingkup = lingkupUntuk(konteks.roles, 'kanban.read');
  const departemen = await db.departemen.findMany({
    where: {
      is_active: true,
      ...(lingkup === 'DEPARTEMEN' ? { id: { in: konteks.departemenIds } } : {}),
    },
    select: { kode: true, nama: true },
    orderBy: { urutan: 'asc' },
  });
  return (
    <main className="space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-primary">Pilih Kanban departemen</h1>
      {departemen.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {departemen.map((item) => (
            <li key={item.kode}>
              <Link href={`/departemen/${encodeURIComponent(item.kode)}/kanban`} className="block rounded-sm border border-default bg-panel p-4 text-[13px] font-medium text-primary hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2">
                {item.nama}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-secondary">Belum ada departemen yang dapat Anda lihat.</p>
      )}
    </main>
  );
}
