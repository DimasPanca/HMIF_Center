/**
 * Skema TOR (T-094, PRD F-10.1) — dipakai editor (klien) DAN server (K-04).
 *
 * Empat belas bagian, tetapi hanya sebagian yang disimpan di `tor.data`:
 *
 *   disimpan      1 Nama · 2 Tema · 3 Gambaran Umum · 4 Tujuan · 5 Bentuk Acara ·
 *                 6 Waktu & Tempat · 7 Sasaran · 8 Kondisi · 9 Parameter ·
 *                 10 Rangkaian · 13 Penutup
 *   tabel sendiri 11 Rundown → tabel `rundown` (satu sumber: TOR, Proposal,
 *                 Surat Undangan — migrasi 012). TIDAK disalin ke tor.data.
 *   ditarik       12 Anggaran ← RAB (selalu dihitung ulang, tidak disalin) ·
 *                 14 Penandatangan ← Ketua Pelaksana acara + Ketua Himpunan periode.
 *
 * Skema sengaja longgar terhadap KELENGKAPAN (draf boleh setengah jadi —
 * auto-save tiap 10 detik) tetapi ketat terhadap BENTUK dan PANJANG. Kelengkapan
 * dinilai terpisah oleh `kelengkapanTor`, yang juga dipakai generator T-095
 * untuk menolak dokumen bolong.
 *
 * Teks kaya = JSON ProseMirror; disanitasi allowlist di server sebelum simpan.
 *
 * Sumber: docs/ai/tasks/P6-tor-proposal.md T-094 · PRD F-10.1 · migrasi 012
 */

import { z } from 'zod';

import type { NodeProseMirror } from '@/lib/notulensi/sanitasi';

export const MAKS_JSON_TOR = 400_000;
export const MAKS_BARIS = 50;
export const MAKS_BARIS_RUNDOWN = 200;

const teks = (maks: number) => z.string().trim().max(maks, `Maksimal ${maks} karakter.`);

/** Dokumen ProseMirror — bentuk saja; isinya disaring `sanitasiKonten` di server. */
export const SkemaTeksKaya = z.custom<NodeProseMirror>(
  (v) => typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'doc',
  'Teks kaya tidak valid.',
);

export const DOK_KOSONG: NodeProseMirror = { type: 'doc', content: [{ type: 'paragraph' }] };

const angkaOpsional = (label: string, maks: number) =>
  z
    .number({ error: `${label} harus angka.` })
    .int(`${label} harus bilangan bulat.`)
    .min(0, `${label} tidak boleh negatif.`)
    .max(maks, `${label} terlalu besar.`)
    .nullable();

export const SkemaWaktuTempat = z.strictObject({
  sesi: teks(120),
  /** YYYY-MM-DD atau kosong (draf). */
  tanggal: z.union([z.literal(''), z.iso.date('Tanggal tidak valid.')]),
  waktu: teks(60),
  tempat: teks(200),
});

export const SkemaKondisi = z.strictObject({ sesi: teks(120), ketentuan: teks(2000) });

export const SkemaParameter = z.strictObject({
  kriteria: teks(200),
  bobot: z
    .number({ error: 'Bobot harus angka.' })
    .min(0, 'Bobot tidak boleh negatif.')
    .max(100, 'Bobot maksimal 100%.')
    .nullable(),
  kkm: z
    .number({ error: 'KKM harus angka.' })
    .min(0, 'KKM tidak boleh negatif.')
    .max(100, 'KKM maksimal 100.')
    .nullable(),
});

export const SkemaRangkaian = z.strictObject({ nama: teks(200), uraian: teks(4000) });

export const SkemaSubBentuk = z.strictObject({ judul: teks(200), uraian: teks(4000) });

