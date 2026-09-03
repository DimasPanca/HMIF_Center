/**
 * Membedah berkas DOCX di `Template/` menjadi teks yang dapat dibaca.
 *
 * T-006 menuntut seseorang membuka sebelas template dan memutuskan bagian mana
 * yang menjadi placeholder. Keputusannya memang milik manusia — hanya orang
 * yang tahu praktik persuratan HMIF yang dapat membedakan kalimat baku dari
 * kalimat yang berubah tiap surat.
 *
 * Yang TIDAK perlu dikerjakan manusia adalah membaca XML di dalam .docx satu
 * per satu. Skrip ini mengeluarkan isinya sebagai teks biasa, menandai
 * placeholder yang sudah ada, dan melaporkan gambar serta tabel yang perlu
 * diperhatikan — supaya pekerjaan yang tersisa benar-benar hanya keputusan.
 *
 *     npx tsx scripts/inspect-templates.ts            ringkasan semua berkas
 *     npx tsx scripts/inspect-templates.ts Peminjaman isi lengkap yang cocok
 *
 * Sumber: docs/ai/tasks/P0-prasyarat.md T-006 · SYSTEM_DESIGN §8.3
 */

import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';

const AKAR = path.resolve(import.meta.dirname, '..');
const DIR = path.join(AKAR, 'Template');
const NL = '\n';
const tulis = (s: string): void => {
  process.stdout.write(s + NL);
};

/** Placeholder docxtemplater: {x}, {#loop}, {/loop}, {%gambar}. */
const POLA_PLACEHOLDER = /\{[#/%]?[a-z_][a-z0-9_]*\}/gi;

interface Isi {
  teks: string;
  paragraf: string[];
  placeholder: string[];
  jumlahGambar: number;
  jumlahTabel: number;
}

/**
 * Mengambil teks dari `word/document.xml`.
 *
 * Word memecah satu kalimat menjadi banyak `<w:t>` begitu ada perubahan format
 * sekecil apa pun — satu huruf tebal di tengah kalimat sudah cukup. Karena itu
 * `<w:t>` digabung tanpa pemisah, dan yang menjadi batas paragraf adalah
 * `</w:p>`.
 *
 * Ini juga sebabnya placeholder di DOCX sering rusak: mengetik `{nomor}` lalu
 * mengubah warna sebagiannya membuat Word menyimpannya sebagai `{nom` + `or}`,
 * dan docxtemplater tidak lagi mengenalinya. `scripts/template-dryrun.ts` yang
 * menangkap hal itu.
 */
function bacaDocx(berkas: string): Isi {
  const zip = new PizZip(fs.readFileSync(berkas));
  const xml = zip.file('word/document.xml')?.asText() ?? '';

  const jumlahGambar = (xml.match(/<a:blip\b/g) ?? []).length;
  const jumlahTabel = (xml.match(/<w:tbl>/g) ?? []).length;

  const paragraf = xml
    // <w:tab/> menjadi spasi lebih dulu. Tanpa ini "Nama" dan ":" menempel
    // menjadi "Nama:" dan struktur baris isian sulit dikenali.
    .replace(/<w:tab\s*\/>/g, ' ')
    .split(/<\/w:p>/)
    .map((p) =>
      // `<w:t(?:\s[^>]*)?>` — BUKAN `<w:t[^>]*>`.
      //
      // Pola yang longgar ikut menangkap setiap tag yang diawali "w:t":
      // <w:tbl>, <w:tblPr>, <w:tc>, <w:top>, <w:tab/>. Akibatnya properti
      // tabel dan tabulasi bocor ke dalam teks, dan hasil pembedahan tidak
      // dapat dipakai. Ketahuan pada jalan pertama: paragraf pertama sebuah
      // surat terbaca sebagai <w:left w:space="0" .../>.
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1] ?? '')
        .join('')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((t) => t.length > 0);

  const teks = paragraf.join(NL);

  return {
    teks,
    paragraf,
    placeholder: [...new Set(teks.match(POLA_PLACEHOLDER) ?? [])],
    jumlahGambar,
    jumlahTabel,
  };
}

function main(): void {
  if (!fs.existsSync(DIR)) {
    process.stderr.write(NL + `  Direktori ${DIR} tidak ada.` + NL + NL);
    process.exit(1);
  }

  const saring = process.argv[2]?.toLowerCase();
  const berkas = fs
    .readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .filter((f) => !saring || f.toLowerCase().includes(saring))
    .sort();

  if (berkas.length === 0) {
    tulis(NL + `  Tidak ada .docx yang cocok "${saring ?? ''}".` + NL);
    return;
  }

  // Satu berkas dan ada penyaring: cetak isinya lengkap, untuk dibedah.
  const lengkap = Boolean(saring) && berkas.length <= 2;

  tulis('');
  tulis(`  ${berkas.length} berkas DOCX di Template/`);
  tulis('');

  for (const f of berkas) {
    const isi = bacaDocx(path.join(DIR, f));

    tulis(`  ${'='.repeat(74)}`);
    tulis(`  ${f}`);
    tulis(`  ${isi.paragraf.length} paragraf · ${isi.jumlahTabel} tabel · ${isi.jumlahGambar} gambar`);

    if (isi.placeholder.length > 0) {
      tulis(`  placeholder yang SUDAH ada: ${isi.placeholder.join(' ')}`);
    } else {
      tulis('  placeholder: belum ada satu pun');
    }
    tulis('');

    const barisan = lengkap ? isi.paragraf : isi.paragraf.slice(0, 12);
    for (const [i, p] of barisan.entries()) {
      const potong = lengkap ? p : p.slice(0, 96) + (p.length > 96 ? ' …' : '');
      tulis(`    ${String(i + 1).padStart(3)}  ${potong}`);
    }
    if (!lengkap && isi.paragraf.length > 12) {
      tulis(`    ...  ${isi.paragraf.length - 12} paragraf lagi ` +
        `(jalankan dengan penyaring nama untuk isi lengkap)`);
    }
    tulis('');
  }
}

main();
