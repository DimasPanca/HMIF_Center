/**
 * field-schemas — skema Zod form surat (K-04): satu skema untuk form klien,
 * validasi server, dan deskripsi `surat_template.field_schema` (T-055).
 *
 * Modul murni tanpa akses DB supaya aman diimpor komponen klien. Nilai default
 * yang berasal dari `app_config` dan flag `PDF_ENABLED` masuk lewat argumen
 * `KonfigSurat`, dibaca server oleh `bacaKonfigSurat()` (lib/surat/konfig.ts)
 * lalu diteruskan ke klien. Karena itu skema berbentuk pabrik, bukan konstanta:
 * dengan begitu tidak ada `HMIF`/`Cilegon` yang ditulis di kode (AGENT_RULES §4.5)
 * dan klien maupun server tetap memanggil pabrik yang sama.
 *
 * Nama field `data_dinamis` sengaja sama persis dengan placeholder template
 * (TEMPLATE_MAPPING §3) supaya generator T-061 tidak butuh tabel penerjemah —
 * salah ketik nama placeholder tidak menimbulkan galat, hanya kata `undefined`
 * di surat tercetak. Penyesuaian antara PRD F-4.2 dan peta template: ADR-026.
 *
 * Sumber: PRD F-4.1, F-4.2 · TEMPLATE_MAPPING §3, §6 · ADR-002, ADR-004,
 *         ADR-010, ADR-021, ADR-026
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Katalog jenis surat
// ---------------------------------------------------------------------------

/**
 * Sebelas jenis yang dapat dipilih: tujuh varian bertemplate dan empat kode
 * berform generik. `jenis` adalah diskriminator form; `kode` dan `varian`
 * diturunkan darinya sehingga klien tidak dapat mengirim pasangan yang tidak cocok.
 */
export const JENIS_SURAT = [
  { jenis: 'PENGAJUAN', kode: '01', varian: null, nama: 'Surat Pengajuan' },
  { jenis: 'KETERANGAN_AKTIF', kode: '02', varian: 'KETERANGAN_AKTIF', nama: 'Surat Keterangan Aktif Organisasi' },
  { jenis: 'ASPIRASI', kode: '03', varian: 'ASPIRASI', nama: 'Surat Pemberitahuan Aspirasi' },
  { jenis: 'UNDANGAN_PEMATERI', kode: '04', varian: 'UNDANGAN_PEMATERI', nama: 'Surat Undangan Pemateri' },
  { jenis: 'UNDANGAN_SAMBUTAN', kode: '04', varian: 'UNDANGAN_SAMBUTAN', nama: 'Surat Undangan Sambutan' },
  { jenis: 'PEMINJAMAN_BARANG', kode: '05', varian: 'PEMINJAMAN_BARANG', nama: 'Surat Peminjaman Barang' },
  { jenis: 'PEMINJAMAN_RUANGAN', kode: '05', varian: 'PEMINJAMAN_RUANGAN', nama: 'Surat Peminjaman Ruangan' },
  { jenis: 'PERINGATAN', kode: '06', varian: null, nama: 'Surat Peringatan' },
  { jenis: 'KEPUTUSAN', kode: '07', varian: null, nama: 'Surat Keputusan' },
  { jenis: 'KERJA_SAMA', kode: '08', varian: 'KERJA_SAMA', nama: 'Surat Kerja Sama' },
  { jenis: 'PIAGAM', kode: '09', varian: null, nama: 'Piagam Penghargaan' },
] as const;

export type JenisSurat = (typeof JENIS_SURAT)[number]['jenis'];
export type KodeSurat = (typeof JENIS_SURAT)[number]['kode'];

export const DAFTAR_JENIS = JENIS_SURAT.map((j) => j.jenis) as [JenisSurat, ...JenisSurat[]];

export function infoJenis(jenis: JenisSurat) {
  // Selalu ada: `jenis` bertipe union literal dari katalog yang sama.
  return JENIS_SURAT.find((j) => j.jenis === jenis)!;
}

// ---------------------------------------------------------------------------
// Konfigurasi dari server
// ---------------------------------------------------------------------------

