/**
 * Membaca RAB dari Excel berformat template (T-091, PRD F-9.3 AC import).
 * Murni (tanpa DB) — dipakai route import DAN `scripts/diff-excel.ts`, jadi satu
 * pengurai untuk template asli maupun hasil ekspor sendiri (T-090).
 *
 * ===========================================================================
 * MENGENALI STRUKTUR, BUKAN MENEBAK TEKS
 * ===========================================================================
 * Template asli diketik manual (RAB_CELL_MAP §5): header divisi tanpa awalan
 * "DIVISI", judul kolom berbeda di satu divisi, baris kosong bergaris, divisi
 * tanpa sub-section. Karena itu:
 *   - divisi  = baris B:F tergabung yang langsung diikuti baris judul "NO"
 *   - sub-section = baris B:F tergabung lainnya
 *   - item    = baris bernomor di B; baris kosong di dalam blok = item kosong
 *   - TOTAL   = baris berlabel TOTAL/T0TAL di B..E (menutup blok divisi)
 * Judul kolom divalidasi terhadap varian yang memang ada di template; yang lain
 * ditolak dengan pesan yang menyebut sheet, baris, dan kolomnya.
 *
 * Jumlah numerik: rumus `=E{r}*{n}` / `=ROUND(E{r}*{n},0)` (ekspor T-090)
 * menyimpan angka yang SUDAH dikonfirmasi pengguna — itulah yang dipakai,
 * bukan perkiraan parser dari teks "2 Hari 1 Malam". Sel F statis = total manual
 * (kecuali 0 tanpa jumlah). Inilah yang membuat ekspor → impor → ekspor identik.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-091 · RAB_CELL_MAP · INV-26
 */

import ExcelJS from 'exceljs';

import { bulatkanJumlah } from '@/lib/rab/calculate';
import { parseJumlah } from '@/lib/rab/parse-jumlah';

export interface ItemImpor {
  /** Nomor baris Excel — rujukan pratinjau & isian manual. */
  baris: number;
  jenis_barang: string;
  jumlah_teks: string;
  jumlah_numerik: number | null;
  /** Parser tidak yakin dan angka belum dikonfirmasi lewat rumus. */
  butuhManual: boolean;
  harga_satuan: number;
  total: number;
  total_manual: boolean;
  /** Baris kosong bergaris di dalam blok. */
  kosong: boolean;
}

export interface SectionImpor {
  nama: string;
  baris: number;
  items: ItemImpor[];
}

export interface DivisiImpor {
  nama: string;
  baris: number;
  sections: SectionImpor[];
}

export interface RabImpor {
  divisi: DivisiImpor[];
  danaTakTerduga: number;
}

export type HasilBaca = { ok: true; nilai: RabImpor } | { ok: false; pesan: string };

/** Varian judul kolom yang ada di template asli (B..F). */
const JUDUL_KOLOM: Record<number, { huruf: string; boleh: RegExp; baku: string }> = {
  2: { huruf: 'B', boleh: /^no\.?$/i, baku: 'NO' },
  3: { huruf: 'C', boleh: /^(jenis|nama) barang$/i, baku: 'Jenis Barang' },
  4: { huruf: 'D', boleh: /^(jumlah|banyaknya)$/i, baku: 'Jumlah' },
  5: { huruf: 'E', boleh: /^harga satuan$/i, baku: 'Harga satuan' },
  6: { huruf: 'F', boleh: /^(total|jumlah)$/i, baku: 'Total ' },
};

const TOTAL = /^T[O0]TAL$/i;
type Nilai = ExcelJS.CellValue;

export function teksSel(v: Nilai): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('result' in v) return teksSel(v.result as Nilai);
    if ('formula' in v || 'sharedFormula' in v) return '';
    if (v instanceof Date) return v.toISOString();
    if ('text' in v) return String((v as { text: unknown }).text).trim();
  }
  return String(v).trim();
}

