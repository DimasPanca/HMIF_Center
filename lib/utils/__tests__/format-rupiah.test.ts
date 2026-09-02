import { describe, expect, it } from 'vitest';

import { formatRupiah, parseRupiah } from '@/lib/utils/format-rupiah';

describe('format rupiah', () => {
  it('memformat dan membaca Rp1.740.000', () => {
    expect(formatRupiah(1_740_000)).toBe('Rp1.740.000');
    expect(parseRupiah('Rp1.740.000')).toBe(1_740_000);
  });

  it('menangani nol dan nilai negatif', () => {
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(-0)).toBe('Rp0');
    expect(formatRupiah(-1_740_000)).toBe('-Rp1.740.000');
    expect(parseRupiah('-Rp1.740.000')).toBe(-1_740_000);
  });

  it('memakai koma untuk pecahan', () => {
    expect(formatRupiah(1_250.5)).toBe('Rp1.250,5');
    expect(parseRupiah('Rp1.250,5')).toBe(1_250.5);
  });

  it('menolak input yang bukan format rupiah', () => {
    expect(() => parseRupiah('Rp1.74.000')).toThrow('Format rupiah tidak valid.');
    expect(() => parseRupiah('-Rp-1.000')).toThrow('Format rupiah tidak valid.');
  });
});
