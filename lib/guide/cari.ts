/**
 * Indeks & pencarian Guide (ADR-060). Murni — dipakai pencarian di browser dan pemilihan konteks
 * Dhana di server. Satu "bagian" = satu judul level 2/3 beserta isinya sampai judul berikutnya.
 */

import { teksBlok, type Blok } from './markdown';

export interface DokumenGuide {
  id: string;
  judul: string;
  ringkas: string;
  blok: Blok[];
}

export interface BagianGuide {
  dokId: string;
  dokJudul: string;
  id: string;
  judul: string;
  teks: string;
}

export interface HasilCari extends BagianGuide {
  skor: number;
  cuplikan: string;
}

export function normalisasi(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Kata umum yang tidak membedakan hasil. */
const KATA_UMUM = new Set(['dan', 'atau', 'yang', 'di', 'ke', 'dari', 'untuk', 'cara', 'bagaimana', 'apa', 'saya', 'ini', 'itu', 'dengan', 'bisa', 'mau', 'gimana']);

export function kataKunci(q: string): string[] {
  const kata = normalisasi(q).split(' ').filter(Boolean);
  const inti = kata.filter((k) => !KATA_UMUM.has(k));
  return inti.length ? inti : kata;
}

/**
 * Sinonim sehari-hari → istilah yang dipakai panduan. Satu kata kunci cocok bila salah satu
 * variannya muncul (mis. "hp" cocok dengan "ponsel").
 */
const SINONIM: Record<string, readonly string[]> = {
  hp: ['ponsel', 'hp'],
  handphone: ['ponsel'],
  upload: ['upload', 'unggah'],
  unggah: ['unggah', 'upload'],
  login: ['masuk', 'login'],
  logout: ['keluar', 'logout'],
  password: ['kata sandi', 'password'],
  sandi: ['sandi', 'password'],
  acc: ['setuju', 'approval'],
  approve: ['setuju', 'approval'],
  setujui: ['setuju', 'approval'],
  gform: ['formulir', 'form'],
  kuesioner: ['formulir', 'form'],
  bug: ['bug', 'error'],
  error: ['bug', 'error', 'masalah'],
  struk: ['nota', 'struk'],
  kwitansi: ['nota'],
  anggaran: ['rab', 'anggaran'],
  sk: ['keterangan aktif', 'sk'],
};
export const varian = (k: string): readonly string[] => SINONIM[k] ?? [k];

export function indeksBagian(dok: DokumenGuide[]): BagianGuide[] {
  const hasil: BagianGuide[] = [];
  for (const d of dok) {
    let kini: BagianGuide = { dokId: d.id, dokJudul: d.judul, id: '', judul: d.judul, teks: d.ringkas };
    for (const b of d.blok) {
      if (b.jenis === 'judul' && b.level >= 2 && b.level <= 3) {
        if (kini.teks.trim() || kini.id) hasil.push(kini);
        kini = { dokId: d.id, dokJudul: d.judul, id: b.id, judul: teksBlok(b), teks: '' };
      } else if (b.jenis !== 'judul' || b.level > 3) {
        kini.teks += ` ${teksBlok(b)}`;
      }
    }
    hasil.push(kini);
  }
  return hasil.map((b) => ({ ...b, teks: b.teks.replace(/\s+/g, ' ').trim() }));
}

function cuplikan(teks: string, kata: string[], panjang = 160): string {
  const n = normalisasi(teks);
  let pos = -1;
  for (const k of kata.flatMap(varian)) {
    pos = n.indexOf(k);
    if (pos >= 0) break;
  }
  if (pos < 0) return teks.slice(0, panjang) + (teks.length > panjang ? '…' : '');
  // Posisi di teks yang dinormalisasi kira-kira sama dengan teks asli (hanya tanda baca yang berubah).
  const mulai = Math.max(0, pos - 50);
  const potong = teks.slice(mulai, mulai + panjang);
  return `${mulai > 0 ? '…' : ''}${potong}${mulai + panjang < teks.length ? '…' : ''}`;
}

/**
 * Semua kata kunci harus muncul (judul atau isi). Skor: kata di judul ×5, di isi ×1 per
 * kemunculan (maks 5), frasa utuh di judul +10 / di isi +4.
 */
export function cari(bagian: BagianGuide[], q: string, batas = 20): HasilCari[] {
  const kata = kataKunci(q);
  if (!kata.length) return [];
  const frasa = normalisasi(q);
  const hasil: HasilCari[] = [];
  for (const b of bagian) {
    const j = normalisasi(b.judul);
    const t = normalisasi(b.teks);
    let skor = 0;
    let semua = true;
    for (const k of kata) {
      const v = varian(k);
      const diJudul = v.some((x) => j.includes(x));
      const diIsi = Math.max(...v.map((x) => t.split(x).length - 1));
      if (!diJudul && !diIsi) {
        semua = false;
        break;
      }
      skor += (diJudul ? 5 : 0) + Math.min(diIsi, 5);
    }
    if (!semua) continue;
    if (kata.length > 1 && j.includes(frasa)) skor += 10;
    else if (kata.length > 1 && t.includes(frasa)) skor += 4;
    hasil.push({ ...b, skor, cuplikan: cuplikan(b.teks, kata) });
  }
  return hasil.sort((a, b) => b.skor - a.skor).slice(0, batas);
}
