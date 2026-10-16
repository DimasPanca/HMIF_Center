/**
 * Skema Proposal kegiatan (T-096, PRD F-10.2) — dipakai editor dan server (K-04).
 *
 * Delapan bagian. Yang DISIMPAN di `proposal.data` hanya isian yang memang
 * diketik/diedit (16 field). Yang DITARIK, tidak pernah disimpan:
 *   sampul (tahun) · Ketua Pelaksana & Ketua Himpunan pada lembar pengesahan ·
 *   5 Susunan Kepanitiaan (divisi/divisi_member) · 6 Anggaran (RAB) ·
 *   8 Lampiran (rundown + rincian RAB).
 *
 * `asal` menandai field yang diisi otomatis (prefill) dan belum disunting
 * pengguna; field itu ditandai "diisi otomatis dari …" di editor dan ikut
 * diperbarui bila sumbernya berubah. Menyunting field menghapus tandanya.
 *
 * Sumber: docs/ai/tasks/P6-tor-proposal.md T-096 · PRD F-10.2 · TEMPLATE_MAPPING §5.10
 */

import { z } from 'zod';

import type { NodeProseMirror } from '@/lib/notulensi/sanitasi';
import { DOK_KOSONG, SkemaTeksKaya, SkemaWaktuTempat, adaTeks } from '@/lib/tor/schema';

export const MAKS_JSON_PROPOSAL = 400_000;
const MAKS_BARIS = 50;

const teks = (maks: number) => z.string().trim().max(maks, `Maksimal ${maks} karakter.`);

export const ASAL = ['TOR', 'PROKER', 'PANITIA', 'PROPOSAL_LAIN'] as const;
export type Asal = (typeof ASAL)[number];

export const LABEL_ASAL: Record<Asal, string> = {
  TOR: 'Diisi otomatis dari TOR',
  PROKER: 'Diisi otomatis dari data proker',
  PANITIA: 'Diisi otomatis dari data panitia',
  PROPOSAL_LAIN: 'Diisi otomatis dari proposal lain periode ini',
};

const SkemaOrang = z.strictObject({ nama: teks(150), nomor: teks(30) });
export type Orang = z.infer<typeof SkemaOrang>;

/** 16 field yang dapat disunting, berurutan sesuai dokumen. */
export const FIELD_PROPOSAL = [
  { id: 'nama_kegiatan', judul: 'Nama kegiatan', bagian: 1 },
  { id: 'sekretaris', judul: 'Sekretaris', bagian: 2 },
  { id: 'ketua_bem', judul: 'Ketua BEM FT', bagian: 2 },
  { id: 'wd3', judul: 'Wakil Dekan Bidang III', bagian: 2 },
  { id: 'kaprodi', judul: 'Ketua Program Studi', bagian: 2 },
  { id: 'latar_belakang', judul: 'Latar belakang', bagian: 3 },
  { id: 'landasan_kegiatan', judul: 'Landasan kegiatan', bagian: 3 },
  { id: 'asas', judul: 'Asas pelaksanaan', bagian: 3 },
  { id: 'tujuan', judul: 'Tujuan kegiatan', bagian: 3 },
  { id: 'sasaran', judul: 'Sasaran kegiatan', bagian: 4 },
  { id: 'bentuk_acara', judul: 'Bentuk acara', bagian: 4 },
  { id: 'sesi', judul: 'Waktu & tempat', bagian: 4 },
  { id: 'pengisi', judul: 'Pengisi acara', bagian: 4 },
  { id: 'gambaran_umum', judul: 'Gambaran umum', bagian: 4 },
  { id: 'rangkaian', judul: 'Rangkaian acara', bagian: 4 },
  { id: 'penutup', judul: 'Penutup', bagian: 7 },
] as const;
export type IdFieldProposal = (typeof FIELD_PROPOSAL)[number]['id'];

export const BAGIAN_PROPOSAL = [
  { no: 1, id: 'sampul', judul: 'Halaman Sampul' },
  { no: 2, id: 'pengesahan', judul: 'Lembar Pengesahan' },
  { no: 3, id: 'pendahuluan', judul: 'Pendahuluan' },
  { no: 4, id: 'realisasi', judul: 'Realisasi Kegiatan' },
  { no: 5, id: 'kepanitiaan', judul: 'Susunan Kepanitiaan' },
  { no: 6, id: 'anggaran', judul: 'Anggaran' },
  { no: 7, id: 'penutup', judul: 'Penutup' },
  { no: 8, id: 'lampiran', judul: 'Lampiran' },
] as const;

const ENUM_FIELD = z.enum(
  FIELD_PROPOSAL.map((f) => f.id) as [IdFieldProposal, ...IdFieldProposal[]],
);

