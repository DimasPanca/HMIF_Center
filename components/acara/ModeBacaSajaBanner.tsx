/**
 * Banner tampilan baca saja untuk divisi lain (T-085, PRD F-8.3, USER_FLOW §6.3).
 *
 * Banner ini MENJELASKAN, bukan menjaga: tombol tulis di halaman divisi lain
 * memang tidak dirender (INV-30), dan route tulis menolak 403 lewat
 * `bisaTulisDivisi` — serta RLS migrasi 039 untuk jalur langsung.
 *
 * Test id: mode-baca-saja.
 */

import { Eye } from 'lucide-react';

export function ModeBacaSajaBanner({ namaDivisi }: { namaDivisi: string }) {
  return (
    <div role="status" data-testid="mode-baca-saja" className="flex items-start gap-2.5 rounded-sm border-l-[3px] border-l-[var(--info)] bg-[var(--info-subtle)] p-3 text-primary">
      <Eye aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-[var(--info)]" />
      <div>
        <p className="text-[14px] font-semibold">Tampilan baca saja — Divisi {namaDivisi}</p>
        <p className="mt-0.5 text-[13px] text-secondary">
          RAB, progres, Gantt, dokumen, dan job desk divisi ini dapat dilihat, tetapi hanya panitia divisinya dan Ketua Pelaksana yang dapat mengubahnya.
        </p>
      </div>
    </div>
  );
}