export interface KonfigSurat {
  /** `app_config.kode_kegiatan_default` — ADR-001 */
  kodeKegiatanDefault: string;
  /** `app_config.kota_default` */
  kotaDefault: string;
  /** `app_config.kode_administrasi` — hanya untuk pratinjau nomor (T-056) */
  kodeAdministrasi: string;
  /** `PDF_ENABLED === 'true'` — ADR-010 */
  pdfAktif: boolean;
}

export const FORMAT_OUTPUT = ['DOCX', 'PDF', 'BOTH'] as const;
export type FormatOutput = (typeof FORMAT_OUTPUT)[number];

const LABEL_FORMAT: Record<FormatOutput, string> = { DOCX: 'DOCX', PDF: 'PDF', BOTH: 'Keduanya' };

/**
 * ADR-010: saat PDF nonaktif, opsi PDF tidak dirender dan server menolaknya.
 * Kedua hal itu bersumber dari fungsi ini, jadi form dan validasi tidak mungkin
 * berbeda pendapat.
 */
export function opsiFormatOutput(pdfAktif: boolean): { nilai: FormatOutput; label: string }[] {
  const nilai: readonly FormatOutput[] = pdfAktif ? FORMAT_OUTPUT : ['DOCX'];
  return nilai.map((n) => ({ nilai: n, label: LABEL_FORMAT[n] }));
}

// ---------------------------------------------------------------------------
// Pembangun field — pesan galat selalu Bahasa Indonesia (K-01)
// ---------------------------------------------------------------------------

/** Tipe yang dikenali FieldRenderer T-058. */
export type TipeField = 'text' | 'textarea' | 'richtext' | 'date' | 'boolean' | 'list' | 'text[]';

// `type`, bukan `interface`: `.meta()` Zod menuntut index signature.
export type MetaField = {
  label: string;
  tipe: TipeField;
  bantuan?: string;
  /** Tidak dirender di form; nilainya tetap tetapi tetap dikirim ke generator. */
  tersembunyi?: boolean;
};

function wajib(label: string, maks = 300) {
  return z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(maks, `${label} maksimal ${maks} karakter.`);
}

function opsional(label: string, maks = 300) {
  return z
    .string({ error: `${label} harus berupa teks.` })
    .trim()
    .max(maks, `${label} maksimal ${maks} karakter.`);
}

const RE_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD yang benar-benar ada di kalender — `2026-02-31` ditolak. */
function tanggalSah(label: string) {
  return z
    .string({ error: `${label} wajib diisi.` })
    .regex(RE_TANGGAL, `${label} harus berformat YYYY-MM-DD.`)
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, `${label} bukan tanggal yang valid.`);
}

/**
 * Hari ini menurut WIB, bukan menurut jam mesin. Server Vercel berjalan di UTC,
 * sehingga `new Date().toISOString()` antara pukul 00.00 dan 07.00 WIB menghasilkan
 * tanggal kemarin di surat resmi.
 */
function hariIniWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function m<T extends z.ZodType>(skema: T, meta: MetaField): T {
  return skema.meta(meta) as T;
}

// ---------------------------------------------------------------------------
// Penandatangan — ADR-004, ADR-021
// ---------------------------------------------------------------------------

export const SkemaPenandatangan = z.object({
  jabatan: m(wajib('Jabatan penandatangan', 150), { label: 'Jabatan', tipe: 'text' }),
  nama: m(wajib('Nama penandatangan', 150), { label: 'Nama', tipe: 'text' }),
  nim: m(
    z
      .string({ error: 'NIM penandatangan wajib diisi.' })
      .trim()
      .regex(/^\d{6,20}$/, 'NIM hanya boleh berisi angka.'),
    { label: 'NIM', tipe: 'text' },
  ),
  /** Bila berakun, TTD diambil dari `signature` saat generate (PRD F-1.3). */
  user_id: z.uuid('Pengguna penandatangan tidak valid.').nullish(),
});
export type Penandatangan = z.infer<typeof SkemaPenandatangan>;

/**
 * Blok tanda tangan surat HMIF hanya punya dua kolom (ADR-021): KANAN selalu
 * Ketua Himpunan bertanda tangan dan berstempel (ADR-004), sehingga
 * "penandatangan tambahan" PRD F-4.2 paling banyak satu, yaitu kolom KIRI.
 */
