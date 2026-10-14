/**
 * Menjalankan setiap template DOCX di `templates/` dengan data dummy lengkap,
 * lalu gagal bila ada placeholder yang tidak menemukan datanya.
 *
 * ===========================================================================
 * KENAPA SKRIP INI HARUS MENCARI, BUKAN MENUNGGU GALAT
 * ===========================================================================
 * Placeholder yang salah ketik TIDAK menimbulkan galat apa pun di docxtemplater.
 * Diukur pada versi 3.69.3:
 *
 *     template  "X {tidak_ada} Y"      data  {}
 *     hasil     "X undefined Y"        galat: tidak ada
 *
 * Dokumen tetap jadi, Word tetap membukanya, dan di tengah surat resmi HMIF
 * tertulis kata `undefined`. `{nomor_lengkap}` yang tersalah ketik menjadi
 * `{nomor_lengkep}` akan lolos sampai ada orang membaca surat yang sudah
 * dicetak dan dikirim.
 *
 * Karena itu skrip ini memasang `nullGetter` — pengait yang dipanggil setiap
 * kali sebuah tag tidak menemukan nilainya — dan memperlakukan satu panggilan
 * pun sebagai kegagalan. Hanya dua kesalahan yang memang melempar galat sendiri
 * (`{#loop}` tanpa penutup, dan `{@raw}` yang tidak sendirian di paragrafnya);
 * sisanya harus dicari.
 *
 * Kekhawatiran sebaliknya — tag rusak karena Word memecahnya menjadi beberapa
 * `<w:t>` — sudah diuji dan tidak terbukti: docxtemplater menyatukan run lebih
 * dulu, bahkan ketika pecahannya berada di paragraf atau sel tabel berbeda.
 * Rinciannya di docs/ai/TEMPLATE_MAPPING.md §2.2.
 *
 *     npx tsx scripts/template-dryrun.ts            direktori templates/
 *     npx tsx scripts/template-dryrun.ts <dir>      direktori lain
 *
 * Argumen direktori ada supaya skrip ini dapat diuji terhadap berkas contoh
 * tanpa menaruh apa pun di `templates/`. Tanpa itu, satu-satunya cara
 * membuktikan skrip ini benar adalah menunggu kesebelas template asli selesai
 * dibedah — yaitu justru pekerjaan yang skrip ini seharusnya mengawal.
 *
 * Keluar 0 bila seluruh berkas lulus, 1 bila ada satu saja yang tidak.
 *
 * Sumber: docs/ai/tasks/P0-prasyarat.md T-006 · docs/ai/TEMPLATE_MAPPING.md · ADR-021
 */

import fs from 'node:fs';
import path from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

const AKAR = path.resolve(import.meta.dirname, '..');
const ARG = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/**
 * `--teks` mencetak hasil render tiap berkas sebagai teks biasa.
 *
 * Lulus dry run hanya membuktikan setiap tag menemukan datanya — bukan bahwa
 * dokumennya terbaca benar. Dua cacat yang tidak akan pernah tertangkap tanpa
 * membaca hasilnya: judul notulensi menjadi "Rapat Rapat Kerja" karena kata
 * "Rapat" tertinggal di luar placeholder, dan seluruh butir daftar berdempet
 * jadi satu baris karena tag loop-nya sebaris.
 */
const TEKS = process.argv.includes('--teks');
const DIR = path.resolve(AKAR, ARG[0] ?? 'templates');

/** Daftar wajib hanya ditegakkan pada direktori sungguhan, bukan saat menguji. */
const RESMI = DIR === path.join(AKAR, 'templates');
const NL = '\n';
const tulis = (s: string): void => {
  process.stdout.write(s + NL);
};

/**
 * Kesebelas berkas yang wajib ada, sesuai SYSTEM_DESIGN §17.
 * Urutannya sengaja sama dengan ceklis TEMPLATE_MAPPING.md §8.
 */
