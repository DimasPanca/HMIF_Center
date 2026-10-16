/**
 * diff-excel — membandingkan STRUKTUR hasil ekspor RAB dengan template asli (T-090).
 *
 *   npx tsx scripts/diff-excel.ts
 *
 * Cara kerjanya: data DIBACA dari `Template/RAB_Template.xlsx` sendiri — lewat
 * pengurai yang sama dengan fitur impor (lib/rab/excel-import.ts, T-091) —
 * diekspor lagi lewat `eksporRabXlsx`, lalu kedua berkas dibandingkan:
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

import { eksporRabXlsx, type DataEksporRab, type DivisiEkspor } from '../lib/rab/excel-export';
import { angkaSel, bacaBlokItem, bacaDanaTakTerduga, jenisBarisItem, mergeLembar, teksSel, type DivisiImpor } from '../lib/rab/excel-import';

const SUMBER = path.join(process.cwd(), 'Template', 'RAB_Template.xlsx');

/** Inkonsistensi template asli yang sudah didokumentasikan (RAB_CELL_MAP §5). */
const INKONSISTENSI_TEMPLATE: { sheet: string; template: string; standar: string; alasan: string }[] = [
  { sheet: 'RAB', template: 'C45:E45', standar: 'B45:E45', alasan: 'TOTAL Divisi Acara di-merge C:E; seluruh TOTAL lain B:E (RAB_CELL_MAP §5 temuan 5)' },
  { sheet: 'RAB AKTUAL', template: 'C45:E45', standar: 'B45:E45', alasan: 'sama dengan sheet RAB — sheet aktual disalin dari RAB (temuan 5)' },
];

const TOTAL = /^T[O0]TAL$/i;
const adaRumus = (v: ExcelJS.CellValue) => !!v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v);

function jenisBarisRingkasan(ws: ExcelJS.Worksheet, r: number): string {
  const h = teksSel(ws.getCell(r, 8).value);
  if (/^no\.?$/i.test(h)) return 'R-HEADER';
  if (TOTAL.test(h)) return 'R-TOTAL';
  if (h !== '' && !Number.isNaN(Number(h))) return /dana tak terduga/i.test(teksSel(ws.getCell(r, 9).value)) ? 'R-DANA' : 'R-DIVISI';
  return '';
}

function wajibBlok(ws: ExcelJS.Worksheet): DivisiImpor[] {
  const b = bacaBlokItem(ws);
  if (!b.ok) throw new Error(b.pesan);
  return b.divisi;
}

function bacaData(wb: ExcelJS.Workbook): DataEksporRab {
  const rab = wb.getWorksheet('RAB')!;
  const aktual = wb.getWorksheet('RAB AKTUAL')!;
  const pm = wb.getWorksheet('PEMASUKAN')!;
  const pg = wb.getWorksheet('PENGELUARAN')!;

  const pemasukan: DataEksporRab['pemasukan'] = [];
  for (let r = 4; r <= pm.rowCount && !TOTAL.test(teksSel(pm.getCell(r, 2).value)); r++) {
    pemasukan.push({ keterangan: teksSel(pm.getCell(r, 3).value), saldo: angkaSel(pm.getCell(r, 4).value) ?? 0 });
  }
  const peserta: DataEksporRab['peserta'] = [];
  for (let r = 12; r <= pm.rowCount && !TOTAL.test(teksSel(pm.getCell(r, 2).value)); r++) {
    const t = pm.getCell(r, 5).value;
    peserta.push({
      nama: teksSel(pm.getCell(r, 3).value),
      bayar: pm.getCell(r, 4).value === true,
      tanggal: t instanceof Date ? t.toISOString().slice(0, 10) : null,
      jumlah: angkaSel(pm.getCell(r, 6).value) ?? 0,
    });
  }
  const pengeluaran: DataEksporRab['pengeluaran'] = [];
  let r = 4;
  while (r <= pg.rowCount && !TOTAL.test(teksSel(pg.getCell(r, 3).value))) r++;
  for (r++; r <= pg.rowCount && !/sisa uang/i.test(teksSel(pg.getCell(r, 3).value)); r++) {
    const t = pg.getCell(r, 4).value;
    pengeluaran.push({
      tanggal: t instanceof Date ? t.toISOString().slice(0, 10) : '2000-01-01',
      uraian: teksSel(pg.getCell(r, 5).value),
      divisi: teksSel(pg.getCell(r, 6).value),
      nominal: angkaSel(pg.getCell(r, 7).value) ?? 0,
    });
  }

  const keEkspor = (d: DivisiImpor[]): DivisiEkspor[] => d.map((x) => ({ nama: x.nama, sections: x.sections.map((s) => ({ nama: s.nama, items: s.items })) }));

  return {
    namaAcara: 'Template',
    rab: { divisi: keEkspor(wajibBlok(rab)), danaTakTerduga: bacaDanaTakTerduga(rab) },
    aktual: {
      divisi: wajibBlok(aktual).map((x) => ({ nama: x.nama, sections: x.sections.map((s) => ({ nama: s.nama, items: s.items.map((i) => ({ ...i, realisasi: i.total })) })) })),
      danaTakTerduga: bacaDanaTakTerduga(aktual),
    },
    pemasukan,
    peserta,
    pengeluaran,
  };
}

