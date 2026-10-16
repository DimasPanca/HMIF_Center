/**
 * Skema PEMASUKAN & data peserta (T-092, PRD F-9.4) — satu skema untuk form,
 * server, dan import (K-04). Aman untuk klien.
 *
 *   sumber dana  baris `pemasukan` manual: Kas Himpunan, Sponsor, Dana Fakultas…
 *   peserta      No · Nama Lengkap · NIM · Status Bayar (BOOLEAN — kontrak
 *                "Jangan") · Tanggal Bayar · Jumlah
 *
 * `ringkasPeserta` adalah satu-satunya rumus ringkasan; panel klien dan server
 * memakainya, jadi angka ringkasan selalu = baris pesertanya.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-092 · PRD F-9.4 · RAB_CELL_MAP §3
 */

import { z } from 'zod';

import type { DefinisiKolom } from '@/lib/import/parse-tabel';

const MAKS_RUPIAH = 999_999_999_999;
const rupiah = (label: string) =>
  z
    .number({ error: `${label} harus angka.` })
    .finite()
    .min(0, `${label} tidak boleh negatif.`)
    .max(MAKS_RUPIAH, `${label} terlalu besar.`)
    .transform((n) => Math.round(n));

const teks = (label: string, maks: number) =>
  z.string({ error: `${label} wajib diisi.` }).trim().min(1, `${label} wajib diisi.`).max(maks, `${label} maksimal ${maks} karakter.`);

export const SkemaSumberDana = z.object({
  keterangan: teks('Keterangan', 200),
  saldo: rupiah('Saldo'),
});
export type InputSumberDana = z.infer<typeof SkemaSumberDana>;

export const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export const SkemaPeserta = z
  .object({
    nama_lengkap: teks('Nama lengkap', 150),
    nim: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v ? v.replace(/\s+/g, '') : null))
      .refine((v) => v === null || /^\d{6,20}$/.test(v), 'NIM hanya angka, 6–20 digit.'),
    sudah_bayar: z.boolean({ error: 'Status bayar harus ya/tidak.' }).default(false),
    tanggal_bayar: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (POLA_TANGGAL.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))), 'Tanggal bayar tidak valid.'),
    jumlah: rupiah('Jumlah').default(0),
  })
  // Tanggal bayar tanpa status bayar = data yang saling bertentangan; ringkasan tak bisa memilih.
  .refine((p) => p.sudah_bayar || p.tanggal_bayar === null, { message: 'Tanggal bayar diisi, tetapi status masih belum bayar.', path: ['tanggal_bayar'] });
export type InputPeserta = z.infer<typeof SkemaPeserta>;

export interface BarisPeserta {
  id: string;
  no_urut: number;
  nama_lengkap: string;
  nim: string | null;
  sudah_bayar: boolean;
  tanggal_bayar: string | null;
  jumlah: number;
}

export interface BarisSumberDana {
  id: string;
  no_urut: number;
  keterangan: string;
  saldo: number;
}

export interface RingkasPeserta {
  total: number;
  sudahBayar: number;
  belumBayar: number;
  /** Jumlah uang dari peserta yang SUDAH bayar. */
  terkumpul: number;
}

export function ringkasPeserta(rows: readonly Pick<BarisPeserta, 'sudah_bayar' | 'jumlah'>[]): RingkasPeserta {
  const sudah = rows.filter((p) => p.sudah_bayar);
  return {
    total: rows.length,
    sudahBayar: sudah.length,
    belumBayar: rows.length - sudah.length,
    terkumpul: sudah.reduce((x, p) => x + p.jumlah, 0),
  };
}

/** Total pemasukan acara = terkumpul dari peserta + seluruh sumber dana lain (saldo awal PENGELUARAN, analisis LPJ). */
export const totalPemasukan = (r: RingkasPeserta, sumber: readonly Pick<BarisSumberDana, 'saldo'>[]) => r.terkumpul + sumber.reduce((x, s) => x + s.saldo, 0);

// ---------------------------------------------------------------------------
// Import massal peserta (parse-tabel, T-048)
// ---------------------------------------------------------------------------

export const KOLOM_IMPORT_PESERTA: DefinisiKolom[] = [
  { kunci: 'nama_lengkap', label: 'Nama Lengkap', alias: ['nama', 'nama peserta', 'nama mahasiswa'], wajib: true },
  { kunci: 'nim', label: 'NIM', alias: ['npm', 'nomor induk mahasiswa'] },
  { kunci: 'bayar', label: 'Status Bayar', alias: ['bayar', 'status', 'lunas', 'sudah bayar', 'status pembayaran'] },
  { kunci: 'tanggal', label: 'Tanggal Bayar', alias: ['tgl bayar', 'tanggal', 'tgl'] },
  { kunci: 'jumlah', label: 'Jumlah', alias: ['nominal', 'jumlah bayar', 'biaya'] },
];

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const YA = new Set(['ya', 'y', 'sudah', 'lunas', 'true', '1', 'v', '✓', 'x', 'bayar', 'sudah bayar']);
const TIDAK = new Set(['', 'tidak', 't', 'belum', 'false', '0', 'belum bayar', '-']);

/** "22/11/2025", "22-11-2025", "2025-11-22" → YYYY-MM-DD. */
function keTanggal(s: string): string | null | undefined {
  const t = s.trim();
  if (!t) return null;
  if (POLA_TANGGAL.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return undefined;
  const [, d, b, y] = m;
  return `${y}-${b!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

/** "Rp150.000", "150000", "150.000" → 150000. */
function keRupiah(s: string): number | undefined {
  const t = s.trim().replace(/^rp\.?\s*/i, '').replace(/\s/g, '');
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Math.round(Number(t.replace(/\./g, '').replace(',', '.')));
  return undefined;
}

/** Skema satu baris berkas import: teks mentah → InputPeserta. */
export function skemaBarisPeserta() {
  return z
    .object({ nama_lengkap: z.string(), nim: z.string(), bayar: z.string(), tanggal: z.string(), jumlah: z.string() })
    .transform((m, ctx): z.input<typeof SkemaPeserta> => {
      const b = normal(m.bayar);
      if (!YA.has(b) && !TIDAK.has(b)) {
        ctx.addIssue({ code: 'custom', path: ['bayar'], message: `Status bayar "${m.bayar}" tidak dikenali (Ya/Belum).` });
        return z.NEVER;
      }
      const tanggal = keTanggal(m.tanggal);
      if (tanggal === undefined) {
        ctx.addIssue({ code: 'custom', path: ['tanggal'], message: `Tanggal "${m.tanggal}" tidak dikenali (pakai 22/11/2025).` });
        return z.NEVER;
      }
      const jumlah = keRupiah(m.jumlah);
      if (jumlah === undefined) {
        ctx.addIssue({ code: 'custom', path: ['jumlah'], message: `Jumlah "${m.jumlah}" bukan nominal rupiah.` });
        return z.NEVER;
      }
      return { nama_lengkap: m.nama_lengkap, nim: m.nim, sudah_bayar: YA.has(b), tanggal_bayar: tanggal, jumlah };
    })
    .pipe(SkemaPeserta);
}
