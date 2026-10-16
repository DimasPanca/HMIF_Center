import { describe, expect, it } from 'vitest';

import {
  bukuPengeluaran,
  penandaSelisih,
  realisasiPerItem,
  urutkanNota,
  type NotaRealisasi,
} from '@/lib/rab/realisasi';

const n = (
  id: string,
  tanggal: string,
  diunggah: string,
  alokasi: NotaRealisasi['alokasi'],
  divisi = 'Konsumsi',
): NotaRealisasi => ({
  id,
  tanggal,
  diunggah,
  divisi,
  alokasi,
});
const item = (id: string, jenis: string, nominal: number) => ({
  rab_item_id: id,
  jenis_barang: jenis,
  uraian_luar_rab: null,
  nominal,
});
const luar = (uraian: string, nominal: number) => ({
  rab_item_id: null,
  jenis_barang: null,
  uraian_luar_rab: uraian,
  nominal,
});

const A = n('a', '2026-10-01', '2026-10-05T10:00:00Z', [item('snack', 'Snack', 50000)]);
const B = n('b', '2026-10-03', '2026-10-02T09:00:00Z', [
  item('galon', 'Galon', 25000),
  luar('Parkir', 5000),
]);
const C = n('c', '2026-10-02', '2026-10-06T08:00:00Z', [item('snack', 'Snack', 10000)]);

describe('rab-realisasi', () => {
  it('buku berurutan tanggal belanja, bukan urutan unggah/verifikasi; saldo berjalan', () => {
    const b = bukuPengeluaran(200000, [B, A, C]);
    expect(b.baris.map((x) => [x.tanggal, x.uraian, x.nominal, x.saldo])).toEqual([
      ['2026-10-01', 'Snack', 50000, 150000],
      ['2026-10-02', 'Snack', 10000, 140000],
      ['2026-10-03', 'Galon', 25000, 115000],
      ['2026-10-03', 'Di luar RAB: Parkir', 5000, 110000],
    ]);
    expect(b.total_pengeluaran).toBe(90000);
    expect(b.sisa).toBe(110000);
    expect(b.baris.map((x) => x.no)).toEqual([1, 2, 3, 4]);
  });

  it('membatalkan verifikasi nota TENGAH menghitung ulang seluruh saldo dari awal', () => {
    const penuh = bukuPengeluaran(200000, [A, B, C]);
    const tanpaTengah = bukuPengeluaran(200000, [A, B]); // C (2 Okt) dibatalkan
    expect(penuh.baris.find((x) => x.tanggal === '2026-10-03')!.saldo).toBe(115000);
    expect(tanpaTengah.baris.map((x) => x.saldo)).toEqual([150000, 125000, 120000]);
    expect(tanpaTengah.sisa).toBe(120000);
    // Sama persis dengan menghitung dari nol daftar yang tersisa — tidak ada sisa state.
    expect(tanpaTengah).toEqual(bukuPengeluaran(200000, [B, A]));
  });

  it('nota terbagi ke 3 item RAB menambah realisasi ketiganya sesuai porsi', () => {
    const tiga = n('t', '2026-10-04', '2026-10-04T00:00:00Z', [
      item('snack', 'Snack', 30000),
      item('galon', 'Galon', 20000),
      item('aqua', 'Aqua', 25000),
    ]);
    const r = realisasiPerItem([A, tiga]);
    expect(Object.fromEntries(r)).toEqual({ snack: 80000, galon: 20000, aqua: 25000 });
    // Total nota tidak dipakai — hanya nominal alokasi.
    expect(bukuPengeluaran(0, [tiga]).baris.map((x) => x.nominal)).toEqual([25000, 20000, 30000]);
  });

  it('pengeluaran di luar RAB masuk PENGELUARAN bertanda, tidak masuk item mana pun', () => {
    const b = bukuPengeluaran(0, [B]);
    expect(b.baris.filter((x) => x.luar_rab)).toEqual([
      expect.objectContaining({ uraian: 'Di luar RAB: Parkir', nominal: 5000, luar_rab: true }),
    ]);
    expect([...realisasiPerItem([B]).keys()]).toEqual(['galon']);
  });

  it('tanggal sama: waktu unggah lalu id sebagai pemecah — stabil', () => {
    const x = n('x', '2026-10-01', '2026-10-01T09:00:00Z', []);
    const y = n('y', '2026-10-01', '2026-10-01T09:00:00Z', []);
    expect(urutkanNota([A, y, x]).map((z) => z.id)).toEqual(['x', 'y', 'a']);
  });

  it('penanda selisih rencana vs realisasi', () => {
    expect(penandaSelisih(50000, 0)).toBe('BELUM');
    expect(penandaSelisih(50000, 50000)).toBe('SESUAI');
    expect(penandaSelisih(50000, 40000)).toBe('HEMAT');
    expect(penandaSelisih(50000, 60000)).toBe('LEBIH');
  });
});
