/**
 * Konstanta tata letak & gaya ekspor RAB (T-090). Koordinat dari
 * `docs/ai/RAB_CELL_MAP.md` §6 (T-007) — dilarang menebak. Gaya (warna isi,
 * font, garis) TERUKUR dari `Template/RAB_Template.xlsx` lewat ExcelJS
 * (2026-10-16), bukan dari contoh SYSTEM_DESIGN §11.3: template asli memakai
 * Arial 10 rata tengah dan isi header `#A4C2F4`, bukan `#BDD7EE/#DCE6F1`.
 * Kontrak T-090 butir 3 meminta replikasi template, jadi template yang menang.
 *
 * Format rupiah distandarkan ke `"Rp"#,##0` (RAB_CELL_MAP §5 temuan 4).
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-090 · RAB_CELL_MAP §1–§6
 */

import type ExcelJS from 'exceljs';

export const RAB_MAP = {
  RAB: {
    kolom: { no: 2, jenisBarang: 3, jumlah: 4, hargaSatuan: 5, total: 6 }, // B C D E F
    lebar: { A: 5.77734375, B: 8.77734375, C: 30.44140625, D: 26.77734375, E: 17.109375, F: 16.33203125, I: 21.109375, J: 25.109375 },
    headerKolom: ['NO', 'Jenis Barang', 'Jumlah', 'Harga satuan', 'Total '], // "Total " berspasi — salin apa adanya
    barisAwal: 2,
    ringkasan: { kolomNo: 8, kolomDivisi: 9, kolomBiaya: 10, barisHeader: 3, header: ['NO.', 'DIVISI', 'BESARAN BIAYA'] },
  },
  RAB_AKTUAL: {
    // Kolom item identik dengan sheet RAB (ADR-019); ringkasan mulai satu baris lebih atas.
    lebar: { C: 31, D: 25, E: 16, F: 15, H: 11.33203125, I: 22.33203125, J: 17.88671875 },
    ringkasan: { kolomNo: 8, kolomDivisi: 9, kolomBiaya: 10, barisHeader: 2, header: ['NO.', 'DIVISI', 'BESARAN BIAYA'] },
  },
  PEMASUKAN: {
    lebar: { C: 36.77734375, D: 26, E: 22.109375, F: 13.44140625 },
    judul: { baris: 2, kolom: 3, teks: 'PEMASUKAN' },
    sumberDana: { barisHeader: 3, header: ['NO', 'Keterangan', 'Saldo'], kolomNo: 2, kolomKeterangan: 3, kolomSaldo: 4 },
    // Sel gabung kosong G8:J8 ada di template asli; ikut direplikasi supaya struktur identik.
    mergeHiasan: 'G8:J8',
    peserta: {
      barisJudul: 9,
      barisHeader: 11,
      barisAwal: 12,
      header: ['No', 'Nama Lengkap', 'BAYAR', 'Tgl BAYAR', 'JUMLAH'],
      kolom: { no: 2, nama: 3, bayar: 4, tanggal: 5, jumlah: 6 },
    },
  },
  PENGELUARAN: {
    lebar: { C: 25.33203125, D: 25.21875, E: 25.88671875, F: 25.21875, G: 26.21875, H: 25.21875 },
    barisHeader: 3,
    header: ['NO', 'Tgl', 'URAIAN', 'DIVISI', 'PENGELUARAN', 'SALDO'],
    kolom: { no: 3, tanggal: 4, uraian: 5, divisi: 6, pengeluaran: 7, saldo: 8 }, // C D E F G H
  },
  RUPIAH: '"Rp"#,##0',
  TANGGAL: 'd mmmm yyyy',
} as const;

const tipis: Partial<ExcelJS.Border> = { style: 'thin' };
export const GARIS_PENUH = { top: tipis, left: tipis, bottom: tipis, right: tipis } as Partial<ExcelJS.Borders>;

const isi = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

export const GAYA = {
  dasar: { font: { name: 'Arial', size: 10 } as Partial<ExcelJS.Font>, alignment: { horizontal: 'center' } as Partial<ExcelJS.Alignment> },
  headerDivisi: { fill: isi('FFA4C2F4') },
  headerRingkasan: { fill: isi('FFA4C2F4') },
  headerKolom: { font: { name: 'Arial', size: 10, bold: true } as Partial<ExcelJS.Font> },
  pemasukanHeader: { fill: isi('FFC0E6F5'), font: { name: 'Arial', size: 11 } as Partial<ExcelJS.Font> },
  pesertaHeader: { fill: isi('FF83CCEB'), font: { name: 'Calibri', size: 11, bold: true } as Partial<ExcelJS.Font> },
  pengeluaranHeader: { fill: isi('FFA4C2F4'), font: { name: 'Calibri', size: 11, bold: true } as Partial<ExcelJS.Font> },
  judul: { font: { name: 'Arial', size: 11, bold: true } as Partial<ExcelJS.Font> },
} as const;
