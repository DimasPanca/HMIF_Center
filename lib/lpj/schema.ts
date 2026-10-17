/**
 * Isian manual LPJ (T-105) — disimpan di `lpj.data_manual`; dipakai editor & server (K-04).
 *
 * Bagian OTOMATIS (identitas, kepanitiaan, laporan keuangan, rincian
 * pemasukan/pengeluaran, perbandingan RAB vs aktual, sisa dana, lampiran nota)
 * TIDAK ada di sini — ditarik dari data dan dibekukan di `lpj.analisis` saat
 * generate. Yang di sini hanya yang memang diketik manusia, mengikuti
 * placeholder templates/lpj.docx (TEMPLATE_MAPPING §5.11).
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-105 · PRD F-12.1
 */

import { z } from 'zod';

const teks = (maks: number) => z.string().trim().max(maks, `Maksimal ${maks} karakter.`);
const orang = z.strictObject({ nama: teks(150), nomor: teks(30) });

export const SkemaNarasiDivisi = z.strictObject({
  narasi: teks(4000),
  perencanaan: teks(4000),
  pelaksanaan: teks(4000),
  pendukung: teks(2000),
  penghambat: teks(2000),
  saran: teks(2000),
});
export type NarasiDivisi = z.infer<typeof SkemaNarasiDivisi>;

export const SkemaDataManualLpj = z.strictObject({
  pendahuluan: teks(8000),
  target_peserta: teks(2000),
  waktu: z.strictObject({ hari_tanggal: teks(200), waktu: teks(100), tempat: teks(200) }),
  proses_perencanaan: teks(8000),
  pelaksanaan_kegiatan: teks(8000),
  output: teks(4000),
  penutup: teks(4000),
  /** Per id divisi. Divisi tanpa entri → narasi kosong ("-"). */
  narasi: z.record(z.uuid(), SkemaNarasiDivisi),
  catatan_materi: teks(2000),
  materi: z
    .array(z.strictObject({ judul: teks(300), pengisi: teks(200), tautan: teks(500) }))
    .max(50),
  daftar_hadir: teks(4000),
  /** Foto kegiatan — gambar hasil /api/images/upload milik pengisi. */
  dokumentasi: z.array(z.strictObject({ image_id: z.uuid(), caption: teks(300) })).max(30),
  /** Pihak fakultas tanpa akun (TEMPLATE_MAPPING Temuan 4). */
  pejabat: z.strictObject({ kaprodi: orang, wd3: orang }),
  /** Catatan terakhir saat LPJ dikembalikan ke DRAFT — hanya dibaca. */
  catatan_pengembalian: teks(500).nullable(),
});
export type DataManualLpj = z.infer<typeof SkemaDataManualLpj>;

export const NARASI_KOSONG: NarasiDivisi = {
  narasi: '',
  perencanaan: '',
  pelaksanaan: '',
  pendukung: '',
  penghambat: '',
  saran: '',
};

export function manualKosong(): DataManualLpj {
  return {
    pendahuluan: '',
    target_peserta: '',
    waktu: { hari_tanggal: '', waktu: '', tempat: '' },
    proses_perencanaan: '',
    pelaksanaan_kegiatan: '',
    output: '',
    penutup: '',
    narasi: {},
    catatan_materi: '',
    materi: [],
    daftar_hadir: '',
    dokumentasi: [],
    pejabat: { kaprodi: { nama: '', nomor: '' }, wd3: { nama: '', nomor: '' } },
    catatan_pengembalian: null,
  };
}

/** Membaca `data_manual` dari DB tanpa melempar: kolom rusak → kosong. */
export function normalisasiManual(mentah: unknown): DataManualLpj {
  const dasar = manualKosong();
  if (typeof mentah !== 'object' || mentah === null) return dasar;
  const gabung: Record<string, unknown> = { ...dasar };
  for (const [k, v] of Object.entries(mentah as Record<string, unknown>)) {
    if (k in dasar && SkemaDataManualLpj.shape[k as keyof DataManualLpj].safeParse(v).success)
      gabung[k] = v;
  }
  return gabung as DataManualLpj;
}

// ---------------------------------------------------------------------------
// Prasyarat (kontrak 1) & kelengkapan
// ---------------------------------------------------------------------------

export interface FaktaPrasyarat {
  notaTerverifikasi: number;
  statusRab: string | null;
  torAda: boolean;
  proposalAda: boolean;
  dokumentasi: number;
}

export interface ButirPrasyarat {
  id: 'nota' | 'rab' | 'tor' | 'proposal' | 'dokumentasi';
  label: string;
  wajib: boolean;
  terpenuhi: boolean;
  keterangan: string;
}

export function prasyaratLpj(f: FaktaPrasyarat): ButirPrasyarat[] {
  return [
    {
      id: 'nota',
      label: 'Minimal 1 nota terverifikasi',
      wajib: true,
      terpenuhi: f.notaTerverifikasi > 0,
      keterangan: `${f.notaTerverifikasi} nota terverifikasi`,
    },
    {
      id: 'rab',
      label: 'RAB berstatus REALISASI atau SELESAI',
      wajib: true,
      terpenuhi: f.statusRab === 'REALISASI' || f.statusRab === 'SELESAI',
      keterangan: `Status RAB: ${f.statusRab ?? 'belum ada'}`,
    },
    {
      id: 'tor',
      label: 'TOR tersusun',
      wajib: false,
      terpenuhi: f.torAda,
      keterangan: f.torAda ? 'Ada' : 'Belum ada (opsional)',
    },
    {
      id: 'proposal',
      label: 'Proposal tersusun',
      wajib: false,
      terpenuhi: f.proposalAda,
      keterangan: f.proposalAda ? 'Ada' : 'Belum ada (opsional)',
    },
    {
      id: 'dokumentasi',
      label: 'Dokumentasi kegiatan terunggah',
      wajib: true,
      terpenuhi: f.dokumentasi > 0,
      keterangan: `${f.dokumentasi} foto`,
    },
  ];
}

/** Isian manual wajib sebelum generate — dokumen bolong ditolak. */
export function kurangManual(d: DataManualLpj): string[] {
  const kurang: string[] = [];
  const ada = (s: string) => s.trim().length > 0;
  if (!ada(d.pendahuluan)) kurang.push('Pendahuluan');
  if (!ada(d.pelaksanaan_kegiatan)) kurang.push('Pelaksanaan kegiatan');
  if (!ada(d.penutup)) kurang.push('Penutup');
  if (!ada(d.waktu.hari_tanggal) || !ada(d.waktu.tempat)) kurang.push('Waktu & tempat pelaksanaan');
  if (!ada(d.pejabat.kaprodi.nama)) kurang.push('Ketua Program Studi (lembar pengesahan)');
  if (!ada(d.pejabat.wd3.nama)) kurang.push('Wakil Dekan III (lembar pengesahan)');
  return kurang;
}