const WAJIB = [
  'surat-02-keterangan-aktif.docx',
  'surat-03-aspirasi.docx',
  'surat-04-undangan-pemateri.docx',
  'surat-04-undangan-sambutan.docx',
  'surat-05-peminjaman-barang.docx',
  'surat-05-peminjaman-ruangan.docx',
  'surat-08-kerja-sama.docx',
  'tor.docx',
  'proposal.docx',
  'lpj.docx',
  'notulensi.docx',
  // Bukan bagian §17: template umum untuk kode 01/06/07/09 (ADR-028, ADR-029).
  'surat-umum.docx',
] as const;

/**
 * Satu blok tanda tangan (ADR-021).
 *
 * `%ttd` dan `%stempel` memakai awalan persen karena begitulah docxtemplater
 * menamai tag `{%…}` selama modul gambar belum dipasang — diukur, bukan
 * ditebak. Modul gambar baru masuk di T-062; sampai saat itu dry run hanya
 * memastikan tag-nya ada dan menemukan nilai.
 */
const TTD = {
  label: 'Mengetahui,',
  jabatan: 'Ketua HMIF',
  nama: 'Dicky Saputra',
  nim: '3337220032',
  '%ttd': '[ttd]',
  '%ttd_nama': '[ttd]',
  '%stempel': '[stempel]',
};

const teks = (n: number): { teks: string }[] =>
  Array.from({ length: n }, (_, i) => ({ teks: `Paragraf uji ke-${i + 1}.` }));

/**
 * Data dummy untuk SELURUH template sekaligus.
 *
 * Satu kamus dipakai kesebelas berkas. Kunci yang tidak dipakai sebuah berkas
 * tidak berbahaya; yang berbahaya adalah kunci yang kurang, dan itu justru yang
 * ingin ditangkap.
 *
 * `nama`, `jabatan`, `nim`, dan `label` SENGAJA tidak ada di tingkat atas.
 * docxtemplater menjatuhkan pencarian ke scope induk bila tidak ketemu di
 * loop, sehingga mendefinisikannya di sini akan membuat `{nama}` yang keliru
 * ditaruh di luar blok tanda tangan ikut terisi — dan dry run kehilangan
 * kemampuannya menangkap pelanggaran TEMPLATE_MAPPING.md §3.3.
 */