export function angkaSel(v: Nilai): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in v) return typeof v.result === 'number' ? v.result : null;
  const t = teksSel(v);
  if (t === '') return null;
  const n = Number(t.replace(/^Rp/i, '').replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

const adaRumus = (v: Nilai) => !!v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v);
const rumusDari = (v: Nilai) => (v && typeof v === 'object' && 'formula' in v ? String(v.formula) : null);

export function mergeLembar(ws: ExcelJS.Worksheet): Set<string> {
  return new Set((ws.model as unknown as { merges?: string[] }).merges ?? []);
}

export type JenisBaris = 'DIVISI' | 'SUB-SECTION' | 'HEADER' | 'ITEM' | 'TOTAL' | '';

/** Jenis struktural satu baris blok item B:F. */
export function jenisBarisItem(ws: ExcelJS.Worksheet, r: number, merges: Set<string>): JenisBaris {
  const b = teksSel(ws.getCell(r, 2).value);
  if ([2, 3, 4, 5].some((c) => TOTAL.test(teksSel(ws.getCell(r, c).value)))) return 'TOTAL';
  if (merges.has(`B${r}:F${r}`)) return /^no\.?$/i.test(teksSel(ws.getCell(r + 1, 2).value)) ? 'DIVISI' : 'SUB-SECTION';
  if (/^no\.?$/i.test(b)) return 'HEADER';
  if (b !== '' && !Number.isNaN(Number(b))) return 'ITEM';
  return '';
}

/** Jumlah terkonfirmasi dari rumus ekspor `E{r}*{n}` atau `ROUND(E{r}*{n},0)`. */
function numerikDariRumus(rumus: string | null, r: number): number | null {
  if (!rumus) return null;
  const m = new RegExp(`^(?:ROUND\\()?E${r}\\*(\\d+(?:\\.\\d+)?)(?:,0\\))?$`, 'i').exec(rumus.replace(/\s/g, ''));
  return m ? Number(m[1]) : null;
}

function bacaItem(ws: ExcelJS.Worksheet, r: number): ItemImpor | { galat: string } {
  const jumlahSel = ws.getCell(r, 4).value;
  const jumlah_teks = typeof jumlahSel === 'number' ? String(jumlahSel) : teksSel(jumlahSel);
  const hargaMentah = ws.getCell(r, 5).value;
  const harga = angkaSel(hargaMentah);
  if (harga === null && teksSel(hargaMentah) !== '') {
    return { galat: `Sheet "RAB" baris ${r} kolom E: harga satuan "${teksSel(hargaMentah)}" bukan angka.` };
  }
  if (harga !== null && harga < 0) return { galat: `Sheet "RAB" baris ${r} kolom E: harga satuan negatif.` };

  const f = ws.getCell(r, 6).value;
  const parsed = parseJumlah(jumlah_teks);
  const dariRumus = numerikDariRumus(rumusDari(f), r);
  const numerik = bulatkanJumlah(dariRumus ?? parsed.numerik);
  const totalSel = angkaSel(f) ?? 0;
  // Sel F statis = total yang dikunci pengguna, kecuali nol tanpa jumlah (item belum lengkap).
  const total_manual = !adaRumus(f) && !(numerik === null && totalSel === 0);

  return {
    baris: r,
    jenis_barang: teksSel(ws.getCell(r, 3).value),
    jumlah_teks,
    jumlah_numerik: numerik,
    butuhManual: dariRumus === null && parsed.butuhInputManual && jumlah_teks !== '',
    harga_satuan: Math.round(harga ?? 0),
    total: Math.round(totalSel),
    total_manual,
    kosong: false,
  };
}