export interface AturanPenandatangan {
  posisi: 'KIRI' | 'KANAN';
  wajib: boolean;
  /** KANAN: diisi otomatis dari Ketua Himpunan, bukan input pengguna. */
  otomatis: boolean;
}

const KANAN_KETUA: AturanPenandatangan = { posisi: 'KANAN', wajib: true, otomatis: true };
const KIRI_WAJIB: AturanPenandatangan = { posisi: 'KIRI', wajib: true, otomatis: false };
const KIRI_OPSIONAL: AturanPenandatangan = { posisi: 'KIRI', wajib: false, otomatis: false };

export const ATURAN_PENANDATANGAN: Record<JenisSurat, readonly AturanPenandatangan[]> = {
  PENGAJUAN: [KIRI_OPSIONAL, KANAN_KETUA],
  KETERANGAN_AKTIF: [KANAN_KETUA],
  ASPIRASI: [KANAN_KETUA],
  UNDANGAN_PEMATERI: [KIRI_WAJIB, KANAN_KETUA],
  UNDANGAN_SAMBUTAN: [KIRI_WAJIB, KANAN_KETUA],
  PEMINJAMAN_BARANG: [KIRI_WAJIB, KANAN_KETUA],
  PEMINJAMAN_RUANGAN: [KIRI_WAJIB, KANAN_KETUA],
  PERINGATAN: [KIRI_OPSIONAL, KANAN_KETUA],
  KEPUTUSAN: [KIRI_OPSIONAL, KANAN_KETUA],
  KERJA_SAMA: [KIRI_WAJIB, KANAN_KETUA],
  PIAGAM: [KIRI_OPSIONAL, KANAN_KETUA],
};

function skemaTambahan(jenis: JenisSurat) {
  const kiri = ATURAN_PENANDATANGAN[jenis].find((a) => a.posisi === 'KIRI');
  const label = 'Penandatangan tambahan';
  let s = z.array(SkemaPenandatangan, { error: `${label} tidak valid.` });
  if (!kiri) {
    s = s.max(0, 'Jenis surat ini hanya ditandatangani Ketua Himpunan.');
  } else if (kiri.wajib) {
    s = s.length(1, 'Isi satu penandatangan kolom kiri, misalnya Ketua Pelaksana.');
  } else {
    s = s.max(1, 'Blok tanda tangan hanya punya satu kolom tambahan.');
  }
  return m(s.default([]), {
    label,
    tipe: 'list',
    bantuan: kiri ? 'Kolom kiri blok tanda tangan, misalnya Ketua Pelaksana.' : undefined,
  });
}

// ---------------------------------------------------------------------------
// Field khusus per jenis — masuk `surat.data_dinamis`
// ---------------------------------------------------------------------------

const f = {
  nama_kegiatan: () => m(wajib('Nama kegiatan', 150), { label: 'Nama kegiatan', tipe: 'text' }),
  tema_kegiatan: () =>
    m(wajib('Tema kegiatan', 300), {
      label: 'Tema kegiatan',
      tipe: 'text',
      bantuan: 'Kepanjangan nama kegiatan, ditulis di dalam kurung sesudahnya.',
    }),
  hari_tanggal: () =>
    m(wajib('Hari, tanggal', 150), {
      label: 'Hari, tanggal',
      tipe: 'text',
      bantuan: 'Contoh: Selasa - Kamis, 19 - 21 Agustus 2025',
    }),
  waktu: (label = 'Waktu') =>
    m(wajib(label, 100), { label, tipe: 'text', bantuan: 'Contoh: 16.00 WIB s.d. Selesai' }),
  tempat: () => m(wajib('Tempat', 200), { label: 'Tempat', tipe: 'text' }),
  label_atas: () =>
    m(opsional('Nama panitia', 150).default(''), {
      label: 'Nama panitia',
      tipe: 'text',
      bantuan: 'Baris di atas blok tanda tangan, misalnya "Panitia AKSARA IF".',
    }),
  tujuan_jabatan: (label: string, perlu: boolean) =>
    m(perlu ? wajib(label, 200) : opsional(label, 200).default(''), {
      label,
      tipe: 'text',
      bantuan: 'Baris kedua alamat tujuan, di bawah nama tujuan.',
    }),
  /** Tetap, tidak dirender (TEMPLATE_MAPPING §6) — baris "Mengetahui," kolom kanan. */
  label_kanan: () =>
    m(z.literal('Mengetahui,', 'Label kolom kanan tidak dapat diubah.').default('Mengetahui,'), { label: 'Label kolom kanan', tipe: 'text', tersembunyi: true }),
};

