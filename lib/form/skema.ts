/**
 * skema — struktur form (bagian + pertanyaan) dan metadatanya. MURNI & aman
 * untuk klien: dipakai editor (validasi saat mengetik) DAN server (K-04).
 *
 * Satu struktur dipakai tiga tempat: isi `form_template.isi`, badan PUT editor,
 * dan bentuk yang dirender halaman isi `/f/{token}`.
 *
 * Sumber: ADR-038 · docs/ai/FORM_CONTRACT.md §1–3
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Kategori — "Untuk apa form ini?" (wajib dipilih)
// ---------------------------------------------------------------------------

export const KATEGORI = ['PENDAFTARAN', 'EVALUASI', 'OPEN_RECRUITMENT', 'PENDATAAN_PENGURUS', 'LAINNYA'] as const;
export type Kategori = (typeof KATEGORI)[number];

export const INFO_KATEGORI: Record<
  Kategori,
  { label: string; penjelasan: string; acara: 'wajib' | 'tidak' | 'opsional'; contoh: string }
> = {
  PENDAFTARAN: {
    label: 'Pendaftaran Peserta',
    penjelasan: 'Calon peserta mendaftar ke acara. Setiap pendaftar otomatis masuk daftar Peserta acara (untuk RAB pemasukan).',
    acara: 'wajib',
    contoh: 'Pendaftaran Seminar Nasional',
  },
  EVALUASI: {
    label: 'Evaluasi Acara',
    penjelasan: 'Umpan balik peserta setelah acara. Ringkasan nilainya tampil di halaman acara.',
    acara: 'wajib',
    contoh: 'Evaluasi SYNCHRONIZE 2026',
  },
  OPEN_RECRUITMENT: {
    label: 'Open Recruitment',
    penjelasan: 'Pendaftaran calon pengurus. Setiap pendaftar bisa ditandai Lolos atau Tidak lolos saat seleksi.',
    acara: 'tidak',
    contoh: 'Open Recruitment Pengurus 2027',
  },
  PENDATAAN_PENGURUS: {
    label: 'Pendataan Pengurus',
    penjelasan: 'Pengurus mengisi data dirinya. Sekum meninjau lalu menerapkannya ke Data Pengurus.',
    acara: 'tidak',
    contoh: 'Pendataan Pengurus Periode 2026/2027',
  },
  LAINNYA: {
    label: 'Lainnya',
    penjelasan: 'Form umum di luar kategori di atas, boleh untuk acara tertentu atau tidak.',
    acara: 'opsional',
    contoh: 'Survei minat pelatihan',
  },
};

// ---------------------------------------------------------------------------
// Tipe pertanyaan
// ---------------------------------------------------------------------------

export const TIPE = [
  'TEKS_SINGKAT',
  'PARAGRAF',
  'PILIHAN_GANDA',
  'KOTAK_CENTANG',
  'DROPDOWN',
  'SKALA',
  'KISI_PILIHAN',
  'KISI_CENTANG',
  'TANGGAL',
  'WAKTU',
  'EMAIL',
  'ANGKA',
  'UNGGAH_BERKAS',
] as const;
export type Tipe = (typeof TIPE)[number];

/** Label & kalimat bantu yang tampil di pemilih tipe (bahasa pengguna, bukan istilah teknis). */
export const INFO_TIPE: Record<Tipe, { label: string; bantuan: string; kelompok: 'Teks' | 'Pilihan' | 'Nilai' | 'Lainnya' }> = {
  TEKS_SINGKAT: { label: 'Jawaban singkat', bantuan: 'Satu baris, mis. nama atau NIM', kelompok: 'Teks' },
  PARAGRAF: { label: 'Paragraf', bantuan: 'Jawaban panjang, mis. saran atau motivasi', kelompok: 'Teks' },
  EMAIL: { label: 'Email', bantuan: 'Alamat email yang diperiksa formatnya', kelompok: 'Teks' },
  ANGKA: { label: 'Angka', bantuan: 'Hanya angka, bisa diberi batas', kelompok: 'Teks' },
  PILIHAN_GANDA: { label: 'Pilihan ganda', bantuan: 'Pilih satu jawaban', kelompok: 'Pilihan' },
  KOTAK_CENTANG: { label: 'Kotak centang', bantuan: 'Boleh pilih lebih dari satu', kelompok: 'Pilihan' },
  DROPDOWN: { label: 'Dropdown', bantuan: 'Pilih satu dari daftar panjang', kelompok: 'Pilihan' },
  SKALA: { label: 'Skala nilai', bantuan: 'Mis. 1 sampai 5, Sangat Tidak Puas – Sangat Puas', kelompok: 'Nilai' },
  KISI_PILIHAN: { label: 'Kisi pilihan ganda', bantuan: 'Menilai beberapa hal dengan pilihan yang sama', kelompok: 'Nilai' },
  KISI_CENTANG: { label: 'Kisi kotak centang', bantuan: 'Tabel baris × kolom, boleh beberapa per baris', kelompok: 'Nilai' },
  TANGGAL: { label: 'Tanggal', bantuan: 'Pilih tanggal dari kalender', kelompok: 'Lainnya' },
  WAKTU: { label: 'Waktu', bantuan: 'Jam dan menit', kelompok: 'Lainnya' },
  UNGGAH_BERKAS: { label: 'Unggah berkas', bantuan: 'Foto atau PDF, mis. bukti bayar atau CV', kelompok: 'Lainnya' },
};

