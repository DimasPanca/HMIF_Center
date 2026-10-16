/**
 * diff-excel — membandingkan STRUKTUR hasil ekspor RAB dengan template asli (T-090).
 *
 *   npx tsx scripts/diff-excel.ts
 *
 * Cara kerjanya: data DIBACA dari `Template/RAB_Template.xlsx` sendiri (divisi,
 * sub-section, item, ringkasan, pemasukan, peserta, pengeluaran), diekspor lagi
 * lewat `eksporRabXlsx`, lalu kedua berkas dibandingkan:
 *   1. daftar & urutan sheet
 *   2. lebar kolom
 *   3. merge range
 *   4. struktur baris — jenis tiap baris (DIVISI / HEADER / SUB-SECTION / ITEM /
 *      TOTAL / ringkasan / pemasukan / pengeluaran) di posisi yang sama
 *
 * Template asli diketik manual lintas kepengurusan dan TIDAK konsisten di
 * beberapa titik (RAB_CELL_MAP §5). Inkonsistensi yang sudah didokumentasikan
 * dilaporkan terpisah, satu per satu, dan TIDAK dihitung sebagai selisih —
 * tetapi juga tidak disembunyikan. Selisih lain = exit 1.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-090 · RAB_CELL_MAP
 */

import path from 'node:path';

import ExcelJS from 'exceljs';

import { eksporRabXlsx, type DataEksporRab, type DivisiEkspor, type ItemAktual } from '../lib/rab/excel-export';
import { parseJumlah } from '../lib/rab/parse-jumlah';

const SUMBER = path.join(process.cwd(), 'Template', 'RAB_Template.xlsx');

/** Inkonsistensi template asli yang sudah didokumentasikan (RAB_CELL_MAP §5). */
const INKONSISTENSI_TEMPLATE: { sheet: string; jenis: 'merge' | 'label'; template: string; standar: string; alasan: string }[] = [
  {
    sheet: 'RAB',
    jenis: 'merge',
    template: 'C45:E45',
    standar: 'B45:E45',
    alasan: 'TOTAL Divisi Acara di-merge C:E; seluruh TOTAL lain B:E (RAB_CELL_MAP §1.2, temuan 5)',
  },
  {
    sheet: 'RAB AKTUAL',
    jenis: 'merge',
    template: 'C45:E45',
    standar: 'B45:E45',
    alasan: 'sama dengan sheet RAB — sheet aktual disalin dari RAB (temuan 5)',
  },
];

type Nilai = ExcelJS.CellValue;

function teks(v: Nilai): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return teks(v.result as Nilai);
    if ('formula' in v || 'sharedFormula' in v) return '';
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

