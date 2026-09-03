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
  /** Hapus baris-baris tabel; indeks mulai 0. */
  | { hapusBaris: [number, number[]] }
  /** Tulis isi sel tabel, satu untai per paragraf. */
  | { sel: [number, number, number, string[]] };

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

const RESEP: Resep[] = [
  // =========================================================================
  {
    keluaran: 'surat-02-keterangan-aktif.docx',
    sumber: 'Contoh Surat Aktif Organisasi.docx',
    ops: [
      { ganti: ['02/274/UN43.3.7/HMIF/VII/2025', '{nomor_lengkap}'] },
      { ganti: ['Nama:', 'Nama: {nama_pemohon}'] },
      { ganti: ['NIM :', 'NIM : {nim_pemohon}'] },
      { ganti: ['Jabatan:', 'Jabatan: {jabatan_pemohon}'] },
      { ganti: ['Kelengkapan Persyaratan Administrasi Beasiswa.', '{keperluan}'] },
      { ganti: ['Cilegon, 16 Juli 2025', '{kota}, {tanggal_surat_format}'] },

      // Satu penandatangan saja, dan tabelnya cuma satu sel — jadi blok ditulis
      // langsung, bukan lewat ttdDua().
      { ganti: ['Ketua HMIF FT UNTIRTA', '{#kanan}{jabatan}'] },
      { sisip: ['Dicky Saputra', '{%ttd}{%stempel}'] },
      { ganti: ['Dicky Saputra', '{nama}'] },

      // Berkas ini menulis "NIM" tanpa titik, berbeda dari enam surat lain.
      // Dipertahankan apa adanya.
      { ganti: ['NIM 3337220032', 'NIM {nim}{/kanan}'] },
    ],
  },

  // =========================================================================
  {
    keluaran: 'surat-03-aspirasi.docx',
    sumber: '018_Surat Aspirasi Keorganisasian Mahasiswa Fakultas Teknik.docx',
    ops: [
      { ganti: ['03/018/UN43.3.7/HMIF/VIII/2026', '{nomor_lengkap}'] },
      { ganti: ['Cilegon, 19 Agustus 2026', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['1 (satu) Lembar', '{lampiran}'] },
      { ganti: ['Aspirasi Keorganisasian Mahasiswa Fakultas Teknik', '{perihal}'] },
      { ganti: ['Ketua DPM FT UNTIRTA', '{tujuan_nama}'] },
      { ganti: ['di Tempat', '{tujuan_alamat}'] },

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
      //     {#poin}{judul}
      //     {#paragraf}
      //     {teks}
      //     {/paragraf}
      //     {/poin}
      { paragraf: ['1. Penyesuaian Timeline', '{#poin}{judul}'] },
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
  {
    keluaran: 'surat-08-kerja-sama.docx',
    sumber: 'Contoh Surat Permohonan Kerja Sama.docx',
    ops: [
      { ganti: ['08/376/UN43.3.7/KT2HMIF/VIII/2025', '{nomor_lengkap}'] },
      { ganti: ['Cilegon, 02 Agustus 2025', '{kota}, {tanggal_surat_format}'] },
      { ganti: ['Lampiran  : -', 'Lampiran  : {lampiran}'] },
      { ganti: ['Permohonan Kerjasama Rumah Sakit', '{perihal}'] },
      { ganti: ['Rumah Sakit Krakatau Medika', '{tujuan_nama}'] },
      { ganti: ['di Tempat', '{tujuan_alamat}'] },
      { ganti: ['AKSARA (Aktualisasi Kepemimpinan Seimbang yang Rasional dan Amanah)', '{nama_kegiatan} ({tema_kegiatan})'] },
      { ganti: ['kerjasama dengan Rumah Sakit Bapak/Ibu/Saudara', 'kerjasama dengan {jenis_mitra} Bapak/Ibu/Saudara'] },
      { ganti: ['Selasa - Kamis, 19 - 21 Agustus 2025', '{hari_tanggal}'] },
      { ganti: ['Kampus FT UNTIRTA', '{tempat}'] },

      { sel: [0, 0, 0, ['{label_atas}']] },
      ...ttdDua(0, 1, 2),
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
    } else if ('hapusBaris' in op) {
      const [tabel, indeks] = op.hapusBaris;
      const n = dok.hapusBarisTabel(tabel, indeks);
      if (n !== indeks.length) {
        pesan.push(`hapusBaris tabel ${tabel} — diharapkan ${indeks.length}, dapat ${n}`);
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
