/**
 * Ekspor RAB ke Excel 4 sheet — RAB · PEMASUKAN · PENGELUARAN · RAB AKTUAL —
 * dengan struktur IDENTIK `Template/RAB_Template.xlsx` (T-090, PRD F-9.2).
 * Murni (tanpa DB): masukannya `DataEksporRab`, keluarannya Buffer .xlsx.
 * Koordinat & gaya: lib/rab/excel-style.ts (RAB_CELL_MAP.md).
 *
 * ===========================================================================
 * FORMULA HIDUP TANPA #VALUE!
 * ===========================================================================
 * Kolom Jumlah memuat TEKS ASLI (INV-26): "16 Unit", "2 Hari 1 Malam". Rumus
 * `=D*E` pada teks seperti itu menghasilkan #VALUE!. Aturannya:
 *   - jumlah bilangan bulat murni ("10")  → D berisi angka 10 (tampilannya
 *     identik dengan teksnya), F = `=D{r}*E{r}` — bentuk baku RAB_CELL_MAP §1.3
 *   - jumlah bersatuan/kompleks           → D berisi teks apa adanya,
 *     F = `=E{r}*{numerik}` — pola yang memang ada di template (`F42 = E42*2`)
 *   - total manual / jumlah kosong        → F berisi nilai statis
 * Hasil (`result`) setiap rumus diisi dari `hitungRab` (T-088) supaya penampil
 * yang tidak menghitung ulang (pratinjau ponsel) tetap menampilkan angka benar.
 *
 * Total divisi `=SUM(F{awal}:F{akhir})`; ringkasan J merujuk sel total divisi
 * (`=F{total}`), Dana Tak Terduga baris terakhir sebelum TOTAL, TOTAL
 * `=SUM(J..)`. PENGELUARAN: saldo berjalan `=H{n-1}-G{n}`.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-090 · RAB_CELL_MAP · SYSTEM_DESIGN §11.3–11.4 · INV-26
 */

import ExcelJS from 'exceljs';

import { hitungRab } from '@/lib/rab/calculate';
import { GARIS_PENUH, GAYA, RAB_MAP } from '@/lib/rab/excel-style';

export interface ItemEkspor {
  jenis_barang: string;
  jumlah_teks: string;
  jumlah_numerik: number | null;
  harga_satuan: number;
  total: number;
  total_manual: boolean;
}

export interface DivisiEkspor {
  nama: string;
  sections: { nama: string; items: ItemEkspor[] }[];
}

/** Baris RAB AKTUAL: rencana item + realisasinya (nota terverifikasi). */
export interface ItemAktual extends ItemEkspor {
  realisasi: number;
}

export interface DataEksporRab {
  namaAcara: string;
  rab: { divisi: DivisiEkspor[]; danaTakTerduga: number };
  aktual: { divisi: { nama: string; sections: { nama: string; items: ItemAktual[] }[] }[]; danaTakTerduga: number };
  pemasukan: { keterangan: string; saldo: number }[];
  peserta: { nama: string; bayar: boolean; tanggal: string | null; jumlah: number }[];
  /** Satu baris per alokasi, sudah berurutan tanggal (lib/rab/realisasi.ts). `luar_rab` ditandai (ADR-006). */
  pengeluaran: { tanggal: string; uraian: string; divisi: string; nominal: number; luar_rab?: boolean }[];
}

const BULAT = /^\d+$/;

function gayaDasar(c: ExcelJS.Cell, garis = true) {
  c.font = { ...GAYA.dasar.font };
  c.alignment = { ...GAYA.dasar.alignment };
  if (garis) c.border = GARIS_PENUH;
}

function rupiah(c: ExcelJS.Cell) {
  c.numFmt = RAB_MAP.RUPIAH;
}

function aturLebar(ws: ExcelJS.Worksheet, lebar: Record<string, number>) {
  for (const [k, v] of Object.entries(lebar)) ws.getColumn(k).width = v;
}