function angka(v: Nilai): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result;
  const n = Number(teks(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const adaRumus = (v: Nilai) => !!v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v);
const TOTAL = /^T[O0]TAL$/i;

function mergeSet(ws: ExcelJS.Worksheet): Set<string> {
  // ExcelJS menyimpan merge di model.merges.
  return new Set((ws.model as unknown as { merges?: string[] }).merges ?? []);
}

/** Jenis struktural baris blok item B:F. */
function jenisBarisItem(ws: ExcelJS.Worksheet, r: number, merges: Set<string>): string {
  const b = teks(ws.getCell(r, 2).value);
  const label = [2, 3, 4, 5].map((c) => teks(ws.getCell(r, c).value));
  if (label.some((t) => TOTAL.test(t))) return 'TOTAL';
  // Divisi dikenali dari STRUKTUR — B:F tergabung lalu baris header "NO" — bukan
  // dari awalan "DIVISI": template menulis "SEKRETARIS" dan "BENDAHARA" tanpa awalan.
  if (merges.has(`B${r}:F${r}`)) return /^no$/i.test(teks(ws.getCell(r + 1, 2).value)) ? 'DIVISI' : 'SUB-SECTION';
  if (/^no$/i.test(b)) return 'HEADER';
  if (b !== '' && !Number.isNaN(Number(b))) return 'ITEM';
  return '';
}

function jenisBarisRingkasan(ws: ExcelJS.Worksheet, r: number): string {
  const h = teks(ws.getCell(r, 8).value);
  if (/^no\.?$/i.test(h)) return 'R-HEADER';
  if (TOTAL.test(h)) return 'R-TOTAL';
  if (h !== '' && !Number.isNaN(Number(h))) return /dana tak terduga/i.test(teks(ws.getCell(r, 9).value)) ? 'R-DANA' : 'R-DIVISI';
  return '';
}

/** Membaca blok item B:F menjadi struktur divisi → sub-section → item. */
function bacaBlokItem(ws: ExcelJS.Worksheet): { nama: string; sections: { nama: string; items: (ItemAktual & { rumus: boolean })[] }[] }[] {
  const merges = mergeSet(ws);
  const hasil: { nama: string; sections: { nama: string; items: (ItemAktual & { rumus: boolean })[] }[] }[] = [];
  let dalamBlok = false;
  for (let r = 1; r <= ws.rowCount; r++) {
    const jenis = jenisBarisItem(ws, r, merges);
    const div = hasil[hasil.length - 1];
    if (jenis === 'DIVISI') hasil.push({ nama: teks(ws.getCell(r, 2).value).replace(/^DIVISI\s+/i, ''), sections: [] });
    else if (jenis === 'HEADER') dalamBlok = true;
    else if (jenis === 'TOTAL') dalamBlok = false;
    else if (jenis === 'SUB-SECTION' && div) div.sections.push({ nama: teks(ws.getCell(r, 2).value), items: [] });
    else if (jenis === '' && dalamBlok && div) {
      // Baris kosong bergaris di dalam blok (template RAB baris 10–11) = item kosong.
      if (!div.sections.length) div.sections.push({ nama: '', items: [] });
      div.sections[div.sections.length - 1]!.items.push({
        jenis_barang: '',
        jumlah_teks: '',
        jumlah_numerik: null,
        harga_satuan: 0,
        total: 0,
        total_manual: false,
        realisasi: 0,
        rumus: false,
      });
    } else if (jenis === 'ITEM' && div) {
      if (!div.sections.length) div.sections.push({ nama: '', items: [] }); // divisi tanpa sub-section (P3K, dst.)
      const jumlah = teks(ws.getCell(r, 4).value);
      const f = ws.getCell(r, 6).value;
      const total = angka(f);
      div.sections[div.sections.length - 1]!.items.push({
        jenis_barang: teks(ws.getCell(r, 3).value),
        jumlah_teks: jumlah,
        jumlah_numerik: parseJumlah(jumlah).numerik,
        harga_satuan: angka(ws.getCell(r, 5).value),
        total,
        total_manual: !adaRumus(f),
        realisasi: total,
        rumus: adaRumus(f),
      });
    }
  }
  return hasil;
}

function bacaRingkasanDana(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= ws.rowCount; r++) if (jenisBarisRingkasan(ws, r) === 'R-DANA') return angka(ws.getCell(r, 10).value);
  return 0;
}

function bacaData(wb: ExcelJS.Workbook): DataEksporRab {
  const rab = wb.getWorksheet('RAB')!;
  const aktual = wb.getWorksheet('RAB AKTUAL')!;
  const pm = wb.getWorksheet('PEMASUKAN')!;
  const pg = wb.getWorksheet('PENGELUARAN')!;

  const pemasukan: DataEksporRab['pemasukan'] = [];
  for (let r = 4; r <= pm.rowCount && !TOTAL.test(teks(pm.getCell(r, 2).value)); r++) {
    pemasukan.push({ keterangan: teks(pm.getCell(r, 3).value), saldo: angka(pm.getCell(r, 4).value) });
  }
  const peserta: DataEksporRab['peserta'] = [];
  for (let r = 12; r <= pm.rowCount && !TOTAL.test(teks(pm.getCell(r, 2).value)); r++) {
    const t = pm.getCell(r, 5).value;
    peserta.push({
      nama: teks(pm.getCell(r, 3).value),
      bayar: pm.getCell(r, 4).value === true,
      tanggal: t instanceof Date ? t.toISOString().slice(0, 10) : null,
      jumlah: angka(pm.getCell(r, 6).value),
    });
  }
  const pengeluaran: DataEksporRab['pengeluaran'] = [];
  let r = 4;
  while (r <= pg.rowCount && !TOTAL.test(teks(pg.getCell(r, 3).value))) r++;
  for (r++; r <= pg.rowCount && !/sisa uang/i.test(teks(pg.getCell(r, 3).value)); r++) {
    const t = pg.getCell(r, 4).value;
    pengeluaran.push({
      tanggal: t instanceof Date ? t.toISOString().slice(0, 10) : '2000-01-01',
      uraian: teks(pg.getCell(r, 5).value),
      divisi: teks(pg.getCell(r, 6).value),
      nominal: angka(pg.getCell(r, 7).value),
    });
  }

  const keEkspor = (d: ReturnType<typeof bacaBlokItem>): DivisiEkspor[] =>
    d.map((x) => ({ nama: x.nama, sections: x.sections.map((s) => ({ nama: s.nama, items: s.items })) }));

  return {
    namaAcara: 'Template',
    rab: { divisi: keEkspor(bacaBlokItem(rab)), danaTakTerduga: bacaRingkasanDana(rab) },
    aktual: { divisi: bacaBlokItem(aktual), danaTakTerduga: bacaRingkasanDana(aktual) },
    pemasukan,
    peserta,
    pengeluaran,
  };
}

