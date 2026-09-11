import { ArrowLeft, PencilLine } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { EditProkerForm, type OpsiEditProker } from '@/components/proker/EditProkerForm';
import { buttonVariants } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can, lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { dalamLingkup, detailProker } from '@/lib/proker/service';

export const dynamic = 'force-dynamic';

interface EditProkerPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProkerPage({ params }: EditProkerPageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'proker.update')) notFound();

  const { id } = await params;
  const proker = await detailProker(id);
  if (
    !proker ||
    proker.periode_id !== konteks.periodeId ||
    !dalamLingkup(konteks, 'proker.update', proker.departemen_id)
  ) {
    notFound();
  }

  const lingkup = lingkupUntuk(konteks.roles, 'proker.update');
  const barisDepartemen = await db.departemen.findMany({
    where: {
      is_active: true,
      ...(lingkup === 'DEPARTEMEN' ? { id: { in: konteks.departemenIds } } : {}),
    },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    select: { id: true, nama: true },
  });
  const departemen: OpsiEditProker[] = barisDepartemen;

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
              aria-hidden="true"
            >
              <PencilLine className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
                Program kerja
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">Sunting program kerja</h1>
                <StatusPill status={proker.status} />
              </div>
              <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
                {proker.nama} · {proker.nama_departemen}
              </p>
            </div>
          </div>

          <Link href="/proker" className={buttonVariants({ variant: 'secondary' })}>
            <ArrowLeft aria-hidden="true" />
            Kembali ke daftar
          </Link>
        </header>

        <EditProkerForm
          departemen={departemen}
          proker={{
            departemen_id: proker.departemen_id,
            deskripsi: proker.deskripsi,
            id: proker.id,
            kategori: proker.kategori,
            nama: proker.nama,
            sasaran: proker.sasaran,
            status: proker.status,
            tanggal_hari_h_mulai: proker.tanggal_hari_h_mulai,
            tanggal_hari_h_selesai: proker.tanggal_hari_h_selesai,
            tanggal_mulai_persiapan: proker.tanggal_mulai_persiapan,
            tujuan: proker.tujuan,
          }}
        />
      </div>
    </main>
  );
}