/** Sel gabung dengan nilai & gaya pada sel pertamanya. */
function gabung(ws: ExcelJS.Worksheet, rentang: string, nilai: ExcelJS.CellValue, gaya?: (c: ExcelJS.Cell) => void) {
  ws.mergeCells(rentang);
  const c = ws.getCell(rentang.split(':')[0]!);
  c.value = nilai;
  gayaDasar(c);
  gaya?.(c);
}

/** Nilai D dan isi F satu item, sesuai aturan formula di kepala berkas. */
function selItem(i: ItemEkspor, r: number, total: number): { d: ExcelJS.CellValue; f: ExcelJS.CellValue } {
  const teks = i.jumlah_teks;
  if (i.total_manual || i.jumlah_numerik === null) return { d: teks, f: total };
  if (BULAT.test(teks.trim())) return { d: Number(teks.trim()), f: { formula: `D${r}*E${r}`, result: total } };
  // Jumlah pecahan (2,5 hari): dibulatkan seperti kaliRupiah (T-088) supaya total
  // Excel = total aplikasi, bukan 8332,5 yang hanya TAMPAK sama karena format.
  const kali = `E${r}*${i.jumlah_numerik}`;
  return { d: teks, f: { formula: Number.isInteger(i.jumlah_numerik) ? kali : `ROUND(${kali},0)`, result: total } };
}

/** Item yang belum diisi sama sekali — diekspor sebagai baris kosong tanpa nomor. */
export const itemKosong = (i: Pick<ItemEkspor, 'jenis_barang' | 'jumlah_teks' | 'harga_satuan' | 'total'>) =>
  !i.jenis_barang.trim() && !i.jumlah_teks.trim() && !i.harga_satuan && !i.total;

interface HasilBlok {
  /** Baris total per divisi (untuk rujukan ringkasan). */
  barisTotal: { nama: string; baris: number; total: number }[];
}

/**
 * Blok item B:F, divisi demi divisi tanpa baris kosong di antaranya (template).
 * Nomor urut berjalan per DIVISI melintasi sub-section (PRD F-9.1).
 */
function tulisBlokItem(
  ws: ExcelJS.Worksheet,
  divisi: { nama: string; sections: { nama: string; items: (ItemEkspor & { realisasi?: number })[] }[] }[],
  pakaiRealisasi: boolean,
): HasilBlok {
  const k = RAB_MAP.RAB.kolom;
  const hasil = hitungRab(
    divisi.map((d, x) => ({
      id: `d${x}`,
      sections: d.sections.map((s, y) => ({
        id: `d${x}s${y}`,
        items: s.items.map((i, z) => ({
          id: `d${x}s${y}i${z}`,
          jumlah_numerik: i.jumlah_numerik,
          harga_satuan: i.harga_satuan,
          total: pakaiRealisasi ? (i.realisasi ?? 0) : i.total,
          total_manual: pakaiRealisasi ? true : i.total_manual,
        })),
      })),
    })),
  );
  const barisTotal: HasilBlok['barisTotal'] = [];
  let r = RAB_MAP.RAB.barisAwal;

  divisi.forEach((d, x) => {
    gabung(ws, `B${r}:F${r}`, `DIVISI ${d.nama.toUpperCase()}`, (c) => (c.fill = GAYA.headerDivisi.fill));
    r++;
    RAB_MAP.RAB.headerKolom.forEach((h, j) => {
      const c = ws.getCell(r, k.no + j);
      c.value = h;
      gayaDasar(c);
      c.font = { ...GAYA.headerKolom.font };
    });
    r++;
    const awal = r;
    let no = 0;
    d.sections.forEach((s, y) => {
      // Sub-section tanpa nama = divisi tanpa sub-section (P3K, Sekretaris, … di template).
      if (s.nama.trim()) {
        gabung(ws, `B${r}:F${r}`, s.nama.toUpperCase());
        r++;
      }
      s.items.forEach((i, z) => {
        if (itemKosong(i)) {
          // Baris kosong bergaris tanpa nomor — ada di template (RAB baris 10–11).
          for (let kol = k.no; kol <= k.total; kol++) gayaDasar(ws.getCell(r, kol));
          r++;
          return;
        }
        const total = hasil.perDivisi[x]!.sections[y]!.items[z]!.total;
        const sel = pakaiRealisasi ? { d: i.jumlah_teks, f: total } : selItem(i, r, total);
        const nilai: [number, ExcelJS.CellValue][] = [
          [k.no, ++no],
          [k.jenisBarang, i.jenis_barang],
          [k.jumlah, sel.d],
          [k.hargaSatuan, i.harga_satuan],
          [k.total, sel.f],
        ];
        for (const [kol, v] of nilai) {
          const c = ws.getCell(r, kol);
          c.value = v;
          gayaDasar(c);
          if (kol >= k.hargaSatuan) rupiah(c);
        }
        if (pakaiRealisasi) {
          // Pembanding rencana tanpa mengubah tata letak (struktur harus identik template).
          ws.getCell(r, k.total).note = `Rencana: Rp${i.total.toLocaleString('id-ID')} · selisih: Rp${(i.total - total).toLocaleString('id-ID')}`;
        }
        r++;
      });
    });
    const akhir = r - 1;
    gabung(ws, `B${r}:E${r}`, 'TOTAL');
    const ct = ws.getCell(r, k.total);
    ct.value = { formula: `SUM(F${awal}:F${Math.max(awal, akhir)})`, result: hasil.perDivisi[x]!.total };
    gayaDasar(ct);
    rupiah(ct);
    barisTotal.push({ nama: d.nama, baris: r, total: hasil.perDivisi[x]!.total });
    r++;
  });
  return { barisTotal };
}

