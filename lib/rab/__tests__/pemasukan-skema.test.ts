import { describe, expect, it } from 'vitest';

import { parseTabel } from '@/lib/import/parse-tabel';
import { KOLOM_IMPORT_PESERTA, SkemaPeserta, ringkasPeserta, skemaBarisPeserta, totalPemasukan } from '@/lib/rab/pemasukan-skema';

describe('SkemaPeserta', () => {
  it('status bayar boolean; tanggal tanpa status bayar ditolak (cermin CHECK peserta_tanggal_konsisten)', () => {
    expect(SkemaPeserta.parse({ nama_lengkap: 'Triana', sudah_bayar: true, tanggal_bayar: '2025-11-22', jumlah: 150000 })).toMatchObject({
      sudah_bayar: true,
      tanggal_bayar: '2025-11-22',
      nim: null,
    });
    const p = SkemaPeserta.safeParse({ nama_lengkap: 'Raka', sudah_bayar: false, tanggal_bayar: '2025-11-22' });
    expect(p.success).toBe(false);
    expect(p.error?.issues[0]?.message).toBe('Tanggal bayar diisi, tetapi status masih belum bayar.');
    expect(SkemaPeserta.safeParse({ nama_lengkap: 'X', sudah_bayar: 'ya' }).success).toBe(false); // bukan teks bebas
  });

  it('NIM opsional tetapi bila ada harus angka 6–20 digit', () => {
    expect(SkemaPeserta.parse({ nama_lengkap: 'A', nim: ' 3337 2401 00 ' }).nim).toBe('3337240100');
    expect(SkemaPeserta.safeParse({ nama_lengkap: 'A', nim: '33A7' }).success).toBe(false);
  });
});

describe('ringkasPeserta — satu rumus untuk panel dan server', () => {
  it('terkumpul hanya dari yang sudah bayar', () => {
    const r = ringkasPeserta([
      { sudah_bayar: true, jumlah: 150000 },
      { sudah_bayar: false, jumlah: 150000 },
      { sudah_bayar: true, jumlah: 100000 },
    ]);
    expect(r).toEqual({ total: 3, sudahBayar: 2, belumBayar: 1, terkumpul: 250000 });
    expect(totalPemasukan(r, [{ saldo: 2_600_000 }])).toBe(2_850_000);
  });
});

describe('import peserta lewat parse-tabel', () => {
  const matriks = [
    ['Nama Lengkap', 'NIM', 'Status Bayar', 'Tgl Bayar', 'Jumlah'],
    ['Triana', '3337240001', 'Lunas', '22/11/2025', 'Rp150.000'],
    ['Raka', '', 'Belum', '', '0'],
    ['Nadia', '3337240003', 'ya', '2025-11-23', '150000'],
    ['Salah Status', '3337240004', 'mungkin', '', ''],
    ['Salah Tanggal', '3337240005', 'ya', '31 Nov', ''],
    ['Belum Tapi Bertanggal', '3337240006', 'belum', '22/11/2025', ''],
    ['', '3337240007', 'ya', '', ''],
  ];
  const h = parseTabel(matriks, KOLOM_IMPORT_PESERTA, skemaBarisPeserta(), { kunciUnik: 'nim' });

  it('kolom dikenali dari judul & alias', () => {
    expect(h.hilang).toEqual([]);
    expect(h.peta).toMatchObject({ nama_lengkap: 0, nim: 1, bayar: 2, tanggal: 3, jumlah: 4 });
  });

  it('baris sah dinormalkan: status → boolean, tanggal → ISO, rupiah → angka', () => {
    expect(h.baris[0]!.data).toEqual({ nama_lengkap: 'Triana', nim: '3337240001', sudah_bayar: true, tanggal_bayar: '2025-11-22', jumlah: 150000 });
    expect(h.baris[1]!.data).toEqual({ nama_lengkap: 'Raka', nim: null, sudah_bayar: false, tanggal_bayar: null, jumlah: 0 });
    expect(h.baris[2]!.data?.tanggal_bayar).toBe('2025-11-23');
  });

  it('baris salah menjadi ERROR dengan pesan jelas', () => {
    expect(h.baris[3]!.status).toBe('ERROR');
    expect(h.baris[3]!.masalah[0]!.pesan).toContain('Status bayar "mungkin" tidak dikenali');
    expect(h.baris[4]!.masalah[0]!.pesan).toContain('Tanggal "31 Nov" tidak dikenali');
    expect(h.baris[5]!.masalah[0]!.pesan).toBe('Tanggal bayar diisi, tetapi status masih belum bayar.');
    expect(h.baris[6]!.status).toBe('ERROR'); // nama kosong
    expect(h.ringkas).toMatchObject({ total: 7, valid: 3, error: 4 });
  });
});
