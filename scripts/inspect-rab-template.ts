/**
 * inspect-rab-template — membedah struktur Template/RAB_Template.xlsx.
 *
 *   npx tsx scripts/inspect-rab-template.ts > docs/ai/rab-template-dump.txt
 *
 * Exporter Excel (T-090) harus menghasilkan berkas yang strukturnya IDENTIK
 * dengan template asli: kolom yang sama, merge yang sama, formula yang sama.
 * Menebak koordinat sel adalah cara paling pasti untuk gagal di gerbang G4.
 * Skrip ini membaca template dan mencetak koordinat sebenarnya.
 *
 * Template dibuka read-only; berkas sumber tidak pernah ditulis ulang.
 *
 * Sumber: docs/ai/tasks/P0-prasyarat.md T-007 · SYSTEM_DESIGN §11.3, §11.4
 */

import path from 'node:path';
import ExcelJS from 'exceljs';

const SUMBER = path.join(process.cwd(), 'Template', 'RAB_Template.xlsx');

/** Ubah indeks kolom (1-based) menjadi huruf: 1 -> A, 27 -> AA. */
function huruf(n: number): string {
  let s = '';
  while (n > 0) {
    const sisa = (n - 1) % 26;
    s = String.fromCharCode(65 + sisa) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function ringkas(v: unknown, maks = 46): string {
  if (v === null || v === undefined) return '';
  let t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > maks ? t.slice(0, maks) + '…' : t;
}

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SUMBER);

  console.log('='.repeat(78));
  console.log('STRUKTUR RAB_Template.xlsx');
  console.log(`Jumlah sheet: ${wb.worksheets.length}`);
  console.log('='.repeat(78));

  for (const ws of wb.worksheets) {
    console.log(`\n\n${'#'.repeat(78)}`);
    console.log(`# SHEET "${ws.name}"  —  ${ws.rowCount} baris x ${ws.columnCount} kolom`);
    console.log('#'.repeat(78));

    // --- Lebar kolom ---
    console.log('\n[LEBAR KOLOM]');
    for (let c = 1; c <= ws.columnCount; c++) {
      const col = ws.getColumn(c);
      if (col.width !== undefined) {
        console.log(`  ${huruf(c).padEnd(3)} width=${col.width}`);
      }
    }

    // --- Merge range ---
    // ws.model.merges memberi rentang penuh ("B2:F2"); _merges hanya sel kiri-atas.
    const merges: string[] = ((ws.model as unknown as { merges?: string[] }).merges ?? []).slice();
    console.log(`\n[MERGE RANGE]  total ${merges.length}`);
    for (const m of merges.sort()) console.log(`  ${m}`);

    // --- Isi sel: nilai, formula, format angka ---
    console.log('\n[ISI SEL]');
    console.log(
      '  SEL      TIPE      NUMFMT              NILAI / FORMULA'
    );
    console.log('  ' + '-'.repeat(74));

    ws.eachRow({ includeEmpty: false }, (row, nomorBaris) => {
      row.eachCell({ includeEmpty: false }, (cell, nomorKolom) => {
        const alamat = `${huruf(nomorKolom)}${nomorBaris}`;
        const numFmt = cell.numFmt ?? '';
        let tipe = 'nilai';
        let isi: string;

        const nilai = cell.value as unknown;
        if (nilai && typeof nilai === 'object' && 'formula' in (nilai as object)) {
          tipe = 'FORMULA';
          const f = nilai as { formula?: string; result?: unknown };
          isi = `=${f.formula}   -> ${ringkas(f.result, 18)}`;
        } else if (nilai && typeof nilai === 'object' && 'richText' in (nilai as object)) {
          tipe = 'rich';
          const r = nilai as { richText: { text: string }[] };
          isi = ringkas(r.richText.map((x) => x.text).join(''));
        } else {
          isi = ringkas(nilai);
        }

        if (isi === '') return;
        console.log(
          `  ${alamat.padEnd(8)} ${tipe.padEnd(9)} ${numFmt.padEnd(19)} ${isi}`
        );
      });
    });
  }

  console.log(`\n\n${'='.repeat(78)}`);
  console.log('SELESAI');
  console.log('='.repeat(78));
}

void main();
