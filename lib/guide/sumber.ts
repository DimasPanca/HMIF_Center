/**
 * Sumber Guide (ADR-060): `docs/panduan/*.md` dibaca dari disk (server saja). Berkas ikut terbawa
 * ke deployment lewat `outputFileTracingIncludes` di `next.config.ts`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import type { RoleCode } from '@/lib/auth/permissions';

import { indeksBagian, type BagianGuide, type DokumenGuide } from './cari';
import { polos, uraiMarkdown } from './markdown';

if (typeof window !== 'undefined') throw new Error('lib/guide/sumber.ts adalah modul server-only.');

const FOLDER = path.join(process.cwd(), 'docs', 'panduan');

/** Urutan tampil + peran yang "memiliki" panduan itu. */
export const DAFTAR_DOKUMEN: readonly { id: string; peran: readonly RoleCode[] }[] = [
  { id: 'umum', peran: [] },
  { id: 'ketua', peran: ['KETUA'] },
  { id: 'wakil', peran: ['WAKIL'] },
  { id: 'sekum', peran: ['SEKUM'] },
  { id: 'bendum', peran: ['BENDUM'] },
  { id: 'kadept', peran: ['KADEPT'] },
  { id: 'anggota', peran: ['ANGGOTA'] },
  { id: 'bph', peran: ['BPH'] },
  { id: 'admin', peran: ['ADMIN'] },
];

/** Tautan gambar relatif (`img/x.png`) → rute penyaji gambar Guide. */
const SRC_GAMBAR = /^img\/([a-z0-9-]+\.(?:png|jpe?g|webp))$/i;

let cache: Promise<DokumenGuide[]> | null = null;

async function baca(): Promise<DokumenGuide[]> {
  const hasil: DokumenGuide[] = [];
  for (const d of DAFTAR_DOKUMEN) {
    const md = await fs.readFile(path.join(FOLDER, `${d.id}.md`), 'utf8').catch(() => null);
    if (md === null) continue;
    const blok = uraiMarkdown(md).map((b) =>
      b.jenis === 'gambar' && SRC_GAMBAR.test(b.src) ? { ...b, src: `/guide/img/${SRC_GAMBAR.exec(b.src)![1]}` } : b,
    );
    const h1 = blok.find((b) => b.jenis === 'judul' && b.level === 1);
    const judul = h1 && h1.jenis === 'judul' ? polos(h1.teks).replace(/\s+[-—]\s+HMIF Center$/, '') : d.id;
    const p1 = blok.find((b) => b.jenis === 'paragraf');
    hasil.push({
      id: d.id,
      judul,
      ringkas: p1 && p1.jenis === 'paragraf' ? polos(p1.teks) : '',
      // Judul level 1 sudah menjadi judul dokumen.
      blok: blok.filter((b) => !(b.jenis === 'judul' && b.level === 1)),
    });
  }
  return hasil;
}

/** Dokumen Guide; di produksi di-cache per proses (berkas tidak berubah saat berjalan). */
export function muatGuide(): Promise<DokumenGuide[]> {
  if (process.env.NODE_ENV !== 'production') return baca();
  cache ??= baca();
  return cache;
}

export async function muatIndeks(): Promise<BagianGuide[]> {
  return indeksBagian(await muatGuide());
}

/** Id panduan yang relevan untuk peran pengguna (ditandai "untuk Anda"). */
export function dokumenUntuk(roles: readonly RoleCode[]): string[] {
  return DAFTAR_DOKUMEN.filter((d) => d.peran.some((p) => roles.includes(p))).map((d) => d.id);
}