export const SkemaDataProposal = z.strictObject({
  nama_kegiatan: teks(200),
  sekretaris: SkemaOrang,
  ketua_bem: SkemaOrang,
  wd3: SkemaOrang,
  kaprodi: SkemaOrang,
  latar_belakang: SkemaTeksKaya,
  landasan_kegiatan: SkemaTeksKaya,
  asas: z.array(teks(500)).max(MAKS_BARIS),
  tujuan: z.array(teks(500)).max(MAKS_BARIS),
  sasaran: SkemaTeksKaya,
  bentuk_acara: SkemaTeksKaya,
  sesi: z.array(SkemaWaktuTempat).max(MAKS_BARIS),
  pengisi: z.array(z.strictObject({ peran: teks(120), nama: teks(200) })).max(MAKS_BARIS),
  gambaran_umum: SkemaTeksKaya,
  rangkaian: z.array(z.strictObject({ nama: teks(200), uraian: teks(4000) })).max(MAKS_BARIS),
  penutup: SkemaTeksKaya,
  asal: z.partialRecord(ENUM_FIELD, z.enum(ASAL)),
  /** Field yang pernah disunting pengguna — prefill tidak pernah menyentuhnya lagi, termasuk bila dikosongkan. */
  manual: z.array(ENUM_FIELD).max(FIELD_PROPOSAL.length),
});
export type DataProposal = z.infer<typeof SkemaDataProposal>;

const ORANG_KOSONG: Orang = { nama: '', nomor: '' };

export function proposalKosong(): DataProposal {
  return {
    nama_kegiatan: '',
    sekretaris: ORANG_KOSONG,
    ketua_bem: ORANG_KOSONG,
    wd3: ORANG_KOSONG,
    kaprodi: ORANG_KOSONG,
    latar_belakang: DOK_KOSONG,
    landasan_kegiatan: DOK_KOSONG,
    asas: [],
    tujuan: [],
    sasaran: DOK_KOSONG,
    bentuk_acara: DOK_KOSONG,
    sesi: [],
    pengisi: [],
    gambaran_umum: DOK_KOSONG,
    rangkaian: [],
    penutup: DOK_KOSONG,
    asal: {},
    manual: [],
  };
}

/** Membaca proposal.data dari DB tanpa melempar: kolom rusak → kosong. */
export function normalisasiProposal(mentah: unknown): DataProposal {
  const dasar = proposalKosong();
  if (typeof mentah !== 'object' || mentah === null) return dasar;
  const gabung: Record<string, unknown> = { ...dasar };
  for (const [k, v] of Object.entries(mentah as Record<string, unknown>)) {
    if (!(k in dasar)) continue;
    if (SkemaDataProposal.shape[k as keyof DataProposal].safeParse(v).success) gabung[k] = v;
  }
  return gabung as DataProposal;
}

// ---------------------------------------------------------------------------
// Terisi / kelengkapan
// ---------------------------------------------------------------------------

const ada = (s: string) => s.trim().length > 0;

export function fieldTerisi(d: DataProposal, id: IdFieldProposal): boolean {
  const v = d[id];
  if (typeof v === 'string') return ada(v);
  if (Array.isArray(v)) {
    return (v as unknown[]).some((x) =>
      typeof x === 'string'
        ? ada(x)
        : Object.values(x as Record<string, unknown>).some((y) => typeof y === 'string' && ada(y)),
    );
  }
  if ((v as NodeProseMirror).type === 'doc') return adaTeks(v as NodeProseMirror);
  return ada((v as Orang).nama);
}

/**
 * Bagian dokumen yang ditarik dari data acara/RAB (bukan field proposal).
 * Dihitung terisi otomatis bila datanya benar-benar ada.
 */
export interface FaktaTarikan {
  tahun: boolean;
  ketua_pelaksana: boolean;
  ketua_himpunan: boolean;
  susunan_kepanitiaan: boolean;
  anggaran: boolean;
  rincian_rab: boolean;
  rundown: boolean;
}

export interface UkuranPrefill {
  total: number;
  terisi: number;
  /** Field yang terisi tanpa diketik: prefill bertanda `asal` + tarikan. */
  otomatis: number;
  persen_otomatis: number;
  dari_sumber: number;
  dari_tarikan: number;
}

/** Kontrak 2: "ukur dan tampilkan persentasenya" — 16 field + 7 tarikan = 23. */
export function ukurPrefill(d: DataProposal, t: FaktaTarikan): UkuranPrefill {
  const tarikan = Object.values(t).filter(Boolean).length;
  const terisiField = FIELD_PROPOSAL.filter((f) => fieldTerisi(d, f.id));
  const dariSumber = terisiField.filter((f) => d.asal[f.id]).length;
  const total = FIELD_PROPOSAL.length + Object.keys(t).length;
  const otomatis = dariSumber + tarikan;
  return {
    total,
    terisi: terisiField.length + tarikan,
    otomatis,
    persen_otomatis: Math.round((otomatis / total) * 100),
    dari_sumber: dariSumber,
    dari_tarikan: tarikan,
  };
}

/** Field wajib sebelum generate — lembar pengesahan & isi utama; pengisi/asas opsional. */
export const FIELD_WAJIB_PROPOSAL: IdFieldProposal[] = [
  'nama_kegiatan',
  'sekretaris',
  'ketua_bem',
  'wd3',
  'kaprodi',
  'latar_belakang',
  'landasan_kegiatan',
  'tujuan',
  'sasaran',
  'bentuk_acara',
  'sesi',
  'gambaran_umum',
  'penutup',
];

export function kurangProposal(d: DataProposal): string[] {
  return FIELD_WAJIB_PROPOSAL.filter((id) => !fieldTerisi(d, id)).map(
    (id) => FIELD_PROPOSAL.find((f) => f.id === id)!.judul,
  );
}