function strukturBaris(ws: ExcelJS.Worksheet): string[] {
  const merges = mergeLembar(ws);
  const baris: string[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    let j = '';
    if (ws.name === 'RAB' || ws.name === 'RAB AKTUAL') j = [jenisBarisItem(ws, r, merges), jenisBarisRingkasan(ws, r)].filter(Boolean).join('+');
    else if (ws.name === 'PEMASUKAN') {
      const b = teksSel(ws.getCell(r, 2).value);
      j = /^no$/i.test(b) ? 'HEADER' : TOTAL.test(b) ? 'TOTAL' : b !== '' || adaRumus(ws.getCell(r, 2).value) ? 'DATA' : teksSel(ws.getCell(r, 3).value) ? 'JUDUL' : '';
    } else if (ws.name === 'PENGELUARAN') {
      const c = teksSel(ws.getCell(r, 3).value);
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
  const hasil = new ExcelJS.Workbook();
  await hasil.xlsx.load((await eksporRabXlsx(bacaData(template))) as unknown as ArrayBuffer);

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
      const huruf = String.fromCharCode(64 + c);
      const wt = t.getColumn(c).width;
      const wh = h.getColumn(c).width;
      if (wt !== undefined && (wh === undefined || Math.abs(wt - wh) > 0.01)) selisih.push(`${nama}: lebar kolom ${huruf} template ${wt} ≠ ekspor ${wh ?? '(bawaan)'}`);
      if (wt === undefined && wh !== undefined) selisih.push(`${nama}: kolom ${huruf} diberi lebar ${wh}, template memakai bawaan`);
    }

    const mt = mergeLembar(t);
    const mh = mergeLembar(h);
    for (const m of mt) {
      if (mh.has(m)) continue;
      const k = INKONSISTENSI_TEMPLATE.find((x) => x.sheet === nama && x.template === m && mh.has(x.standar));
      if (k) dikecualikan.push(`${nama}: merge ${m} → ekspor ${k.standar} — ${k.alasan}`);
      else selisih.push(`${nama}: merge ${m} ada di template, tidak ada di ekspor`);
    }
    for (const m of mh) {
      if (mt.has(m) || INKONSISTENSI_TEMPLATE.some((x) => x.sheet === nama && x.standar === m && mt.has(x.template))) continue;
      selisih.push(`${nama}: merge ${m} ada di ekspor, tidak ada di template`);
    }

    const st = strukturBaris(t);
    const sh = strukturBaris(h);
    for (let r = 0; r < Math.max(st.length, sh.length); r++) {
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
