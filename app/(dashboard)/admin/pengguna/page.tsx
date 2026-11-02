import { notFound, redirect } from 'next/navigation';

import { ManajemenPengguna } from '@/components/pengguna/ManajemenPengguna';
import { konteksSaatIni } from '@/lib/auth/guard';
import { daftarPenggunaTerlingkup } from '@/lib/auth/invitation';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function PenggunaPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'user.read')) notFound();

  const [pengguna, departemen] = await Promise.all([
    daftarPenggunaTerlingkup(konteks),
    db.departemen.findMany({
      where: { is_active: true },
      select: { id: true, nama: true },
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    }),
  ]);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Pengguna &amp; peran</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Undang pengurus, atur perannya, dan nonaktifkan akun tanpa menghapus riwayat kerjanya.
            </p>
          </div>
        </header>
        <ManajemenPengguna
          awal={pengguna}
          departemen={departemen}
          userIdSaya={konteks.sesi.userId}
          bolehUndang={can(konteks.roles, 'user.create')}
          bolehUbah={can(konteks.roles, 'user.update')}
        />
      </div>
    </main>
  );
}
