'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { PilihanPeriode } from '@/components/layout/Sidebar';
import { Select } from '@/components/ui/select';

interface PeriodeSelectorProps {
  periode: PilihanPeriode[];
  periodeAktifId: string;
}

export function PeriodeSelector({ periode, periodeAktifId }: PeriodeSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pilihan = searchParams.get('periode') ?? periodeAktifId;

  function pilih(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === periodeAktifId) params.delete('periode');
    else params.set('periode', id);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="hidden min-w-36 max-w-52 sm:block">
      <label htmlFor="periode-selector" className="sr-only">
        Periode kepengurusan
      </label>
      <Select
        id="periode-selector"
        aria-label="Periode kepengurusan"
        placeholder={null}
        value={pilihan}
        onChange={(event) => pilih(event.target.value)}
        className="text-[12px]"
      >
        {periode.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nama}
            {item.status === 'AKTIF' ? ' · Aktif' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}