const SkemaItemBarang = z.object({
  kebutuhan: m(wajib('Kebutuhan', 150), { label: 'Kebutuhan', tipe: 'text' }),
  banyaknya: m(wajib('Banyaknya', 50), { label: 'Banyaknya', tipe: 'text', bantuan: 'Contoh: 2 unit' }),
});

const SkemaBarisRundown = z.object({
  hari_tanggal: m(opsional('Hari, tanggal', 150).default(''), {
    label: 'Hari, tanggal',
    tipe: 'text',
    bantuan: 'Kosongkan pada baris lanjutan di hari yang sama.',
  }),
  waktu: m(wajib('Waktu', 50), { label: 'Waktu', tipe: 'text' }),
  acara: m(wajib('Acara', 200), { label: 'Acara', tipe: 'text' }),
  keterangan: m(opsional('Keterangan', 150).default(''), { label: 'Keterangan', tipe: 'text' }),
});

const SkemaPoinAspirasi = z.object({
  judul: m(wajib('Judul poin', 200), { label: 'Judul poin', tipe: 'text' }),
  paragraf: m(
    z
      .array(wajib('Uraian', 3000), { error: 'Uraian poin tidak valid.' })
      .min(1, 'Setiap poin aspirasi butuh minimal satu paragraf uraian.'),
    { label: 'Uraian', tipe: 'text[]' },
  ),
});

function daftar<T extends z.ZodType>(item: T, label: string, pesanKosong: string) {
  return m(z.array(item, { error: `${label} tidak valid.` }).min(1, pesanKosong), { label, tipe: 'list' });
}

