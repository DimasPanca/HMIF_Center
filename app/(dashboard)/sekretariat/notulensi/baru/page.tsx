import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { NotulensiForm } from '@/components/notulensi/NotulensiForm';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { tujuanTulisNotulensi } from '@/lib/notulensi/service';

export const dynamic = 'force-dynamic';

export default async function NotulensiBaruPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'notulensi.create')) notFound();

  const [tujuan, departemen] = await Promise.all([
    tujuanTulisNotulensi(konteks),
    db.departemen.findMany({
      where: { is_active: true },
      select: { id: true, nama: true, kode: true },
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    }),
  ]);
  const departemenTulis =
    tujuan.departemenIds === 'SEMUA' ? departemen : departemen.filter((d) => tujuan.departemenIds.includes(d.id));
  if (!tujuan.himpunan && departemenTulis.length === 0) notFound();

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <Link
            href="/sekretariat/notulensi"
            className="inline-flex items-center gap-1 text-[13px] text-secondary hover:text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Arsip notulensi
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Notulensi baru</h1>
        </header>
        <NotulensiForm
          awal={null}
          editable
          pilihanTujuan={{ himpunan: tujuan.himpunan, departemen: departemenTulis }}
          departemen={departemen}
        />
      </div>
    </main>
  );
}
