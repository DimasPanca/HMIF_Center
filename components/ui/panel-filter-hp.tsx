'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTampilanHp } from '@/components/ui/use-layar-hp';
import { cn } from '@/lib/utils';

/**
 * Di HP panel filter dilipat menjadi satu tombol "Filter" supaya isi halaman
 * langsung terlihat (ADR-037); pilihan buka/tutup diingat. Layar lebar: apa adanya.
 */
export function PanelFilterHp({ children, jumlahAktif = 0 }: { children: ReactNode; jumlahAktif?: number }) {
  const [keadaan, setKeadaan, layarHp] = useTampilanHp('hmif-filter-hp', 'tertutup', 'terbuka');
  if (!layarHp) return <>{children}</>;
  const terbuka = keadaan === 'terbuka';
  return (
    <div>
      <button
        type="button"
        aria-expanded={terbuka}
        data-testid="filter-hp-toggle"
        onClick={() => setKeadaan(terbuka ? 'tertutup' : 'terbuka')}
        className="flex min-h-11 w-full items-center gap-2 rounded-md border border-default bg-panel px-3 text-[14px] font-medium text-primary"
      >
        <SlidersHorizontal className="size-4 text-secondary" aria-hidden="true" />
        Filter
        {jumlahAktif > 0 ? (
          <span className="rounded-full bg-[var(--primary)] px-2 text-[12px] leading-5 text-[var(--primary-text)] tabular-nums">{jumlahAktif} aktif</span>
        ) : null}
        <ChevronDown className={cn('ml-auto size-4 text-secondary transition-transform', terbuka && 'rotate-180')} aria-hidden="true" />
      </button>
      {terbuka ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