const DUMMY: Record<string, unknown> = {
  // --- surat: kolom tabel `surat` ---
  nomor_lengkap: '05/379/UN43.3.7/KT2HMIF/VIII/2025',
  tanggal_surat_format: 'Senin, 04 Agustus 2025',
  kota: 'Cilegon',
  lampiran: '1 (satu) Lembar',
  perihal: 'Permohonan Peminjaman Tandu',
  tujuan_nama: 'Kepala Badan Penanggulangan Bencana Daerah (BPBD) Kota Cilegon',
  tujuan_jabatan: 'Fakultas Teknik UNTIRTA',
  tujuan_alamat: 'di Tempat',
  isi_paragraf: 'Paragraf isi surat, hasil konversi dari isi_html.',
  // Template umum: satu paragraf dokumen per paragraf isi, dan baris instansi opsional.
  paragraf_isi: teks(2),
  ada_tujuan_jabatan: true,

  // --- surat: data_dinamis ---
  nama_kegiatan: 'AKSARA',
  tema_kegiatan: 'Aktualisasi Kepemimpinan Seimbang yang Rasional dan Amanah',
  hari_tanggal: 'Selasa - Kamis, 19 - 21 Agustus 2025',
  waktu: '08:10 - 09:00 WIB',
  tempat: 'Kampus FT UNTIRTA',
  label_atas: 'Panitia AKSARA IF',
  label_kanan: 'Mengetahui,',
  nama_pemohon: 'Dicky Saputra',
  nim_pemohon: '3337220032',
  jabatan_pemohon: 'Staff Departemen Kaderisasi',
  keperluan: 'Kelengkapan Persyaratan Administrasi Beasiswa',
  topik_materi: 'Kepemimpinan',
  barang: 'Tandu',
  ruangan: 'Ruangan Auditorium FT',
  jenis_mitra: 'Rumah Sakit',

  // --- blok tanda tangan (ADR-021) ---
  kiri: { ...TTD, label: '', jabatan: 'Ketua Pelaksana', nama: 'Muhammad Imam Faturrohman', nim: '3337230036' },
  kanan: TTD,

  // --- loop surat ---
  items: [
    { no: '1.', kebutuhan: 'Tandu', banyaknya: '2 unit' },
    { no: '2.', kebutuhan: 'Tabung Oksigen', banyaknya: '1 unit' },
  ],
  rundown: [
    { hari_tanggal: 'Senin, 06 Oktober 2025', waktu: '16.00-16.30', acara: 'Absensi', keterangan: 'Acara',
      mulai: '16:00', selesai: '16:30', durasi: '30 Menit', pj: 'Acara' },
    { hari_tanggal: '', waktu: '16.30-16.40', acara: 'Pembukaan', keterangan: 'Acara',
      mulai: '16:30', selesai: '16:40', durasi: '10 Menit', pj: 'Acara' },
  ],
  poin: [
    { judul: 'Penyesuaian Timeline PDKT Teknik 2026', paragraf: teks(3) },
    { judul: 'Kontribusi dan Komitmen Ormawa', paragraf: teks(2) },
  ],

  // --- TOR (PRD F-10.1) ---
  tahun: 2025,
  gambaran_umum: 'Gambaran umum kegiatan.',
  tujuan: teks(3),
  bentuk_acara: 'Hybrid, daring dan luring.',
  sesi: [
    { nama_sesi: 'Technical Meeting', hari_tanggal: 'Minggu, 17 Agustus 2025', waktu: '19.00 - 20.45 WIB', tempat: 'Zoom' },
    { nama_sesi: 'Hari H', hari_tanggal: 'Kamis, 21 Agustus 2025', waktu: '08.00 - 17.00 WIB', tempat: 'Aula FT' },
  ],
  sasaran_peserta: 'Mahasiswa Informatika angkatan 2024.',
  jumlah_peserta: 120,
  jumlah_kelompok: 8,
  kondisi: [{ nama_sesi: 'Hari H', ketentuan: 'Hadir tepat waktu, toleransi 15 menit.' }],
  parameter: [
    { kriteria: 'Kehadiran', bobot: '40%', kkm: '75%' },
    { kriteria: 'Penugasan', bobot: '40%', kkm: '75%' },
  ],
  rangkaian: [{ nama: 'Sharing Session', uraian: 'Perkenalan tupoksi tiap departemen.' }],
  bentuk: [
    { judul: '1. Technical Meeting (Online)', uraian: 'Penjelasan menyeluruh sebelum rangkaian dimulai.' },
    { judul: '2. Puncak Acara (Outdoor)', uraian: 'Dua hari satu malam di lokasi kegiatan.' },
  ],
  kkm: '60 (akumulasi total)',

  // Susunan acara TOR: loop bersarang. {#sesi_rundown} mengulang kelompok baris
  // per sesi, {#rundown} di dalamnya mengulang baris isinya.
  sesi_rundown: [
    {
      nama_sesi: 'Technical Meeting',
      total_durasi: '80 Menit',
      rentang_waktu: '19:00 - 20:20 Selesai',
      rundown: [
        { hari_tanggal: 'Rabu, 26 November 2025', mulai: '19:00', selesai: '19:05', durasi: '5 Menit', acara: 'Pembukaan', pj: 'MC' },
        { hari_tanggal: '', mulai: '19:05', selesai: '19:10', durasi: '5 Menit', acara: 'Sambutan', pj: 'Ketuplak' },
      ],
    },
    {
      nama_sesi: 'PRA-1',
      total_durasi: '240 Menit',
      rentang_waktu: '15:40 - 19:40 Selesai',
      rundown: [
        { hari_tanggal: 'Kamis, 27 November 2025', mulai: '15:40', selesai: '16:00', durasi: '20 Menit', acara: 'Absensi', pj: 'Komdis' },
      ],
    },
  ],
  penutup: 'Demikian kerangka acuan ini dibuat.',

  // --- anggaran: selalu ditarik dari RAB saat generate ---
  rab_divisi: [
    { no: 1, divisi: 'Acara', besaran: 'Rp0' },
    { no: 2, divisi: 'Konsumsi', besaran: 'Rp1.175.000' },
  ],
  rab_total: 'Rp1.957.000',
  rab_rinci: [
    { no: 1, divisi: 'Konsumsi', item: 'Snack', jumlah: 120, satuan: 'pcs', harga: 'Rp5.000', total: 'Rp600.000' },
  ],

  // --- Proposal (PRD F-10.2) ---
  latar_belakang: 'Latar belakang kegiatan.',
  landasan_kegiatan: 'AD/ART HMIF FT UNTIRTA.',
  asas_pelaksanaan: 'Kekeluargaan dan profesionalitas.',
  sasaran: 'Mahasiswa Informatika angkatan 2024.',
  // Tabel "Pengisi Acara" pada Proposal berbentuk "peran : nama".
  pengisi: [
    { peran: 'Pembawa Acara', nama: 'Layyinnida Indah Ramadhan' },
    { peran: 'Pemateri', nama: 'Nur Ali Arfan' },
  ],
  asas: teks(3),
  ketua_bem_nama: 'Dylan Arsyi Fahrizi',
  ketua_bem_nim: '3336220084',
  sekretaris_nama: 'Amelia Putri Aqiilah',
  sekretaris_nim: '3337240049',

  // Susunan kepanitiaan dua tingkat: divisi, lalu anggotanya.
  divisi_panitia: [
    {
      nama_divisi: 'Penasihat',
      anggota: [
        { jabatan: 'Ketua Program Studi', nama: 'Nanang Krisdianto, S.T., M.Kom' },
        { jabatan: 'Sekretaris Program Studi', nama: 'Royan Habibie Sukarna, S.Kom., M.Kom' },
      ],
    },
    {
      nama_divisi: 'Acara',
      anggota: [{ jabatan: 'Koordinator', nama: 'Dimas Panca Pamungkas' }],
    },
  ],

  // Rincian RAB dua tingkat: divisi, lalu itemnya.
  rincian: [
    {
      divisi: 'DIVISI KONSUMSI',
      item: [
        { no: 1, jenis_barang: 'Galon', jumlah: '10', harga_satuan: 'Rp5.000', total: 'Rp50.000' },
        { no: 2, jenis_barang: 'Snack', jumlah: '120', harga_satuan: 'Rp5.000', total: 'Rp600.000' },
      ],
    },
    {
      divisi: 'DIVISI PDD',
      item: [{ no: 1, jenis_barang: 'Cetak Banner', jumlah: '2', harga_satuan: 'Rp75.000', total: 'Rp150.000' }],
    },
  ],
  panitia: [
    { divisi: 'Inti', jabatan: 'Ketua Pelaksana', nama: 'Muhammad Imam Faturrohman', nim: '3337230036' },
    { divisi: 'Acara', jabatan: 'Koordinator', nama: 'Alya Fauziah A.', nim: '3337230011' },
  ],

  // --- LPJ (PRD F-12.1) ---
  realisasi_kegiatan: 'Seluruh rangkaian terlaksana sesuai rencana.',
  pemasukan: [{ no: 1, sumber: 'Dana Kemahasiswaan', nominal: 'Rp2.000.000' }],
  total_pemasukan: 'Rp2.000.000',
  pengeluaran: [{ no: 1, divisi: 'Konsumsi', item: 'Snack', nominal: 'Rp600.000' }],
  total_pengeluaran: 'Rp1.957.000',
  perbandingan: [{ item: 'Snack', rencana: 'Rp600.000', aktual: 'Rp575.000', selisih: '-Rp25.000' }],
  sisa_dana: 'Rp43.000',
  nota: [{ divisi: 'Konsumsi', '%gambar': '[nota]', keterangan: 'Struk Indomaret 19 Agustus' }],
  dokumentasi: [{ '%foto': '[foto]', caption: 'Sesi pembukaan' }],
  evaluasi: teks(2),
  saran: teks(2),
  ketupel_nama: 'Muhammad Imam Faturrohman',
  ketupel_nim: '3337230036',
  ketua_himpunan_nama: 'Shindu Nata Wijaya',
  ketua_himpunan_nim: '3337230054',
  kaprodi_nama: 'Nanang Krisdianto, S.T., M.Kom',
  kaprodi_nip: '197504092006041004',
  wd3_nama: 'Dr. Dwinanto, S.T., M.T.',
  wd3_nip: '198301122008121001',

  // --- Notulensi ---
  judul: 'Rapat Kerja Departemen Kaderisasi',
  tanggal_format: '04 Agustus 2025',
  pemimpin_rapat: 'Dicky Saputra',
  notulis: 'Alya Fauziah A.',
  hadir: '18 dari 21 pengurus',
  agenda: teks(3),
  hasil: teks(3),

  // --- LPJ: isi laporan ---
  pendahuluan: 'Pendahuluan laporan pertanggungjawaban.',
  target_peserta: 'Mahasiswa Informatika angkatan 2024.',
  proses_perencanaan: 'Tahapan persiapan kegiatan.',
  pelaksanaan_kegiatan: 'Kegiatan terlaksana sesuai rencana.',
  output: 'Peserta memahami struktur organisasi HMIF.',
  catatan_materi: 'Materi diarsipkan di Google Drive.',
  rab_ringkasan: 'Total pemasukan Rp2.000.000, pengeluaran Rp1.957.000.',
  daftar_hadir: 'Daftar hadir panitia dan peserta terlampir.',
  materi: [
    { judul: 'Pengenalan Program Studi', pengisi: 'Nanang Krisdianto, S.T., M.Kom', tautan: 'bit.ly/materi1' },
    { judul: 'Etika Berorganisasi', pengisi: 'Shindu Nata Wijaya', tautan: 'bit.ly/materi2' },
  ],

  // Narasi per divisi. Namanya `divisi_narasi`, bukan `narasi`, karena tiap
  // itemnya SENDIRI punya field `narasi` — loop dan field yang senama membuat
  // pencarian docxtemplater bergantung pada letak tag, bukan pada maksudnya.
  divisi_narasi: [
    {
      nama_divisi: 'Divisi Acara',
      koordinator: 'Rifqi Fahrezi',
      anggota: [{ nama: 'Elga Syahira' }, { nama: 'Rijal Fauzi' }],
      narasi: 'Divisi Acara mengurus rangkaian acara dari persiapan sampai pelaksanaan.',
      perencanaan: 'Menyusun konsep acara dan rundown.',
      pelaksanaan: 'Memandu jalannya acara pada hari H.',
      pendukung: 'Koordinasi antar divisi berjalan baik.',
      penghambat: 'Beberapa komponen pembukaan belum siap tepat waktu.',
      saran: 'Perhatikan waktu mulai acara.',
    },
    {
      nama_divisi: 'Divisi Konsumsi',
      koordinator: 'Puja Widyasti',
      anggota: [{ nama: 'Isabella' }],
      narasi: 'Divisi Konsumsi mengurus konsumsi peserta dan panitia.',
      perencanaan: 'Mendata kebutuhan konsumsi per sesi.',
      pelaksanaan: 'Mendistribusikan konsumsi sesuai jadwal.',
      pendukung: 'Vendor responsif.',
      penghambat: 'Perubahan jumlah peserta mendadak.',
      saran: 'Kunci jumlah peserta H-3.',
    },
  ],

  // --- penanda gambar tingkat atas ---
  '%ttd': '[ttd]',
  '%stempel': '[stempel]',
  '%gambar': '[gambar]',
  '%foto': '[foto]',
};