/** Ringkasan H:J: satu baris per divisi (rujukan ke total divisi), Dana Tak Terduga, TOTAL. */
function tulisRingkasan(
  ws: ExcelJS.Worksheet,
  barisHeader: number,
  header: readonly string[],
  barisTotal: HasilBlok['barisTotal'],
  dana: number,
) {
  header.forEach((h, j) => {
    const c = ws.getCell(barisHeader, 8 + j);
    c.value = h;
    gayaDasar(c);
    c.fill = GAYA.headerRingkasan.fill;
  });
  let r = barisHeader + 1;
  const awal = r;
  const baris = (no: number, nama: string, biaya: ExcelJS.CellValue) => {
    for (const [kol, v] of [[8, no], [9, nama], [10, biaya]] as [number, ExcelJS.CellValue][]) {
      const c = ws.getCell(r, kol);
      c.value = v;
      gayaDasar(c);
      if (kol === 10) rupiah(c);
    }
    r++;
  };
  barisTotal.forEach((t, i) => baris(i + 1, t.nama.toUpperCase(), { formula: `F${t.baris}`, result: t.total }));
  baris(barisTotal.length + 1, 'Dana Tak Terduga', dana);
  gabung(ws, `H${r}:I${r}`, 'TOTAL');
  const c = ws.getCell(r, 10);
  c.value = { formula: `SUM(J${awal}:J${r - 1})`, result: barisTotal.reduce((x, t) => x + t.total, 0) + dana };
  gayaDasar(c);
  rupiah(c);
}

