import { ClipboardPlus } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { WizardShell, type OpsiPilihan } from '@/components/proker/wizard/WizardShell';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can, lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function TambahProkerPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'proker.create')) notFound();

  const lingkup = lingkupUntuk(konteks.roles, 'proker.create');
  const [barisDepartemen, barisPengurus] = await Promise.all([
    db.departemen.findMany({
      where: {
        is_active: true,
        ...(lingkup === 'DEPARTEMEN' ? { id: { in: konteks.departemenIds } } : {}),
      },
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
      select: { id: true, nama: true },
    }),
    db.app_user.findMany({
      where: { is_active: true },
      orderBy: { nama_lengkap: 'asc' },
      select: { id: true, nama_lengkap: true },
    }),
  ]);

  const departemen: OpsiPilihan[] = barisDepartemen;
  const pengurus: OpsiPilihan[] = barisPengurus.map((item) => ({
    id: item.id,
    nama: item.nama_lengkap,
  }));
  const departemenAwal =
    departemen.find((item) => konteks.departemenIds.includes(item.id))?.id ?? departemen[0]?.id;

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <ClipboardPlus className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
              Program kerja
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold">Tambah program kerja</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Lengkapi setiap langkah secara berurutan. Draft tersimpan otomatis dan dapat
              dilanjutkan saat Anda kembali.
            </p>
          </div>
        </header>

        <WizardShell
          departemen={departemen}
          departemenAwal={departemenAwal}
          pengurus={pengurus}
        />
      </div>
    </main>
  );
}
