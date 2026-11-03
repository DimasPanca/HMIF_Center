/**
 * Navigasi ruang kerja acara (ADR-039): sembilan bagian dikelompokkan menjadi empat
 * fase kerja — Ikhtisar, Persiapan, Pelaksanaan, Laporan — supaya pilihan di layar
 * pertama cukup empat, dan urutannya mengikuti alur acara. Bagian di dalam fase
 * tampil sebagai baris kedua.
 *
 * Tab adalah tautan `?tab=` di rute yang sama, jadi setiap bagian dapat dibagikan
 * dan tombol Kembali bekerja. `?tab=` menerima slug bagian (tor, rab, …) maupun
 * slug fase (persiapan → bagian pertamanya); tautan lama tetap berlaku.
 *
 * Test id: acara-grup-{fase}, acara-tab-{bagian}. Ikhtisar = acara-tab-ringkasan.
 */

import Link from 'next/link';

import { cn } from '@/lib/utils';

export const TAB_ACARA = [
  { slug: 'ringkasan', label: 'Ikhtisar' },
  { slug: 'tor', label: 'TOR' },
  { slug: 'rab', label: 'RAB' },
  { slug: 'proposal', label: 'Proposal' },
  { slug: 'divisi', label: 'Divisi' },
  { slug: 'gantt', label: 'Gantt' },
  { slug: 'formulir', label: 'Formulir' },
  { slug: 'nota', label: 'Nota' },
  { slug: 'lpj', label: 'LPJ' },
] as const;

export type TabAcara = (typeof TAB_ACARA)[number]['slug'];

export const GRUP_ACARA = [
  { slug: 'ringkasan', label: 'Ikhtisar', bagian: [] },
  { slug: 'persiapan', label: 'Persiapan', bagian: ['tor', 'rab', 'proposal'] },
  { slug: 'pelaksanaan', label: 'Pelaksanaan', bagian: ['divisi', 'gantt', 'formulir'] },
  { slug: 'laporan', label: 'Laporan', bagian: ['nota', 'lpj'] },
] as const satisfies readonly { slug: string; label: string; bagian: readonly TabAcara[] }[];

type GrupAcara = (typeof GRUP_ACARA)[number];

export function tabDari(v: string | undefined): TabAcara {
  const grup = GRUP_ACARA.find((g) => g.slug === v);
  if (grup) return grup.bagian[0] ?? 'ringkasan';
  return TAB_ACARA.some((t) => t.slug === v) ? (v as TabAcara) : 'ringkasan';
}

export function grupDari(tab: TabAcara): GrupAcara {
  return GRUP_ACARA.find((g) => (g.bagian as readonly string[]).includes(tab)) ?? GRUP_ACARA[0];
}

const labelTab = (slug: TabAcara) => TAB_ACARA.find((t) => t.slug === slug)!.label;

const fokus = 'outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]';

export function TabNav({ acaraId, aktif }: { acaraId: string; aktif: TabAcara }) {
  const grupAktif = grupDari(aktif);
  return (
    <nav aria-label="Bagian ruang kerja acara" className="space-y-2">
      {/* HP: empat fase sebagai tombol (2×2 di layar sangat sempit) — tidak ada yang
          tersembunyi di luar layar (ADR-037). Layar lebar: tab bergaris bawah. */}
      <ul className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4 sm:flex sm:gap-1 sm:border-b sm:border-default">
        {GRUP_ACARA.map((g) => {
          const nyala = g.slug === grupAktif.slug;
          return (
            <li key={g.slug} className="min-w-0">
              <Link
                href={`/acara/${acaraId}?tab=${g.bagian[0] ?? g.slug}`}
                aria-current={nyala ? (g.bagian.length ? 'true' : 'page') : undefined}
                data-testid={g.bagian.length ? `acara-grup-${g.slug}` : 'acara-tab-ringkasan'}
                className={cn(
                  'flex h-10 items-center justify-center gap-1.5 rounded-md border px-1 text-[13.5px] font-medium',
                  'sm:-mb-px sm:inline-flex sm:rounded-none sm:border-0 sm:border-b-2 sm:px-3 sm:text-[14px]',
                  fokus,
                  nyala
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)] sm:bg-transparent sm:text-primary'
                    : 'border-default text-secondary hover:text-primary sm:border-transparent',
                )}
              >
                <span className="truncate">{g.label}</span>
                {g.bagian.length ? (
                  <span className="hidden text-[12px] font-normal text-tertiary lg:inline">
                    {g.bagian.map(labelTab).join(' · ')}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {grupAktif.bagian.length ? (
        <ul
          aria-label={`Bagian ${grupAktif.label}`}
          className={cn('grid gap-1.5 sm:flex sm:gap-1', grupAktif.bagian.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}
        >
          {grupAktif.bagian.map((slug) => (
            <li key={slug} className="min-w-0">
              <Link
                href={`/acara/${acaraId}?tab=${slug}`}
                aria-current={aktif === slug ? 'page' : undefined}
                data-testid={`acara-tab-${slug}`}
                className={cn(
                  'flex h-9 items-center justify-center rounded-full border px-3.5 text-[13.5px] font-medium',
                  fokus,
                  aktif === slug
                    ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-primary'
                    : 'border-default text-secondary hover:bg-subtle hover:text-primary',
                )}
              >
                <span className="truncate">{labelTab(slug)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
