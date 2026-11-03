/**
 * Pengetahuan aturan organisasi untuk Dhana: AD/ART/GBHO/GBHK HMIF & BEM FT serta Peraturan
 * Fakultas DPM FT (`docs/pengetahuan/ormawa/*.md`). Dipotong per pasal (judul ###) supaya yang dikirim
 * ke model hanya pasal yang relevan — hemat token. Server saja.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { indeksBagian, type BagianGuide } from '@/lib/guide/cari';
import { uraiMarkdown } from '@/lib/guide/markdown';

if (typeof window !== 'undefined') throw new Error('lib/dhana/pengetahuan.ts adalah modul server-only.');

const FOLDER = path.join(process.cwd(), 'docs', 'pengetahuan', 'ormawa');

/** Nama pendek dokumen — dipakai Dhana saat menyebut sumber ("ART HMIF Pasal 14"). */
const NAMA: Record<string, string> = {
  '00': 'Indeks aturan ormawa FT',
  '01': 'AD HMIF',
  '02': 'ART HMIF',
  '03': 'GBHO HMIF',
  '04': 'GBHK HMIF',
  '05': 'AD BEM FT',
  '06': 'ART BEM FT',
  '07': 'GBHO BEM FT',
  '08': 'GBHK BEM FT',
  '09': 'Perfak DPM FT No. 1/2024 (Susunan dan Kedudukan Ormawa)',
  '10': 'Perfak DPM FT No. 2/2024 (Mekanisme Keuangan)',
  '11': 'Perfak DPM FT No. 3/2024 (Pemilu Raya)',
  '12': 'Perfak DPM FT No. 1/2020 (Pola Umum Kaderisasi)',
};

let cache: Promise<BagianGuide[]> | null = null;

async function baca(): Promise<BagianGuide[]> {
  const berkas = (await fs.readdir(FOLDER).catch(() => [] as string[])).filter((f) => f.endsWith('.md')).sort();
  const hasil: BagianGuide[] = [];
  for (const f of berkas) {
    const kode = f.slice(0, 2);
    const md = (await fs.readFile(path.join(FOLDER, f), 'utf8'))
      // Metadata YAML di atas berkas tidak ikut dikirim ke model.
      .replace(/^---\n[\s\S]*?\n---\n/, '');
    const blok = uraiMarkdown(md).filter((b) => !(b.jenis === 'judul' && b.level === 1));
    const bagian = indeksBagian([{ id: `aturan-${kode}`, judul: NAMA[kode] ?? f, ringkas: '', blok }]);
    // Judul BAB tanpa isi tidak berguna sebagai potongan.
    hasil.push(...bagian.filter((b) => b.teks.length > 0));
  }
  return hasil;
}

export function muatPengetahuan(): Promise<BagianGuide[]> {
  if (process.env.NODE_ENV !== 'production') return baca();
  cache ??= baca();
  return cache;
}