// ---------------------------------------------------------------------------
// Peran — pemetaan jawaban ke data organisasi (integrasi)
// ---------------------------------------------------------------------------

export const PERAN = ['nama_lengkap', 'nim', 'email', 'no_hp', 'angkatan', 'jabatan'] as const;
export type Peran = (typeof PERAN)[number];
export const LABEL_PERAN: Record<Peran, string> = {
  nama_lengkap: 'Nama lengkap',
  nim: 'NIM',
  email: 'Email',
  no_hp: 'Nomor HP',
  angkatan: 'Angkatan',
  jabatan: 'Jabatan',
};

/** Peran yang wajib ada sebelum form kategori ini boleh dibuka. */
export const PERAN_WAJIB: Record<Kategori, Peran[]> = {
  PENDAFTARAN: ['nama_lengkap'],
  EVALUASI: [],
  OPEN_RECRUITMENT: [],
  PENDATAAN_PENGURUS: ['nama_lengkap', 'nim'],
  LAINNYA: [],
};

// ---------------------------------------------------------------------------
// Skema
// ---------------------------------------------------------------------------

/** Id lokal stabil untuk bagian/pilihan (uuid dari DB, atau id sementara editor). */
const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Id tidak sah.');
const teks = (maks: number) => z.string().trim().max(maks, `Maksimal ${maks} karakter.`);
const TUJUAN_KIRIM = 'KIRIM';

const pilihan = z.object({ id, label: teks(200).min(1, 'Label pilihan wajib diisi.'), lompat_ke: id.nullable().optional() });
const baris = z.object({ id, label: teks(200).min(1, 'Label wajib diisi.') });

export const SkemaOpsi = z
  .object({
    maks: z.number().int().positive().max(5000).optional(),
    min: z.number().optional(),
    pilihan: z.array(pilihan).max(100).optional(),
    lainnya: z.boolean().optional(),
    min_pilih: z.number().int().min(0).max(100).optional(),
    maks_pilih: z.number().int().min(1).max(100).optional(),
    skala_min: z.union([z.literal(0), z.literal(1)]).optional(),
    skala_maks: z.number().int().min(2).max(10).optional(),
    label_min: teks(60).optional(),
    label_maks: teks(60).optional(),
    baris: z.array(baris).max(50).optional(),
    kolom: z.array(baris).max(20).optional(),
    jenis: z.array(z.enum(['gambar', 'pdf'])).min(1).optional(),
    // Vercel menolak badan permintaan > 4,5 MB per fungsi (ADR-038 #9).
    maks_mb: z.number().int().min(1).max(4).optional(),
  })
  .strict();
export type Opsi = z.infer<typeof SkemaOpsi>;

export const SkemaPertanyaan = z.object({
  id,
  tipe: z.enum(TIPE),
  judul: teks(500).min(1, 'Pertanyaan wajib diisi.'),
  deskripsi: teks(2000).default(''),
  wajib: z.boolean().default(false),
  opsi: SkemaOpsi.default({}),
  peran: z.enum(PERAN).nullable().default(null),
});
export type Pertanyaan = z.infer<typeof SkemaPertanyaan>;

