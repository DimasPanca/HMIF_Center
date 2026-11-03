/**
 * Pengurai markdown kecil untuk Guide (ADR-060). Hanya subset yang dipakai `docs/panduan/*.md`:
 * judul, paragraf, daftar (satu tingkat anak), tabel, kutipan, gambar, blok kode. Hasilnya data
 * terstruktur — dirender sebagai elemen React, tidak pernah lewat `dangerouslySetInnerHTML`.
 * Murni: dipakai server (Guide, Dhana) dan klien (pencarian).
 */

export interface ButirDaftar {
  teks: string;
  anak: string[];
}

export type Blok =
  | { jenis: 'judul'; level: 1 | 2 | 3 | 4; teks: string; id: string }
  | { jenis: 'paragraf'; teks: string }
  | { jenis: 'daftar'; berurut: boolean; butir: ButirDaftar[] }
  | { jenis: 'tabel'; kepala: string[]; baris: string[][] }
  | { jenis: 'kutipan'; teks: string }
  | { jenis: 'gambar'; alt: string; src: string }
  | { jenis: 'kode'; teks: string };

/** Jangkar URL dari judul: "3. Mengunggah nota" → "3-mengunggah-nota". */
export function slug(teks: string): string {
  return polos(teks)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Teks tanpa penanda inline (**, `, [tautan](url), ![gambar](url)). */
export function polos(teks: string): string {
  return teks
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

const RE_DAFTAR = /^(\s*)(?:[-*]|(\d+)\.)\s+(.*)$/;
const RE_GAMBAR = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
/** Butir daftar tingkat atas (kolom 0–1) — memulai blok daftar baru. */
const awalDaftar = (baris: string) => {
  const m = RE_DAFTAR.exec(baris);
  return !!m && m[1]!.length < 2;
};
const selTabel = (baris: string) =>
  baris
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((s) => s.trim());

export function uraiMarkdown(md: string): Blok[] {
  const baris = md.replace(/\r\n/g, '\n').split('\n');
  const hasil: Blok[] = [];
  const idTerpakai = new Map<string, number>();
  let i = 0;

  const idUnik = (teks: string) => {
    const dasar = slug(teks) || 'bagian';
    const n = idTerpakai.get(dasar) ?? 0;
    idTerpakai.set(dasar, n + 1);
    return n ? `${dasar}-${n + 1}` : dasar;
  };

  while (i < baris.length) {
    const b = baris[i]!;
    if (!b.trim()) {
      i++;
      continue;
    }

    if (b.startsWith('```')) {
      const isi: string[] = [];
      i++;
      while (i < baris.length && !baris[i]!.startsWith('```')) isi.push(baris[i++]!);
      i++;
      hasil.push({ jenis: 'kode', teks: isi.join('\n') });
      continue;
    }

    const judul = /^(#{1,4})\s+(.*)$/.exec(b);
    if (judul) {
      const teks = judul[2]!.trim();
      hasil.push({ jenis: 'judul', level: judul[1]!.length as 1 | 2 | 3 | 4, teks, id: idUnik(teks) });
      i++;
      continue;
    }

    const gambar = RE_GAMBAR.exec(b.trim());
    if (gambar) {
      hasil.push({ jenis: 'gambar', alt: gambar[1]!, src: gambar[2]! });
      i++;
      continue;
    }

    if (b.trimStart().startsWith('|') && baris[i + 1]?.trim().match(/^\|?\s*:?-{2,}/)) {
      const kepala = selTabel(b);
      i += 2;
      const isi: string[][] = [];
      while (i < baris.length && baris[i]!.trimStart().startsWith('|')) isi.push(selTabel(baris[i++]!));
      hasil.push({ jenis: 'tabel', kepala, baris: isi });
      continue;
    }

    if (b.startsWith('>')) {
      const isi: string[] = [];
      while (i < baris.length && baris[i]!.startsWith('>')) isi.push(baris[i++]!.replace(/^>\s?/, ''));
      hasil.push({ jenis: 'kutipan', teks: isi.join(' ').trim() });
      continue;
    }

    if (awalDaftar(b)) {
      const berurut = RE_DAFTAR.exec(b)![2] !== undefined;
      const butir: ButirDaftar[] = [];
      while (i < baris.length) {
        const l = baris[i]!;
        const m = RE_DAFTAR.exec(l);
        if (m && m[1]!.length < 2) {
          butir.push({ teks: m[3]!, anak: [] });
        } else if (m && butir.length) {
          butir[butir.length - 1]!.anak.push(m[3]!);
        } else if (l.trim() && /^\s{2,}/.test(l) && butir.length) {
          const akhir = butir[butir.length - 1]!;
          if (akhir.anak.length) akhir.anak[akhir.anak.length - 1] += ` ${l.trim()}`;
          else akhir.teks += ` ${l.trim()}`;
        } else break;
        i++;
      }
      hasil.push({ jenis: 'daftar', berurut, butir });
      continue;
    }

    const isi: string[] = [];
    while (
      i < baris.length &&
      baris[i]!.trim() &&
      !/^(#{1,4}\s|```|>|\|)/.test(baris[i]!) &&
      !RE_GAMBAR.test(baris[i]!.trim()) &&
      !awalDaftar(baris[i]!)
    ) {
      isi.push(baris[i++]!.trim());
    }
    if (isi.length) hasil.push({ jenis: 'paragraf', teks: isi.join(' ') });
    else i++;
  }
  return hasil;
}

/** Teks polos satu blok, untuk indeks pencarian dan konteks Dhana. */
export function teksBlok(b: Blok): string {
  switch (b.jenis) {
    case 'judul':
    case 'paragraf':
    case 'kutipan':
    case 'kode':
      return polos(b.teks);
    case 'daftar':
      return b.butir.map((x) => [x.teks, ...x.anak].map(polos).join(' ')).join(' ');
    case 'tabel':
      return [b.kepala, ...b.baris].map((r) => r.map(polos).join(' ')).join(' ');
    case 'gambar':
      return b.alt;
  }
}
