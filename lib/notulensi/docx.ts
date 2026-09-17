/**
 * docx — generate DOCX notulensi dari `templates/notulensi.docx`. SERVER-ONLY.
 *
 * Template memakai placeholder docxtemplater bawaan (`{...}`), termasuk dua loop
 * `{#agenda}{teks}{/agenda}` dan `{#hasil}{teks}{/hasil}`. Pemetaan (kontrak
 * §DOCX): agenda = blok isi notulensi; hasil = poin keputusan. Meta & ringkasan
 * kehadiran mengisi placeholder skalar.
 *
 * Sumber: docs/ai/tasks/P8-kesekretariatan.md T-106 · PRD M13 (Template Notulensi)
 */

import fs from 'node:fs';
import path from 'node:path';

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

export interface DataDocxNotulensi {
  judul: string;
  hari_tanggal: string;
  waktu: string;
  tempat: string;
  perihal: string;
  pemimpin_rapat: string;
  notulis: string;
  hadir: string;
  agenda: { teks: string }[];
  hasil: { teks: string }[];
  kota: string;
  tanggal_format: string;
}

const BERKAS_TEMPLATE = path.join(process.cwd(), 'templates', 'notulensi.docx');

/** Merender template menjadi berkas .docx (bytes). */
export function buatDocxNotulensi(data: DataDocxNotulensi): Buffer {
  const zip = new PizZip(fs.readFileSync(BERKAS_TEMPLATE));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
