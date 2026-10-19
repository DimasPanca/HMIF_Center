/**
 * Gate T-090 — `npm run test -- excel-export` (bersama `npx tsx scripts/diff-excel.ts`).
 */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { eksporRabXlsx, namaBerkasRab, type DataEksporRab } from '@/lib/rab/excel-export';

const item = (jenis: string, jumlah: string, numerik: number | null, harga: number, o: Partial<{ total: number; total_manual: boolean }> = {}) => ({
  jenis_barang: jenis,
  jumlah_teks: jumlah,
  jumlah_numerik: numerik,
  harga_satuan: harga,
  total: o.total ?? Math.round((numerik ?? 0) * harga),
  total_manual: o.total_manual ?? false,
});

const DATA: DataEksporRab = {
  namaAcara: 'SYNCHRONIZE 2026',
  rab: {
    divisi: [
      {
        nama: 'Konsumsi',
        sections: [
          { nama: 'Konsumsi Panitia', items: [item('Galon', '10', 10, 5000), item('Angkot', '16 Unit', 16, 300000)] },
          { nama: 'Kebutuhan Divisi', items: [item('Tempat', '2 Hari 1 Malam', 2, 0, { total: 3_800_000, total_manual: true })] },
        ],
      },
      { nama: 'P3K', sections: [{ nama: '', items: [item('Promag', '2', 2, 10000)] }] },
    ],
    danaTakTerduga: 561_300,
  },
  aktual: {
    divisi: [
      {
        nama: 'Konsumsi',
        sections: [
          { nama: 'Konsumsi Panitia', items: [{ ...item('Galon', '10', 10, 5000), realisasi: 45000 }, { ...item('Angkot', '16 Unit', 16, 300000), realisasi: 5_600_000 }] },
          { nama: 'Kebutuhan Divisi', items: [{ ...item('Tempat', '2 Hari 1 Malam', 2, 0, { total: 3_800_000, total_manual: true }), realisasi: 3_800_000 }] },
        ],
      },
      { nama: 'P3K', sections: [{ nama: '', items: [{ ...item('Promag', '2', 2, 10000), realisasi: 0 }] }] },
    ],
    danaTakTerduga: 561_300,
  },
  pemasukan: [
    { keterangan: 'Total Pembayaran SYNCHRONIZE', saldo: 23_400_000 },
    { keterangan: 'Himpunan', saldo: 2_600_000 },
  ],
  peserta: [
    { nama: 'Triana Surya', bayar: true, tanggal: '2025-11-22', jumlah: 150000 },
    { nama: 'Raka Pratama', bayar: false, tanggal: null, jumlah: 0 },
  ],
  pengeluaran: [
    { tanggal: '2025-11-25', uraian: 'Banner', divisi: 'PDD', nominal: 93750 },
    { tanggal: '2025-11-20', uraian: 'DP tempat', divisi: 'Humas', nominal: 500000 },
  ],
};

async function buka(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await eksporRabXlsx(DATA)) as unknown as ArrayBuffer);
  return wb;
}

const merges = (ws: ExcelJS.Worksheet) => new Set((ws.model as unknown as { merges: string[] }).merges);
const rumus = (c: ExcelJS.Cell) => (c.value as { formula?: string }).formula;
const hasil = (c: ExcelJS.Cell) => (c.value as { result?: number }).result;

