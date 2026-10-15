/**
 * Membangun `templates/*.docx` dari berkas contoh di `Template/`.
 *
 * ===========================================================================
 * KENAPA LEWAT SKRIP, BUKAN DIKETIK LANGSUNG DI WORD
 * ===========================================================================
 * Pembedahan template adalah pekerjaan sekali jalan yang hasilnya dipakai
 * bertahun-tahun. Dikerjakan di Word, ia meninggalkan sebelas berkas biner yang
 * tidak dapat ditinjau, tidak dapat diulang, dan tidak dapat dijelaskan: kalau
 * kelak ada yang bertanya "kenapa {tempat} ada di sini tapi tidak di sana",
 * tidak ada yang bisa menjawab selain membuka berkasnya satu per satu.
 *
 * Resep di bawah ini menjawab pertanyaan itu. Ia juga berarti berkas contoh di
 * `Template/` boleh diperbarui kapan pun — jalankan ulang, dan kesebelas
 * template ikut terbarui tanpa ada yang perlu mengingat langkah apa saja yang
 * dulu dikerjakan.
 *
 * Yang disentuh hanya isi `<w:t>`; lihat scripts/docx-surgery.ts. Kop surat,
 * margin, font, dan tata letak tabel tidak pernah dibaca, apalagi ditulis.
 *
 * ===========================================================================
 * SETIAP OPERASI WAJIB KENA
 * ===========================================================================
 * Operasi yang tidak menemukan sasarannya menghentikan skrip. Itu disengaja.
 * Penggantian yang diam-diam gagal menghasilkan template yang KEHILANGAN satu
 * placeholder — dan `template-dryrun.ts` tidak akan menangkapnya, karena ia
 * hanya memeriksa tag yang ADA. Satu-satunya tempat kesalahan itu dapat
 * tertangkap adalah di sini, saat penggantiannya tidak terjadi.
 *
 *     npx tsx scripts/build-templates.ts
 *     npx tsx scripts/template-dryrun.ts
 *
 * Sumber: docs/ai/TEMPLATE_MAPPING.md · ADR-021 · SYSTEM_DESIGN §8.2, §17
 */

import fs from 'node:fs';
import path from 'node:path';
import { Dokumen } from './docx-surgery';

const AKAR = path.resolve(import.meta.dirname, '..');
const SUMBER = path.join(AKAR, 'Template');
const TUJUAN = path.join(AKAR, 'templates');
const NL = '\n';
const tulis = (s: string): void => {
  process.stdout.write(s + NL);
};

type Op =
  /** Ganti setiap kemunculan teks; `n` adalah jumlah yang diharapkan. */
  | { ganti: [string, string]; n?: number }
  /** Ganti SELURUH isi paragraf pertama yang teksnya diawali argumen pertama. */
  | { paragraf: [string, string] }
  /** Sisipkan paragraf baru (salinan) tepat sebelum paragraf yang diawali X. */
  | { sisip: [string, string] }
  /** Hapus blok dari paragraf X sampai paragraf Y; tanpa Y berarti sampai akhir. */
  | { hapus: [string] | [string, string] }
  /** Hapus blok dari paragraf X sampai TEPAT SEBELUM paragraf Y. */
  | { hapusHingga: [string, string] }
  /** Hapus tabel-tabel utuh berdasarkan indeksnya (mulai 0). */
  | { hapusTabel: number[] }
  /** Hapus baris-baris tabel; indeks mulai 0. */
  | { hapusBaris: [number, number[]] }
  /** Tulis isi sel tabel, satu untai per paragraf. */
  | { sel: [number, number, number, string[]] }
  /** Isi sebuah bagian: [judul, judul berikutnya, teks pengganti]. */
  | { isiBagian: [string, string, string] }
  /**
   * Buang seluruh gambar badan dokumen — tanda tangan dan stempel contoh.
   * Angkanya jumlah gambar yang diharapkan; lihat `Dokumen.hapusGambar`.
   */
  | { hapusGambar: number }
  /** Buang paragraf pindah halaman kosong di akhir; angkanya jumlah yang diharapkan. */
  | { hapusPindahHalamanAkhir: number };

interface Resep {
  keluaran: string;
  sumber: string;
  ops: Op[];
}

/**
 * Blok tanda tangan dua penandatangan (ADR-021).
 *
 * Bentuknya sama pada lima surat kepanitiaan: tabel tiga kolom, baris jabatan
 * di atas baris nama, kolom tengah sebagai pemisah. Pasangan `{#kiri}`…`{/kiri}`
 * dibuka dan ditutup DI DALAM SATU SEL — bila membentang antar baris, docxtemplater
 * memperlakukannya sebagai loop baris dan menghapus seluruh baris itu (termasuk
 * kolom kanan) ketika penandatangan kiri tidak ada. Diukur; lihat ADR-021.
 */
function ttdDua(tabel: number, barisJabatan: number, barisNama: number): Op[] {
  return [
    { sel: [tabel, barisJabatan, 0, ['{#kiri}{jabatan}{/kiri}']] },
    { sel: [tabel, barisJabatan, 2, ['{#kanan}{label}', '{jabatan}{/kanan}']] },
    { sel: [tabel, barisNama, 0, ['{#kiri}{%ttd}', '{nama}', 'NIM. {nim}{/kiri}']] },
    { sel: [tabel, barisNama, 2, ['{#kanan}{%ttd}{%stempel}', '{nama}', 'NIM. {nim}{/kanan}']] },
  ];
}

/**
 * Blok tanda tangan SATU penandatangan yang tabelnya tetap melebar tiga kolom.
 *
 * Aspirasi hanya ditandatangani Ketua HMIF, tetapi tabelnya sama seperti surat
 * dua penandatangan — kolom kiri dan tengah sekadar kosong. Pasangan tag tetap
 * wajib satu sel; membukanya di baris jabatan dan menutupnya di baris nama
 * membuat docxtemplater menghapus kedua baris itu saat `kanan` kosong.
 */
function ttdKanan(tabel: number, barisJabatan: number, barisNama: number): Op[] {
  return [
    { sel: [tabel, barisJabatan, 2, ['{#kanan}{jabatan}{/kanan}']] },
    { sel: [tabel, barisNama, 2, ['{#kanan}{%ttd}{%stempel}', '{nama}', 'NIM. {nim}{/kanan}']] },
  ];
}

/**
 * Baris tabel rincian RAB yang dibuang: baris sub-kelompok (indeks 2) dan
 * seluruh baris item contoh kecuali yang pertama. Yang disisakan hanya indeks
 * 0 (nama divisi), 1 (kepala tabel), dan 3 (satu baris item sebagai badan loop).
 */
const BARIS_RINCIAN: number[] = [2, ...Array.from({ length: 63 }, (_, i) => i + 4)];

/**
 * Baris tabel susunan acara pada LPJ yang dibuang: seluruh baris isi contoh
 * kecuali yang pertama. Tabelnya 22 baris — satu kepala dan 21 baris isi.
 */
const BARIS_RUNDOWN_LPJ: number[] = Array.from({ length: 20 }, (_, i) => i + 2);

