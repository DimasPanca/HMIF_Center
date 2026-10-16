/**
 * Satu baris RAB — aturan yang dipakai SAMA PERSIS oleh grid (klien) dan route
 * (server, INV-27). Aman untuk klien.
 *
 *   jumlah   teks disimpan apa adanya (INV-26); numerik dari parseJumlah, atau
 *            dari isian manual bila parser minta dipastikan ("2 Hari 1 Malam")
 *   total    round(numerik × harga) dalam rupiah bulat — kecuali total_manual,
 *            yang mengunci nilai override pengguna
 *
 * Rupiah disimpan sebagai bilangan bulat: Decimal(15,2) di DB, tetapi RAB HMIF
 * tidak mengenal sen, dan pembulatan di satu tempat ini mencegah klien dan
 * server berselisih satu rupiah.
 *
 * Aritmetika uang (bilangan bulat, tanpa float) dan kalkulasi bertingkat ada di
 * lib/rab/calculate.ts (T-088); `jumlahkan*` di bawah hanya pembungkusnya.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-087 · PRD F-9.1, F-9.3 · INV-26, INV-27
 */

import { z } from 'zod';

import { bulatkanJumlah, hitungRab, hitungTotalItem } from '@/lib/rab/calculate';
import { parseJumlah } from '@/lib/rab/parse-jumlah';

export const MAKS_RUPIAH = 999_999_999_999;

export interface ItemRab {
  id: string;
  section_id: string;
  no_urut: number;
  jenis_barang: string;
  jumlah_teks: string;
  jumlah_numerik: number | null;
  harga_satuan: number;
  total: number;
  total_manual: boolean;
  keterangan: string | null;
}

export interface SectionRab {
  id: string;
  nama: string;
  urutan: number;
  items: ItemRab[];
}

export interface DivisiRab {
  id: string;
  nama: string;
  warna: string | null;
  /** Hak tulis divisi ini (bisaTulisDivisi + RAB terbuka). False → baris tanpa input (INV-30). */
  boleh_tulis: boolean;
  sections: SectionRab[];
}

const rupiah = (label: string) =>
  z
    .number({ error: `${label} harus angka.` })
    .finite()
    .min(0, `${label} tidak boleh negatif.`)
    .max(MAKS_RUPIAH, `${label} terlalu besar.`)
    .transform((n) => Math.round(n));

/** Perubahan satu item dari grid. Semua opsional — PATCH sebagian. */
export const SkemaUbahItem = z
  .object({
    jenis_barang: z.string().trim().max(200, 'Jenis barang maksimal 200 karakter.'),
    jumlah_teks: z.string().max(100, 'Jumlah maksimal 100 karakter.'),
    /** Hanya dipakai bila parser meminta isian manual. */
    jumlah_numerik: z.number().finite().min(0, 'Jumlah tidak boleh negatif.').max(10_000_000).nullable(),
    harga_satuan: rupiah('Harga satuan'),
    total_manual: z.boolean(),
    /** Hanya dipakai bila total_manual. */
    total: rupiah('Total'),
    keterangan: z.string().trim().max(500, 'Keterangan maksimal 500 karakter.').nullable(),
    /**
     * Total menurut hitungan klien — TIDAK disimpan. Server menghitung ulang
     * (INV-27) dan melaporkan selisihnya; nilai server yang menang.
     */
    total_klien: z.number().finite(),
  })
  .partial()
  .strict();
export type UbahItem = z.infer<typeof SkemaUbahItem>;

/** Total satu item — lib/rab/calculate.ts. */
export const totalItem = hitungTotalItem;

/**
 * Menerapkan perubahan ke item — dipakai klien (optimistis) dan server
 * (kebenaran). `jumlah_numerik` kiriman hanya dihormati bila teksnya memang
 * butuh isian manual; selain itu angka parser yang menang.
 */
export function terapkanUbah(lama: ItemRab, u: UbahItem): ItemRab {
  const teks = u.jumlah_teks !== undefined ? u.jumlah_teks.trim() : lama.jumlah_teks;
  const parsed = parseJumlah(teks);
  let numerik: number | null;
  if (!parsed.butuhInputManual) numerik = parsed.numerik;
  else if (u.jumlah_numerik !== undefined) numerik = u.jumlah_numerik;
  else if (u.jumlah_teks !== undefined && teks !== lama.jumlah_teks) numerik = parsed.numerik; // perkiraan, tetap ditandai
  else numerik = lama.jumlah_numerik;

  const baru: ItemRab = {
    ...lama,
    jenis_barang: u.jenis_barang ?? lama.jenis_barang,
    jumlah_teks: teks,
    jumlah_numerik: bulatkanJumlah(numerik),
    harga_satuan: u.harga_satuan ?? lama.harga_satuan,
    total_manual: u.total_manual ?? lama.total_manual,
    total: u.total ?? lama.total,
    keterangan: u.keterangan !== undefined ? u.keterangan || null : lama.keterangan,
  };
  return { ...baru, total: totalItem(baru) };
}

export const jumlahkanSection = (s: SectionRab) => s.items.reduce((x, i) => x + totalItem(i), 0);
export const jumlahkanDivisi = (d: DivisiRab) => hitungRab([d]).totalDivisi;
/** Total seluruh divisi, TANPA dana tak terduga. */
export const jumlahkanAcara = (list: readonly DivisiRab[]) => hitungRab(list).totalDivisi;
