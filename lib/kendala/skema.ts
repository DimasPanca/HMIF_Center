/**
 * skema kendala — satu skema untuk form & server (K-04), plus utilitas mention
 * dan utas berulir. Aman untuk klien.
 *
 * Mention disimpan di teks sebagai token `@[Nama Lengkap](uuid)`: nama tetap
 * terbaca walau akun kelak dinonaktifkan, dan id membuat sorotan tidak salah
 * orang bila ada dua pengurus bernama sama. Teks TIDAK pernah dirender sebagai
 * HTML — token dipecah menjadi segmen dan ditampilkan sebagai teks biasa.
 *
 * Sumber: T-082 · PRD F-7.3 · USER_FLOW §8.2
 */

import { z } from 'zod';

export const PRIORITAS = ['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS'] as const;
export type Prioritas = (typeof PRIORITAS)[number];
export const STATUS_KENDALA = ['TERBUKA', 'SEDANG_DITANGANI', 'SELESAI'] as const;
export type StatusKendala = (typeof STATUS_KENDALA)[number];

export const LABEL_PRIORITAS: Record<Prioritas, string> = { RENDAH: 'Rendah', SEDANG: 'Sedang', TINGGI: 'Tinggi', KRITIS: 'Kritis' };
export const LABEL_STATUS_KENDALA: Record<StatusKendala, string> = {
  TERBUKA: 'Terbuka',
  SEDANG_DITANGANI: 'Sedang Ditangani',
  SELESAI: 'Selesai',
};

/** Balasan lebih dalam dari ini diratakan di tingkat ini (kontrak T-082 #2). */
export const KEDALAMAN_MAKS = 3;
export const MIN_CATATAN = 5;

const teks = (label: string, maks: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(maks, `${label} maksimal ${maks} karakter.`);

export const SkemaKendalaBaru = z.object({
  judul: teks('Judul', 200),
  deskripsi: teks('Deskripsi', 5000),
  prioritas: z.enum(PRIORITAS, { error: 'Pilih prioritas.' }).default('SEDANG'),
  assignee_id: z.uuid({ error: 'Assignee tidak valid.' }).nullable().default(null),
  proker_id: z.uuid({ error: 'Proker tidak valid.' }).nullable().default(null),
});

/**
 * Perubahan kendala. Menandai SELESAI WAJIB disertai catatan penyelesaian
 * (PRD F-7.3; juga CHECK `kendala_selesai_wajib_catatan` migrasi 010) —
 * catatan itulah yang membuat arsip berguna periode berikutnya.
 */
export const SkemaUbahKendala = z
  .object({
    status: z.enum(STATUS_KENDALA).optional(),
    prioritas: z.enum(PRIORITAS).optional(),
    assignee_id: z.uuid().nullable().optional(),
    catatan_penyelesaian: z.string().trim().max(5000).optional(),
  })
  .refine((v) => v.status !== 'SELESAI' || (v.catatan_penyelesaian?.length ?? 0) >= MIN_CATATAN, {
    message: `Tulis catatan penyelesaian (minimal ${MIN_CATATAN} karakter): bagaimana kendala ini diselesaikan.`,
    path: ['catatan_penyelesaian'],
  });

export const SkemaBalasan = z.object({
  konten: teks('Balasan', 3000),
  parent_id: z.uuid({ error: 'Balasan induk tidak valid.' }).nullable().default(null),
});

// ---------------------------------------------------------------------------
// Mention
// ---------------------------------------------------------------------------

const POLA_MENTION = /@\[([^\]\n]{1,150})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export type SegmenTeks = { t: 'teks'; v: string } | { t: 'mention'; nama: string; id: string };

export function tokenMention(nama: string, id: string): string {
  return `@[${nama.replace(/[[\]\n]/g, '')}](${id})`;
}

/** Teks balasan → segmen teks & mention, untuk dirender tanpa HTML. */
export function pecahMention(konten: string): SegmenTeks[] {
  const hasil: SegmenTeks[] = [];
  let posisi = 0;
  for (const m of konten.matchAll(POLA_MENTION)) {
    if (m.index > posisi) hasil.push({ t: 'teks', v: konten.slice(posisi, m.index) });
    hasil.push({ t: 'mention', nama: m[1]!, id: m[2]!.toLowerCase() });
    posisi = m.index + m[0].length;
  }
  if (posisi < konten.length) hasil.push({ t: 'teks', v: konten.slice(posisi) });
  return hasil;
}

export function idTerMention(konten: string): string[] {
  return [...new Set(pecahMention(konten).flatMap((s) => (s.t === 'mention' ? [s.id] : [])))];
}

// ---------------------------------------------------------------------------
// Utas berulir
// ---------------------------------------------------------------------------

export interface BalasanDatar {
  id: string;
  parent_id: string | null;
  konten: string;
  penulis_id: string;
  nama_penulis: string;
  created_at: string;
}

export interface SimpulUtas extends BalasanDatar {
  kedalaman: number;
  /** Nama yang dibalas — hanya bila diratakan dari tingkat lebih dalam. */
  membalas: string | null;
  anak: SimpulUtas[];
}

/**
 * Daftar datar → pohon. Balasan yang lebih dalam dari KEDALAMAN_MAKS
 * dipasang di tingkat terdalam (tidak menjorok lagi) dan diberi keterangan
 * "membalas X" supaya alurnya tetap terbaca. Balasan yatim (induknya
 * terhapus) tampil di tingkat atas. Urutan kronologis per tingkat.
 */
export function susunUtas(daftar: BalasanDatar[]): SimpulUtas[] {
  const urut = [...daftar].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const simpul = new Map<string, SimpulUtas>();
  const akar: SimpulUtas[] = [];
  for (const b of urut) {
    const induk = b.parent_id ? simpul.get(b.parent_id) : undefined;
    if (!induk) {
      const s: SimpulUtas = { ...b, kedalaman: 1, membalas: null, anak: [] };
      simpul.set(b.id, s);
      akar.push(s);
      continue;
    }
    if (induk.kedalaman < KEDALAMAN_MAKS) {
      const s: SimpulUtas = { ...b, kedalaman: induk.kedalaman + 1, membalas: null, anak: [] };
      simpul.set(b.id, s);
      induk.anak.push(s);
    } else {
      // Diratakan: menjadi saudara induknya di tingkat terdalam.
      const wadah = cariInduk(akar, induk) ?? akar;
      const s: SimpulUtas = { ...b, kedalaman: KEDALAMAN_MAKS, membalas: induk.nama_penulis, anak: [] };
      simpul.set(b.id, s);
      (Array.isArray(wadah) ? wadah : wadah.anak).push(s);
    }
  }
  return akar;
}

function cariInduk(daftar: SimpulUtas[], target: SimpulUtas): SimpulUtas | null {
  for (const s of daftar) {
    if (s.anak.includes(target)) return s;
    const r = cariInduk(s.anak, target);
    if (r) return r;
  }
  return null;
}