/** Placeholder docxtemplater: {x}, {#loop}, {/loop}, {%gambar}, {@raw}. */
const POLA_TAG = /\{[#/^%@]?[a-z_][a-z0-9_]*\}/gi;

interface Hasil {
  berkas: string;
  tag: string[];
  hilang: string[];
  galat: string[];
}

/** Jumlah tabel di sebuah `word/document.xml`. */
function jumlahTabel(xml: string): number {
  return (xml.match(/<w:tbl>/g) ?? []).length;
}

/**
 * Membaca tag yang TERTULIS di dokumen, tanpa melibatkan docxtemplater.
 *
 * Dipakai hanya untuk laporan — berapa tag yang ada dan tag apa saja. Penentuan
 * lulus/tidak tetap datang dari render sungguhan, karena pembacaan regex di
 * sini tidak menyatukan run seperti yang dilakukan docxtemplater dan karena itu
 * bisa melewatkan tag yang terpecah.
 */
function tagTertulis(zip: PizZip): string[] {
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  const datar = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1] ?? '')
    .join('');
  return [...new Set(datar.match(POLA_TAG) ?? [])].sort();
}

function periksa(berkas: string): Hasil {
  const hasil: Hasil = { berkas: path.basename(berkas), tag: [], hilang: [], galat: [] };
  const hilang = new Set<string>();

  let zip: PizZip;
  try {
    zip = new PizZip(fs.readFileSync(berkas));
  } catch (e) {
    hasil.galat.push(`Bukan berkas .docx yang sah: ${(e as Error).message}`);
    return hasil;
  }

  hasil.tag = tagTertulis(zip);

  try {
    const doc = new Docxtemplater(zip, {
      // paragraphLoop membuat {#poin} pada paragraf mengulang paragrafnya,
      // bukan menyisipkan teks berulang di satu baris.
      paragraphLoop: true,
      linebreaks: true,
      // docxtemplater mencetak sendiri seluruh objek galat beserta stack ke
      // konsol sebelum melemparnya. Untuk satu berkas rusak itu sudah 30 baris
      // JSON, dan laporan di bawah — yang menyebut berkas dan penjelasannya
      // dalam satu baris — tenggelam di antaranya.
      errorLogging: false,
      nullGetter(part: { value: string }) {
        hilang.add(part.value);
        return `«${part.value} KOSONG»`;
      },
    });
    doc.render(DUMMY);
  } catch (e) {
    const err = e as Error & { properties?: { errors?: { properties?: { explanation?: string } }[] } };
    const rinci = (err.properties?.errors ?? [])
      .map((x) => x.properties?.explanation)
      .filter((x): x is string => Boolean(x));
    hasil.galat.push(...(rinci.length > 0 ? rinci : [err.message]));
  }

  // =========================================================================
  // JEBAKAN ADR-021: blok tanda tangan yang tag-nya membentang antar BARIS
  // =========================================================================
  // Bila `{#kiri}` dibuka di baris jabatan dan ditutup di baris nama,
  // docxtemplater memperlakukan kedua baris itu sebagai loop baris. Untuk surat
  // dua penandatangan hasilnya kebetulan benar, sehingga kesalahan ini LULUS
  // seluruh pemeriksaan di atas — dan baru muncul pada surat pertama yang cuma
  // punya satu penandatangan, yang tanda tangan satu-satunya justru ikut
  // terhapus bersama seluruh barisnya.
  //
  // Satu-satunya cara menangkapnya adalah merender ulang tanpa penandatangan
  // dan menghitung tabel yang tersisa. Diukur: bentuk yang salah menyisakan
  // NOL tabel, bentuk yang benar menyisakan jumlah yang sama seperti template.
  const tabelTemplate = jumlahTabel(zip.file('word/document.xml')?.asText() ?? '');
  //
  // Hanya dijalankan bila tidak ada tag yang kosong. Loop baris yang datanya
  // tidak ada juga mengosongkan tabelnya — benar, tetapi bukan pelanggaran
  // ADR-021, dan pesannya akan menuduh hal yang salah. Kekosongan data sudah
  // dilaporkan sendiri di atas.
  if (tabelTemplate > 0 && hasil.galat.length === 0 && hilang.size === 0) {
    try {
      const kosong = new Docxtemplater(new PizZip(fs.readFileSync(berkas)), {
        paragraphLoop: true,
        linebreaks: true,
        errorLogging: false,
        nullGetter: () => '',
      });
      kosong.render({ ...DUMMY, kiri: null, kanan: null });
      const sisa = jumlahTabel(kosong.getZip().file('word/document.xml')?.asText() ?? '');
      if (sisa < tabelTemplate) {
        hasil.galat.push(
          `Tanpa penandatangan, ${tabelTemplate - sisa} dari ${tabelTemplate} tabel ikut hilang. ` +
            `Pasangan {#kiri}/{#kanan} membentang antar baris tabel — lihat ADR-021.`,
        );
      }
    } catch (e) {
      hasil.galat.push(`gagal saat diuji tanpa penandatangan: ${(e as Error).message}`);
    }
  }

  hasil.hilang = [...hilang].sort();
  return hasil;
}

