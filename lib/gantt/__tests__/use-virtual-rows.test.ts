import { describe, expect, it } from 'vitest';

import { calculateVirtualRange } from '@/lib/gantt/use-virtual-rows';

const rows = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  y: index * 20,
  height: 20,
}));

describe('calculateVirtualRange', () => {
  it('merender viewport awal ditambah lima baris buffer bawah', () => {
    expect(calculateVirtualRange(rows, 0, 100)).toEqual({
      startIndex: 0,
      endIndex: 10,
    });
  });

  it('menambahkan tepat lima baris buffer pada kedua sisi viewport', () => {
    expect(calculateVirtualRange(rows, 200, 100)).toEqual({
      startIndex: 5,
      endIndex: 20,
    });
  });

  it('memperhitungkan offset header sticky', () => {
    expect(calculateVirtualRange(rows, 50, 100, 0, 50, 50)).toEqual({
      startIndex: 2,
      endIndex: 5,
    });
  });

  it('mengapit rentang di akhir daftar dan menangani daftar kosong', () => {
    expect(calculateVirtualRange(rows, 560, 100)).toEqual({
      startIndex: 23,
      endIndex: 30,
    });
    expect(calculateVirtualRange([], 0, 100)).toEqual({ startIndex: 0, endIndex: 0 });
  });
});