export const SkemaBagian = z.object({
  id,
  judul: teks(200).default(''),
  deskripsi: teks(2000).default(''),
  /** null = bagian berikutnya; 'KIRIM' = selesai; selain itu id bagian. */
  lanjut_ke: id.nullable().default(null),
  pertanyaan: z.array(SkemaPertanyaan).max(200),
});
export type Bagian = z.infer<typeof SkemaBagian>;

export const SkemaStruktur = z
  .object({ bagian: z.array(SkemaBagian).min(1, 'Form minimal punya satu bagian.').max(30) })
  .superRefine((s, ctx) => {
    const idBagian = new Set(s.bagian.map((b) => b.id));
    const semuaId = new Set<string>();
    const peranDipakai = new Set<string>();
    if (idBagian.size !== s.bagian.length) ctx.addIssue({ code: 'custom', path: ['bagian'], message: 'Id bagian ganda.' });
    const tujuanSah = (t: string | null | undefined) => t == null || t === TUJUAN_KIRIM || idBagian.has(t);

    s.bagian.forEach((b, bi) => {
      if (!tujuanSah(b.lanjut_ke)) ctx.addIssue({ code: 'custom', path: ['bagian', bi, 'lanjut_ke'], message: 'Tujuan bagian tidak ada.' });
      let berlogika = 0;
      b.pertanyaan.forEach((p, pi) => {
        const jalur = ['bagian', bi, 'pertanyaan', pi];
        if (semuaId.has(p.id)) ctx.addIssue({ code: 'custom', path: [...jalur, 'id'], message: 'Id pertanyaan ganda.' });
        semuaId.add(p.id);
        if (p.peran) {
          if (peranDipakai.has(p.peran)) ctx.addIssue({ code: 'custom', path: [...jalur, 'peran'], message: `${LABEL_PERAN[p.peran]} sudah dipakai pertanyaan lain.` });
          peranDipakai.add(p.peran);
        }
        const o = p.opsi;
        const butuhPilihan = p.tipe === 'PILIHAN_GANDA' || p.tipe === 'DROPDOWN' || p.tipe === 'KOTAK_CENTANG';
        if (butuhPilihan && (!o.pilihan || o.pilihan.length < 1)) ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi', 'pilihan'], message: 'Tambahkan minimal satu pilihan.' });
        if (butuhPilihan && o.pilihan && new Set(o.pilihan.map((x) => x.id)).size !== o.pilihan.length)
          ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi', 'pilihan'], message: 'Id pilihan ganda.' });
        const adaLompat = (o.pilihan ?? []).some((x) => x.lompat_ke);
        if (adaLompat) {
          if (p.tipe !== 'PILIHAN_GANDA' && p.tipe !== 'DROPDOWN')
            ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi'], message: 'Lompat bagian hanya untuk pilihan ganda atau dropdown.' });
          berlogika++;
          for (const x of o.pilihan ?? []) if (!tujuanSah(x.lompat_ke)) ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi', 'pilihan'], message: 'Tujuan lompat tidak ada.' });
        }
        if ((p.tipe === 'KISI_PILIHAN' || p.tipe === 'KISI_CENTANG') && (!o.baris?.length || !o.kolom?.length))
          ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi'], message: 'Kisi butuh minimal satu baris dan satu kolom.' });
        if (p.tipe === 'SKALA' && (o.skala_maks ?? 5) <= (o.skala_min ?? 1))
          ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi'], message: 'Nilai maksimum skala harus lebih besar dari minimum.' });
        if (p.tipe === 'ANGKA' && o.min !== undefined && o.maks !== undefined && o.maks < o.min)
          ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi'], message: 'Batas maksimum lebih kecil dari minimum.' });
        if (p.tipe === 'KOTAK_CENTANG' && o.min_pilih !== undefined && o.maks_pilih !== undefined && o.maks_pilih < o.min_pilih)
          ctx.addIssue({ code: 'custom', path: [...jalur, 'opsi'], message: 'Maksimal pilihan lebih kecil dari minimal.' });
      });
      if (berlogika > 1) ctx.addIssue({ code: 'custom', path: ['bagian', bi], message: 'Satu bagian hanya boleh punya satu pertanyaan yang menentukan lompatan.' });
    });
  });
