/**
 * isi-html — allowlist HTML untuk "Isi surat" (PRD F-4.2, kontrak T-058 butir 7).
 *
 * Editor isi surat sengaja dibatasi pada paragraf, tebal, miring, dan daftar,
 * sehingga HTML yang sah hanya memuat tujuh tag tanpa atribut. Itu yang
 * memungkinkan pembersih sesempit ini: semua yang lain dibuang, termasuk SELURUH
 * atribut — tidak ada `href`, `style`, `on*`, atau `src` yang perlu dinilai.
 *
 * Bukan pengurai HTML umum, dan tidak berusaha menjadi itu. Ia tokenizer satu
 * arah: tag yang diizinkan ditulis ulang dari nol (bukan disalin), teks di
 * luar tag di-escape ulang, dan isi `<script>`/`<style>` dibuang bersama tagnya.
 * Keluarannya selalu aman dirender, apa pun masukannya.
 *
 * Modul murni — dipakai skema form (cek "wajib diisi" berdasarkan teks, bukan
 * panjang HTML: editor kosong menghasilkan `<p></p>`) dan service sebelum simpan.
 *
 * Sumber: SYSTEM_DESIGN §18.1 (S8: sanitasi rich text) · docs/ai/tasks/P2-persuratan.md T-058
 */

const TAG_DIIZINKAN = new Set(['p', 'strong', 'em', 'ul', 'ol', 'li', 'br']);
/** Sinonim yang dihasilkan editor atau tempelan dari Word, dipetakan ke bentuk baku. */
const ALIAS: Record<string, string> = { b: 'strong', i: 'em' };
/** Isinya dibuang seluruhnya, bukan hanya tagnya. */
const ISI_DIBUANG = new Set(['script', 'style', 'template', 'iframe', 'object', 'noscript', 'textarea', 'title']);

// Huruf wajib tepat sesudah `<` atau `</`, seperti aturan HTML: "a < b" adalah
// teks, bukan tag. Mengizinkan spasi di situ membuat teks biasa ikut terbuang.
const POLA_TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<!--[\s\S]*?-->/g;
const ENTITAS_SAH = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});/;

/** Escape teks tanpa merusak entitas yang sudah ada (`&amp;` tetap `&amp;`). */
function escapeTeks(teks: string): string {
  let hasil = '';
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i]!;
    if (c === '&') hasil += ENTITAS_SAH.test(teks.slice(i)) ? '&' : '&amp;';
    else if (c === '<') hasil += '&lt;';
    else if (c === '>') hasil += '&gt;';
    else if (c === '"') hasil += '&quot;';
    else hasil += c;
  }
  return hasil;
}

export function sanitasiIsiHtml(masukan: unknown): string {
  if (typeof masukan !== 'string' || masukan === '') return '';
  let hasil = '';
  let posisi = 0;
  let dibuang: string | null = null;

  for (const m of masukan.matchAll(POLA_TAG)) {
    const sebelum = masukan.slice(posisi, m.index);
    posisi = m.index + m[0].length;
    if (!dibuang) hasil += escapeTeks(sebelum);
    if (!m[2]) continue; // komentar HTML

    const tutup = m[1] === '/';
    const nama = m[2].toLowerCase();
    if (dibuang) {
      if (tutup && nama === dibuang) dibuang = null;
      continue;
    }
    if (ISI_DIBUANG.has(nama)) {
      if (!tutup && !/\/\s*>$/.test(m[0])) dibuang = nama;
      continue;
    }
    const baku = ALIAS[nama] ?? nama;
    if (!TAG_DIIZINKAN.has(baku)) continue;
    if (baku === 'br') hasil += tutup ? '' : '<br>';
    else hasil += tutup ? `</${baku}>` : `<${baku}>`;
  }
  if (!dibuang) hasil += escapeTeks(masukan.slice(posisi));
  return hasil.trim();
}

const ENTITAS_DASAR: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Teks datar dari isi surat: pemisah blok menjadi baris baru, entitas dasar
 * diurai. Dipakai pemeriksaan "wajib diisi" dan kelak placeholder `{isi_paragraf}`.
 */
export function teksDariIsiHtml(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (asli, e: string) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : asli;
      }
      return ENTITAS_DASAR[e.toLowerCase()] ?? asli;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
