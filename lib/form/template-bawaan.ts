/**
 * template-bawaan — template resmi awal (ADR-038 #3). MURNI.
 * Disemai sekali bila belum ada (dicocokkan dari nama); setelah itu dikelola
 * Sekum/Admin dari halaman Template. Id di sini hanya rujukan internal
 * template — setiap form yang dibuat mendapat id baru (salinStruktur).
 *
 * Template Evaluasi diturunkan dari formulir Evaluasi SYNCHRONIZE milik
 * panitia, dibuat umum (tanpa nama acara). KT1 sengaja minimal: isinya
 * menyusul dari panitia.
 */

import type { Kategori, Opsi, Pertanyaan, Struktur } from './skema';

let n = 0;
const id = (awalan: string) => `${awalan}${++n}`;

const tanya = (judul: string, tipe: Pertanyaan['tipe'], ext: Partial<Omit<Pertanyaan, 'id' | 'judul' | 'tipe'>> = {}): Pertanyaan => ({
  id: id('q'),
  tipe,
  judul,
  deskripsi: '',
  wajib: true,
  opsi: {},
  peran: null,
  ...ext,
});
const pilihan = (...label: string[]): Opsi['pilihan'] => label.map((l) => ({ id: id('o'), label: l }));
const skala = (judul: string): Pertanyaan =>
  tanya(judul, 'SKALA', { opsi: { skala_min: 1, skala_maks: 5, label_min: 'Sangat Tidak Puas', label_maks: 'Sangat Puas' } });

export interface TemplateBawaan {
  nama: string;
  kategori: Kategori;
  deskripsi: string;
  isi: Struktur;
}

const dataDiri = () => [
  tanya('Nama lengkap', 'TEKS_SINGKAT', { peran: 'nama_lengkap' }),
  tanya('NIM', 'TEKS_SINGKAT', { peran: 'nim', opsi: { maks: 20 } }),
  tanya('Angkatan', 'TEKS_SINGKAT', { peran: 'angkatan', opsi: { maks: 4 }, deskripsi: 'Contoh: 2024' }),
  tanya('Nomor WhatsApp', 'TEKS_SINGKAT', { peran: 'no_hp', opsi: { maks: 20 } }),
  tanya('Email', 'EMAIL', { peran: 'email' }),
];