/** Objek ketat: kunci asing ditolak, supaya tidak ada sampah yang tersimpan di JSONB. */
const SKEMA_KHUSUS = {
  KETERANGAN_AKTIF: () =>
    z.strictObject({
      nama_pemohon: m(wajib('Nama mahasiswa', 150), { label: 'Nama mahasiswa', tipe: 'text' }),
      nim_pemohon: m(
        z
          .string({ error: 'NIM wajib diisi.' })
          .trim()
          .regex(/^\d{6,20}$/, 'NIM hanya boleh berisi angka.'),
        { label: 'NIM', tipe: 'text' },
      ),
      jabatan_pemohon: m(wajib('Jabatan', 150), {
        label: 'Jabatan',
        tipe: 'text',
        bantuan: 'Contoh: Staff Departemen Kaderisasi',
      }),
      keperluan: m(wajib('Keperluan', 300), {
        label: 'Dipergunakan sebagai',
        tipe: 'text',
        bantuan: 'Contoh: Kelengkapan Persyaratan Administrasi Beasiswa',
      }),
    }),
  ASPIRASI: () =>
    z.strictObject({
      label_atas: m(opsional('Salam penutup', 100).default('Hormat Kami,'), { label: 'Salam penutup', tipe: 'text' }),
      poin: daftar(SkemaPoinAspirasi, 'Poin aspirasi', 'Tambahkan minimal satu poin aspirasi.'),
    }),
  UNDANGAN_PEMATERI: () =>
    z.strictObject({
      nama_kegiatan: f.nama_kegiatan(),
      tema_kegiatan: f.tema_kegiatan(),
      tujuan_jabatan: f.tujuan_jabatan('Jabatan/instansi pemateri', false),
      topik_materi: m(wajib('Topik materi', 200), { label: 'Topik materi', tipe: 'text' }),
      hari_tanggal: f.hari_tanggal(),
      waktu: f.waktu(),
      tempat: f.tempat(),
      label_atas: f.label_atas(),
      lampirkan_tor: m(z.boolean({ error: 'Pilihan lampiran TOR tidak valid.' }).default(false), {
        label: 'Lampirkan TOR',
        tipe: 'boolean',
        bantuan: 'Diambil otomatis dari modul TOR kegiatan.',
      }),
      label_kanan: f.label_kanan(),
    }),
  UNDANGAN_SAMBUTAN: () =>
    z.strictObject({
      nama_kegiatan: f.nama_kegiatan(),
      tema_kegiatan: f.tema_kegiatan(),
      hari_tanggal: f.hari_tanggal(),
      waktu: f.waktu(),
      tempat: f.tempat(),
      rundown: daftar(SkemaBarisRundown, 'Susunan acara', 'Tambahkan minimal satu baris susunan acara.'),
      label_kanan: f.label_kanan(),
    }),
  PEMINJAMAN_BARANG: () =>
    z.strictObject({
      nama_kegiatan: f.nama_kegiatan(),
      tema_kegiatan: f.tema_kegiatan(),
      barang: m(wajib('Barang yang dipinjam', 150), {
        label: 'Barang yang dipinjam',
        tipe: 'text',
        bantuan: 'Ringkasan untuk kalimat isi, misalnya "Tandu". Rinciannya di tabel kebutuhan.',
      }),
      hari_tanggal: f.hari_tanggal(),
      tempat: f.tempat(),
      label_atas: f.label_atas(),
      items: daftar(SkemaItemBarang, 'Tabel kebutuhan', 'Tambahkan minimal satu barang di tabel kebutuhan.'),
      label_kanan: f.label_kanan(),
    }),
  PEMINJAMAN_RUANGAN: () =>
    z.strictObject({
      nama_kegiatan: f.nama_kegiatan(),
      tema_kegiatan: f.tema_kegiatan(),
      ruangan: m(wajib('Nama ruangan', 150), { label: 'Nama ruangan', tipe: 'text' }),
      tujuan_jabatan: f.tujuan_jabatan('Nama instansi tujuan', true),
      hari_tanggal: f.hari_tanggal(),
      waktu: f.waktu('Pukul'),
      tempat: f.tempat(),
      label_atas: f.label_atas(),
      label_kanan: f.label_kanan(),
    }),
  KERJA_SAMA: () =>
    z.strictObject({
      nama_kegiatan: f.nama_kegiatan(),
      tema_kegiatan: f.tema_kegiatan(),
      jenis_mitra: m(wajib('Jenis instansi mitra', 100), {
        label: 'Jenis instansi mitra',
        tipe: 'text',
        bantuan: 'Contoh: Rumah Sakit — dipakai di kalimat "kerjasama dengan Rumah Sakit Bapak/Ibu/Saudara".',
      }),
      hari_tanggal: f.hari_tanggal(),
      tempat: f.tempat(),
      label_atas: f.label_atas(),
      label_kanan: f.label_kanan(),
    }),
} as const;

type JenisBertemplate = keyof typeof SKEMA_KHUSUS;

function punyaTemplate(jenis: JenisSurat): jenis is JenisBertemplate {
  return jenis in SKEMA_KHUSUS;
}

function skemaKhusus(jenis: JenisSurat) {
  // Form generik (01, 06, 07, 09) tidak punya field khusus: seluruh isinya di `isi_surat`.
  return punyaTemplate(jenis) ? SKEMA_KHUSUS[jenis]() : z.strictObject({});
}

// ---------------------------------------------------------------------------
// Field umum yang dipakai per jenis
// ---------------------------------------------------------------------------

/**
 * Field umum yang benar-benar dicetak template. Field umum yang tidak ada di
 * sini tetap ada di skema — kolom `surat` bersifat NOT NULL — tetapi diberi
 * nilai tetap dan tidak dirender di form (ADR-026).
 */
export type FieldUmum =
  | 'kode_kegiatan'
  | 'tanggal_surat'
  | 'kota'
  | 'lampiran'
  | 'perihal'
  | 'tujuan_preset'
  | 'tujuan_nama'
  | 'tujuan_alamat'
  | 'isi_surat'
  | 'penandatangan_tambahan'
  | 'format_output';

