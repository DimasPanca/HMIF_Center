/**
 * export-daftar — daftar arsip surat → Excel (T-063). Server-only.
 *
 * Untuk laporan sekretariat (PRD F-4.4): satu baris per surat dengan kolom
 * yang sama seperti tabel arsip, ditambah kegiatan, departemen, dan alasan
 * pembatalan. Surat DIBATALKAN ikut terekspor — laporan yang menghilangkannya
 * membuat urutan nomor tampak berlubang tanpa penjelasan.
 *
 * Nilai yang diawali `=`, `+`, `-`, `@` diberi tanda kutip tunggal: isian
 * pengguna (perihal, tujuan) yang dimulai `=` akan dijalankan Excel sebagai
 * rumus (CSV/formula injection).
 *
 * ExcelJS dimuat lazy — ±1 MB, dan hanya dibutuhkan saat seseorang mengekspor.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-063 · PRD F-4.4
 */

import type { BarisArsip } from '@/lib/surat/arsip';
import { formatTanggalSurat } from '@/lib/utils/format-tanggal';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/export-daftar.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const LABEL_STATUS: Record<BarisArsip['status'], string> = {
  DRAFT: 'Draf',
  MENUNGGU_APPROVAL: 'Menunggu Persetujuan',
  DISETUJUI: 'Disetujui',
  TERBIT: 'Terbit',
  DITOLAK: 'Ditolak',
  DIBATALKAN: 'Dibatalkan',
};

/** Menetralkan nilai yang akan dibaca Excel sebagai rumus. */
export function selAman(nilai: string | null | undefined): string {
  const s = nilai ?? '';
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export const KOLOM_EXPORT = [
  'No',
  'Nomor',
  'Jenis',
  'Perihal',
  'Tujuan',
  'Tanggal',
  'Pembuat',
  'Approver',
  'Status',
  'Kegiatan',
  'Departemen',
  'Alasan pembatalan',
] as const;

export function barisExport(b: BarisArsip, i: number): (string | number)[] {
  return [
    i + 1,
    b.nomor_lengkap ?? '—',
    b.nama_jenis,
    selAman(b.perihal),
    selAman(b.tujuan_nama),
    formatTanggalSurat(b.tanggal_surat),
    selAman(b.nama_pembuat),
    selAman(b.nama_penyetuju ?? '—'),
    LABEL_STATUS[b.status],
    selAman(b.kode_kegiatan),
    selAman(b.nama_departemen ?? '—'),
    selAman(b.alasan_pembatalan ?? ''),
  ];
}

export async function buatExcelArsip(baris: BarisArsip[], judul: string): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HMIF Center';
  wb.created = new Date();
  const ws = wb.addWorksheet('Arsip Surat', { views: [{ state: 'frozen', ySplit: 2 }] });

  ws.addRow([judul]);
  ws.mergeCells(1, 1, 1, KOLOM_EXPORT.length);
  ws.getRow(1).font = { bold: true, size: 13 };

  const kepala = ws.addRow([...KOLOM_EXPORT]);
  kepala.font = { bold: true };
  kepala.eachCell((c) => {
    c.border = { bottom: { style: 'thin' } };
  });

  baris.forEach((b, i) => {
    const r = ws.addRow(barisExport(b, i));
    if (b.status === 'DIBATALKAN') r.font = { strike: true, color: { argb: 'FF8A8A8A' } };
  });

  const lebar = [5, 34, 30, 40, 34, 18, 24, 24, 20, 12, 22, 34];
  lebar.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + baris.length, column: KOLOM_EXPORT.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
