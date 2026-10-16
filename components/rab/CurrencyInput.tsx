'use client';

/**
 * Input Rupiah untuk sel RAB (T-087 kontrak 3): memformat saat mengetik
 * (`50000` → `Rp50.000`) dan menyerahkan angka murni ke pemanggil.
 *
 * Hanya digit yang dibaca — titik, "Rp", dan spasi yang ikut terketik atau
 * tertempel diabaikan, jadi menempel "Rp 1.250.000" dari WhatsApp tetap benar.
 * Rupiah RAB tidak mengenal sen (lib/rab/item.ts).
 */

import * as React from 'react';

import { MAKS_RUPIAH } from '@/lib/rab/item';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export function bacaRupiah(teks: string): number {
  const digit = teks.replace(/\D/g, '');
  return digit ? Math.min(Number(digit), MAKS_RUPIAH) : 0;
}

export const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { value: number; onNilai: (n: number) => void }
>(function CurrencyInput({ value, onNilai, className, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value ? formatRupiah(value) : ''}
      placeholder="Rp0"
      onChange={(e) => onNilai(bacaRupiah(e.target.value))}
      className={cn('text-right tabular-nums', className)}
    />
  );
});