const UMUM_BERALAMAT: readonly FieldUmum[] = [
  'kode_kegiatan',
  'tanggal_surat',
  'kota',
  'lampiran',
  'perihal',
  'tujuan_preset',
  'tujuan_nama',
  'tujuan_alamat',
  'penandatangan_tambahan',
  'format_output',
];

export const FIELD_UMUM_TERPAKAI: Record<JenisSurat, readonly FieldUmum[]> = {
  PENGAJUAN: [...UMUM_BERALAMAT, 'isi_surat'],
  // Surat keterangan tidak beralamat dan tidak berperihal (TEMPLATE_MAPPING §5.1).
  KETERANGAN_AKTIF: ['kode_kegiatan', 'tanggal_surat', 'kota', 'format_output'],
  ASPIRASI: [...UMUM_BERALAMAT.filter((k) => k !== 'penandatangan_tambahan'), 'isi_surat'],
  UNDANGAN_PEMATERI: UMUM_BERALAMAT,
  UNDANGAN_SAMBUTAN: UMUM_BERALAMAT,
  PEMINJAMAN_BARANG: UMUM_BERALAMAT,
  PEMINJAMAN_RUANGAN: UMUM_BERALAMAT,
  PERINGATAN: [...UMUM_BERALAMAT, 'isi_surat'],
  KEPUTUSAN: [...UMUM_BERALAMAT, 'isi_surat'],
  KERJA_SAMA: UMUM_BERALAMAT,
  PIAGAM: [...UMUM_BERALAMAT, 'isi_surat'],
};

/** Nilai tetap untuk kolom NOT NULL yang tidak dipakai template Keterangan Aktif. */
const TANPA_ALAMAT = '-';

function fieldUmum(konfig: KonfigSurat, jenis: JenisSurat) {
  const terpakai = new Set(FIELD_UMUM_TERPAKAI[jenis]);
  const pakai = (k: FieldUmum) => terpakai.has(k);
  const isiWajib = pakai('isi_surat');
  const format = opsiFormatOutput(konfig.pdfAktif).map((o) => o.nilai) as [FormatOutput, ...FormatOutput[]];

  const atauTetap = (k: FieldUmum, skema: z.ZodType, label: string) =>
    pakai(k)
      ? skema
      : m(z.literal(TANPA_ALAMAT, `${label} tidak dipakai jenis surat ini.`).default(TANPA_ALAMAT), {
          label,
          tipe: 'text',
          tersembunyi: true,
        });

  return {
    kode_kegiatan: m(
      z
        .string({ error: 'Kode kegiatan wajib diisi.' })
        .trim()
        .toUpperCase()
        // Segmen ini masuk ke nomor surat; garis miring akan memecah nomornya.
        .regex(/^[A-Z0-9]{2,30}$/, 'Kode kegiatan hanya huruf dan angka tanpa spasi, 2–30 karakter.')
        .default(konfig.kodeKegiatanDefault),
      { label: 'Kegiatan', tipe: 'text', bantuan: 'Masuk ke nomor surat, misalnya HMIF, KT2HMIF, MUSMAIF.' },
    ),
    tanggal_surat: m(tanggalSah('Tanggal surat').default(hariIniWib), { label: 'Tanggal surat', tipe: 'date' }),
    kota: m(wajib('Kota', 100).default(konfig.kotaDefault), { label: 'Kota', tipe: 'text' }),
    lampiran: m(opsional('Lampiran', 100).default('-'), {
      label: 'Lampiran',
      tipe: 'text',
      bantuan: 'Contoh: 1 (satu) Lembar. Isi "-" bila tidak ada.',
    }),
    perihal: pakai('perihal')
      ? m(wajib('Perihal', 300), { label: 'Perihal', tipe: 'text' })
      : m(z.string({ error: 'Perihal harus berupa teks.' }).trim().default(infoJenis(jenis).nama), {
          label: 'Perihal',
          tipe: 'text',
          tersembunyi: true,
        }),
    tujuan_preset: atauTetap(
      'tujuan_preset',
      m(wajib('Tujuan', 150), { label: 'Tujuan', tipe: 'text' }),
      'Tujuan',
    ),
    tujuan_nama: atauTetap(
      'tujuan_nama',
      m(wajib('Nama/jabatan tujuan', 200), { label: 'Nama/jabatan tujuan', tipe: 'text' }),
      'Nama/jabatan tujuan',
    ),
    tujuan_alamat: atauTetap(
      'tujuan_alamat',
      m(wajib('Alamat tujuan', 150), { label: 'Alamat tujuan', tipe: 'text', bantuan: 'Contoh: di Tempat, di Cilegon' }),
      'Alamat tujuan',
    ),
    isi_surat: isiWajib
      ? m(wajib('Isi surat', 20_000), { label: 'Isi surat', tipe: 'richtext' })
      : m(opsional('Isi surat', 20_000).default(''), { label: 'Isi surat', tipe: 'richtext', tersembunyi: true }),
    /** Selalu Ketua Himpunan, bertanda tangan dan berstempel — tidak dapat diganti (ADR-004). */
    penandatangan_utama: m(z.literal('KETUA', 'Penandatangan utama selalu Ketua Himpunan.').default('KETUA'), {
      label: 'Penandatangan utama',
      tipe: 'text',
      tersembunyi: true,
    }),
    penandatangan_tambahan: skemaTambahan(jenis),
    format_output: m(
      z.enum(format, { error: konfig.pdfAktif ? 'Format output tidak valid.' : 'Format PDF belum tersedia.' }).default('DOCX'),
      { label: 'Format output', tipe: 'text' },
    ),
  };
}

