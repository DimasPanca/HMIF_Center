import Link from 'next/link';
import { notFound } from 'next/navigation';

import { KendalaList } from '@/components/kendala/KendalaList';
import { LaporKendala } from '@/components/kendala/LaporKendala';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { boleh, daftarKendala, departemenDariKode, orangRelevan, prokerPilihan } from '@/lib/kendala/service';

import { bacaFilter, pilihanPeriode, type ParamCari } from '@/lib/kendala/filter-halaman';

export const dynamic = 'force-dynamic';

export default async function KendalaDepartemenPage({
  params,
  searchParams,
}: {
  params: Promise<{ kode: string }>;
  searchParams: Promise<ParamCari>;
}) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'kendala.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka kendala.</main>;
  }
  const { kode } = await params;
  const departemen = await departemenDariKode(kode);
  if (!departemen) notFound();
  if (!boleh(konteks, 'kendala.read', departemen.id)) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak memiliki akses ke kendala departemen ini.</main>;
  }
  const { f, nilai } = bacaFilter(await searchParams);
  const bolehLapor = boleh(konteks, 'kendala.create', departemen.id);
  const [baris, periode, orang, proker] = await Promise.all([
    daftarKendala(konteks, { ...f, departemenId: departemen.id }),
    pilihanPeriode(konteks),
    bolehLapor ? orangRelevan(konteks, departemen.id) : Promise.resolve([]),
    bolehLapor ? prokerPilihan(konteks, departemen.id) : Promise.resolve([]),
  ]);

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-secondary">
            <Link href="/departemen/kendala" className="hover:underline">
              Kendala
            </Link>{' '}
            / {departemen.nama}
          </p>
          <h1 className="text-2xl font-semibold text-primary">Kendala {departemen.nama}</h1>
        </div>
        {bolehLapor ? <LaporKendala departemenId={departemen.id} orang={orang} proker={proker} /> : null}
      </header>
      <KendalaList
        baris={baris}
        filter={nilai}
        aksi={`/departemen/${encodeURIComponent(departemen.kode)}/kendala`}
        periode={periode}
        tampilDepartemen={false}
      />
    </main>
  );
}
