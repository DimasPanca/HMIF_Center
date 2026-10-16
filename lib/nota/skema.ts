/**
 * Skema nota (T-101, PRD F-11.1) — dipakai form upload (klien) dan server (K-04).
 *
 * Uang = rupiah bulat (sama dengan RAB, lib/rab/item.ts). Satu nota →
 * beberapa alokasi; setiap alokasi menunjuk SATU item RAB divisi itu, atau
 * "pengeluaran di luar RAB" dengan uraian wajib (ADR-006). Satu item RAB hanya
 * sekali per nota (indeks unik parsial migrasi 008).
 *
 * Kesamaan total alokasi = total nota (INV-28, ADR-007) diperiksa di sini
 * (`selisihAlokasi`) dan di service saat submit; trigger DB hanya menjaga batas atas.
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-101 · ADR-006 · ADR-007
 */

import { z } from 'zod';

export const MAKS_RUPIAH_NOTA = 999_999_999_999;
export const MAKS_ALOKASI = 30;

const rupiah = (label: string) =>
  z
    .number({ error: `${label} harus angka.` })
    .int(`${label} harus rupiah bulat.`)
    .positive(`${label} harus lebih dari 0.`)
    .max(MAKS_RUPIAH_NOTA, `${label} terlalu besar.`);

export const SkemaAlokasi = z
  .strictObject({
    rab_item_id: z.uuid('Item RAB tidak valid.').nullable(),
    uraian_luar_rab: z.string().trim().max(300, 'Uraian maksimal 300 karakter.').nullable(),
    jumlah_aktual: z
      .number({ error: 'Jumlah aktual harus angka.' })
      .positive('Jumlah aktual harus lebih dari 0.')
      .max(1_000_000)
      .nullable(),
    harga_aktual: z
      .number({ error: 'Harga aktual harus angka.' })
      .int('Harga aktual harus rupiah bulat.')
      .min(0, 'Harga aktual tidak boleh negatif.')
      .max(MAKS_RUPIAH_NOTA)
      .nullable(),
    nominal: rupiah('Nominal alokasi'),
  })
  .refine(
    (a) => (a.rab_item_id === null) !== (a.uraian_luar_rab === null || a.uraian_luar_rab === ''),
    {
      message: 'Pilih item RAB, atau isi uraian untuk pengeluaran di luar RAB.',
      path: ['rab_item_id'],
    },
  );
export type Alokasi = z.infer<typeof SkemaAlokasi>;

const tanggal = z.iso.date('Tanggal belanja tidak valid.');

export const SkemaNota = z
  .strictObject({
    divisi_id: z.uuid('Divisi tidak valid.'),
    image_id: z.uuid('Gambar nota belum diunggah.'),
    tanggal_belanja: tanggal,
    total_nota: rupiah('Total nota'),
    keterangan: z.string().trim().max(500, 'Keterangan maksimal 500 karakter.').nullable(),
    alokasi: z
      .array(SkemaAlokasi)
      .min(1, 'Nota wajib dikaitkan ke item RAB atau uraian luar RAB.')
      .max(MAKS_ALOKASI),
  })
  .refine(
    (n) =>
      new Set(n.alokasi.filter((a) => a.rab_item_id).map((a) => a.rab_item_id)).size ===
      n.alokasi.filter((a) => a.rab_item_id).length,
    {
      message: 'Satu item RAB hanya boleh dialokasikan sekali per nota.',
      path: ['alokasi'],
    },
  );
export type IsianNota = z.infer<typeof SkemaNota>;

/** Total alokasi − total nota. 0 = seimbang; negatif = masih ada sisa untuk dialokasikan. */
export function selisihAlokasi(
  totalNota: number,
  alokasi: readonly { nominal: number | null }[],
): number {
  return alokasi.reduce((s, a) => s + (a.nominal ?? 0), 0) - totalNota;
}

/** Kalimat selisih untuk pengguna; null bila seimbang. */
export function pesanSelisih(
  totalNota: number,
  alokasi: readonly { nominal: number | null }[],
  format: (n: number) => string,
): string | null {
  const s = selisihAlokasi(totalNota, alokasi);
  if (s === 0) return null;
  const total = alokasi.reduce((x, a) => x + (a.nominal ?? 0), 0);
  return `Alokasi ${format(total)} ≠ total nota ${format(totalNota)} — ${s < 0 ? 'kurang' : 'lebih'} ${format(Math.abs(s))}.`;
}

/** Tanggal belanja tidak boleh di masa depan (zona Jakarta, dibandingkan sebagai YYYY-MM-DD). */
export function tanggalMasaDepan(tanggalBelanja: string, hariIni: string): boolean {
  return tanggalBelanja > hariIni;
}