// ---------------------------------------------------------------------------
// Skema publik
// ---------------------------------------------------------------------------

function buatSkemaJenis<J extends JenisSurat>(konfig: KonfigSurat, jenis: J) {
  return z.strictObject({
    jenis: z.literal(jenis),
    ...fieldUmum(konfig, jenis),
    data_dinamis: skemaKhusus(jenis),
  });
}

/**
 * Skema lengkap form surat — dipakai `useForm` di klien dan `safeParse` di
 * route server (K-04). Diskriminator `jenis` memilih field khusus yang berlaku.
 */
export function buatSkemaSurat(konfig: KonfigSurat) {
  return z.discriminatedUnion(
    'jenis',
    [
      buatSkemaJenis(konfig, 'PENGAJUAN'),
      buatSkemaJenis(konfig, 'KETERANGAN_AKTIF'),
      buatSkemaJenis(konfig, 'ASPIRASI'),
      buatSkemaJenis(konfig, 'UNDANGAN_PEMATERI'),
      buatSkemaJenis(konfig, 'UNDANGAN_SAMBUTAN'),
      buatSkemaJenis(konfig, 'PEMINJAMAN_BARANG'),
      buatSkemaJenis(konfig, 'PEMINJAMAN_RUANGAN'),
      buatSkemaJenis(konfig, 'PERINGATAN'),
      buatSkemaJenis(konfig, 'KEPUTUSAN'),
      buatSkemaJenis(konfig, 'KERJA_SAMA'),
      buatSkemaJenis(konfig, 'PIAGAM'),
    ],
    { error: 'Jenis surat tidak dikenal.' },
  );
}

export type SkemaSurat = ReturnType<typeof buatSkemaSurat>;
/** Nilai sesudah validasi (default terisi, teks ter-trim). */
export type SuratFormValues = z.infer<SkemaSurat>;
/** Nilai yang boleh dikirim form sebelum default diterapkan. */
export type SuratFormInput = z.input<SkemaSurat>;

// ---------------------------------------------------------------------------
// Deskripsi field — isi `surat_template.field_schema` (T-055, TEMPLATE_MAPPING §6)
// ---------------------------------------------------------------------------

export interface DeskripsiField {
  key: string;
  label: string;
  type: TipeField;
  required: boolean;
  default?: unknown;
  bantuan?: string;
  /** Hanya untuk `type: 'list'` dengan item berupa objek. */
  item?: Record<string, Omit<DeskripsiField, 'key' | 'item'>>;
}