const RESEP: Resep[] = [
  // =========================================================================
  {
    keluaran: 'surat-02-keterangan-aktif.docx',
    sumber: 'Contoh Surat Aktif Organisasi.docx',
    ops: [
      // Tanda tangan dan stempel contoh — milik orang sungguhan (T-061).
      { hapusGambar: 2 },
      { ganti: ['02/274/UN43.3.7/HMIF/VII/2025', '{nomor_lengkap}'] },
      { ganti: ['Nama:', 'Nama: {nama_pemohon}'] },
      { ganti: ['NIM :', 'NIM : {nim_pemohon}'] },
      { ganti: ['Jabatan:', 'Jabatan: {jabatan_pemohon}'] },
      { ganti: ['Kelengkapan Persyaratan Administrasi Beasiswa.', '{keperluan}'] },
      { ganti: ['Cilegon, 16 Juli 2025', '{kota}, {tanggal_surat_format}'] },

      // Satu penandatangan saja, dan tabelnya cuma satu sel — jadi blok ditulis
      // langsung, bukan lewat ttdDua().
      { ganti: ['Ketua HMIF FT UNTIRTA', '{#kanan}{jabatan}'] },
      { ganti: ['Dicky Saputra', '{nama}'] },

      // Berkas ini menulis "NIM" tanpa titik, berbeda dari enam surat lain.
      // Dipertahankan apa adanya.
      { ganti: ['NIM 3337220032', 'NIM {nim}{/kanan}'] },

      // `{%ttd_nama}`, bukan `{%ttd}`: tambatannya paragraf nama itu sendiri,
      // bukan baris kosong di atasnya, jadi gambar dinaikkan lebih tinggi
      // (lib/documents/image-module.ts `ttdMelayang`).
      //
      // Gambar TTD+stempel ditambatkan ke paragraf NAMA dan melayang naik ke
      // ruang tanda tangan di atasnya — BUKAN di paragraf sisipan baru: satu
      // paragraf tambahan saja sudah mendorong berkas ini menjadi dua halaman
      // dengan halaman kedua kosong (diukur di Word, T-061). Paragraf bertek
      // sel ini: kota-tanggal, jabatan, " ", " ", nama, NIM.
      //
      // Tag gambar di AKHIR paragraf: teks sesudah tag gambar dalam satu `<w:t>`
      // pindah ke run baru tanpa format (lihat lib/documents/image-module.ts),
      // jadi `{%ttd}{nama}` akan mencetak nama dengan font bawaan Word.
      {
        sel: [0, 0, 1, ['{kota}, {tanggal_surat_format}', '{#kanan}{jabatan}', ' ', ' ', '{nama}{%ttd_nama}{%stempel}', 'NIM {nim}{/kanan}']],
      },
    ],
  },

  // =========================================================================
  {
    keluaran: 'surat-03-aspirasi.docx',
    sumber: '018_Surat Aspirasi Keorganisasian Mahasiswa Fakultas Teknik.docx',
    ops: [
      // Tanda tangan dan stempel contoh — milik orang sungguhan (T-061).
      { hapusGambar: 2 },
      { ganti: ['03/018/UN43.3.7/HMIF/VIII/2026', '{nomor_lengkap}'] },
      { ganti: ['Cilegon, 19 Agustus 2026', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['1 (satu) Lembar', '{lampiran}'] },
      { ganti: ['Aspirasi Keorganisasian Mahasiswa Fakultas Teknik', '{perihal}'] },
      { ganti: ['Ketua DPM FT UNTIRTA', '{tujuan_nama}'] },
      { ganti: ['di Tempat', '{tujuan_alamat}'] },
      // Kalimat pembuka dulu selalu menyebut DPM walau surat ditujukan ke BEM
      // atau Kepala Bagian Sekretariat. Kini mengikuti tujuan yang dipilih
      // (keputusan pemilik produk 2026-10-15; BACKLOG temuan T-059).
      { ganti: ['Dewan Perwakilan Mahasiswa (DPM) FT-UNTIRTA', '{tujuan_nama}'] },

      // Paragraf pembuka dan penutup adalah kalimat baku setiap surat aspirasi;
      // hanya kalimat tengah — yang menyebut isi aspirasi kali ini — yang
      // menjadi {isi_paragraf}.
      { paragraf: ['Aspirasi ini disampaikan sebagai bentuk masukan', '{isi_paragraf}'] },

      { sel: [0, 0, 0, ['{label_atas}']] },
      ...ttdKanan(0, 1, 2),

      // Lampiran I: lima poin contoh disisakan satu sebagai kerangka loop.
      // Gaya penomoran dan indentasi paragraf yang tersisa diwarisi setiap
      // iterasi, jadi menghapus empat sisanya bukan mengubah tata letak.
      //
      // Lima paragraf dibutuhkan, dan berkas asli menyediakan tiga; dua sisanya
      // disalin. Tag pembuka dan penutup {#paragraf} WAJIB berdiri sendiri —
      // digabung dalam satu paragraf, seluruh butir tercetak berdempet menjadi
      // satu baris panjang.
      //
      //     {#poin}
      //     {judul}
      //     {#paragraf}
      //     {teks}
      //     {/paragraf}
      //     {/poin}
      //
      // `{#poin}` juga berdiri sendiri (T-061). Dulu sebaris dengan {judul}:
      // paragraphLoop hanya membuang paragraf tag bila PEMBUKA dan penutupnya
      // sama-sama sendirian, jadi paragraf {/poin} — salinan paragraf berbutir —
      // tercetak sebagai butir "●" kosong di bawah setiap poin.
      { sisip: ['1. Penyesuaian Timeline', '{#poin}'] },
      { paragraf: ['1. Penyesuaian Timeline', '{judul}'] },
      { paragraf: ['HMIF pada dasarnya tidak mempermasalahkan', '{#paragraf}'] },
      { sisip: ['Namun, perlu adanya kejelasan timeline', '{teks}'] },
      { paragraf: ['Namun, perlu adanya kejelasan timeline', '{/paragraf}'] },
      { sisip: ['Setiap perubahan timeline diharapkan', '{/poin}'] },
      { hapus: ['Setiap perubahan timeline diharapkan'] },
    ],
  },

  // =========================================================================
  {
    keluaran: 'surat-04-undangan-pemateri.docx',
    sumber: 'Contoh Surat Undangan Pemateri.docx',
    ops: [
      // Temuan 1: berkas ini menggabungkan dua dokumen. Paragraf 22 dan
      // seterusnya adalah TOR lengkap beserta Lampiran RAB dan Susunan Acara —
      // 328 paragraf milik dokumen lain, yang sudah punya berkasnya sendiri.
      // Dihapus PALING AWAL supaya operasi berikutnya tidak salah sasaran:
      // "Ketua Pelaksana", "Cilegon, 07 Agustus 2025", dan "AKSARA" semuanya
      // muncul lagi di dalam TOR itu.
      { hapus: ['KERANGKA ACUAN KERJA'] },
      // Tanda tangan dan stempel contoh — milik orang sungguhan (T-061). Sesudah
      // TOR di atas dibuang, karena TOR itu membawa gambarnya sendiri.
      { hapusGambar: 3 },
      // Paragraf pindah halaman yang dulu menyambung ke TOR tertinggal dan
      // mencetak halaman kedua kosong di setiap undangan (T-061).
      { hapusPindahHalamanAkhir: 1 },

      { ganti: ['04/381/UN43.3.7/KT2HMIF/VIII/2025', '{nomor_lengkap}'] },
      { ganti: ['Cilegon, 07 Agustus 2025', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['11 (sebelas) Lembar Acuan Kegiatan', '{lampiran}'] },
      { ganti: ['Undangan Pembicara Gelar Wicara', '{perihal}'] },
      { ganti: ['Demisioner Ketua Himpunan HMIF 1.0', '{tujuan_jabatan}'] },
      { ganti: ['di Cilegon', '{tujuan_alamat}'] },

      { ganti: ['AKSARA (Aktualisasi Kepemimpinan Seimbang yang Rasional dan Amanah)', '{nama_kegiatan} ({tema_kegiatan})'] },
      { ganti: ['Saudara Nur Ali Arfan', 'Saudara {tujuan_nama}'] },
      { ganti: ['dengan topik Kepemimpinan', 'dengan topik {topik_materi}'] },
      { ganti: ['Nur Ali Arfan', '{tujuan_nama}'] },

      { paragraf: ['Hari, tanggal:', 'Hari, tanggal: {hari_tanggal}'] },
      { paragraf: ['Waktu:', 'Waktu: {waktu}'] },
      { paragraf: ['Tempat:', 'Tempat: {tempat}'] },

      { sel: [0, 0, 0, ['{label_atas}']] },
      ...ttdDua(0, 1, 2),
    ],
  },

  // =========================================================================
  {
    keluaran: 'surat-04-undangan-sambutan.docx',
    sumber: 'Contoh Surat Undangan dan Sambutan.docx',
    ops: [
      // Tanda tangan dan stempel contoh — milik orang sungguhan (T-061).
      { hapusGambar: 3 },
      { ganti: ['04/492/UN43.3.7/MUSMAIF/X/2025', '{nomor_lengkap}'] },
      { ganti: ['Cilegon, 03 Oktober 2025', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['1 (satu) Lembar Susunan Acara', '{lampiran}'] },
      { ganti: ['Undangan Menghadiri Kegiatan MUSMAIF', '{perihal}'] },
      { ganti: ['MUSMAIF (Musyawarah Mahasiswa Informatika)', '{nama_kegiatan} ({tema_kegiatan})'] },
      { ganti: ['kepada DPM Fakultas Teknik Universitas Sultan Ageng Tirtayasa', 'kepada {tujuan_nama}'] },
      { ganti: ['Dewan Perwakilan Mahasiswa Fakultas Teknik UNTIRTA', '{tujuan_nama}'] },
      { ganti: ['di Cilegon', '{tujuan_alamat}'] },

      { paragraf: ['Hari, tanggal:', 'Hari, tanggal: {hari_tanggal}'] },
      { paragraf: ['Waktu:', 'Waktu: {waktu}'] },
      { paragraf: ['Tempat:', 'Tempat: {tempat}'] },

      // Tabel tanda tangan berkas ini hanya dua baris — tanpa sel gabungan
      // {label_atas} di atasnya. Tidak ditambahkan; menyeragamkannya dengan
      // surat lain berarti mengubah tata letak surat aslinya.
      ...ttdDua(0, 0, 1),

      // Lampiran I: enam baris rundown disisakan satu sebagai badan loop.
      { hapusBaris: [1, [2, 3, 4, 5, 6]] },
      { sel: [1, 1, 0, ['{#rundown}{hari_tanggal}']] },
      { sel: [1, 1, 1, ['{waktu}']] },
      { sel: [1, 1, 2, ['{acara}']] },
      { sel: [1, 1, 3, ['{keterangan}{/rundown}']] },
    ],
  },

  // =========================================================================
  {
    keluaran: 'surat-05-peminjaman-barang.docx',
    sumber: 'Contoh Surat Peminjaman Barang.docx',
    ops: [
      // Tanda tangan dan stempel contoh — milik orang sungguhan (T-061).
      { hapusGambar: 3 },
      { ganti: ['05/379/UN43.3.7/KT2HMIF/VIII/2025', '{nomor_lengkap}'] },
      { ganti: ['Senin, 04 Agustus 2025', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['Lampiran  : -', 'Lampiran  : {lampiran}'] },
      { ganti: ['Permohonan Peminjaman Tandu', '{perihal}'] },
      { ganti: ['Kepala Badan Penanggulangan Bencana Daerah (BPBD) Kota Cilegon', '{tujuan_nama}'] },
      { ganti: ['di Tempat', '{tujuan_alamat}'] },
      { ganti: ['AKSARA (Aktualisasi Kepemimpinan Seimbang yang Rasional dan Amanah)', '{nama_kegiatan} ({tema_kegiatan})'] },
      { ganti: ['meminjam Tandu guna', 'meminjam {barang} guna'] },
      { ganti: ['Selasa - Kamis, 19 - 21 Agustus 2025', '{hari_tanggal}'] },
      { ganti: ['Kampus FT UNTIRTA', '{tempat}'] },

      // Tabel kebutuhan: satu baris data disisakan sebagai badan {#items}.
      { sel: [0, 1, 0, ['{#items}{no}']] },
      { sel: [0, 1, 1, ['{kebutuhan}']] },
      { sel: [0, 1, 2, ['{banyaknya}{/items}']] },

      { sel: [1, 0, 0, ['{label_atas}']] },
      ...ttdDua(1, 1, 2),
    ],
  },

  // =========================================================================
  {
    keluaran: 'surat-05-peminjaman-ruangan.docx',
    sumber: 'Contoh Surat Peminjaman Ruangan.docx',
    ops: [
      // Tanda tangan dan stempel contoh — milik orang sungguhan (T-061).
      { hapusGambar: 3 },
      { ganti: ['05/491/UN43.3.7/MUSMAIF/IX/2025', '{nomor_lengkap}'] },
      { ganti: ['Senin, 29 September 2025', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['Lampiran  : -', 'Lampiran  : {lampiran}'] },
      { ganti: ['Permohonan Peminjaman Ruang Auditorium FT', '{perihal}'] },
      { ganti: ['Kepala Bagian Sekretariat', '{tujuan_nama}'] },
      { ganti: ['Fakultas Teknik UNTIRTA', '{tujuan_jabatan}'] },
      { ganti: ['di Cilegon', '{tujuan_alamat}'] },
      { ganti: ['MUSMAIF (Musyawarah Mahasiswa Informatika)', '{nama_kegiatan} ({tema_kegiatan})'] },
      { ganti: ['meminjam Ruangan Auditorium FT guna', 'meminjam {ruangan} guna'] },
      { ganti: ['Kamis, 09 Oktober 2025', '{hari_tanggal}'] },
      { ganti: ['16.00 - selesai', '{waktu}'] },
      { ganti: ['Tempat      : Auditorium FT', 'Tempat      : {tempat}'] },

      { sel: [0, 0, 0, ['{label_atas}']] },
      ...ttdDua(0, 1, 2),
    ],
  },

  // =========================================================================
  // Template umum untuk surat tanpa contoh resmi: Pengajuan (01), Peringatan
  // (06), Keputusan (07), Piagam (09) — ADR-028, ADR-029. Diturunkan dari
  // Peminjaman Ruangan karena kop, kepala surat, dan blok TTD dua kolomnya
  // sudah persis bentuk baku HMIF; hanya badannya yang diganti isi bebas.
  {
    keluaran: 'surat-umum.docx',
    sumber: 'Contoh Surat Peminjaman Ruangan.docx',
    ops: [
      { hapusGambar: 3 },
      { ganti: ['05/491/UN43.3.7/MUSMAIF/IX/2025', '{nomor_lengkap}'] },
      { ganti: ['Senin, 29 September 2025', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['Lampiran  : -', 'Lampiran  : {lampiran}'] },
      { ganti: ['Permohonan Peminjaman Ruang Auditorium FT', '{perihal}'] },
      { ganti: ['Kepala Bagian Sekretariat', '{tujuan_nama}'] },

      // Baris instansi tujuan opsional: paragraf pembuka/penutup kondisi yang
      // berdiri sendiri dibuang paragraphLoop, jadi tujuan tanpa instansi tidak
      // menyisakan baris kosong di antara nama dan alamat.
      { sisip: ['Fakultas Teknik UNTIRTA', '{#ada_tujuan_jabatan}'] },
      { paragraf: ['Fakultas Teknik UNTIRTA', '{tujuan_jabatan}'] },
      { sisip: ['di Cilegon', '{/ada_tujuan_jabatan}'] },
      { ganti: ['di Cilegon', '{tujuan_alamat}'] },

      // Badan surat: satu paragraf template per paragraf isi, sehingga perataan
      // dan indentasi paragraf contoh diwarisi setiap paragraf isi.
      { sisip: ['Sehubungan dengan akan diselenggarakannya', '{#paragraf_isi}'] },
      { paragraf: ['Sehubungan dengan akan diselenggarakannya', '{teks}'] },
      { sisip: ['Hari, tanggal', '{/paragraf_isi}'] },
      { hapus: ['Hari, tanggal', 'Demikian surat ini kami sampaikan'] },

      // Tanpa nama panitia di atas blok TTD; baris sel tunggalnya dibuang.
      { hapusBaris: [0, [0]] },
      ...ttdDua(0, 0, 1),
    ],
  },

  // =========================================================================
  {
    keluaran: 'surat-08-kerja-sama.docx',
    sumber: 'Contoh Surat Permohonan Kerja Sama.docx',
    ops: [
      // Tanda tangan dan stempel contoh — milik orang sungguhan (T-061).
      { hapusGambar: 3 },
      { ganti: ['08/376/UN43.3.7/KT2HMIF/VIII/2025', '{nomor_lengkap}'] },
      { ganti: ['Cilegon, 02 Agustus 2025', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['Lampiran  : -', 'Lampiran  : {lampiran}'] },
      { ganti: ['Permohonan Kerjasama Rumah Sakit', '{perihal}'] },
      { ganti: ['Rumah Sakit Krakatau Medika', '{tujuan_nama}'] },
      { ganti: ['di Tempat', '{tujuan_alamat}'] },
      { ganti: ['AKSARA (Aktualisasi Kepemimpinan Seimbang yang Rasional dan Amanah)', '{nama_kegiatan} ({tema_kegiatan})'] },
      { ganti: ['kerjasama dengan Rumah Sakit Bapak/Ibu/Saudara', 'kerjasama dengan {jenis_mitra} Bapak/Ibu/Saudara'] },
      // Kalimat ini menyebut nama kegiatan contoh sekali lagi, terpisah dari
      // "AKSARA (…)" di atas. Tanpa operasi ini setiap surat kerja sama berbunyi
      // "panitia AKSARA" apa pun kegiatannya (ditemukan T-059, 2026-10-15).
      { ganti: ['Kami selaku panitia AKSARA bermaksud', 'Kami selaku panitia {nama_kegiatan} bermaksud'] },
      { ganti: ['Selasa - Kamis, 19 - 21 Agustus 2025', '{hari_tanggal}'] },
      { ganti: ['Kampus FT UNTIRTA', '{tempat}'] },

      { sel: [0, 0, 0, ['{label_atas}']] },
      ...ttdDua(0, 1, 2),
    ],
  },


  // =========================================================================
  {
    keluaran: 'tor.docx',
    sumber: 'TOR_KT1_2025.docx',
    ops: [
      // --- sampul
      { paragraf: ['SYNCHRONIZE', '{nama_kegiatan}'] },
      { paragraf: ['TAHUN 2025', 'TAHUN {tahun}'] },

      // --- bagian 1-3: nama, tema, gambaran umum (PRD F-10.1)
      { paragraf: ['Nama kegiatan', 'Nama kegiatan    : {nama_kegiatan}'] },
      { paragraf: ['Tema kegiatan', 'Tema kegiatan                 : {tema_kegiatan}'] },

      // Gambaran umum di berkas contoh dua paragraf. Cukup satu placeholder:
      // `linebreaks: true` mengubah baris baru pada teks menjadi <w:br/>, jadi
      // isi berapa paragraf pun tetap tercetak dengan pemisah yang benar.
      { paragraf: ['Kegiatan dimulai dengan Technical Meeting', '{gambaran_umum}'] },
      { hapusHingga: ['Pelaksanaan Hari H berlangsung 2 hari', 'Tujuan Kegiatan'] },

      // --- bagian 4: tujuan kegiatan (daftar berulang)
      { sisip: ['Meningkatkan rasa kepemilikan', '{#tujuan}'] },
      { paragraf: ['Meningkatkan rasa kepemilikan', '{teks}'] },
      { sisip: ['Menumbuhkan rasa kekeluargaan', '{/tujuan}'] },
      { hapusHingga: ['Menumbuhkan rasa kekeluargaan', 'Bentuk Acara'] },

      // --- bagian 5: bentuk acara (teks + sub-bagian berulang)
      { paragraf: ['Kegiatan SYNCHRONIZE dilaksanakan dalam bentuk', '{bentuk_acara}'] },
      { sisip: ['1. Technical Meeting (Online)', '{#bentuk}'] },
      { paragraf: ['1. Technical Meeting (Online)', '{judul}'] },
      { paragraf: ['Pada kegiatan Technical Meeting (TM) di tanggal', '{uraian}'] },
      { sisip: ['2. Pra 1, Pra 2, dan Pra 3 (Offline)', '{/bentuk}'] },
      { hapusHingga: ['2. Pra 1, Pra 2, dan Pra 3 (Offline)', 'Waktu dan Tempat Pelaksanaan'] },

      // --- bagian 6: waktu & tempat, berulang per sesi
      { sisip: ['Technical Meeting', '{#sesi}'] },
      { paragraf: ['Technical Meeting', '{nama_sesi}'] },
      { paragraf: ['Hari, Tanggal:', 'Hari, Tanggal: {hari_tanggal}'] },
      { paragraf: ['Waktu:', 'Waktu: {waktu}'] },
      { paragraf: ['Tempat:', 'Tempat: {tempat}'] },
      { sisip: ['Pra 1', '{/sesi}'] },
      { hapusHingga: ['Pra 1', 'Sasaran Peserta'] },

      // --- bagian 7: sasaran peserta
      { paragraf: ['Peserta SYNCHRONIZE merupakan', '{sasaran_peserta}'] },

      // --- bagian 8: kondisi pelaksanaan
      { sisip: ['Technical Meeting: Peserta mengikuti', '{#kondisi}'] },
      { paragraf: ['Technical Meeting: Peserta mengikuti', '{nama_sesi}: {ketentuan}'] },
      { sisip: ['Pra 1-3: Peserta mengikuti', '{/kondisi}'] },
      { hapusHingga: ['Pra 1-3: Peserta mengikuti', 'Parameter Kelulusan:'] },

      // --- bagian 9: parameter kelulusan
      { sisip: ['Kehadiran minimal 80%', '{#parameter}'] },
      { paragraf: ['Kehadiran minimal 80%', '{kriteria} (bobot {bobot})'] },
      { sisip: ['Penugasan (bobot 20%)', '{/parameter}'] },
      { hapusHingga: ['Penugasan (bobot 20%)', 'KKM:'] },
      { paragraf: ['KKM:', 'KKM: {kkm}'] },

      // --- bagian 10: rangkaian acara, berulang per sesi
      //
      // Berkas contoh merinci tiap sesi sampai tingkat butir arahan pemateri —
      // 125 paragraf untuk satu kegiatan. PRD F-10.1 §10 menetapkan bentuk yang
      // jauh lebih ringkas: "Repeatable per sesi: Nama + Uraian". Yang diikuti
      // PRD, karena template harus melayani kegiatan apa pun, bukan
      // mengabadikan susunan SYNCHRONIZE 2025.
      { sisip: ['Technical Meeting', '{#rangkaian}'] },
      { paragraf: ['Technical Meeting', '{nama}'] },
      { paragraf: ['Pada kegiatan Technical Meeting (TM) di tanggal', '{uraian}'] },
      { sisip: ['Pra 1', '{/rangkaian}'] },
      { hapusHingga: ['Pra 1', 'Rancangan Anggaran Biaya'] },

      // --- bagian 11 & 12: rujukan ke lampiran
      { ganti: ['Rencana anggaran biaya SYNCHRONIZE terlampir I.', 'Rencana anggaran biaya {nama_kegiatan} terlampir I.'] },
      { ganti: ['Susunan acara SYNCHRONIZE terlampir II.', 'Susunan acara {nama_kegiatan} terlampir II.'] },

      // --- bagian 13: penutup
      { paragraf: ['Demikian kerangka acuan atau TOR ini dibuat', '{penutup}'] },

      // --- bagian 14: tanda tangan (satu penandatangan, seluruhnya satu sel)
      { sel: [0, 0, 2, ['{kota}, {tanggal_format}', '{#kanan}{jabatan}', '{%ttd}{%stempel}', '{nama}', 'NIM. {nim}{/kanan}']] },

      // --- Lampiran I: ringkasan RAB per divisi.
      // Baris Total diisi LEBIH DULU karena hapusBaris di bawah menggeser
      // indeksnya.
      { sel: [1, 10, 1, ['{rab_total}']] },
      { sel: [1, 1, 0, ['{#rab_divisi}{no}']] },
      { sel: [1, 1, 1, ['{divisi}']] },
      { sel: [1, 1, 2, ['{besaran}{/rab_divisi}']] },
      { hapusBaris: [1, [2, 3, 4, 5, 6, 7, 8, 9]] },

      // --- Lampiran II: susunan acara.
      //
      // Berkas contoh memakai LIMA tabel terpisah, satu per sesi. Dijadikan satu
      // tabel dengan loop bersarang: {#sesi_rundown} mengulang seluruh kelompok
      // baris — nama sesi, dua baris kepala, isi, total — sekali per sesi, dan
      // {#rundown} di dalamnya mengulang baris isinya. Bentuk tabelnya, enam
      // kolom dengan kepala bertingkat, tidak berubah sama sekali.
      { sel: [3, 0, 0, ['{#sesi_rundown}{nama_sesi}']] },
      { sel: [3, 3, 0, ['{#rundown}{hari_tanggal}']] },
      { sel: [3, 3, 1, ['{mulai}']] },
      { sel: [3, 3, 2, ['{selesai}']] },
      { sel: [3, 3, 3, ['{durasi}']] },
      { sel: [3, 3, 4, ['{acara}']] },
      { sel: [3, 3, 5, ['{pj}{/rundown}']] },
      { sel: [3, 11, 2, ['{total_durasi}']] },
      { sel: [3, 11, 3, ['{rentang_waktu}{/sesi_rundown}']] },
      { hapusBaris: [3, [4, 5, 6, 7, 8, 9, 10]] },

      // Empat tabel sesi sisanya dihapus SEBELUM tabel rincian di bawah, supaya
      // indeks yang dipakai di sini masih indeks berkas aslinya.
      { hapusTabel: [4, 5, 6, 7] },

      // Rincian RAB per item adalah milik Proposal (PRD F-10.2 §8), bukan TOR:
      // PRD F-10.1 §12 hanya meminta ringkasan per divisi beserta totalnya.
      { hapusHingga: ['Dengan Rincian:', 'Lampiran II. Susunan Kegiatan'] },
    ],
  },

  // =========================================================================
  {
    keluaran: 'proposal.docx',
    sumber: 'Proposal KT1 IF25.docx',
    ops: [
      // --- bagian 1: halaman sampul
      { paragraf: ['SYNCHRONIZE', '{nama_kegiatan}'] },
      { paragraf: ['TAHUN 2025', 'TAHUN {tahun}'] },
      { paragraf: ['KEGIATAN SYNCHRONIZE', 'KEGIATAN {nama_kegiatan}'] },

      // --- bagian 2: lembar pengesahan — ENAM penandatangan.
      //
      // Empat di antaranya bukan pengguna sistem: Ketua BEM, Wakil Dekan III,
      // dan Ketua Program Studi. Dua yang terakhir ber-NIP, bukan NIM. Model
      // {#kiri}/{#kanan} (ADR-021) tidak cukup di sini, jadi tiap posisi memakai
      // placeholder bernama sendiri. Lihat Temuan 4 di TEMPLATE_MAPPING.md.
      { sel: [0, 1, 0, ['Ketua pelaksana ', '{ketupel_nama}', 'NIM. {ketupel_nim}']] },
      { sel: [0, 1, 2, [' Sekretaris', '{sekretaris_nama}', 'NIM. {sekretaris_nim}']] },
      { sel: [0, 2, 0, ['Ketua BEM FT. UNTIRTA', '{ketua_bem_nama}', 'NIM. {ketua_bem_nim}']] },
      { sel: [0, 2, 2, ['Ketua HMIF', '{ketua_himpunan_nama}', 'NIM. {ketua_himpunan_nim}']] },
      { sel: [0, 3, 0, ['Wakil Dekan Bidang III ', 'FT. UNTIRTA', '{wd3_nama}', 'NIP. {wd3_nip}']] },
      { sel: [0, 3, 2, ['Ketua Program Studi Informatika', 'FT. UNTIRTA', '{kaprodi_nama}', 'NIP. {kaprodi_nip}']] },

      // --- bagian 3: pendahuluan
      { paragraf: ['Himpunan Mahasiswa Informatika (HMIF) merupakan wadah', '{latar_belakang}'] },
      { hapusHingga: ['SYNCHRONIZE menjadi tahap awal pembinaan', 'Landasan Kegiatan'] },
      { paragraf: ['Program kerja Himpunan Mahasiswa Informatika', '{landasan_kegiatan}'] },

      { ganti: ['Asas Pelaksanaan kegiatan SYNCHRONIZE terdiri dari:', 'Asas Pelaksanaan kegiatan {nama_kegiatan} terdiri dari:'] },
      { sisip: ['Asas keterbukaan', '{#asas}'] },
      { paragraf: ['Asas keterbukaan', '{teks}'] },
      { sisip: ['Asas demokratis', '{/asas}'] },
      { hapusHingga: ['Asas demokratis', 'Tujuan Kegiatan'] },

      { ganti: ['Kegiatan SYNCHRONIZE diselenggarakan dengan tujuan sebagai berikut:', 'Kegiatan {nama_kegiatan} diselenggarakan dengan tujuan sebagai berikut:'] },
      { sisip: ['Meningkatkan rasa kepemilikan', '{#tujuan}'] },
      { paragraf: ['Meningkatkan rasa kepemilikan', '{teks}'] },
      { sisip: ['Menumbuhkan rasa kekeluargaan', '{/tujuan}'] },
      { hapusHingga: ['Menumbuhkan rasa kekeluargaan', 'REALISASI KEGIATAN'] },

      // --- bagian 4: realisasi kegiatan
      { paragraf: ['Peserta SYNCHRONIZE merupakan', '{sasaran}'] },
      { paragraf: ['Kegiatan SYNCHRONIZE dilaksanakan dalam bentuk', '{bentuk_acara}'] },
      { ganti: ['Adapun waktu dan tempat pelaksanaan SYNCHRONIZE:', 'Adapun waktu dan tempat pelaksanaan {nama_kegiatan}:'] },

      { sisip: ['Technical Meeting', '{#sesi}'] },
      { paragraf: ['Technical Meeting', '{nama_sesi}'] },
      // Awalan "Waktu" saja akan mengenai judul "Waktu dan Tempat Pelaksanaan"
      // yang berada di atasnya. Spasi perataan berkas asli dipertahankan pada
      // teks penggantinya supaya kolom titik dua tetap lurus.
      { paragraf: ['Hari, tanggal ', 'Hari, tanggal       : {hari_tanggal}'] },
      { paragraf: ['Waktu    ', 'Waktu                 : {waktu}'] },
      { paragraf: ['Tempat   ', 'Tempat                : {tempat}'] },
      { sisip: ['Pra 1', '{/sesi}'] },
      { hapusHingga: ['Pra 1', 'Pengisi Acara'] },

      // Pengisi acara: tabel tiga kolom "peran : nama".
      { sel: [1, 0, 0, ['{#pengisi}{peran}']] },
      { sel: [1, 0, 1, [':']] },
      { sel: [1, 0, 2, ['{nama}{/pengisi}']] },
      { hapusBaris: [1, [1, 2]] },

      { paragraf: ['Kegiatan dimulai dengan Technical Meeting', '{gambaran_umum}'] },
      { hapusHingga: ['Pelaksanaan Hari H berlangsung 2 hari', 'Rangkaian Acara'] },

      { sisip: ['Technical Meeting', '{#rangkaian}'] },
      { paragraf: ['Technical Meeting', '{nama}'] },
      { paragraf: ['Pada kegiatan Technical Meeting (TM) di tanggal', '{uraian}'] },
      { sisip: ['Pra 1', '{/rangkaian}'] },
      { hapusHingga: ['Pra 1', 'Rencana Anggaran Biaya'] },

      // --- rujukan ketiga lampiran
      { ganti: ['Rencana Anggaran Biaya SYNCHRONIZE Terlampir I.', 'Rencana Anggaran Biaya {nama_kegiatan} Terlampir I.'] },
      { ganti: ['Struktur kepanitiaan acara SYNCHRONIZE Terlampir II.', 'Struktur kepanitiaan acara {nama_kegiatan} Terlampir II.'] },
      { ganti: ['Susunan Kegiatan SYNCHRONIZE Terlampir III.', 'Susunan Kegiatan {nama_kegiatan} Terlampir III.'] },

      // --- bagian 7: penutup
      { paragraf: ['Demikian proposal kegiatan SYNCHRONIZE ini disusun', '{penutup}'] },
      { hapus: ['Kami menyadari bahwa pelaksanaan kegiatan ini', 'Kami menyadari bahwa pelaksanaan kegiatan ini'] },

      // --- tanda tangan penutup
      { sel: [2, 0, 2, ['{kota}, {tanggal_format}', 'Ketua Pelaksana', '{ketupel_nama}', 'NIM. {ketupel_nim}']] },

      // --- Lampiran I: ringkasan RAB per divisi
      { sel: [3, 10, 1, ['{rab_total}']] },
      { sel: [3, 1, 0, ['{#rab_divisi}{no}']] },
      { sel: [3, 1, 1, ['{divisi}']] },
      { sel: [3, 1, 2, ['{besaran}{/rab_divisi}']] },
      { hapusBaris: [3, [2, 3, 4, 5, 6, 7, 8, 9]] },

      // --- Lampiran I lanjutan: rincian RAB per item.
      //
      // Berbeda dari TOR, rincian ini MEMANG milik Proposal (PRD F-10.2 §8).
      // Bentuknya dua tingkat: satu kelompok baris per divisi, dan di dalamnya
      // satu baris per item. Baris sub-kelompok berjudul ("KOMSUMSI PANITIA",
      // "KEBUTUHAN DIVISI") tidak dipertahankan — pengelompokannya tidak ada di
      // model data RAB, dan menirunya berarti mengarang struktur yang tidak
      // dapat diisi sistem.
      { sel: [4, 0, 0, ['{#rincian}{divisi}']] },
      { sel: [4, 3, 0, ['{#item}{no}']] },
      { sel: [4, 3, 1, ['{jenis_barang}']] },
      { sel: [4, 3, 2, ['{jumlah}']] },
      { sel: [4, 3, 3, ['{harga_satuan}']] },
      { sel: [4, 3, 4, ['{total}{/item}{/rincian}']] },
      { hapusBaris: [4, BARIS_RINCIAN] },

      // --- Lampiran II: struktur kepanitiaan, dua tingkat
      { sisip: ['Penasihat', '{#divisi_panitia}'] },
      { paragraf: ['Penasihat', '{nama_divisi}'] },
      { sisip: ['Ketua Program Studi:', '{#anggota}'] },
      { paragraf: ['Ketua Program Studi:', '{jabatan}: {nama}'] },
      { sisip: ['Sekretaris Program Studi:', '{/anggota}'] },
      { sisip: ['Sekretaris Program Studi:', '{/divisi_panitia}'] },
      { hapusHingga: ['Sekretaris Program Studi:', 'Lampiran III. Susunan Kegiatan'] },

      // --- Lampiran III: susunan acara, sama bentuknya dengan TOR
      { sel: [5, 0, 0, ['{#sesi_rundown}{nama_sesi}']] },
      { sel: [5, 3, 0, ['{#rundown}{hari_tanggal}']] },
      { sel: [5, 3, 1, ['{mulai}']] },
      { sel: [5, 3, 2, ['{selesai}']] },
      { sel: [5, 3, 3, ['{durasi}']] },
      { sel: [5, 3, 4, ['{acara}']] },
      { sel: [5, 3, 5, ['{pj}{/rundown}']] },
      { sel: [5, 11, 2, ['{total_durasi}']] },
      { sel: [5, 11, 3, ['{rentang_waktu}{/sesi_rundown}']] },
      { hapusBaris: [5, [4, 5, 6, 7, 8, 9, 10]] },
      { hapusTabel: [6, 7, 8, 9] },
    ],
  },

  // =========================================================================
  {
    keluaran: 'lpj.docx',
    sumber: 'Template LPJ HMIF.docx',
    ops: [
      // =====================================================================
      // OPERASI TABEL LEBIH DULU
      // =====================================================================
      // Penghapusan di bawah membuang lima tabel koordinator divisi dan satu
      // formulir fakultas. Indeks tabel di sini karena itu masih indeks berkas
      // asli — dan wajib tetap begitu.

      // Lembar pengesahan: empat penandatangan, dua di antaranya pihak fakultas
      // ber-NIP yang tidak punya akun di sistem (Temuan 4).
      { sel: [0, 1, 0, ['Ketua pelaksana ', '{ketupel_nama}', 'NIM. {ketupel_nim}']] },
      { sel: [0, 1, 2, [' Ketua Himpunan', '{ketua_himpunan_nama}', 'NIM. {ketua_himpunan_nim}']] },
      { sel: [0, 3, 0, ['Ketua Program Studi Informatika', '{kaprodi_nama}', 'NIP. {kaprodi_nip}']] },
      { sel: [0, 3, 2, ['Wakil Dekan Bidang III ', 'FT UNTIRTA', '{wd3_nama}', 'NIP. {wd3_nip}']] },

      // Tabel koordinator divisi, badan loop {#divisi_narasi}.
      { sel: [2, 0, 1, [': {koordinator}']] },
      { sel: [2, 1, 1, [': {#anggota}', '{nama}', '{/anggota}']] },

      // Lampiran materi kegiatan.
      { sel: [8, 1, 0, ['{#materi}{judul}']] },
      { sel: [8, 1, 1, ['{pengisi}']] },
      { sel: [8, 1, 2, ['{tautan}{/materi}']] },
      { hapusBaris: [8, [2, 3, 4]] },

      // Lampiran susunan acara.
      { sel: [9, 1, 0, ['{#rundown}{hari_tanggal}']] },
      { sel: [9, 1, 1, ['{waktu}']] },
      { sel: [9, 1, 2, ['{acara}']] },
      { sel: [9, 1, 3, ['{pj}{/rundown}']] },
      { hapusBaris: [9, BARIS_RUNDOWN_LPJ] },

      // =====================================================================
      // SAMPUL DAN LEMBAR PENGESAHAN
      // =====================================================================
      { paragraf: ['(nama kegiatan)', '{nama_kegiatan}'] },
      { paragraf: ['TAHUN 2025', 'TAHUN {tahun}'] },
      { paragraf: ['(NAMA KEGIATAN)', '{nama_kegiatan}'] },
      { paragraf: ['TAHUN 2025', 'TAHUN {tahun}'] },
      { paragraf: ['Cilegon, (Tanggal)', '{kota}, {tanggal_format}'] },

      // =====================================================================
      // TEMUAN 2 — halaman kerja yang bukan bagian LPJ
      // =====================================================================
      // Dua hal dibuang sekaligus di sini: catatan kerja untuk manusia yang
      // diakhiri "HAPUS HALAMAN INI JIKA SUDAH SEMUA", dan "FORM DAFTAR
      // PENGAJUAN ANGGARAN KEMAHASISWAAN TAHUN 2024" beserta tabel ceklisnya —
      // formulir milik fakultas, bukan bagian LPJ HMIF, dan tahunnya sudah
      // lewat. Dibiarkan, keduanya ikut tercetak pada setiap LPJ yang terbit.
      { hapusHingga: ['SOP LPJ yang sesuai ketentuan', 'PENDAHULUAN'] },

      // =====================================================================
      // ISI LAPORAN
      // =====================================================================
      { paragraf: ['pendahuluan', '{pendahuluan}'] },
      { paragraf: ['Nama Kegiatan :', 'Nama Kegiatan : {nama_kegiatan}'] },
      { paragraf: ['Tema Kegiatan:', 'Tema Kegiatan: {tema_kegiatan}'] },

      { sisip: ['xxx', '{#tujuan}'] },
      { paragraf: ['xxx', '{teks}'] },
      { sisip: ['xxx', '{/tujuan}'] },
      { hapus: ['xxx', 'xxx'] },

      // "TARGET PESERTA" hanya berupa judul tanpa isi contoh, jadi paragrafnya
      // disalin dari judul bagian berikutnya.
      { sisip: ['WAKTU PELAKSANAAN KEGIATAN', '{target_peserta}'] },

      { paragraf: ['Hari, tanggal:', 'Hari, tanggal: {hari_tanggal}'] },
      { paragraf: ['Waktu :', 'Waktu : {waktu}'] },
      { paragraf: ['Tempat:', 'Tempat: {tempat}'] },

      // Susunan kepanitiaan: dua tingkat, divisi lalu anggotanya. Enam paragraf
      // dibutuhkan dan berkas asli hanya menyediakan satu, jadi lima disalin.
      { sisip: ['Masukkan susunan kepanitiaan', '{#divisi_panitia}'] },
      { sisip: ['Masukkan susunan kepanitiaan', '{nama_divisi}'] },
      { sisip: ['Masukkan susunan kepanitiaan', '{#anggota}'] },
      { paragraf: ['Masukkan susunan kepanitiaan', '{jabatan}: {nama}'] },
      { sisip: ['PROSES PERENCANAAN', '{/anggota}'] },
      { sisip: ['PROSES PERENCANAAN', '{/divisi_panitia}'] },

      { paragraf: ['xxx', '{proses_perencanaan}'] },
      { hapus: ['boleh juga diisi langkah-langkah', 'boleh juga diisi langkah-langkah'] },
      { paragraf: ['TBA', '{pelaksanaan_kegiatan}'] },
      { paragraf: ['kalau berupa produk jadi boleh linknya', '{output}'] },
      { sisip: ['NARASI KEGIATAN', '{penutup}'] },

      // =====================================================================
      // NARASI PER DIVISI
      // =====================================================================
      // Contoh berisi tujuh divisi VOIF 2023 lengkap dengan narasinya — 360
      // paragraf. Satu blok disisakan sebagai badan loop {#divisi_narasi}; sisanya
      // dibuang. Tabel koordinator ikut terulang karena berada di antara tag
      // pembuka dan penutup yang keduanya berdiri sendiri di paragrafnya.
      //
      // Narasi Badan Pengurus Harian dibuang seluruhnya: bentuknya berbeda dari
      // narasi divisi (dua jabatan per blok, bukan koordinator + anggota), dan
      // BPH sudah tercakup sebagai salah satu divisi pada data kepanitiaan.
      { hapusHingga: ['BADAN PENGURUS HARIAN', 'NARASI KEGIATAN DIVISI-DIVISI'] },

      { sisip: ['Divisi Acara', '{#divisi_narasi}'] },
      { paragraf: ['Divisi Acara', '{nama_divisi}'] },
      { isiBagian: ['Narasi', 'Perencanaan', '{narasi}'] },
      { isiBagian: ['Perencanaan', 'Pelaksanaan', '{perencanaan}'] },
      { isiBagian: ['Pelaksanaan', 'Faktor Pendukung', '{pelaksanaan}'] },
      { isiBagian: ['Faktor Pendukung', 'Faktor Penghambat', '{pendukung}'] },
      { isiBagian: ['Faktor Penghambat', 'Saran dan Rekomendasi', '{penghambat}'] },
      { isiBagian: ['Saran dan Rekomendasi', 'Divisi Mentor dan Asisten Mentor', '{saran}'] },
      { sisip: ['Divisi Mentor dan Asisten Mentor', '{/divisi_narasi}'] },
      { hapusHingga: ['Divisi Mentor dan Asisten Mentor', 'Lampiran'] },

      // =====================================================================
      // LAMPIRAN
      // =====================================================================
      { hapus: ['DISESUAIKAN LAGI', 'DISESUAIKAN LAGI'] },
      { paragraf: ['Materi yang disampaikan kepada peserta', '{catatan_materi}'] },

      // "Lampiran Rancangan Anggaran Biaya (RAB)" pada berkas contoh hanya
      // berupa judul tanpa tabel apa pun — lihat Temuan 10. Sampai T-093
      // menambahkan tabelnya, ringkasan keuangan masuk sebagai satu blok teks.
      { sisip: ['Lampiran Susunan Acara', '{rab_ringkasan}'] },
      { sisip: ['Lampiran Foto/Dokumentasi', '{daftar_hadir}'] },

      { sisip: ['Dokumentasi Instagram', '{#dokumentasi}'] },
      { paragraf: ['Dokumentasi Instagram', '{caption}'] },
      { sisip: ['Pra Voyage of Informatic', '{/dokumentasi}'] },
      { hapus: ['Pra Voyage of Informatic'] },
    ],
  },
  // =========================================================================
  {
    keluaran: 'notulensi.docx',
    sumber: 'Template Notulensi.docx',
    ops: [
      // "NOTULENSI Rapat (Nama Rapat)" — kata "Rapat" ikut diganti, kalau tidak
      // judul rapat yang sudah memuat kata itu menghasilkan "Rapat Rapat Kerja".
      { ganti: ['Rapat (Nama Rapat)', '{judul}'] },

      // Tabel identitas rapat: kolom kedua hanya berisi ":".
      { sel: [1, 0, 1, [': {hari_tanggal}']] },
      { sel: [1, 1, 1, [': {waktu}']] },
      { sel: [1, 2, 1, [': {tempat}']] },
      { sel: [1, 3, 1, [': {perihal}']] },
      { sel: [1, 4, 1, [': {pemimpin_rapat}']] },
      { sel: [1, 5, 1, [': {notulis}']] },
      { sel: [1, 6, 1, [': {hadir}']] },

      // Agenda dan hasil rapat masing-masing daftar, dan tiap butir harus
      // menjadi PARAGRAF sendiri. Menaruh {#agenda}{teks}{/agenda} dalam satu
      // paragraf membuatnya loop sebaris: seluruh butir berdempet menjadi
      // "Butir satu.Butir dua." tanpa pemisah. Karena itu tag pembuka dan
      // penutup diberi paragrafnya sendiri, dan paragraf isian ".." yang sudah
      // ada menjadi badan loop-nya.
      //
      // Berkas asli hanya menyediakan satu paragraf ".." per bagian, jadi dua
      // paragraf tambahan disalin dari yang sudah ada — perataan dan formatnya
      // ikut terbawa.
      { sisip: ['..', '{#agenda}'] },
      { paragraf: ['..', '{teks}'] },
      { sisip: ['HASIL RAPAT:', '{/agenda}'] },

      // Setelah bagian agenda selesai, satu-satunya paragraf ".." yang tersisa
      // adalah milik hasil rapat.
      { sisip: ['..', '{#hasil}'] },
      { paragraf: ['..', '{teks}'] },
      { sisip: ['Cilegon, (Tanggal)', '{/hasil}'] },

      { ganti: ['Cilegon, (Tanggal)', '{kota}, {tanggal_format}'] },
      { paragraf: ['(.', '({notulis})'] },
    ],
  },
];

function jalankan(resep: Resep): { ok: boolean; pesan: string[] } {
  const pesan: string[] = [];
  const berkas = path.join(SUMBER, resep.sumber);

  if (!fs.existsSync(berkas)) {
    return { ok: false, pesan: [`sumber tidak ada: ${resep.sumber}`] };
  }

  const dok = new Dokumen(fs.readFileSync(berkas));

  for (const op of resep.ops) {
    if ('ganti' in op) {
      const [cari, jadi] = op.ganti;
      const harap = op.n ?? 1;
      const dapat = dok.ganti(cari, jadi);
      if (dapat !== harap) {
        pesan.push(`ganti ${JSON.stringify(cari)} — diharapkan ${harap}, dapat ${dapat}`);
      }
    } else if ('paragraf' in op) {
      const [awalan, jadi] = op.paragraf;
      if (!dok.gantiParagraf(awalan, jadi)) {
        pesan.push(`paragraf berawalan ${JSON.stringify(awalan)} tidak ditemukan`);
      }
    } else if ('sisip' in op) {
      const [awalan, teks] = op.sisip;
      if (!dok.sisipSebelum(awalan, teks)) {
        pesan.push(`sisip sebelum ${JSON.stringify(awalan)} tidak ditemukan`);
      }
    } else if ('hapus' in op) {
      const [dari, sampai] = op.hapus;
      const n = dok.hapusBlok(dari, sampai);
      if (n === 0) pesan.push(`hapus dari ${JSON.stringify(dari)} tidak mengenai apa pun`);
    } else if ('hapusHingga' in op) {
      const [dari, sebelum] = op.hapusHingga;
      if (dok.hapusHingga(dari, sebelum) === 0) {
        pesan.push(
          `hapusHingga ${JSON.stringify(dari)} -> ${JSON.stringify(sebelum)} tidak mengenai apa pun`,
        );
      }
    } else if ('hapusTabel' in op) {
      const n = dok.hapusTabel(op.hapusTabel);
      if (n !== op.hapusTabel.length) {
        pesan.push(`hapusTabel - diharapkan ${op.hapusTabel.length}, dapat ${n}`);
      }
    } else if ('hapusBaris' in op) {
      const [tabel, indeks] = op.hapusBaris;
      const n = dok.hapusBarisTabel(tabel, indeks);
      if (n !== indeks.length) {
        pesan.push(`hapusBaris tabel ${tabel} — diharapkan ${indeks.length}, dapat ${n}`);
      }
    } else if ('hapusPindahHalamanAkhir' in op) {
      const n = dok.hapusPindahHalamanAkhir();
      if (n !== op.hapusPindahHalamanAkhir) {
        pesan.push(`hapusPindahHalamanAkhir — diharapkan ${op.hapusPindahHalamanAkhir}, dapat ${n}`);
      }
    } else if ('hapusGambar' in op) {
      const n = dok.hapusGambar();
      if (n !== op.hapusGambar) pesan.push(`hapusGambar — diharapkan ${op.hapusGambar}, dapat ${n}`);
    } else if ('isiBagian' in op) {
      const [judul, berikut, teks] = op.isiBagian;
      if (!dok.isiBagian(judul, berikut, teks)) {
        pesan.push(`isiBagian ${JSON.stringify(judul)} -> ${JSON.stringify(berikut)} gagal`);
      }
    } else {
      const [tabel, baris, sel, isi] = op.sel;
      if (!dok.setSel(tabel, baris, sel, isi)) {
        pesan.push(`sel [${tabel},${baris},${sel}] tidak ditemukan`);
      }
    }
  }

  if (pesan.length > 0) return { ok: false, pesan };

  fs.mkdirSync(TUJUAN, { recursive: true });
  fs.writeFileSync(path.join(TUJUAN, resep.keluaran), dok.simpan());
  return { ok: true, pesan: [] };
}

function main(): void {
  tulis('');
  tulis(`  BANGUN TEMPLATE — ${RESEP.length} resep`);
  tulis('');

  let gagal = 0;
  for (const resep of RESEP) {
    const { ok, pesan } = jalankan(resep);
    tulis(`  ${ok ? '✓' : '✗'} ${resep.keluaran}`);
    if (!ok) {
      gagal++;
      for (const p of pesan) tulis(`      ${p}`);
    }
  }

  tulis('');
  if (gagal > 0) {
    tulis(`  GAGAL — ${gagal} resep tidak lengkap. Tidak ada berkas yang ditulis untuk resep itu.`);
    tulis('');
    process.exit(1);
  }

  tulis(`  Selesai. Periksa dengan: npx tsx scripts/template-dryrun.ts`);
  tulis('');
}

main();
