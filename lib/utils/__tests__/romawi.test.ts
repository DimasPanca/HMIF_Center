import { describe, expect, it } from 'vitest';

import { bulanRomawi } from '@/lib/utils/romawi';

describe('bulan Romawi', () => {
  it('mengubah bulan 10 menjadi X', () => {
    expect(bulanRomawi(10)).toBe('X');
  });

  it('mendukung batas awal dan akhir', () => {
    expect(bulanRomawi(1)).toBe('I');
    expect(bulanRomawi(12)).toBe('XII');
  });

  it.each([0, -1, 13, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'menolak bulan di luar rentang: %s',
    (bulan) => {
      expect(() => bulanRomawi(bulan)).toThrow(RangeError);
    },
  );
});