/** Mencetak hasil render sebuah template sebagai teks biasa. */
function cetakTeks(berkas: string): void {
  const doc = new Docxtemplater(new PizZip(fs.readFileSync(berkas)), {
    paragraphLoop: true,
    linebreaks: true,
    errorLogging: false,
    nullGetter: (part: { value: string }) => `<<${part.value} KOSONG>>`,
  });
  doc.render(DUMMY);
  const xml = doc.getZip().file('word/document.xml')?.asText() ?? '';
  for (const m of xml.matchAll(/<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g)) {
    const t = [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((x) => x[1] ?? '')
      .join('')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    if (t) tulis(`      ${t}`);
  }
}

function main(): void {
  tulis('');

  if (!fs.existsSync(DIR)) {
    tulis(`  Direktori ${path.relative(AKAR, DIR)}/ belum ada.`);
    tulis('');
    tulis('  T-006 berstatus BLOCKED: kesebelas berkas .docx harus dibedah lebih');
    tulis('  dulu di Microsoft Word. Petanya lengkap di docs/ai/TEMPLATE_MAPPING.md —');
    tulis('  ikuti §1 lalu §5, satu berkas satu sub-bagian.');
    tulis('');
    process.exit(1);
  }

  const ada = fs
    .readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .sort();

  const kurang = RESMI ? WAJIB.filter((w) => !ada.includes(w)) : [];
  const asing = RESMI ? ada.filter((f) => !WAJIB.includes(f as (typeof WAJIB)[number])) : [];

  tulis(
    RESMI
      ? `  DRY RUN TEMPLATE — ${ada.length} dari ${WAJIB.length} berkas ada`
      : `  DRY RUN TEMPLATE — ${ada.length} berkas di ${path.relative(AKAR, DIR) || DIR}`,
  );
  tulis('');

  const hasil = ada.map((f) => periksa(path.join(DIR, f)));

  for (const h of hasil) {
    const lulus = h.hilang.length === 0 && h.galat.length === 0;
    tulis(`  ${lulus ? '✓' : '✗'} ${h.berkas}`);
    tulis(`      ${h.tag.length} tag tertulis`);

    for (const g of h.galat) tulis(`      GALAT    ${g}`);
    for (const t of h.hilang) tulis(`      KOSONG   {${t}} tidak menemukan data`);
    if (TEKS && h.galat.length === 0) cetakTeks(path.join(DIR, h.berkas));
    tulis('');
  }

  if (kurang.length > 0) {
    tulis('  BELUM ADA:');
    for (const k of kurang) tulis(`      ${k}`);
    tulis('');
  }

  if (asing.length > 0) {
    tulis('  DI LUAR DAFTAR SYSTEM_DESIGN §17 — periksa penamaannya:');
    for (const a of asing) tulis(`      ${a}`);
    tulis('');
  }

  const gagal = hasil.filter((h) => h.hilang.length > 0 || h.galat.length > 0);
  const bersih = gagal.length === 0 && kurang.length === 0 && asing.length === 0;

  if (bersih) {
    tulis(`  LULUS — ${hasil.length} berkas, nol placeholder tak terisi.`);
    tulis('');
    return;
  }

  tulis(
    `  GAGAL — ${gagal.length} berkas bermasalah, ${kurang.length} belum ada` +
      (asing.length > 0 ? `, ${asing.length} salah nama` : '') +
      '.',
  );
  tulis('  Peta perbaikannya: docs/ai/TEMPLATE_MAPPING.md');
  tulis('');
  process.exit(1);
}

main();
