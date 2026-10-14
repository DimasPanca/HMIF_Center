/**
 * docx-engine — mengisi template DOCX dengan data. Server-only.
 *
 * Dokumen TIDAK pernah dirender dari nol (kontrak T-061 "Jangan"): kop, margin,
 * font, dan tata letak datang utuh dari template; mesin ini hanya mengganti
 * placeholder dan menyisipkan gambar.
 *
 * ===========================================================================
 * PLACEHOLDER TANPA DATA = GAGAL, BUKAN "undefined"
 * ===========================================================================
 * Bawaan docxtemplater mencetak kata `undefined` untuk tag yang tidak menemukan
 * datanya, tanpa galat apa pun (diukur di T-006, lihat scripts/template-dryrun.ts).
 * Untuk surat resmi itu lebih buruk daripada gagal: dokumennya tampak jadi.
 * `nullGetter` di sini mengumpulkan setiap tag yang kosong, dan render
 * dibatalkan bila ada satu saja. String kosong `''` bukan "kosong" — itu nilai
 * yang memang dipilih (mis. label kolom kanan tanpa penandatangan kiri).
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-061 · SYSTEM_DESIGN §8 · ADR-021, ADR-029
 */

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { ModulGambar, pasangGambar } from './image-module';

if (typeof window !== 'undefined') {
  throw new Error('lib/documents/docx-engine.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export class GalatTemplate extends Error {
  constructor(
    message: string,
    readonly tagKosong: string[] = [],
  ) {
    super(message);
    this.name = 'GalatTemplate';
  }
}

/** Pesan galat docxtemplater (multi-error) → satu kalimat yang dapat dibaca. */
function uraikan(e: unknown): string {
  const sifat = (e as { properties?: { errors?: { properties?: { explanation?: string } }[]; explanation?: string } })
    .properties;
  const rinci = sifat?.errors?.map((x) => x.properties?.explanation).filter(Boolean) ?? [];
  if (rinci.length > 0) return rinci.slice(0, 3).join(' ');
  return sifat?.explanation ?? (e instanceof Error ? e.message : String(e));
}

/**
 * Mengisi `template` dengan `data`. Melempar `GalatTemplate` bila template
 * rusak, tag tak tertutup, atau ada placeholder tanpa data.
 */
export function renderDocx(template: Buffer, data: Record<string, unknown>): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(template);
  } catch (e) {
    throw new GalatTemplate(`Berkas template bukan .docx yang sah: ${(e as Error).message}`);
  }

  const kosong = new Set<string>();
  const gambar = new ModulGambar();
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
      modules: [gambar],
      nullGetter(part) {
        // Tag biasa dan tag loop sama-sama dihitung; tag gambar tidak pernah
        // sampai ke sini — null pada gambar berarti "tanpa gambar" (image-module).
        kosong.add(part.value);
        return '';
      },
    });
    doc.render(data);
  } catch (e) {
    throw new GalatTemplate(`Template tidak dapat diisi: ${uraikan(e)}`);
  }

  if (kosong.size > 0) {
    const daftar = [...kosong].sort();
    throw new GalatTemplate(`Data untuk placeholder berikut tidak ada: ${daftar.map((t) => `{${t}}`).join(', ')}.`, daftar);
  }

  const hasil = doc.getZip();
  pasangGambar(hasil, gambar);
  return hasil.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
