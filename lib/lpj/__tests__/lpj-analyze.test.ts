import { describe, expect, it } from 'vitest';

import { analisisLpj, kategoriItem, persenSelisih, type BahanLpj } from '@/lib/lpj/analyze';

const item = (id: string, jenis: string, rencana: number, section = 'UMUM') => ({
  id,
  jenis_barang: jenis,
  section,
  rencana,
});
const alok = (rab: string | null, nominal: number, uraian: string | null = null) => ({
  rab_item_id: rab,
  jenis_barang: rab,
  uraian_luar_rab: uraian,
  nominal,
});

/** Skenario kontrak 6 sekaligus. */
const BAHAN: BahanLpj = {
  divisi: [
    {
      id: 'dk',
      nama: 'Konsumsi',
      items: [
        item('snack', 'Snack', 100_000),
        item('galon', 'Galon', 50_000),
        item('aqua', 'Aqua', 30_000),
      ],
    },
    {
      id: 'dp',
      nama: 'PDD',
      items: [
        item('kamera', 'Sewa kamera', 200_000),
        item('baterai', 'Baterai', 40_000),
        item('gratis', 'Pinjaman', 0),
      ],
    },
  ],
  nota: [
    // Nota terbagi ke 3 item RAB.
    {
      id: 'n1',
      tanggal: '2026-10-01',
      diunggah: '2026-10-01T00:00:00Z',
      divisi: 'Konsumsi',
      total_nota: 150_000,
      alokasi: [alok('snack', 90_000), alok('galon', 50_000), alok('aqua', 10_000)],
    },
    // Item over 200%: baterai rencana 40.000, aktual 130.000 (325%).
    {
      id: 'n2',
      tanggal: '2026-10-02',
      diunggah: '2026-10-02T00:00:00Z',
      divisi: 'PDD',
      total_nota: 130_000,
      alokasi: [alok('baterai', 130_000)],
    },
    // Pengeluaran di luar RAB.
    {
      id: 'n3',
      tanggal: '2026-10-03',
      diunggah: '2026-10-03T00:00:00Z',
      divisi: 'Konsumsi',
      total_nota: 25_000,
      alokasi: [alok(null, 25_000, 'Parkir mobil logistik')],
    },
  ],
  // Pemasukan dari 2 sumber.
  pemasukan: [
    { keterangan: 'Total Pembayaran Acara', saldo: 300_000 },
    { keterangan: 'Kas HMIF', saldo: 150_000 },
  ],
  danaTakTerduga: 60_000,
};

describe('lpj-analyze', () => {
  const a = analisisLpj(BAHAN, new Date('2026-10-16T00:00:00Z'));
  const per = (id: string) => a.perItem.find((i) => i.id === id)!;

  it('total pengeluaran sama persis dengan jumlah nota terverifikasi', () => {
    expect(a.totalAktual).toBe(150_000 + 130_000 + 25_000);
    expect(a.jumlahNota).toBe(3);
    // Σ alokasi (dalam RAB + luar RAB) = total aktual (INV-28).
    expect(a.perItem.reduce((s, i) => s + i.aktual, 0) + a.totalDiLuarRab).toBe(a.totalAktual);
  });

  it('nota terbagi 3 item menambah realisasi ketiganya sesuai porsi', () => {
    expect([per('snack').aktual, per('galon').aktual, per('aqua').aktual]).toEqual([
      90_000, 50_000, 10_000,
    ]);
    expect(per('snack').kategori).toBe('UNDER_BUDGET');
    expect(per('galon').kategori).toBe('SESUAI');
  });

  it('item tanpa nota masuk "Belum Direalisasikan"', () => {
    expect(a.belumRealisasi.map((i) => i.id)).toEqual(['kamera', 'gratis']);
    expect(per('kamera')).toMatchObject({
      aktual: 0,
      selisih: -200_000,
      persenSelisih: -100,
      kategori: 'BELUM_REALISASI',
    });
  });

  it('item over 200% ditandai OVER_BUDGET dengan besaran kelebihan', () => {
    expect(a.overBudget.map((i) => i.id)).toEqual(['baterai']);
    expect(per('baterai')).toMatchObject({
      selisih: 90_000,
      persenSelisih: 225,
      kategori: 'OVER_BUDGET',
    });
  });

  it('pengeluaran di luar RAB menjadi temuan, bukan daftar kosong', () => {
    expect(a.diLuarRab).toEqual([
      {
        nota_id: 'n3',
        tanggal: '2026-10-03',
        divisi: 'Konsumsi',
        uraian: 'Parkir mobil logistik',
        nominal: 25_000,
      },
    ]);
    expect(a.totalDiLuarRab).toBe(25_000);
    expect(a.perDivisi.find((d) => d.nama === 'Konsumsi')!.diLuarRab).toBe(25_000);
  });

  it('pemasukan dari 2 sumber dan sisa dana', () => {
    expect(a.totalPemasukan).toBe(450_000);
    expect(a.sisaDana).toBe(450_000 - 305_000);
  });

  it('per divisi: rencana vs aktual (tanpa pengeluaran luar RAB)', () => {
    expect(a.perDivisi.map((d) => [d.nama, d.rencana, d.aktual, d.selisih])).toEqual([
      ['Konsumsi', 180_000, 150_000, -30_000],
      ['PDD', 240_000, 130_000, -110_000],
    ]);
    expect(a.totalRencana).toBe(420_000);
  });

  it('dana tak terduga: menutup kelebihan item + luar RAB sampai batas cadangan', () => {
    // kebutuhan = 90.000 (baterai) + 25.000 (luar RAB) = 115.000; cadangan 60.000.
    expect(a.danaTakTerdugaTerpakai).toBe(60_000);
    expect(a.kekuranganDanaTakTerduga).toBe(55_000);
    const cukup = analisisLpj({ ...BAHAN, danaTakTerduga: 200_000 });
    expect(cukup.danaTakTerdugaTerpakai).toBe(115_000);
    expect(cukup.kekuranganDanaTakTerduga).toBe(0);
  });

  it('persentase aman terhadap pembagian nol', () => {
    expect(per('gratis').persenSelisih).toBeNull();
    expect(persenSelisih(5000, 0)).toBeNull();
    const kosong = analisisLpj({ divisi: [], nota: [], pemasukan: [], danaTakTerduga: 0 });
    expect(kosong).toMatchObject({
      totalRencana: 0,
      totalAktual: 0,
      sisaDana: 0,
      perDivisi: [],
      diLuarRab: [],
    });
    expect(
      analisisLpj({ ...BAHAN, divisi: [{ id: 'x', nama: 'X', items: [] }] }).perDivisi[0]!
        .persenSelisih,
    ).toBeNull();
  });

  it('kategori item', () => {
    expect([
      kategoriItem(100, 0),
      kategoriItem(100, 100),
      kategoriItem(100, 80),
      kategoriItem(100, 250),
    ]).toEqual(['BELUM_REALISASI', 'SESUAI', 'UNDER_BUDGET', 'OVER_BUDGET']);
    // Item ber-rencana 0 yang terealisasi = over budget.
    expect(kategoriItem(0, 1000)).toBe('OVER_BUDGET');
  });
});