export interface FieldSchemaTemplate {
  fields: DeskripsiField[];
  signers: { posisi: 'KIRI' | 'KANAN'; wajib: boolean }[];
  /** Placeholder umum yang dicetak template ini (bukan field form). */
  pakai: string[];
  /** Nilai tetap yang tidak dirender form tetapi wajib sampai ke generator. */
  tetap: Record<string, unknown>;
}

function bacaMeta(skema: z.ZodType): MetaField | undefined {
  return skema.meta() as MetaField | undefined;
}

function bukaPembungkus(skema: z.ZodType): z.ZodType {
  let s: z.ZodType = skema;
  while (s instanceof z.ZodDefault || s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
    s = s.unwrap() as z.ZodType;
  }
  return s;
}

function deskripsikan(key: string, skema: z.ZodType): DeskripsiField {
  const meta = bacaMeta(skema);
  if (!meta) throw new Error(`Field "${key}" tidak punya meta label — tambahkan lewat m().`);

  const kosong = skema.safeParse(undefined);
  const d: DeskripsiField = { key, label: meta.label, type: meta.tipe, required: !kosong.success };
  if (kosong.success && kosong.data !== undefined) d.default = kosong.data;
  if (meta.bantuan) d.bantuan = meta.bantuan;

  const inti = bukaPembungkus(skema);
  if (inti instanceof z.ZodArray && inti.element instanceof z.ZodObject) {
    d.item = {};
    for (const [k, sub] of Object.entries(inti.element.shape as Record<string, z.ZodType>)) {
      const anak = deskripsikan(k, sub);
      d.item[k] = { label: anak.label, type: anak.type, required: anak.required };
      if ('default' in anak) d.item[k].default = anak.default;
      if (anak.bantuan) d.item[k].bantuan = anak.bantuan;
    }
  }
  return d;
}

/** Placeholder umum per jenis — padanan `pakai` di TEMPLATE_MAPPING §6. */
const PLACEHOLDER_UMUM: Partial<Record<FieldUmum, string>> = {
  kota: 'kota',
  tanggal_surat: 'tanggal_surat_format',
  lampiran: 'lampiran',
  perihal: 'perihal',
  tujuan_nama: 'tujuan_nama',
  tujuan_alamat: 'tujuan_alamat',
  isi_surat: 'isi_paragraf',
};

export function serialisasiFieldSchema(konfig: KonfigSurat, jenis: JenisSurat): FieldSchemaTemplate {
  const khusus = skemaKhusus(jenis);
  const fields: DeskripsiField[] = [];
  const tetap: Record<string, unknown> = {};

  for (const [key, skema] of Object.entries(khusus.shape as Record<string, z.ZodType>)) {
    const d = deskripsikan(key, skema);
    if (bacaMeta(skema)?.tersembunyi) tetap[key] = d.default;
    else fields.push(d);
  }

  const pakai = ['nomor_lengkap'];
  for (const k of FIELD_UMUM_TERPAKAI[jenis]) {
    const ph = PLACEHOLDER_UMUM[k];
    if (ph) pakai.push(ph);
  }

  return {
    fields,
    signers: ATURAN_PENANDATANGAN[jenis].map(({ posisi, wajib }) => ({ posisi, wajib })),
    pakai,
    tetap,
  };
}

/**
 * Nilai awal form untuk satu jenis: hasil parse objek kosong yang hanya
 * mengambil default. Field wajib dibiarkan kosong (`''`/`[]`) supaya form
 * terkendali dan pesan "wajib diisi" muncul sesudah pengguna menyentuhnya.
 */
export function nilaiAwalSurat(konfig: KonfigSurat, jenis: JenisSurat): SuratFormInput {
  const umum = fieldUmum(konfig, jenis);
  const awal: Record<string, unknown> = { jenis };
  for (const [k, s] of Object.entries(umum) as [string, z.ZodType][]) {
    const r = s.safeParse(undefined);
    awal[k] = r.success ? r.data : '';
  }
  const dinamis: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(skemaKhusus(jenis).shape as Record<string, z.ZodType>)) {
    const r = s.safeParse(undefined);
    dinamis[k] = r.success ? r.data : bukaPembungkus(s) instanceof z.ZodArray ? [] : '';
  }
  awal.data_dinamis = dinamis;
  return awal as SuratFormInput;
}
