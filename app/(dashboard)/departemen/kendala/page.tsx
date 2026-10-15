import Link from 'next/link';

import { KendalaList } from '@/components/kendala/KendalaList';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarKendala, departemenTerlihat } from '@/lib/kendala/service';

import { bacaFilter, pilihanPeriode, type ParamCari } from '@/lib/kendala/filter-halaman';

export const dynamic = 'force-dynamic';

/** Semua kendala dalam lingkup baca + pencarian arsip lintas periode (T-082 #6). */
export default async function KendalaSemuaPage({ searchParams }: { searchParams: Promise<ParamCari> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'kendala.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka kendala.</main>;
  }
  const { f, nilai } = bacaFilter(await searchParams);
  const [departemen, periode, baris] = await Promise.all([departemenTerlihat(konteks), pilihanPeriode(konteks), daftarKendala(konteks, f)]);

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Kendala</h1>
          <p className="text-[13px] text-secondary">Kendala seluruh departemen yang dapat Anda lihat. Pilih departemen untuk melapor kendala baru.</p>
        </div>
      </header>
      {departemen.length ? (
        <nav aria-label="Kendala per departemen" className="flex flex-wrap gap-2">
          {departemen.map((d) => (
            <Link
              key={d.id}
              href={`/departemen/${encodeURIComponent(d.kode)}/kendala`}
              className="rounded-sm border border-default bg-panel px-3 py-1.5 text-[13px] font-medium text-primary hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {d.nama}
            </Link>
          ))}
        </nav>
      ) : null}
      <KendalaList baris={baris} filter={nilai} aksi="/departemen/kendala" departemen={departemen} periode={periode} tampilDepartemen />
    </main>
  );
}