export const SkemaDataTor = z.strictObject({
  nama_kegiatan: teks(200),
  tema: teks(300),
  gambaran_umum: SkemaTeksKaya,
  tujuan: z.array(teks(500)).max(MAKS_BARIS),
  bentuk_acara: z.strictObject({
    uraian: SkemaTeksKaya,
    sub: z.array(SkemaSubBentuk).max(MAKS_BARIS),
  }),
  waktu_tempat: z.array(SkemaWaktuTempat).max(MAKS_BARIS),
  sasaran: z.strictObject({
    uraian: SkemaTeksKaya,
    estimasi_jumlah: angkaOpsional('Estimasi jumlah peserta', 100_000),
    jumlah_kelompok: angkaOpsional('Jumlah kelompok', 10_000),
  }),
  kondisi: z.array(SkemaKondisi).max(MAKS_BARIS),
  parameter: z.array(SkemaParameter).max(MAKS_BARIS),
  rangkaian: z.array(SkemaRangkaian).max(MAKS_BARIS),
  penutup: SkemaTeksKaya,
});
export type DataTor = z.infer<typeof SkemaDataTor>;

/** Satu baris tabel `rundown`. `id` dibuat klien (UUID) supaya auto-save idempoten. */
export const SkemaBarisRundown = z
  .strictObject({
    id: z.uuid('ID baris tidak valid.'),
    tanggal: z.iso.date('Tanggal rundown wajib diisi.'),
    waktu_mulai: z.union([
      z.literal(''),
      z.iso.time({ precision: -1, error: 'Jam mulai tidak valid.' }),
    ]),
    waktu_selesai: z.union([
      z.literal(''),
      z.iso.time({ precision: -1, error: 'Jam selesai tidak valid.' }),
    ]),
    acara: teks(300).min(1, 'Nama acara rundown wajib diisi.'),
    keterangan: teks(300),
  })
  .refine((r) => !r.waktu_mulai || !r.waktu_selesai || r.waktu_selesai > r.waktu_mulai, {
    message: 'Jam selesai harus setelah jam mulai.',
    path: ['waktu_selesai'],
  });
export type BarisRundown = z.infer<typeof SkemaBarisRundown>;

/**
 * Isi PUT auto-save. `rundown` opsional: klien mengirimnya hanya bila SEMUA
 * barisnya valid — baris setengah jadi tidak boleh membuat baris lama terhapus.
 */
export const SkemaSimpanTor = z.strictObject({
  data: SkemaDataTor,
  rundown: z.array(SkemaBarisRundown).max(MAKS_BARIS_RUNDOWN).optional(),
});

export function torKosong(
  awal: { nama_kegiatan?: string | null; tema?: string | null } = {},
): DataTor {
  return {
    nama_kegiatan: awal.nama_kegiatan ?? '',
    tema: awal.tema ?? '',
    gambaran_umum: DOK_KOSONG,
    tujuan: [],
    bentuk_acara: { uraian: DOK_KOSONG, sub: [] },
    waktu_tempat: [],
    sasaran: { uraian: DOK_KOSONG, estimasi_jumlah: null, jumlah_kelompok: null },
    kondisi: [],
    parameter: [],
    rangkaian: [],
    penutup: DOK_KOSONG,
  };
}

/**
 * Membaca `tor.data` dari DB apa adanya: kolom yang hilang/rusak diganti
 * nilai kosong, bukan melempar — TOR lama tidak boleh membuat editor macet.
 */
export function normalisasiTor(
  mentah: unknown,
  awal: { nama_kegiatan?: string | null; tema?: string | null } = {},
): DataTor {
  const dasar = torKosong(awal);
  if (typeof mentah !== 'object' || mentah === null) return dasar;
  const gabung: Record<string, unknown> = { ...dasar };
  for (const [k, v] of Object.entries(mentah as Record<string, unknown>)) {
    if (!(k in dasar)) continue;
    const kolom = SkemaDataTor.shape[k as keyof DataTor];
    if (kolom.safeParse(v).success) gabung[k] = v;
  }
  return gabung as DataTor;
}

// ---------------------------------------------------------------------------
// Bobot parameter kelulusan (kontrak 4)
// ---------------------------------------------------------------------------

export function totalBobot(p: readonly { bobot: number | null }[]): number {
  // Pembulatan 2 desimal: 33,33 + 33,33 + 33,34 = 100 tepat, bukan 99,999….
  return Math.round(p.reduce((s, x) => s + (x.bobot ?? 0), 0) * 100) / 100;
}

