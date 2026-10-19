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
    // HP: delapan tab tampil sekaligus sebagai kisi 4×2 — tidak ada yang tersembunyi
    // di luar layar dan tidak perlu digeser (ADR-037). Layar lebar: tab bergaris bawah.
    <nav aria-label="Bagian ruang kerja acara">
      <ul className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-1 sm:border-b sm:border-default">
        {TAB_ACARA.map((t) => (
          <li key={t.slug} className="min-w-0">
            <Link
              href={`/acara/${acaraId}?tab=${t.slug}`}
              aria-current={aktif === t.slug ? 'page' : undefined}
              data-testid={`acara-tab-${t.slug}`}
              className={cn(
                'flex h-10 items-center justify-center rounded-md border px-1 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
                'sm:-mb-px sm:inline-flex sm:rounded-none sm:border-0 sm:border-b-2 sm:px-3 sm:text-[14px]',
                aktif === t.slug
                  ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)] sm:bg-transparent sm:text-primary'
                  : 'border-default text-secondary hover:text-primary sm:border-transparent',
              )}
            >
              <span className="truncate">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
