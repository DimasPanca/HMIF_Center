import { Users } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { PengurusTable } from '@/components/pengurus/PengurusTable';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarDepartemen, daftarPengurusLengkap } from '@/lib/pengurus/service';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data Pengurus periode berjalan (T-107, PRD F-14.1): sumber Surat Keterangan
 * Aktif dan daftar hadir notulensi. Tulis = Admin & Sekum; Kadept/Anggota
 * hanya melihat departemennya.
 */
export default async function DataPengurusPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'pengurus.read')) notFound();

  const sp = await searchParams;
  const status = satu(sp.status);
  const filter = {
    q: satu(sp.q)?.slice(0, 100),
    departemen: POLA_UUID.test(satu(sp.departemen) ?? '') ? satu(sp.departemen) : undefined,
    status: status === 'nonaktif' || status === 'semua' ? status : undefined,
  } as const;
  const [baris, departemen] = await Promise.all([daftarPengurusLengkap(konteks, filter), daftarDepartemen()]);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <Users className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Kesekretariatan</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Data pengurus</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Daftar pengurus periode ini — sumber Surat Keterangan Aktif Organisasi dan daftar hadir notulensi. Pengurus tidak harus
              punya akun.
            </p>
          </div>
        </header>
        <PengurusTable
          baris={baris}
          departemen={departemen}
          filter={filter}
          izin={{
            tulis: can(konteks.roles, 'pengurus.create'),
            hapus: can(konteks.roles, 'pengurus.delete'),
            buatSurat: can(konteks.roles, 'surat.create'),
          }}
        />
      </div>
    </main>
  );
}
