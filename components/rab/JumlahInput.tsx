'use client';

/**
 * Kolom Jumlah RAB (T-087 kontrak 4, DESIGN_SYSTEM §9.3): teks bebas yang
 * disimpan apa adanya (INV-26), dengan hint hasil parse `→ 16` di bawahnya.
 *
 * Bila parser tidak yakin ("2 Hari 1 Malam", "2 pack (12 pcs/pack)"), baris
 * ditandai amber dan muncul field kecil "jumlah untuk perhitungan" — alurnya
 * tidak diblokir: sementara itu angka pertama dipakai sebagai perkiraan.
 *
 * Test id (relatif baris): rab-jumlah, rab-jumlah-hint, rab-jumlah-manual.
 */

import * as React from 'react';

import { parseJumlah } from '@/lib/rab/parse-jumlah';
import { cn } from '@/lib/utils';

const angkaId = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export function JumlahInput({
  teks,
  numerik,
  onTeks,
  onNumerik,
  inputProps,
  kelasSel,
}: {
  teks: string;
  numerik: number | null;
  onTeks: (t: string) => void;
  onNumerik: (n: number | null) => void;
  inputProps: React.ComponentProps<'input'>;
  kelasSel: string;
}) {
  const parsed = React.useMemo(() => parseJumlah(teks), [teks]);
  const id = React.useId();
  const manual = parsed.butuhInputManual && teks.trim() !== '';

  return (
    <div className="grid gap-0.5">
      <input
        {...inputProps}
        type="text"
        value={teks}
        onChange={(e) => onTeks(e.target.value)}
        aria-describedby={`${id}-hint`}
        data-testid="rab-jumlah"
        className={cn(kelasSel, manual && 'border-[var(--warning)] bg-[var(--warning-subtle)]')}
      />
      {manual ? (
        <label className="flex items-center gap-1 text-[11px] text-[var(--warning)]" id={`${id}-hint`} data-testid="rab-jumlah-hint">
          <span className="whitespace-nowrap">Jumlah untuk perhitungan</span>
          <input
            type="text"
            inputMode="decimal"
            value={numerik ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(',', '.').trim();
              const n = Number(v);
              onNumerik(v === '' ? null : Number.isFinite(n) && n >= 0 ? n : (numerik ?? null));
            }}
            onKeyDown={inputProps.onKeyDown}
            onBlur={inputProps.onBlur}
            data-testid="rab-jumlah-manual"
            className="h-6 w-16 rounded-sm border border-[var(--warning)] bg-panel px-1 text-right text-[12px] text-primary tabular-nums"
          />
        </label>
      ) : (
        <span id={`${id}-hint`} data-testid="rab-jumlah-hint" className="text-[11px] text-tertiary tabular-nums">
          {parsed.numerik !== null ? `→ ${angkaId.format(parsed.numerik)}` : ' '}
        </span>
      )}
    </div>
  );
}
