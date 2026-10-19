import { BadgeCheck } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { AjukanSkAktif } from '@/components/surat/AjukanSkAktif';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarPengajuanSaya, identitasPemohon } from '@/lib/surat/keterangan-aktif';

export const dynamic = 'force-dynamic';

/**
 * Surat Keterangan Aktif mandiri (ADR-036): pengurus mengajukan untuk dirinya,
 * memantau statusnya, dan mengunduh dokumen yang sudah terbit.
 */
export default async function SkAktifPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'surat.ajukan_aktif')) notFound();
  const [identitas, pengajuan] = await Promise.all([identitasPemohon(konteks), daftarPengajuanSaya(konteks)]);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <BadgeCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Persuratan</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Surat Keterangan Aktif</h1>
            <p className="mt-1 text-[14px] leading-5 text-secondary">
              Bukti Anda pengurus aktif HMIF, untuk beasiswa, magang, atau lomba. Cukup tulis keperluannya; data diri terisi
              otomatis dan surat diterbitkan setelah disetujui pimpinan.
            </p>
          </div>
        </header>
        <AjukanSkAktif identitas={identitas} pengajuan={pengajuan} />
      </div>
    </main>
  );
}