describe('eksporRabXlsx — struktur template (RAB_CELL_MAP)', () => {
  it('empat sheet dengan urutan template', async () => {
    const wb = await buka();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['RAB', 'PEMASUKAN', 'PENGELUARAN', 'RAB AKTUAL']);
  });

  it('sheet RAB: header divisi & sub-section B:F, TOTAL B:E, "Total " berspasi, lebar kolom', async () => {
    const ws = (await buka()).getWorksheet('RAB')!;
    const m = merges(ws);
    expect(ws.getCell('B2').value).toBe('DIVISI KONSUMSI');
    expect(m.has('B2:F2')).toBe(true);
    expect((ws.getRow(3).values as unknown[]).slice(2, 7)).toEqual(['NO', 'Jenis Barang', 'Jumlah', 'Harga satuan', 'Total ']);
    expect(ws.getCell('B4').value).toBe('KONSUMSI PANITIA');
    expect(m.has('B4:F4')).toBe(true);
    expect(ws.getCell('B9').value).toBe('TOTAL');
    expect(m.has('B9:E9')).toBe(true);
    expect(ws.getColumn('C').width).toBeCloseTo(30.44, 1);
    expect(ws.getCell('E5').numFmt).toBe('"Rp"#,##0');
  });

  it('kolom Jumlah memuat teks asli; formula hidup tanpa #VALUE! (INV-26)', async () => {
    const ws = (await buka()).getWorksheet('RAB')!;
    expect(ws.getCell('D5').value).toBe(10); // bilangan bulat murni
    expect(rumus(ws.getCell('F5'))).toBe('D5*E5');
    expect(ws.getCell('D6').value).toBe('16 Unit'); // teks apa adanya
    expect(rumus(ws.getCell('F6'))).toBe('E6*16');
    expect(hasil(ws.getCell('F6'))).toBe(4_800_000);
    expect(ws.getCell('D8').value).toBe('2 Hari 1 Malam');
    expect(ws.getCell('F8').value).toBe(3_800_000); // total manual = nilai statis
    expect(rumus(ws.getCell('F9'))).toBe('SUM(F4:F8)');
    expect(hasil(ws.getCell('F9'))).toBe(50000 + 4_800_000 + 3_800_000);
  });

  it('nomor urut berjalan per divisi; divisi tanpa sub-section tidak punya baris sub-section', async () => {
    const ws = (await buka()).getWorksheet('RAB')!;
    expect([ws.getCell('B5').value, ws.getCell('B6').value, ws.getCell('B8').value]).toEqual([1, 2, 3]);
    expect(ws.getCell('B10').value).toBe('DIVISI P3K');
    expect(ws.getCell('B11').value).toBe('NO');
    expect(ws.getCell('C12').value).toBe('Promag'); // langsung item
    expect(ws.getCell('B12').value).toBe(1);
  });

  it('ringkasan H:J mulai baris 3: rujukan total divisi, Dana Tak Terduga, TOTAL = jumlah semuanya', async () => {
    const ws = (await buka()).getWorksheet('RAB')!;
    expect([ws.getCell('H3').value, ws.getCell('I3').value, ws.getCell('J3').value]).toEqual(['NO.', 'DIVISI', 'BESARAN BIAYA']);
    expect(rumus(ws.getCell('J4'))).toBe('F9');
    expect(hasil(ws.getCell('J4'))).toBe(hasil(ws.getCell('F9')));
    expect(rumus(ws.getCell('J5'))).toBe('F13');
    expect(ws.getCell('I6').value).toBe('Dana Tak Terduga');
    expect(ws.getCell('J6').value).toBe(561_300);
    expect(merges(ws).has('H7:I7')).toBe(true);
    expect(rumus(ws.getCell('J7'))).toBe('SUM(J4:J6)');
    expect(hasil(ws.getCell('J7'))).toBe(hasil(ws.getCell('F9'))! + hasil(ws.getCell('F13'))! + 561_300);
  });

  it('RAB AKTUAL: blok item sama, ringkasan mulai baris 2, total = realisasi dengan catatan rencana', async () => {
    const ws = (await buka()).getWorksheet('RAB AKTUAL')!;
    expect(ws.getCell('B2').value).toBe('DIVISI KONSUMSI');
    expect(ws.getCell('H2').value).toBe('NO.');
    expect(rumus(ws.getCell('J3'))).toBe('F9');
    expect(ws.getCell('F5').value).toBe(45000);
    expect(String(ws.getCell('F5').note)).toContain('Rencana: Rp50.000');
    expect(rumus(ws.getCell('J6'))).toBe('SUM(J3:J5)');
  });

  it('PEMASUKAN: sumber dana + TOTAL B:C, peserta bernomor ROW()-11, TOTAL peserta', async () => {
    const ws = (await buka()).getWorksheet('PEMASUKAN')!;
    expect(ws.getCell('C2').value).toBe('PEMASUKAN');
    expect([ws.getCell('B3').value, ws.getCell('C3').value, ws.getCell('D3').value]).toEqual(['NO', 'Keterangan', 'Saldo']);
    expect(merges(ws).has('B6:C6')).toBe(true);
    expect(rumus(ws.getCell('D6'))).toBe('SUM(D4:D5)');
    expect(merges(ws).has('C9:E9')).toBe(true);
    expect(rumus(ws.getCell('B12'))).toBe('ROW(B12)-11');
    expect(ws.getCell('D12').value).toBe(true);
    expect(ws.getCell('E12').numFmt).toBe('d mmmm yyyy');
    expect(rumus(ws.getCell('F14'))).toBe('SUM(F12:F13)');
    expect(merges(ws).has('B14:E14')).toBe(true);
  });

  it('PEMASUKAN: ≥5 sumber dana tidak menabrak judul peserta — blok peserta turun satu baris kosong', async () => {
    const wb = new ExcelJS.Workbook();
    const banyak: DataEksporRab = {
      ...DATA,
      pemasukan: [...DATA.pemasukan, { keterangan: 'Sponsor A', saldo: 1_000_000 }, { keterangan: 'Sponsor B', saldo: 2_000_000 }, { keterangan: 'Sponsor C', saldo: 3_000_000 }],
    };
    await wb.xlsx.load((await eksporRabXlsx(banyak)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('PEMASUKAN')!;
    // 5 sumber dana → baris 4–8, TOTAL baris 9; judul peserta baris 11, header 13, data mulai 14.
    expect(merges(ws).has('B9:C9')).toBe(true);
    expect(rumus(ws.getCell('D9'))).toBe('SUM(D4:D8)');
    expect(merges(ws).has('C11:E11')).toBe(true);
    expect(rumus(ws.getCell('B14'))).toBe('ROW(B14)-13');
    expect(rumus(ws.getCell('F16'))).toBe('SUM(F14:F15)');
  });

  it('PENGELUARAN: pemasukan → TOTAL saldo awal → pengeluaran urut tanggal, saldo berjalan =H{n-1}-G{n}', async () => {
    const ws = (await buka()).getWorksheet('PENGELUARAN')!;
    expect(ws.getRow(3).values).toEqual([undefined, undefined, undefined, 'NO', 'Tgl', 'URAIAN', 'DIVISI', 'PENGELUARAN', 'SALDO']);
    expect(ws.getCell('G4').value).toBeNull();
    expect(rumus(ws.getCell('H6'))).toBe('SUM(H4:H5)');
    expect(merges(ws).has('C6:G6')).toBe(true);
    expect(ws.getCell('E7').value).toBe('DP TEMPAT'); // 20 Nov lebih dulu dari 25 Nov
    expect(rumus(ws.getCell('H7'))).toBe('H6-G7');
    expect(hasil(ws.getCell('H7'))).toBe(26_000_000 - 500_000);
    expect(rumus(ws.getCell('H8'))).toBe('H7-G8');
    expect(hasil(ws.getCell('H8'))).toBe(26_000_000 - 500_000 - 93_750);
    expect(ws.getCell('C9').value).toBe('SISA UANG');
    expect(merges(ws).has('C9:G9')).toBe(true);
  });
});

describe('jumlah pecahan', () => {
  it('rumus dibulatkan seperti kaliRupiah — total Excel = total aplikasi (terukur di Excel 16)', async () => {
    const wb = new ExcelJS.Workbook();
    const data: DataEksporRab = {
      ...DATA,
      rab: { divisi: [{ nama: 'Humas', sections: [{ nama: 'Sewa', items: [item('Sewa', '2,5 Hari', 2.5, 3333, { total: 8333 })] }] }], danaTakTerduga: 0 },
    };
    await wb.xlsx.load((await eksporRabXlsx(data)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('RAB')!;
    expect(ws.getCell('D5').value).toBe('2,5 Hari');
    expect(rumus(ws.getCell('F5'))).toBe('ROUND(E5*2.5,0)');
    expect(hasil(ws.getCell('F5'))).toBe(8333);
  });
});

describe('namaBerkasRab', () => {
  it('RAB-{namaAcara}-{YYYYMMDD}.xlsx, aman untuk nama berkas', () => {
    expect(namaBerkasRab('SYNCHRONIZE 2026', new Date('2026-10-16T08:00:00Z'))).toBe('RAB-SYNCHRONIZE-2026-20261016.xlsx');
    expect(namaBerkasRab('KT 1: IF/25', new Date('2026-01-02T00:00:00Z'))).toBe('RAB-KT-1-IF-25-20260102.xlsx');
  });
});
