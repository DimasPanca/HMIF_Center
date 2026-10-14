/**
 * preset-tujuan — dropdown "Tujuan — Preset" pada form surat (PRD F-4.2).
 *
 * Modul murni tanpa akses DB supaya aman diimpor komponen klien. Daftar yang
 * dipakai aplikasi dibaca dari tabel `tujuan_surat_preset` lewat
 * `bacaPresetTujuan()` di `lib/surat/konfig.ts`, karena Sekum boleh
 * menyunting redaksinya tanpa deployment (policy migrasi 018).
 *
 * `PRESET_TUJUAN_BAWAAN` adalah cermin baris seed 018 — bukan sumber kedua.
 * Ia dipakai test dan sebagai isian awal bila tabelnya kosong, dan test
 * membandingkannya dengan berkas migrasi supaya keduanya tidak bercabang diam-diam.
 *
 * Sumber: PRD F-4.2 · docs/ai/SEED_DATA.md §4 · supabase/migrations/018_seed.sql
 */

export interface PresetTujuan {
  label: string;
  /** Kosong untuk "Lainnya": pengguna mengisinya sendiri. */
  nama: string | null;
  alamat: string | null;
}

export const LABEL_PRESET_LAINNYA = 'Lainnya (isi manual)';

export const PRESET_TUJUAN_BAWAAN: readonly PresetTujuan[] = [
  { label: 'BEM FT UNTIRTA', nama: 'Ketua BEM FT UNTIRTA', alamat: 'di Tempat' },
  { label: 'DPM FT UNTIRTA', nama: 'Ketua DPM FT UNTIRTA', alamat: 'di Tempat' },
  {
    label: 'Kepala Bagian Sekretariat FT',
    nama: 'Kepala Bagian Sekretariat Fakultas Teknik UNTIRTA',
    alamat: 'di Tempat',
  },
  { label: 'Ketua Jurusan', nama: 'Ketua Jurusan Teknik Informatika FT UNTIRTA', alamat: 'di Tempat' },
  { label: 'Wakil Dekan III', nama: 'Wakil Dekan III Fakultas Teknik UNTIRTA', alamat: 'di Tempat' },
  { label: LABEL_PRESET_LAINNYA, nama: null, alamat: null },
];

export interface IsianTujuan {
  tujuan_preset: string;
  tujuan_nama: string;
  tujuan_alamat: string;
}

/**
 * Hasil memilih preset: nama dan alamat terisi, tetap dapat disunting sesudahnya.
 *
 * Memilih "Lainnya" mengosongkan keduanya, bukan mempertahankan isian preset
 * sebelumnya — kalau tidak, "Ketua BEM FT UNTIRTA" yang tertinggal mudah lolos
 * ke surat yang sebenarnya ditujukan ke pihak lain.
 */
export function terapkanPreset(label: string, daftar: readonly PresetTujuan[]): IsianTujuan {
  const preset = daftar.find((p) => p.label === label);
  return {
    tujuan_preset: label,
    tujuan_nama: preset?.nama ?? '',
    tujuan_alamat: preset?.alamat ?? '',
  };
}