export const TEMPLATE_BAWAAN: TemplateBawaan[] = [
  {
    nama: 'Form Evaluasi Acara',
    kategori: 'EVALUASI',
    deskripsi: 'Penilaian 1–5 untuk setiap aspek acara ditambah saran tertulis. Anonim secara bawaan.',
    isi: {
      bagian: [
        {
          id: 'b-eval-1',
          judul: 'Penilaian kegiatan',
          deskripsi:
            'Formulir ini mengumpulkan umpan balik yang konstruktif dan terukur mengenai seluruh rangkaian kegiatan. Jawaban teman-teman menjadi bahan evaluasi panitia untuk menyempurnakan program berikutnya. Identitas pengisi dirahasiakan - mohon isi dengan jujur dan objektif.',
          lanjut_ke: null,
          pertanyaan: [
            skala('Tingkat kepuasan keseluruhan'),
            skala('Kejelasan informasi dan komunikasi dari panitia'),
            skala('Kesesuaian jadwal pelaksanaan dengan rencana'),
            skala('Kecukupan dan kesiapan fasilitas pendukung'),
            skala('Kualitas dan ketepatan waktu penyediaan konsumsi'),
            skala('Kualitas penyampaian oleh pemateri/fasilitator'),
            skala('Manfaat dan pengetahuan baru yang diperoleh dari kegiatan ini'),
            skala('Efektivitas sesi interaksi antarpeserta'),
          ],
        },
        {
          id: 'b-eval-2',
          judul: 'Saran dan masukan',
          deskripsi: '',
          lanjut_ke: null,
          pertanyaan: [
            tanya('Aspek terbaik dari kegiatan ini yang wajib dipertahankan', 'PARAGRAF'),
            tanya('Bagian yang paling perlu diperbaiki dan saran perbaikannya', 'PARAGRAF'),
            tanya('Pesan dan kesan untuk kegiatan ini ke depannya', 'PARAGRAF'),
          ],
        },
      ],
    },
  },
  {
    nama: 'Form Pendaftaran Peserta',
    kategori: 'PENDAFTARAN',
    deskripsi: 'Data diri pendaftar; setiap pendaftar otomatis masuk daftar Peserta acara.',
    isi: {
      bagian: [
        { id: 'b-daftar-1', judul: 'Data diri', deskripsi: '', lanjut_ke: null, pertanyaan: dataDiri() },
        {
          id: 'b-daftar-2',
          judul: 'Pembayaran',
          deskripsi: 'Lewati bila kegiatan ini gratis.',
          lanjut_ke: null,
          pertanyaan: [tanya('Bukti pembayaran', 'UNGGAH_BERKAS', { wajib: false, opsi: { jenis: ['gambar', 'pdf'], maks_mb: 4 } })],
        },
      ],
    },
  },
  {
    nama: 'Form Open Recruitment',
    kategori: 'OPEN_RECRUITMENT',
    deskripsi: 'Pendaftaran calon pengurus: data diri, pilihan departemen, motivasi, dan berkas pendukung.',
    isi: {
      bagian: [
        { id: 'b-oprec-1', judul: 'Data diri', deskripsi: '', lanjut_ke: null, pertanyaan: dataDiri() },
        {
          id: 'b-oprec-2',
          judul: 'Minat & motivasi',
          deskripsi: '',
          lanjut_ke: null,
          pertanyaan: [
            tanya('Departemen pilihan pertama', 'DROPDOWN', { opsi: { pilihan: pilihan('Kaderisasi', 'Eksternal', 'Internal', 'Minat dan Bakat', 'Kominfo', 'Kewirausahaan') } }),
            tanya('Departemen pilihan kedua', 'DROPDOWN', { wajib: false, opsi: { pilihan: pilihan('Kaderisasi', 'Eksternal', 'Internal', 'Minat dan Bakat', 'Kominfo', 'Kewirausahaan') } }),
            tanya('Motivasi bergabung dengan HMIF', 'PARAGRAF'),
            tanya('Pengalaman organisasi atau kepanitiaan', 'PARAGRAF', { wajib: false }),
            tanya('Bersedia aktif selama satu periode kepengurusan?', 'PILIHAN_GANDA', { opsi: { pilihan: pilihan('Ya, bersedia', 'Belum yakin') } }),
          ],
        },
        {
          id: 'b-oprec-3',
          judul: 'Berkas',
          deskripsi: '',
          lanjut_ke: null,
          pertanyaan: [tanya('CV atau portofolio (PDF)', 'UNGGAH_BERKAS', { wajib: false, opsi: { jenis: ['pdf'], maks_mb: 4 } })],
        },
      ],
    },
  },
  {
    nama: 'Form Pendataan Pengurus',
    kategori: 'PENDATAAN_PENGURUS',
    deskripsi: 'Pengurus memperbarui data dirinya; Sekum menerapkannya ke Data Pengurus.',
    isi: {
      bagian: [
        {
          id: 'b-data-1',
          judul: 'Data pengurus',
          deskripsi: 'Pastikan NIM sesuai KTM - data ini dipakai untuk surat dan administrasi himpunan.',
          lanjut_ke: null,
          pertanyaan: [
            ...dataDiri(),
            tanya('Jabatan', 'TEKS_SINGKAT', { peran: 'jabatan', deskripsi: 'Contoh: Staf Departemen Kaderisasi' }),
            tanya('Alamat domisili', 'PARAGRAF', { wajib: false }),
            tanya('Pas foto', 'UNGGAH_BERKAS', { wajib: false, opsi: { jenis: ['gambar'], maks_mb: 4 } }),
          ],
        },
      ],
    },
  },
  {
    nama: 'Template KT1',
    kategori: 'LAINNYA',
    deskripsi: 'Kerangka awal form KT1 - isi lengkapnya menyusul dari panitia.',
    isi: {
      bagian: [
        {
          id: 'b-kt1-1',
          judul: 'Data peserta',
          deskripsi: '',
          lanjut_ke: null,
          pertanyaan: [tanya('Nama lengkap', 'TEKS_SINGKAT', { peran: 'nama_lengkap' }), tanya('NIM', 'TEKS_SINGKAT', { peran: 'nim', opsi: { maks: 20 } })],
        },
      ],
    },
  },
];