function sheetPemasukan(ws: ExcelJS.Worksheet, d: DataEksporRab) {
  const m = RAB_MAP.PEMASUKAN;
  aturLebar(ws, m.lebar);
  const judul = ws.getCell(m.judul.baris, m.judul.kolom);
  judul.value = m.judul.teks;
  judul.font = { ...GAYA.judul.font };
  judul.alignment = { horizontal: 'center' };

  m.sumberDana.header.forEach((h, j) => {
    const c = ws.getCell(m.sumberDana.barisHeader, m.sumberDana.kolomNo + j);
    c.value = h;
    gayaDasar(c);
    c.fill = GAYA.pemasukanHeader.fill;
    c.font = { ...GAYA.pemasukanHeader.font };
  });
  let r = m.sumberDana.barisHeader + 1;
  const awal = r;
  d.pemasukan.forEach((p, i) => {
    for (const [kol, v] of [[2, i + 1], [3, p.keterangan], [4, p.saldo]] as [number, ExcelJS.CellValue][]) {
      const c = ws.getCell(r, kol);
      c.value = v;
      gayaDasar(c);
      if (kol === 4) rupiah(c);
    }
    r++;
  });
  gabung(ws, `B${r}:C${r}`, 'TOTAL');
  const t = ws.getCell(r, 4);
  t.value = { formula: `SUM(D${awal}:D${Math.max(awal, r - 1)})`, result: d.pemasukan.reduce((x, p) => x + p.saldo, 0) };
  gayaDasar(t);
  rupiah(t);

  ws.mergeCells(m.mergeHiasan);

  // Blok peserta berjangkar di baris tetap template (judul baris 9). Sumber dana yang
  // banyak (≥5 baris, mis. 4 sponsor + "Total Pembayaran") mendorong TOTAL-nya ke baris
  // itu dan menabrak sel gabung judul — maka blok peserta ikut turun, sisakan satu baris kosong.
  const geser = r >= m.peserta.barisJudul ? r - m.peserta.barisJudul + 2 : 0;
  const ps = { ...m.peserta, barisJudul: m.peserta.barisJudul + geser, barisHeader: m.peserta.barisHeader + geser, barisAwal: m.peserta.barisAwal + geser };
  gabung(ws, `C${ps.barisJudul}:E${ps.barisJudul}`, `RINCIAN PEMASUKAN DAN DATA PESERTA ${d.namaAcara.toUpperCase()}`, (c) => {
    c.font = { ...GAYA.judul.font };
    c.border = {};
  });
  ps.header.forEach((h, j) => {
    const c = ws.getCell(ps.barisHeader, ps.kolom.no + j);
    c.value = h;
    gayaDasar(c);
    c.fill = GAYA.pesertaHeader.fill;
    c.font = { ...GAYA.pesertaHeader.font };
  });
  r = ps.barisAwal;
  d.peserta.forEach((p) => {
    const nilai: [number, ExcelJS.CellValue][] = [
      [ps.kolom.no, { formula: `ROW(B${r})-${ps.barisAwal - 1}`, result: r - ps.barisAwal + 1 }],
      [ps.kolom.nama, p.nama],
      [ps.kolom.bayar, p.bayar],
      [ps.kolom.tanggal, p.tanggal ? new Date(`${p.tanggal}T00:00:00Z`) : null],
      [ps.kolom.jumlah, p.jumlah],
    ];
    for (const [kol, v] of nilai) {
      const c = ws.getCell(r, kol);
      c.value = v;
      gayaDasar(c);
      if (kol === ps.kolom.tanggal) c.numFmt = RAB_MAP.TANGGAL;
      if (kol === ps.kolom.jumlah) rupiah(c);
    }
    r++;
  });
  gabung(ws, `B${r}:E${r}`, 'TOTAL');
  const tp = ws.getCell(r, ps.kolom.jumlah);
  tp.value = { formula: `SUM(F${ps.barisAwal}:F${Math.max(ps.barisAwal, r - 1)})`, result: d.peserta.reduce((x, p) => x + p.jumlah, 0) };
  gayaDasar(tp);
  rupiah(tp);
}