export type Struktur = z.infer<typeof SkemaStruktur>;

export const SkemaPengaturan = z.object({
  judul: teks(200).min(3, 'Judul minimal 3 karakter.'),
  deskripsi: teks(5000).default(''),
  akses: z.enum(['PUBLIK', 'INTERNAL']),
  anonim: z.boolean(),
  satu_respons: z.boolean(),
  ditutup_pada: z.iso.datetime({ offset: true }).nullable(),
  kuota: z.number().int().min(1).max(100000).nullable(),
  pesan_selesai: teks(1000).min(1, 'Pesan penutup wajib diisi.'),
});
export type Pengaturan = z.infer<typeof SkemaPengaturan>;

/** Badan PUT editor: pengaturan + struktur. */
export const SkemaSimpanForm = SkemaPengaturan.extend({ struktur: SkemaStruktur }).refine(
  (v) => !v.satu_respons || v.akses === 'INTERNAL',
  { path: ['satu_respons'], message: 'Satu respons per akun hanya untuk form yang wajib login.' },
);
export type SimpanForm = z.infer<typeof SkemaSimpanForm>;

export const SkemaBuatForm = z.object({
  kategori: z.enum(KATEGORI, { error: 'Pilih untuk apa form ini dibuat.' }),
  kepanitiaan_id: z.uuid().nullable().default(null),
  template_id: z.uuid().nullable().default(null),
  judul: teks(200).min(3, 'Judul minimal 3 karakter.'),
  deskripsi: teks(5000).default(''),
});
export type BuatForm = z.infer<typeof SkemaBuatForm>;

export const SkemaTemplate = z.object({
  nama: teks(120).min(3, 'Nama template minimal 3 karakter.'),
  kategori: z.enum(KATEGORI),
  deskripsi: teks(2000).default(''),
  isi: SkemaStruktur,
  aktif: z.boolean().default(true),
});
export type TemplateForm = z.infer<typeof SkemaTemplate>;

export const TUJUAN_SELESAI = TUJUAN_KIRIM;

/** Struktur awal form kosong: satu bagian, satu pertanyaan singkat. */
export function strukturKosong(buatId: () => string): Struktur {
  return {
    bagian: [{ id: buatId(), judul: '', deskripsi: '', lanjut_ke: null, pertanyaan: [{ id: buatId(), tipe: 'TEKS_SINGKAT', judul: 'Pertanyaan tanpa judul', deskripsi: '', wajib: false, opsi: {}, peran: null }] }],
  };
}

/** Opsi bawaan saat tipe dipilih/diganti di editor. */
export function opsiAwal(tipe: Tipe, buatId: () => string): Opsi {
  switch (tipe) {
    case 'PILIHAN_GANDA':
    case 'DROPDOWN':
    case 'KOTAK_CENTANG':
      return { pilihan: [{ id: buatId(), label: 'Opsi 1' }] };
    case 'SKALA':
      return { skala_min: 1, skala_maks: 5, label_min: 'Sangat Tidak Puas', label_maks: 'Sangat Puas' };
    case 'KISI_PILIHAN':
    case 'KISI_CENTANG':
      return { baris: [{ id: buatId(), label: 'Baris 1' }], kolom: [{ id: buatId(), label: 'Kolom 1' }] };
    case 'UNGGAH_BERKAS':
      return { jenis: ['gambar', 'pdf'], maks_mb: 4 };
    default:
      return {};
  }
}

/** Masalah yang menghalangi form DIBUKA (selain validasi struktur). */
export function syaratBuka(kategori: Kategori, s: Struktur): string[] {
  const masalah: string[] = [];
  const semua = s.bagian.flatMap((b) => b.pertanyaan);
  if (semua.length === 0) masalah.push('Tambahkan minimal satu pertanyaan.');
  const peran = new Set(semua.map((p) => p.peran).filter(Boolean));
  for (const p of PERAN_WAJIB[kategori]) {
    if (!peran.has(p)) masalah.push(`Form ${INFO_KATEGORI[kategori].label} perlu pertanyaan yang ditandai "${LABEL_PERAN[p]}".`);
  }
  return masalah;
}