/** Blok item B:F → divisi → sub-section → item, dengan validasi judul kolom. */
export function bacaBlokItem(ws: ExcelJS.Worksheet): { ok: true; divisi: DivisiImpor[] } | { ok: false; pesan: string } {
  const merges = mergeLembar(ws);
  const divisi: DivisiImpor[] = [];
  let dalamBlok = false;

  for (let r = 1; r <= ws.rowCount; r++) {
    const jenis = jenisBarisItem(ws, r, merges);
    const div = divisi[divisi.length - 1];
    const sectionAktif = () => {
      if (!div!.sections.length) div!.sections.push({ nama: '', baris: r, items: [] });
      return div!.sections[div!.sections.length - 1]!;
    };

    if (jenis === 'DIVISI') {
      if (dalamBlok) return { ok: false, pesan: `Sheet "${ws.name}" baris ${r}: divisi baru dimulai sebelum baris TOTAL divisi sebelumnya.` };
      divisi.push({ nama: teksSel(ws.getCell(r, 2).value).replace(/^DIVISI\s+/i, ''), baris: r, sections: [] });
    } else if (jenis === 'HEADER') {
      if (!div) return { ok: false, pesan: `Sheet "${ws.name}" baris ${r}: judul kolom tanpa baris divisi di atasnya.` };
      for (const [k, j] of Object.entries(JUDUL_KOLOM)) {
        const isi = teksSel(ws.getCell(r, Number(k)).value);
        if (!j.boleh.test(isi)) {
          return { ok: false, pesan: `Sheet "${ws.name}" baris ${r} kolom ${j.huruf}: judul "${isi || '(kosong)'}" tidak dikenali — diharapkan "${j.baku.trim()}".` };
        }
      }
      dalamBlok = true;
    } else if (jenis === 'TOTAL') {
      dalamBlok = false;
    } else if (jenis === 'SUB-SECTION' && div && dalamBlok) {
      div.sections.push({ nama: teksSel(ws.getCell(r, 2).value), baris: r, items: [] });
    } else if (jenis === 'ITEM' && div && dalamBlok) {
      const i = bacaItem(ws, r);
      if ('galat' in i) return { ok: false, pesan: i.galat.replace('Sheet "RAB"', `Sheet "${ws.name}"`) };
      sectionAktif().items.push(i);
    } else if (jenis === '' && div && dalamBlok) {
      sectionAktif().items.push({
        baris: r,
        jenis_barang: '',
        jumlah_teks: '',
        jumlah_numerik: null,
        butuhManual: false,
        harga_satuan: 0,
        total: 0,
        total_manual: false,
        kosong: true,
      });
    }
  }
  if (dalamBlok) return { ok: false, pesan: `Sheet "${ws.name}": divisi terakhir (${divisi[divisi.length - 1]?.nama}) tidak ditutup baris TOTAL.` };
  if (!divisi.length) {
    return { ok: false, pesan: `Sheet "${ws.name}" tidak memuat blok divisi: baris "DIVISI …" tergabung B:F yang diikuti baris judul kolom "NO".` };
  }
  return { ok: true, divisi };
}

/** Nilai Dana Tak Terduga di ringkasan H:J. */
export function bacaDanaTakTerduga(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (/dana tak terduga/i.test(teksSel(ws.getCell(r, 9).value))) return Math.round(angkaSel(ws.getCell(r, 10).value) ?? 0);
  }
  return 0;
}

export async function bacaRabExcel(isi: Buffer | ArrayBuffer): Promise<HasilBaca> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(isi as ArrayBuffer);
  } catch {
    return { ok: false, pesan: 'Berkas bukan Excel (.xlsx) yang valid. Simpan ulang sebagai .xlsx lalu coba lagi.' };
  }
  const ws = wb.getWorksheet('RAB');
  if (!ws) {
    return { ok: false, pesan: `Sheet "RAB" tidak ditemukan. Sheet yang ada: ${wb.worksheets.map((w) => `"${w.name}"`).join(', ') || '(tidak ada)'}.` };
  }
  const blok = bacaBlokItem(ws);
  if (!blok.ok) return blok;
  return { ok: true, nilai: { divisi: blok.divisi, danaTakTerduga: bacaDanaTakTerduga(ws) } };
}
