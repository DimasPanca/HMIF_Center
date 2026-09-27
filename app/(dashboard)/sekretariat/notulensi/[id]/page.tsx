import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { NotulensiForm } from '@/components/notulensi/NotulensiForm';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { sanitasiKonten } from '@/lib/notulensi/sanitasi';
import { bolehTulisNotulensi, detailNotulensi } from '@/lib/notulensi/service';
import { formatTanggalPanjang } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

export default async function DetailNotulensiPage({ params }: { params: Promise<{ id: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'notulensi.read')) notFound();

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await detailNotulensi(konteks, id);
  if (!detail) notFound();

  // Kontrol ubah tidak dirender sama sekali bagi yang tak berhak (INV-30); arsip periode lain read-only (INV-08).
  const editable =
    can(konteks.roles, 'notulensi.update') &&
    detail.periode_id === konteks.periodeId &&
    (await bolehTulisNotulensi(db, konteks, detail.departemen_id));

  const departemen = await db.departemen.findMany({
    where: { is_active: true },
    select: { id: true, nama: true, kode: true },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
  });

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
          <h1 className="mt-2 text-2xl font-semibold break-words">{detail.judul}</h1>
          <p className="mt-1 text-[14px] text-secondary">{formatTanggalPanjang(detail.tanggal)}</p>
        </header>
        <NotulensiForm
          key={detail.id}
          awal={{ ...detail, konten: sanitasiKonten(detail.konten) }}
          editable={editable}
          departemen={departemen}
        />
      </div>
    </main>
  );
}
