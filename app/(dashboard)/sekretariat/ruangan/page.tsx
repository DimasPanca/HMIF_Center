import { Building2 } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { DaftarRuangan } from '@/components/ruangan/DaftarRuangan';
import { KalenderBooking } from '@/components/ruangan/KalenderBooking';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarBooking, daftarRuangan, rentangBulan } from '@/lib/ruangan/service';
import { tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Peminjaman ruangan (T-108, PRD F-14.2, USER_FLOW §9.3). Sekretaris mengelola
 * daftar ruangan; Admin/Sekum/Kadept mencatat peminjaman. Bentrok hanya
 * diperingatkan — keputusan akhir ada di Dekanat.
 */
export default async function PeminjamanRuanganPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  // KADEPT memegang `C*` tanpa `R`: ia tetap perlu melihat kalender untuk mengajukan.
  if (!can(konteks.roles, 'ruangan.read') && !can(konteks.roles, 'ruangan.create')) notFound();

  const sp = await searchParams;
  const diminta = Array.isArray(sp.bulan) ? sp.bulan[0] : sp.bulan;
  const { bulan } = rentangBulan(diminta ?? tanggalHariIniJakarta().slice(0, 7));
  const [ruangan, booking] = await Promise.all([daftarRuangan(), daftarBooking(konteks, { bulan })]);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <Building2 className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Kesekretariatan</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Peminjaman ruangan</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Jadwal peminjaman yang sudah diajukan HMIF. Bentrok hanya diperingatkan karena keputusan akhir ada di Dekanat.
            </p>
          </div>
        </header>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <KalenderBooking
            bulan={bulan}
            booking={booking}
            ruangan={ruangan}
            izin={{
              userId: konteks.sesi.userId,
              catat: can(konteks.roles, 'ruangan.create'),
              hapus: can(konteks.roles, 'ruangan.delete'),
              kelola: can(konteks.roles, 'ruangan.update'),
              buatSurat: can(konteks.roles, 'surat.create'),
            }}
          />
          <DaftarRuangan ruangan={ruangan} bolehKelola={can(konteks.roles, 'ruangan.update')} />
        </div>
      </div>
    </main>
  );
}