function sheetPengeluaran(ws: ExcelJS.Worksheet, d: DataEksporRab) {
  const m = RAB_MAP.PENGELUARAN;
  const k = m.kolom;
  aturLebar(ws, m.lebar);
  m.header.forEach((h, j) => {
    const c = ws.getCell(m.barisHeader, k.no + j);
    c.value = h;
    gayaDasar(c);
    c.fill = GAYA.pengeluaranHeader.fill;
    c.font = { ...GAYA.pengeluaranHeader.font };
  });
  const sel = (r: number, kol: number, v: ExcelJS.CellValue, fmt?: string) => {
    const c = ws.getCell(r, kol);
    c.value = v;
    gayaDasar(c);
    if (fmt) c.numFmt = fmt;
  };

  // Pemasukan dulu (hanya C, E, H), lalu TOTAL = saldo awal.
  let r = m.barisHeader + 1;
  let no = 0;
  const awal = r;
  for (const p of d.pemasukan) {
    sel(r, k.no, ++no);
    for (const kol of [k.tanggal, k.divisi, k.pengeluaran]) sel(r, kol, null);
    sel(r, k.uraian, p.keterangan.toUpperCase());
    sel(r, k.saldo, p.saldo, RAB_MAP.RUPIAH);
    r++;
  }
  let saldo = d.pemasukan.reduce((x, p) => x + p.saldo, 0);
  gabung(ws, `C${r}:G${r}`, 'TOTAL');
  sel(r, k.saldo, { formula: `SUM(H${awal}:H${Math.max(awal, r - 1)})`, result: saldo }, RAB_MAP.RUPIAH);
  r++;

  // Pengeluaran berurutan tanggal, saldo berjalan berantai.
  const urut = [...d.pengeluaran].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  for (const p of urut) {
    saldo -= p.nominal;
    sel(r, k.no, ++no);
    sel(r, k.tanggal, new Date(`${p.tanggal}T00:00:00Z`), RAB_MAP.TANGGAL);
    sel(r, k.uraian, p.uraian.toUpperCase());
    sel(r, k.divisi, p.divisi.toUpperCase());
    sel(r, k.pengeluaran, p.nominal, RAB_MAP.RUPIAH);
    sel(r, k.saldo, { formula: `H${r - 1}-G${r}`, result: saldo }, RAB_MAP.RUPIAH);
    // Pengeluaran di luar RAB ditandai kuning muda — temuan LPJ (ADR-006, T-103).
    if (p.luar_rab) {
      for (let kol = k.no; kol <= k.saldo; kol++) ws.getCell(r, kol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    }
    r++;
  }
  gabung(ws, `C${r}:G${r}`, 'SISA UANG');
  sel(r, k.saldo, { formula: `H${r - 1}`, result: saldo }, RAB_MAP.RUPIAH);
}

export async function eksporRabXlsx(d: DataEksporRab): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HMIF Center';

  const rab = wb.addWorksheet('RAB');
  aturLebar(rab, RAB_MAP.RAB.lebar);
  const blok = tulisBlokItem(rab, d.rab.divisi, false);
  tulisRingkasan(rab, RAB_MAP.RAB.ringkasan.barisHeader, RAB_MAP.RAB.ringkasan.header, blok.barisTotal, d.rab.danaTakTerduga);

  sheetPemasukan(wb.addWorksheet('PEMASUKAN'), d);
  sheetPengeluaran(wb.addWorksheet('PENGELUARAN'), d);

  const aktual = wb.addWorksheet('RAB AKTUAL');
  aturLebar(aktual, RAB_MAP.RAB_AKTUAL.lebar);
  const blokAktual = tulisBlokItem(aktual, d.aktual.divisi, true);
  tulisRingkasan(aktual, RAB_MAP.RAB_AKTUAL.ringkasan.barisHeader, RAB_MAP.RAB_AKTUAL.ringkasan.header, blokAktual.barisTotal, d.aktual.danaTakTerduga);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** `RAB-{namaAcara}-{YYYYMMDD}.xlsx` — karakter yang tidak aman untuk nama berkas diganti '-'. */
export function namaBerkasRab(namaAcara: string, tanggal: Date): string {
  const bersih = namaAcara.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'Acara';
  const ymd = tanggal.toISOString().slice(0, 10).replace(/-/g, '');
  return `RAB-${bersih}-${ymd}.xlsx`;
}
