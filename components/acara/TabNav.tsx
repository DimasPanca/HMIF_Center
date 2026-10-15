/**
 * Delapan tab ruang kerja acara (USER_FLOW §6.2). Tab adalah tautan `?tab=`
 * di rute yang sama, jadi setiap tab dapat dibagikan dan tombol Kembali bekerja.
 *
 * Test id: acara-tab-{slug}.
 */

import Link from 'next/link';

import { cn } from '@/lib/utils';

export const TAB_ACARA = [
  { slug: 'ringkasan', label: 'Ringkasan' },
  { slug: 'gantt', label: 'Gantt' },
  { slug: 'divisi', label: 'Divisi' },
  { slug: 'rab', label: 'RAB' },
  { slug: 'tor', label: 'TOR' },
  { slug: 'proposal', label: 'Proposal' },
  { slug: 'nota', label: 'Nota' },
  { slug: 'lpj', label: 'LPJ' },
] as const;

export type TabAcara = (typeof TAB_ACARA)[number]['slug'];

export function tabDari(v: string | undefined): TabAcara {
  return TAB_ACARA.some((t) => t.slug === v) ? (v as TabAcara) : 'ringkasan';
}

export function TabNav({ acaraId, aktif }: { acaraId: string; aktif: TabAcara }) {
  return (
    <nav aria-label="Bagian ruang kerja acara" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-default">
        {TAB_ACARA.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/acara/${acaraId}?tab=${t.slug}`}
              aria-current={aktif === t.slug ? 'page' : undefined}
              data-testid={`acara-tab-${t.slug}`}
              className={cn(
                '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-[14px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
                aktif === t.slug ? 'border-[var(--primary)] text-primary' : 'border-transparent text-secondary hover:text-primary',
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
