/**
 * Gate T-091 — `npm run test -- excel-import`.
 */
import path from 'node:path';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { eksporRabXlsx, type DataEksporRab } from '@/lib/rab/excel-export';
import { bacaRabExcel, type RabImpor } from '@/lib/rab/excel-import';

const item = (jenis: string, jumlah: string, numerik: number | null, harga: number, total: number, total_manual = false) => ({
  jenis_barang: jenis,
  jumlah_teks: jumlah,
  jumlah_numerik: numerik,
  harga_satuan: harga,
  total,
  total_manual,
});

const DATA: DataEksporRab = {
  namaAcara: 'Uji Roundtrip',
  rab: {
    divisi: [
      {
        nama: 'Konsumsi',
        sections: [
          {
            nama: 'Konsumsi Panitia',
            items: [
              item('Galon', '10', 10, 5000, 50000),
              item('Angkot', '16 Unit', 16, 300000, 4_800_000),
              item('Sewa villa', '2 Hari 1 Malam', 3, 1_000_000, 3_000_000), // jumlah dikonfirmasi manual = 3
              item('Sewa alat', '2,5 Hari', 2.5, 3333, 8333),
              item('Tempat', '2 pack (12 pcs/pack)', 2, 0, 3_800_000, true), // total dikunci
              item('', '', null, 0, 0), // baris kosong bergaris
            ],
          },
          { nama: 'Kebutuhan Divisi', items: [item('Materai', '2', 2, 12000, 24000)] },
        ],
      },
      { nama: 'P3K', sections: [{ nama: '', items: [item('Promag', '2', 2, 10000, 20000), item('Peminjaman KSR', '-', null, 25000, 0)] }] },
    ],
    danaTakTerduga: 561_300,
  },
  aktual: { divisi: [], danaTakTerduga: 0 },
  pemasukan: [],
  peserta: [],
  pengeluaran: [],
};

/** Hasil baca → bentuk masukan ekspor (impor lalu ekspor ulang). */
function keEkspor(r: RabImpor): DataEksporRab {
  return {
    ...DATA,
    rab: {
      divisi: r.divisi.map((d) => ({ nama: d.nama, sections: d.sections.map((s) => ({ nama: s.nama, items: s.items })) })),
      danaTakTerduga: r.danaTakTerduga,
    },
  };
}

async function baca(buf: Buffer): Promise<RabImpor> {
  const h = await bacaRabExcel(buf);
  if (!h.ok) throw new Error(h.pesan);
  return h.nilai;
}