function strukturBaris(ws: ExcelJS.Worksheet): string[] {
  const merges = mergeSet(ws);
  const nama = ws.name;
  const baris: string[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    let j = '';
    if (nama === 'RAB' || nama === 'RAB AKTUAL') j = [jenisBarisItem(ws, r, merges), jenisBarisRingkasan(ws, r)].filter(Boolean).join('+');
    else if (nama === 'PEMASUKAN') {
      const b = teks(ws.getCell(r, 2).value);
      j = /^no$/i.test(b) ? 'HEADER' : TOTAL.test(b) ? 'TOTAL' : b !== '' || adaRumus(ws.getCell(r, 2).value) ? 'DATA' : teks(ws.getCell(r, 3).value) ? 'JUDUL' : '';
    } else if (nama === 'PENGELUARAN') {
      const c = teks(ws.getCell(r, 3).value);
      j = /^no$/i.test(c) ? 'HEADER' : TOTAL.test(c) ? 'TOTAL' : /sisa uang/i.test(c) ? 'SISA' : c !== '' ? 'DATA' : '';
    }
    baris.push(j);
  }
  while (baris.length && baris[baris.length - 1] === '') baris.pop();
  return baris;
}

async function main() {
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(SUMBER);
  const data = bacaData(template);
  const hasil = new ExcelJS.Workbook();
  await hasil.xlsx.load((await eksporRabXlsx(data)) as unknown as ArrayBuffer);

  const selisih: string[] = [];
  const dikecualikan: string[] = [];

  const namaT = template.worksheets.map((w) => w.name);
  const namaH = hasil.worksheets.map((w) => w.name);
  if (namaT.join('|') !== namaH.join('|')) selisih.push(`Sheet: template [${namaT.join(', ')}] ≠ ekspor [${namaH.join(', ')}]`);

  for (const nama of namaT) {
    const t = template.getWorksheet(nama)!;
    const h = hasil.getWorksheet(nama);
    if (!h) continue;

    for (let c = 1; c <= 10; c++) {
      const wt = t.getColumn(c).width;
      const wh = h.getColumn(c).width;
      if (wt !== undefined && (wh === undefined || Math.abs(wt - wh) > 0.01)) selisih.push(`${nama}: lebar kolom ${String.fromCharCode(64 + c)} template ${wt} ≠ ekspor ${wh ?? '(bawaan)'}`);
      if (wt === undefined && wh !== undefined) selisih.push(`${nama}: kolom ${String.fromCharCode(64 + c)} diberi lebar ${wh}, template memakai bawaan`);
    }

    const mt = mergeSet(t);
    const mh = mergeSet(h);
    for (const m of mt) {
      if (mh.has(m)) continue;
      const k = INKONSISTENSI_TEMPLATE.find((x) => x.sheet === nama && x.jenis === 'merge' && x.template === m && mh.has(x.standar));
      if (k) dikecualikan.push(`${nama}: merge ${m} → ekspor ${k.standar} — ${k.alasan}`);
      else selisih.push(`${nama}: merge ${m} ada di template, tidak ada di ekspor`);
    }
    for (const m of mh) {
      if (mt.has(m)) continue;
      if (INKONSISTENSI_TEMPLATE.some((x) => x.sheet === nama && x.standar === m && mt.has(x.template))) continue;
      selisih.push(`${nama}: merge ${m} ada di ekspor, tidak ada di template`);
    }

    const st = strukturBaris(t);
    const sh = strukturBaris(h);
    const n = Math.max(st.length, sh.length);
    for (let r = 0; r < n; r++) {
      if ((st[r] ?? '') !== (sh[r] ?? '')) selisih.push(`${nama}: baris ${r + 1} template "${st[r] ?? ''}" ≠ ekspor "${sh[r] ?? ''}"`);
    }
  }

  console.log(`diff-excel — ${path.relative(process.cwd(), SUMBER)} vs ekspor dari datanya sendiri`);
  console.log(`  sheet: ${namaH.join(' · ')}`);
  if (dikecualikan.length) {
    console.log(`\n  Inkonsistensi template asli (didokumentasikan, tidak dihitung):`);
    for (const d of dikecualikan) console.log(`    - ${d}`);
  }
  if (selisih.length) {
    console.log(`\n  SELISIH STRUKTUR: ${selisih.length}`);
    for (const s of selisih.slice(0, 60)) console.log(`    ✗ ${s}`);
    process.exit(1);
  }
  console.log(`\n  Selisih struktur: 0 — sheet, lebar kolom, merge, dan posisi baris identik.`);
}

void main();