/** null = tidak ada parameter atau total tepat 100%. Selain itu, kalimat peringatan. */
export function peringatanBobot(p: readonly { bobot: number | null }[]): string | null {
  if (!p.length) return null;
  const t = totalBobot(p);
  if (t === 100) return null;
  const selisih = Math.round(Math.abs(100 - t) * 100) / 100;
  return `Total bobot ${formatPersen(t)}% — ${t < 100 ? 'kurang' : 'lebih'} ${formatPersen(selisih)}% dari 100%.`;
}

const formatPersen = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Kelengkapan (kontrak 6) — juga syarat generate T-095
// ---------------------------------------------------------------------------

export const BAGIAN_TOR = [
  { no: 1, id: 'nama', judul: 'Nama Kegiatan' },
  { no: 2, id: 'tema', judul: 'Tema Kegiatan' },
  { no: 3, id: 'gambaran', judul: 'Gambaran Umum Kegiatan' },
  { no: 4, id: 'tujuan', judul: 'Tujuan Kegiatan' },
  { no: 5, id: 'bentuk', judul: 'Bentuk Acara' },
  { no: 6, id: 'waktu-tempat', judul: 'Waktu & Tempat Pelaksanaan' },
  { no: 7, id: 'sasaran', judul: 'Sasaran Peserta' },
  { no: 8, id: 'kondisi', judul: 'Kondisi Pelaksanaan' },
  { no: 9, id: 'parameter', judul: 'Parameter Kelulusan' },
  { no: 10, id: 'rangkaian', judul: 'Rangkaian Acara' },
  { no: 11, id: 'rundown', judul: 'Susunan Acara (Rundown)' },
  { no: 12, id: 'anggaran', judul: 'Anggaran' },
  { no: 13, id: 'penutup', judul: 'Penutup' },
  { no: 14, id: 'penandatangan', judul: 'Penandatangan' },
] as const;
export type IdBagianTor = (typeof BAGIAN_TOR)[number]['id'];

/** True bila dokumen ProseMirror memuat teks (atau butir checklist/tabel). */
export function adaTeks(n: NodeProseMirror | null | undefined): boolean {
  if (!n) return false;
  if (n.type === 'text') return !!(n.text ?? '').trim();
  if (n.type === 'taskItem' || n.type === 'table') return true;
  return (n.content ?? []).some(adaTeks);
}

const isi = (s: string) => s.trim().length > 0;

export interface FaktaLuarTor {
  /** Jumlah baris rundown tersimpan (atau sedang diedit dan valid). */
  rundown: number;
  /** RAB memuat minimal satu divisi dengan total > 0. */
  anggaran: boolean;
  /** Ketua Pelaksana acara DAN Ketua Himpunan periode diketahui. */
  penandatangan: boolean;
}

export function bagianTerisi(d: DataTor, luar: FaktaLuarTor): Record<IdBagianTor, boolean> {
  return {
    nama: isi(d.nama_kegiatan),
    tema: isi(d.tema),
    gambaran: adaTeks(d.gambaran_umum),
    tujuan: d.tujuan.some(isi),
    bentuk:
      adaTeks(d.bentuk_acara.uraian) ||
      d.bentuk_acara.sub.some((s) => isi(s.judul) || isi(s.uraian)),
    'waktu-tempat': d.waktu_tempat.some((w) => isi(w.sesi) && !!w.tanggal && isi(w.tempat)),
    sasaran: adaTeks(d.sasaran.uraian) || d.sasaran.estimasi_jumlah !== null,
    kondisi: d.kondisi.some((k) => isi(k.ketentuan)),
    parameter: d.parameter.some((p) => isi(p.kriteria) && p.bobot !== null),
    rangkaian: d.rangkaian.some((r) => isi(r.nama)),
    rundown: luar.rundown > 0,
    anggaran: luar.anggaran,
    penutup: adaTeks(d.penutup),
    penandatangan: luar.penandatangan,
  };
}

export function kelengkapanTor(
  d: DataTor,
  luar: FaktaLuarTor,
): { terisi: number; total: number; kurang: string[] } {
  const t = bagianTerisi(d, luar);
  const kurang = BAGIAN_TOR.filter((b) => !t[b.id]).map((b) => `${b.no}. ${b.judul}`);
  return { terisi: BAGIAN_TOR.length - kurang.length, total: BAGIAN_TOR.length, kurang };
}
