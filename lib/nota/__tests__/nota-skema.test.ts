import { describe, expect, it } from 'vitest';

import { SkemaNota, pesanSelisih, selisihAlokasi, tanggalMasaDepan } from '@/lib/nota/skema';

const ITEM_A = '6f1b0f7e-2a51-4c55-9f0e-0d6a6f6a1c11';
const ITEM_B = '6f1b0f7e-2a51-4c55-9f0e-0d6a6f6a1c12';
const baris = (rab: string | null, nominal: number, uraian: string | null = null) => ({
  rab_item_id: rab,
  uraian_luar_rab: uraian,
  jumlah_aktual: null,
  harga_aktual: null,
  nominal,
});
const nota = (alokasi: ReturnType<typeof baris>[], total = 75000) => ({
  divisi_id: '6f1b0f7e-2a51-4c55-9f0e-0d6a6f6a1c00',
  image_id: '6f1b0f7e-2a51-4c55-9f0e-0d6a6f6a1c01',
  tanggal_belanja: '2026-10-01',
  total_nota: total,
  keterangan: null,
  alokasi,
});
const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

describe('skema nota (T-101)', () => {
  it('contoh PRD: Rp50.000 + Rp25.000 pada Rp75.000 seimbang; Rp60.000 + Rp25.000 lebih Rp10.000', () => {
    expect(selisihAlokasi(75000, [baris(ITEM_A, 50000), baris(ITEM_B, 25000)])).toBe(0);
    expect(selisihAlokasi(75000, [baris(ITEM_A, 60000), baris(ITEM_B, 25000)])).toBe(10000);
    expect(pesanSelisih(75000, [baris(ITEM_A, 60000), baris(ITEM_B, 25000)], rp)).toBe('Alokasi Rp85.000 ≠ total nota Rp75.000 — lebih Rp10.000.');
    expect(pesanSelisih(75000, [baris(ITEM_A, 70000)], rp)).toContain('kurang Rp5.000');
  });

  it('wajib minimal satu alokasi; item RAB XOR uraian luar RAB (ADR-006)', () => {
    expect(SkemaNota.safeParse(nota([])).success).toBe(false);
    expect(SkemaNota.safeParse(nota([baris(null, 75000, 'Galon')])).success).toBe(true);
    expect(SkemaNota.safeParse(nota([baris(null, 75000, '')])).success).toBe(false);
    expect(SkemaNota.safeParse(nota([baris(ITEM_A, 75000, 'dobel')])).success).toBe(false);
  });

  it('satu item RAB hanya sekali per nota; baris luar RAB boleh berulang', () => {
    expect(SkemaNota.safeParse(nota([baris(ITEM_A, 50000), baris(ITEM_A, 25000)])).success).toBe(false);
    expect(SkemaNota.safeParse(nota([baris(null, 50000, 'A'), baris(null, 25000, 'B')])).success).toBe(true);
  });

  it('rupiah bulat positif', () => {
    expect(SkemaNota.safeParse(nota([baris(ITEM_A, 75000.5)])).success).toBe(false);
    expect(SkemaNota.safeParse(nota([baris(ITEM_A, 0)])).success).toBe(false);
    expect(SkemaNota.safeParse(nota([baris(ITEM_A, 75000)], 0)).success).toBe(false);
  });

  it('tanggal belanja masa depan', () => {
    expect(tanggalMasaDepan('2026-10-17', '2026-10-16')).toBe(true);
    expect(tanggalMasaDepan('2026-10-16', '2026-10-16')).toBe(false);
  });
});