async function bukuDenganRab(isi: (ws: ExcelJS.Worksheet) => void, namaSheet = 'RAB'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(namaSheet);
  isi(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Satu blok divisi minimal yang sah: header B:F, judul kolom, satu item, TOTAL. */
function blokSah(ws: ExcelJS.Worksheet, judul = ['NO', 'Jenis Barang', 'Jumlah', 'Harga satuan', 'Total ']) {
  ws.mergeCells('B2:F2');
  ws.getCell('B2').value = 'DIVISI ACARA';
  judul.forEach((j, i) => (ws.getCell(3, 2 + i).value = j));
  ws.getCell('B4').value = 1;
  ws.getCell('C4').value = 'Flare';
  ws.getCell('D4').value = '2 Pcs';
  ws.getCell('E4').value = 60000;
  ws.getCell('F4').value = { formula: 'E4*2', result: 120000 };
  ws.mergeCells('B5:E5');
  ws.getCell('B5').value = 'TOTAL';
  ws.getCell('F5').value = { formula: 'SUM(F4:F4)', result: 120000 };
}

describe('roundtrip ekspor → impor → ekspor', () => {
  it('data identik field per field', async () => {
    const pertama = await baca(await eksporRabXlsx(DATA));
    const kedua = await baca(await eksporRabXlsx(keEkspor(pertama)));
    expect(kedua).toEqual(pertama);
  });

  it('nilai item terbaca benar dari ekspor (bukan sekadar sama dengan dirinya)', async () => {
    const r = await baca(await eksporRabXlsx(DATA));
    const [konsumsi, p3k] = r.divisi;
    expect(konsumsi!.nama).toBe('KONSUMSI');
    const items = konsumsi!.sections[0]!.items;
    expect(items.map((i) => [i.jenis_barang, i.jumlah_teks, i.jumlah_numerik, i.harga_satuan, i.total, i.total_manual])).toEqual([
      ['Galon', '10', 10, 5000, 50000, false],
      ['Angkot', '16 Unit', 16, 300000, 4_800_000, false],
      ['Sewa villa', '2 Hari 1 Malam', 3, 1_000_000, 3_000_000, false], // angka dari rumus E*3, bukan perkiraan 2
      ['Sewa alat', '2,5 Hari', 2.5, 3333, 8333, false],
      ['Tempat', '2 pack (12 pcs/pack)', 2, 0, 3_800_000, true],
      ['', '', null, 0, 0, false],
    ]);
    expect(items[2]!.butuhManual).toBe(false); // sudah dikonfirmasi lewat rumus
    expect(items[5]!.kosong).toBe(true);
    expect(p3k!.sections[0]!.nama).toBe('');
    expect(p3k!.sections[0]!.items[1]).toMatchObject({ jumlah_teks: '-', jumlah_numerik: null, total: 0, total_manual: false });
    expect(r.danaTakTerduga).toBe(561_300);
  });
});

describe('template asli', () => {
  it('Template/RAB_Template.xlsx terbaca: 8 divisi, P3K 21 item, jumlah kompleks ditandai', async () => {
    const r = await baca(await import('node:fs').then((fs) => fs.readFileSync(path.resolve('Template/RAB_Template.xlsx'))));
    expect(r.divisi.map((d) => d.nama)).toEqual(['KOMSUMSI', 'PDD', 'PERLARATAN', 'HUMAS', 'ACARA', 'P3K', 'SEKRETARIS', 'BENDAHARA']);
    const p3k = r.divisi[5]!;
    expect(p3k.sections).toHaveLength(1);
    expect(p3k.sections[0]!.items).toHaveLength(21);
    const tempat = r.divisi[3]!.sections[0]!.items[0]!;
    expect(tempat).toMatchObject({ jumlah_teks: '2 Hari 1 Malam', butuhManual: true, total: 3_800_000, total_manual: true });
    expect(r.danaTakTerduga).toBe(561_300);
  });
});

describe('berkas berstruktur lain ditolak dengan pesan yang menyebut sheet/kolom', () => {
  it('bukan xlsx', async () => {
    expect(await bacaRabExcel(Buffer.from('bukan excel'))).toEqual({ ok: false, pesan: expect.stringContaining('bukan Excel (.xlsx)') });
  });

  it('sheet RAB tidak ada', async () => {
    const h = await bacaRabExcel(await bukuDenganRab(blokSah, 'Anggaran'));
    expect(h).toEqual({ ok: false, pesan: 'Sheet "RAB" tidak ditemukan. Sheet yang ada: "Anggaran".' });
  });

  it('judul kolom salah', async () => {
    const h = await bacaRabExcel(await bukuDenganRab((ws) => blokSah(ws, ['NO', 'Barang', 'Jumlah', 'Harga satuan', 'Total'])));
    expect(h).toEqual({ ok: false, pesan: 'Sheet "RAB" baris 3 kolom C: judul "Barang" tidak dikenali — diharapkan "Jenis Barang".' });
  });

  it('harga satuan bukan angka', async () => {
    const h = await bacaRabExcel(
      await bukuDenganRab((ws) => {
        blokSah(ws);
        ws.getCell('E4').value = 'enam puluh ribu';
      }),
    );
    expect(h).toEqual({ ok: false, pesan: 'Sheet "RAB" baris 4 kolom E: harga satuan "enam puluh ribu" bukan angka.' });
  });

  it('divisi tanpa baris TOTAL', async () => {
    const h = await bacaRabExcel(
      await bukuDenganRab((ws) => {
        blokSah(ws);
        ws.unMergeCells('B5:E5');
        ws.getCell('B5').value = null;
      }),
    );
    expect(h).toEqual({ ok: false, pesan: 'Sheet "RAB": divisi terakhir (ACARA) tidak ditutup baris TOTAL.' });
  });

  it('sheet RAB tanpa blok divisi', async () => {
    const h = await bacaRabExcel(await bukuDenganRab((ws) => (ws.getCell('B2').value = 'Catatan bebas')));
    expect(h.ok).toBe(false);
    expect(!h.ok && h.pesan).toContain('tidak memuat blok divisi');
  });
});
