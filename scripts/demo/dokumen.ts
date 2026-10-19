/**
 * TOR, Proposal, dan LPJ demo.
 *
 * Seluruhnya lewat API sungguhan sebagai Ketua Pelaksana / Bendahara Umum:
 * isi disimpan seperti auto-save editor, lalu DOCX dibuat oleh generator yang
 * sama dengan tombol "Buat dokumen". LPJ Dies Natalis dibawa sampai FINAL
 * (Bendahara mengajukan → Bendahara Umum → Ketua Himpunan) sehingga RAB-nya
 * berstatus SELESAI.
 */

import { randomUUID } from 'node:crypto';

import sharp from 'sharp';

import { fieldTerisi, type DataProposal, type IdFieldProposal } from '@/lib/proposal/schema';

import { doc, p, type Node } from './acara';
import type { InfoAkun } from './akun';
import { GagalApi, type Sesi } from './klien';
import { dari, langkah, ok, rentangPanjang, type Sql } from './konfig';
import type { HasilProker } from './proker';

const teksKaya = (...paragraf: string[]): Node => doc(...paragraf.map((x) => p(x)));
const AULA = 'Aula Fakultas Teknik UNTIRTA';

interface IsiAcara {
  kunci: 'dies' | 'sync' | 'lkmm' | 'visit';
  ketuplak: string;
  nama: string;
  tema: string;
  gambaran: string[];
  tujuan: string[];
  bentuk: { uraian: string[]; sub: Array<{ judul: string; uraian: string }> };
  sesi: Array<{ sesi: string; hari: number; waktu: string; tempat: string }>;
  sasaran: { uraian: string[]; estimasi: number; kelompok: number | null };
  kondisi: Array<{ sesi: string; ketentuan: string }>;
  parameter: Array<{ kriteria: string; bobot: number; kkm: number | null }>;
  rangkaian: Array<{ nama: string; uraian: string }>;
  rundown: Array<{ hari: number; mulai: string; selesai: string; acara: string; ket: string }>;
  penutup: string[];
  /** Proposal */
  latar: string[];
  landasan: string[];
  asas: string[];
  pengisi: Array<{ peran: string; nama: string }>;
  /** false = TOR dibiarkan setengah jadi (tampil sebagai draf). */
  lengkap: boolean;
}

const ACARA: IsiAcara[] = [
  {
    kunci: 'dies',
    ketuplak: 'int1',
    nama: 'Dies Natalis HMIF ke-12 — Malam Puncak',
    tema: 'Satu Langkah, Seribu Karya',
    gambaran: [
      'Dies Natalis HMIF adalah peringatan tahunan berdirinya Himpunan Mahasiswa Informatika. Pada tahun kedua belas ini, malam puncak dirancang sebagai ruang bertemu seluruh keluarga besar Informatika UNTIRTA: pengurus, anggota, alumni, dan dosen.',
      'Rangkaian malam puncak memadukan refleksi perjalanan himpunan, penampilan unit kegiatan, penyerahan penghargaan pengurus berprestasi, serta temu alumni dalam suasana yang hangat dan sederhana.',
    ],
    tujuan: [
      'Mempererat kekeluargaan pengurus, anggota, dan alumni Informatika UNTIRTA.',
      'Merefleksikan capaian himpunan selama dua belas tahun.',
      'Memberikan apresiasi kepada pengurus dan anggota berprestasi.',
    ],
    bentuk: {
      uraian: ['Acara puncak berbentuk malam kebersamaan dengan susunan acara formal singkat, penampilan, dan jamuan makan malam.'],
      sub: [
        { judul: 'Sesi formal', uraian: 'Pembukaan, sambutan Ketua HMIF, dan sambutan perwakilan dosen.' },
        { judul: 'Sesi penampilan', uraian: 'Penampilan unit kegiatan: musik, tari tradisional, dan stand-up comedy.' },
        { judul: 'Sesi apresiasi', uraian: 'Penyerahan penghargaan pengurus berprestasi dan foto bersama.' },
      ],
    },
    sesi: [{ sesi: 'Malam Puncak', hari: -17, waktu: '18.30 WIB s.d. 22.00 WIB', tempat: AULA }],
    sasaran: { uraian: ['Pengurus dan anggota HMIF, alumni, serta dosen Informatika.'], estimasi: 120, kelompok: null },
    kondisi: [
      { sesi: 'Kehadiran', ketentuan: 'Peserta mengonfirmasi kehadiran melalui formulir pendaftaran maksimal H-3.' },
      { sesi: 'Busana', ketentuan: 'Pakaian rapi atau batik; pengurus mengenakan almamater.' },
    ],
    parameter: [
      { kriteria: 'Kehadiran pada sesi formal dan penampilan', bobot: 70, kkm: 80 },
      { kriteria: 'Pengisian umpan balik acara', bobot: 30, kkm: 100 },
    ],
    rangkaian: [
      { nama: 'Registrasi dan jamuan pembuka', uraian: 'Tamu mengisi daftar hadir dan menikmati jamuan ringan.' },
      { nama: 'Sesi formal', uraian: 'Menyanyikan lagu Indonesia Raya, sambutan, dan refleksi dua belas tahun HMIF.' },
      { nama: 'Penampilan dan apresiasi', uraian: 'Penampilan unit kegiatan dilanjutkan penyerahan penghargaan.' },
    ],
    rundown: [
      { hari: -17, mulai: '17.30', selesai: '18.30', acara: 'Registrasi dan jamuan pembuka', ket: 'Panitia Acara' },
      { hari: -17, mulai: '18.30', selesai: '19.15', acara: 'Sesi formal dan sambutan', ket: 'Ketua HMIF' },
      { hari: -17, mulai: '19.15', selesai: '20.15', acara: 'Penampilan unit kegiatan', ket: 'Departemen Minat dan Bakat' },
      { hari: -17, mulai: '20.15', selesai: '21.00', acara: 'Penyerahan penghargaan', ket: 'Wakil Ketua HMIF' },
      { hari: -17, mulai: '21.00', selesai: '22.00', acara: 'Makan malam dan foto bersama', ket: 'Panitia Konsumsi' },
    ],
    penutup: ['Demikian kerangka acuan ini disusun sebagai pedoman pelaksanaan Dies Natalis HMIF ke-12. Semoga seluruh rangkaian berjalan lancar dan bermanfaat.'],
    latar: [
      'Himpunan Mahasiswa Informatika berdiri sebagai wadah aspirasi dan pengembangan diri mahasiswa Teknik Informatika UNTIRTA. Setiap tahun, hari jadi himpunan diperingati untuk menjaga tradisi kebersamaan lintas angkatan.',
      'Dies Natalis ke-12 menjadi momentum merefleksikan perjalanan himpunan sekaligus merayakan capaian pengurus dan anggota selama satu periode kepengurusan.',
    ],
    landasan: [
      'Anggaran Dasar dan Anggaran Rumah Tangga HMIF.',
      'Program kerja Departemen Internal periode 2026/2027 yang telah disetujui Ketua HMIF.',
    ],
    asas: ['Kekeluargaan', 'Keterbukaan', 'Kebersamaan'],
    pengisi: [
      { peran: 'Pembawa acara', nama: 'Aulia Rahmawati' },
      { peran: 'Penampilan musik', nama: 'UKM Musik Informatika' },
    ],
    lengkap: true,
  },
  {
    kunci: 'sync',
    ketuplak: 'eks1',
    nama: 'SYNCHRONIZE 2026 — Seminar Nasional Teknologi',
    tema: 'Kecerdasan Buatan untuk Indonesia Tangguh',
    gambaran: [
      'SYNCHRONIZE adalah seminar nasional tahunan HMIF yang mempertemukan mahasiswa dengan praktisi dan akademisi di bidang teknologi informasi. Edisi 2026 mengangkat kecerdasan buatan dan dampaknya bagi dunia kerja dan masyarakat.',
      'Kegiatan berlangsung dua hari: seminar dengan tiga pembicara pada hari pertama, serta pameran proyek mahasiswa dan sesi jejaring pada hari kedua.',
    ],
    tujuan: [
      'Memperluas wawasan mahasiswa tentang kecerdasan buatan dan peluang kariernya.',
      'Membuka ruang jejaring antara mahasiswa, praktisi industri, dan akademisi.',
      'Memamerkan karya proyek mahasiswa Informatika kepada publik.',
    ],
    bentuk: {
      uraian: ['Seminar nasional luring dengan siaran daring terbatas, dilengkapi pameran proyek mahasiswa.'],
      sub: [
        { judul: 'Seminar', uraian: 'Tiga sesi pemaparan dan diskusi panel bersama pembicara industri dan akademisi.' },
        { judul: 'Pameran proyek', uraian: 'Dua belas stan proyek mahasiswa, dinilai pengunjung dan juri.' },
      ],
    },
    sesi: [
      { sesi: 'Hari 1 — Seminar', hari: 12, waktu: '08.00 WIB s.d. 16.00 WIB', tempat: AULA },
      { sesi: 'Hari 2 — Pameran dan jejaring', hari: 13, waktu: '09.00 WIB s.d. 14.00 WIB', tempat: 'Lobi Gedung Fakultas Teknik' },
    ],
    sasaran: { uraian: ['Mahasiswa Informatika, siswa SMA/SMK se-Banten, dan masyarakat umum.'], estimasi: 200, kelompok: null },
    kondisi: [
      { sesi: 'Pendaftaran', ketentuan: 'Pendaftaran melalui formulir daring, ditutup H-2 atau saat kuota terpenuhi.' },
      { sesi: 'Kehadiran', ketentuan: 'Peserta wajib registrasi ulang di meja panitia dan membawa tanda pengenal.' },
    ],
    parameter: [
      { kriteria: 'Kehadiran seluruh sesi seminar', bobot: 60, kkm: 80 },
      { kriteria: 'Pengisian umpan balik', bobot: 40, kkm: 100 },
    ],
    rangkaian: [
      { nama: 'Seminar nasional', uraian: 'Pemaparan tiga pembicara dan sesi tanya jawab moderator.' },
      { nama: 'Pameran proyek mahasiswa', uraian: 'Stan proyek berbasis kecerdasan buatan dari mahasiswa semester 3 hingga 7.' },
      { nama: 'Sesi jejaring', uraian: 'Pertemuan terarah antara pembicara, sponsor, dan peserta.' },
    ],
    rundown: [
      { hari: 12, mulai: '08.00', selesai: '09.00', acara: 'Registrasi peserta', ket: 'Panitia Acara' },
      { hari: 12, mulai: '09.00', selesai: '10.00', acara: 'Pembukaan dan sambutan', ket: 'Wakil Dekan III' },
      { hari: 12, mulai: '10.00', selesai: '12.00', acara: 'Sesi 1 — AI generatif di industri', ket: 'Dr. Rina Kartika, M.Kom.' },
      { hari: 12, mulai: '13.00', selesai: '15.00', acara: 'Sesi 2 — Produk AI bertanggung jawab', ket: 'Bayu Setiadi, S.T., M.T.' },
      { hari: 12, mulai: '15.00', selesai: '16.00', acara: 'Diskusi panel dan penutupan', ket: 'Moderator' },
      { hari: 13, mulai: '09.00', selesai: '14.00', acara: 'Pameran proyek dan jejaring', ket: 'Panitia Perlengkapan' },
    ],
    penutup: ['Demikian kerangka acuan SYNCHRONIZE 2026 ini kami susun. Besar harapan kami agar kegiatan memperoleh dukungan dari seluruh pihak.'],
    latar: [
      'Perkembangan kecerdasan buatan dalam beberapa tahun terakhir mengubah cara industri bekerja dan menuntut kesiapan lulusan perguruan tinggi. Mahasiswa Informatika perlu memahami peluang sekaligus tantangannya sejak dini.',
      'Melalui SYNCHRONIZE 2026, HMIF menghadirkan ruang belajar bersama praktisi dan akademisi agar mahasiswa memperoleh gambaran nyata tentang penerapan kecerdasan buatan.',
    ],
    landasan: [
      'Anggaran Dasar dan Anggaran Rumah Tangga HMIF.',
      'Program kerja Departemen Eksternal periode 2026/2027 yang telah disetujui Ketua HMIF.',
      'Kalender akademik Fakultas Teknik UNTIRTA tahun akademik berjalan.',
    ],
    asas: ['Kebermanfaatan', 'Keterbukaan', 'Profesionalitas'],
    pengisi: [
      { peran: 'Pemateri sesi 1', nama: 'Dr. Rina Kartika, M.Kom.' },
      { peran: 'Pemateri sesi 2', nama: 'Bayu Setiadi, S.T., M.T.' },
      { peran: 'Moderator', nama: 'Fikri Haikal' },
    ],
    lengkap: true,
  },
  {
    kunci: 'lkmm',
    ketuplak: 'kad2',
    nama: 'Latihan Kepemimpinan dan Manajemen Mahasiswa Pra-Dasar (LKMM-PD) 2026',
    tema: 'Menjadi Pemimpin yang Berdampak',
    gambaran: [
      'LKMM-PD adalah pelatihan dasar kepemimpinan dan manajemen organisasi bagi mahasiswa baru. Pelatihan berlangsung dua hari dengan kombinasi materi kelas, diskusi kelompok, dan simulasi kepanitiaan.',
    ],
    tujuan: [
      'Membentuk kader yang siap memimpin dan berorganisasi.',
      'Mengenalkan nilai, struktur, dan budaya kerja HMIF kepada anggota baru.',
    ],
    bentuk: {
      uraian: ['Pelatihan tatap muka dua hari di lingkungan fakultas dengan sesi kelompok kecil.'],
      sub: [
        { judul: 'Materi kelas', uraian: 'Organisasi, manajemen waktu, dan komunikasi efektif.' },
        { judul: 'Simulasi kepanitiaan', uraian: 'Setiap kelompok merancang acara kecil dan mempresentasikannya.' },
      ],
    },
    sesi: [
      { sesi: 'Hari 1 — Materi', hari: 41, waktu: '08.00 WIB s.d. 17.00 WIB', tempat: AULA },
      { sesi: 'Hari 2 — Simulasi', hari: 42, waktu: '08.00 WIB s.d. 16.00 WIB', tempat: AULA },
    ],
    sasaran: { uraian: ['Mahasiswa baru angkatan 2026.'], estimasi: 80, kelompok: 8 },
    kondisi: [
      { sesi: 'Kehadiran', ketentuan: 'Peserta wajib mengikuti seluruh rangkaian untuk memperoleh sertifikat.' },
      { sesi: 'Perlengkapan', ketentuan: 'Peserta membawa alat tulis dan botol minum pribadi.' },
    ],
    parameter: [
      { kriteria: 'Kehadiran', bobot: 40, kkm: 100 },
      { kriteria: 'Presentasi simulasi kelompok', bobot: 40, kkm: 70 },
      { kriteria: 'Ujian akhir tertulis', bobot: 20, kkm: 60 },
    ],
    rangkaian: [
      { nama: 'Pembukaan dan perkenalan', uraian: 'Perkenalan pengurus, tata tertib, dan pembagian kelompok.' },
      { nama: 'Materi kepemimpinan', uraian: 'Tiga sesi materi bersama pemateri internal dan alumni.' },
      { nama: 'Simulasi dan penutupan', uraian: 'Presentasi kelompok, penilaian, dan penyerahan sertifikat.' },
    ],
    rundown: [
      { hari: 41, mulai: '08.00', selesai: '09.00', acara: 'Registrasi dan pembukaan', ket: 'Panitia Acara' },
      { hari: 41, mulai: '09.00', selesai: '12.00', acara: 'Materi 1 — Kepemimpinan dan organisasi', ket: 'Pemateri' },
      { hari: 41, mulai: '13.00', selesai: '17.00', acara: 'Materi 2 — Manajemen waktu dan komunikasi', ket: 'Pemateri' },
      { hari: 42, mulai: '08.00', selesai: '14.00', acara: 'Simulasi kepanitiaan', ket: 'Fasilitator kelompok' },
      { hari: 42, mulai: '14.00', selesai: '16.00', acara: 'Presentasi dan penutupan', ket: 'Panitia Acara' },
    ],
    penutup: ['Demikian kerangka acuan LKMM-PD 2026 ini disusun sebagai pedoman panitia dan peserta.'],
    latar: [
      'Regenerasi pengurus merupakan kebutuhan setiap organisasi. HMIF menyelenggarakan LKMM-PD sebagai tahap awal pembinaan kader dari mahasiswa baru.',
    ],
    landasan: ['Anggaran Dasar dan Anggaran Rumah Tangga HMIF.', 'Program kerja Departemen Kaderisasi periode 2026/2027.'],
    asas: ['Kepemimpinan', 'Kebersamaan', 'Tanggung jawab'],
    pengisi: [
      { peran: 'Pemateri kepemimpinan', nama: 'Muhammad Raihan' },
      { peran: 'Pemateri manajemen waktu', nama: 'Alumni HMIF' },
    ],
    lengkap: true,
  },
  {
    kunci: 'visit',
    ketuplak: 'eks2',
    nama: 'Kunjungan Industri ke Perusahaan Teknologi Jakarta',
    tema: 'Melihat Industri dari Dekat',
    gambaran: ['Kunjungan ke dua perusahaan rintisan di Jakarta untuk melihat budaya kerja dan proses pengembangan produk.'],
    tujuan: ['Memberi gambaran dunia kerja bagi mahasiswa tingkat akhir.'],
    bentuk: { uraian: [], sub: [] },
    sesi: [],
    sasaran: { uraian: [], estimasi: 45, kelompok: null },
    kondisi: [],
    parameter: [],
    rangkaian: [],
    rundown: [],
    penutup: [],
    latar: [],
    landasan: [],
    asas: [],
    pengisi: [],
    lengkap: false,
  },
];

/** TOR dikirim seperti auto-save editor: seluruh `data` + `rundown`. */
async function isiTor(ketuplak: Sesi, kid: string, a: IsiAcara): Promise<void> {
  const data = {
    nama_kegiatan: a.nama,
    tema: a.tema,
    gambaran_umum: teksKaya(...a.gambaran),
    tujuan: a.tujuan,
    bentuk_acara: { uraian: teksKaya(...a.bentuk.uraian), sub: a.bentuk.sub },
    waktu_tempat: a.sesi.map((s) => ({ sesi: s.sesi, tanggal: dari(s.hari), waktu: s.waktu, tempat: s.tempat })),
    sasaran: { uraian: teksKaya(...a.sasaran.uraian), estimasi_jumlah: a.sasaran.estimasi, jumlah_kelompok: a.sasaran.kelompok },
    kondisi: a.kondisi,
    parameter: a.parameter.map((x) => ({ kriteria: x.kriteria, bobot: x.bobot, kkm: x.kkm })),
    rangkaian: a.rangkaian,
    penutup: teksKaya(...a.penutup),
  };
  const rundown = a.rundown.map((r) => ({
    id: randomUUID(),
    tanggal: dari(r.hari),
    waktu_mulai: r.mulai.replace('.', ':'),
    waktu_selesai: r.selesai.replace('.', ':'),
    acara: r.acara,
    keterangan: r.ket,
  }));
  await ketuplak.wajib('PUT', `/api/tor/${kid}`, { data, ...(rundown.length ? { rundown } : {}) }, `simpan TOR ${a.kunci}`);
}

const PEJABAT = {
  ketua_bem: { nama: 'Rizky Maulana Putra', nomor: '3337220214' },
  wd3: { nama: 'Dr. Ir. Hendra Wijaya, M.T.', nomor: 'NIP 197405122000031002' },
  kaprodi: { nama: 'Dr. Sari Wulandari, S.T., M.Kom.', nomor: 'NIP 198109232006042001' },
};

async function isiProposal(ketuplak: Sesi, kid: string, a: IsiAcara): Promise<void> {
  const g = await ketuplak.wajib('GET', `/api/proposal/${kid}`, undefined, `muat proposal ${a.kunci}`);
  const data: DataProposal = g.data.data;
  const isi = (id: IdFieldProposal, nilai: unknown): void => {
    if (fieldTerisi(data, id)) return; // sudah terisi otomatis dari TOR/Proker/Panitia
    (data as unknown as Record<string, unknown>)[id] = nilai;
  };
  isi('nama_kegiatan', a.nama);
  isi('ketua_bem', PEJABAT.ketua_bem);
  isi('wd3', PEJABAT.wd3);
  isi('kaprodi', PEJABAT.kaprodi);
  isi('latar_belakang', teksKaya(...a.latar));
  isi('landasan_kegiatan', teksKaya(...a.landasan));
  isi('asas', a.asas);
  isi('tujuan', a.tujuan);
  isi('sasaran', teksKaya(...a.sasaran.uraian));
  isi('bentuk_acara', teksKaya(...a.bentuk.uraian));
  isi('sesi', a.sesi.map((s) => ({ sesi: s.sesi, tanggal: dari(s.hari), waktu: s.waktu, tempat: s.tempat })));
  isi('pengisi', a.pengisi);
  isi('gambaran_umum', teksKaya(...a.gambaran));
  isi('rangkaian', a.rangkaian);
  isi('penutup', teksKaya(...a.penutup));
  if (!data.sekretaris.nama) {
    // Sekretaris belum tertarik otomatis → isi dari susunan panitia (bila ada).
    data.sekretaris = { nama: g.data.sekretaris_acara?.nama ?? 'Sekretaris Panitia', nomor: g.data.sekretaris_acara?.nim ?? '' };
  }
  await ketuplak.wajib('PUT', `/api/proposal/${kid}`, { data }, `simpan proposal ${a.kunci}`);
}

// ---- Foto dokumentasi (ilustrasi) ------------------------------------------------

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function fotoKegiatan(judul: string, warna: string, variasi: number): Promise<{ master: Buffer; preview: Buffer; thumb: Buffer; lebar: number; tinggi: number }> {
  const lebar = 1600;
  const tinggi = 1000;
  const orang = Array.from({ length: 16 }, (_, i) => {
    const x = 140 + ((i * 97 + variasi * 41) % 1320);
    const y = 640 + ((i * 53 + variasi * 17) % 240);
    const r = 34 + ((i * 7) % 14);
    const warnaBaju = ['#1f3b73', '#0f766e', '#9a3412', '#6d28d9', '#be123c', '#0e7490'][(i + variasi) % 6];
    return `<circle cx="${x}" cy="${y - r}" r="${r * 0.62}" fill="#f1c9a5"/><rect x="${x - r * 0.9}" y="${y - r * 0.4}" width="${r * 1.8}" height="${r * 1.7}" rx="${r * 0.5}" fill="${warnaBaju}"/>`;
  }).join('');
  const svg = `<svg width="${lebar}" height="${tinggi}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${warna}"/><stop offset="1" stop-color="#0b1020"/></linearGradient></defs>
    <rect width="${lebar}" height="${tinggi}" fill="url(#g)"/>
    <rect x="260" y="150" width="1080" height="330" rx="18" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>
    <text x="${lebar / 2}" y="290" font-size="76" font-weight="bold" font-family="sans-serif" text-anchor="middle" fill="#fff">${esc(judul)}</text>
    <text x="${lebar / 2}" y="372" font-size="40" font-family="sans-serif" text-anchor="middle" fill="#dbe4ff">Himpunan Mahasiswa Informatika · UNTIRTA</text>
    <rect x="0" y="870" width="${lebar}" height="130" fill="#000" fill-opacity="0.35"/>
    ${orang}
  </svg>`;
  const master = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  const [preview, thumb] = await Promise.all([
    sharp(master).resize(1000, 625).webp({ quality: 78 }).toBuffer(),
    sharp(master).resize(320, 200).webp({ quality: 70 }).toBuffer(),
  ]);
  return { master, preview, thumb, lebar, tinggi };
}

async function unggahFoto(sesi: Sesi, judul: string, warna: string, no: number): Promise<string> {
  const f = await fotoKegiatan(judul, warna, no);
  const up = await sesi.unggah('/api/images/upload', {
    master: { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: f.master },
    preview: { name: 'preview.webp', mimeType: 'image/webp', buffer: f.preview },
    thumb: { name: 'thumb.webp', mimeType: 'image/webp', buffer: f.thumb },
    original_width: String(f.lebar),
    original_height: String(f.tinggi),
    original_mime_type: 'image/jpeg',
    kind: 'FOTO',
    is_scanned: 'false',
    original_filename: `dokumentasi-${no}.jpg`,
  });
  if (!up.ok) throw new GagalApi(`unggah foto dokumentasi ${judul}`, up);
  return up.data.id as string;
}

async function isiLpjDies(sql: Sql, sesi: Map<string, Sesi>, kid: string): Promise<void> {
  const bendum = sesi.get('bendum')!;
  const divisi = await sql<{ id: string; nama: string }[]>`SELECT id::text, nama FROM divisi WHERE kepanitiaan_id = ${kid}::uuid ORDER BY urutan, nama`;

  const judulFoto: Array<[string, string]> = [
    ['Registrasi dan sambutan tamu', '#1d4ed8'],
    ['Sambutan Ketua HMIF', '#0f766e'],
    ['Penampilan unit kegiatan', '#9333ea'],
    ['Penyerahan penghargaan', '#b45309'],
    ['Foto bersama keluarga besar', '#be123c'],
  ];
  const dokumentasi: Array<{ image_id: string; caption: string }> = [];
  for (const [i, [judul, warna]] of judulFoto.entries()) {
    dokumentasi.push({ image_id: await unggahFoto(bendum, judul, warna, i + 1), caption: judul });
  }

  const narasi: Record<string, Record<string, string>> = {};
  const isiDivisi: Record<string, { narasi: string; perencanaan: string; pelaksanaan: string; pendukung: string; penghambat: string; saran: string }> = {
    Acara: {
      narasi: 'Divisi Acara menyusun dan menjalankan rundown malam puncak dari registrasi hingga penutupan.',
      perencanaan: 'Rundown disusun tiga minggu sebelum acara dan diuji dalam gladi bersih satu hari sebelumnya.',
      pelaksanaan: 'Seluruh sesi berjalan sesuai rundown dengan keterlambatan total kurang dari sepuluh menit.',
      pendukung: 'Pembawa acara berpengalaman dan kerja sama yang baik dengan divisi lain.',
      penghambat: 'Sistem suara sempat berdengung pada sesi penampilan pertama.',
      saran: 'Lakukan uji suara bersama penampil minimal dua jam sebelum acara.',
    },
    Konsumsi: {
      narasi: 'Divisi Konsumsi menyediakan jamuan pembuka dan makan malam bagi 120 tamu.',
      perencanaan: 'Menu dan jumlah porsi ditetapkan berdasarkan data konfirmasi kehadiran H-3.',
      pelaksanaan: 'Makanan tiba tepat waktu dan seluruh tamu terlayani tanpa antrean panjang.',
      pendukung: 'Rekanan katering memberikan harga yang sesuai anggaran.',
      penghambat: 'Dua belas tamu hadir tanpa konfirmasi sehingga porsi sempat tipis.',
      saran: 'Siapkan cadangan porsi sepuluh persen dari jumlah konfirmasi.',
    },
    Dokumentasi: {
      narasi: 'Divisi Dokumentasi mengabadikan seluruh rangkaian acara dalam foto dan video.',
      perencanaan: 'Titik pengambilan gambar dan daftar momen wajib disepakati sebelum acara.',
      pelaksanaan: 'Lebih dari 400 foto dan satu video ringkas dihasilkan, diserahkan maksimal H+3.',
      pendukung: 'Peminjaman kamera dan lensa dari departemen komunikasi dan informasi.',
      penghambat: 'Pencahayaan panggung kurang pada sesi penampilan.',
      saran: 'Koordinasikan tata cahaya dengan divisi acara sejak gladi.',
    },
  };
  for (const d of divisi) narasi[d.id] = isiDivisi[d.nama] ?? Object.values(isiDivisi)[0]!;

  const manual = {
    pendahuluan:
      'Dies Natalis HMIF ke-12 diselenggarakan sebagai peringatan hari jadi himpunan sekaligus ajang kebersamaan pengurus, anggota, alumni, dan dosen Informatika UNTIRTA. Laporan ini memuat pertanggungjawaban pelaksanaan dan keuangan kegiatan.',
    target_peserta: '120 orang; terealisasi 118 orang (98%).',
    waktu: { hari_tanggal: rentangPanjang(dari(-17), dari(-16)), waktu: '18.30 WIB s.d. 22.00 WIB', tempat: AULA },
    proses_perencanaan:
      'Perencanaan dimulai enam minggu sebelum hari-H melalui rapat panitia mingguan. Susunan acara, anggaran, dan pembagian tugas divisi disepakati pada rapat ketiga, kemudian disetujui Ketua HMIF.',
    pelaksanaan_kegiatan:
      'Acara dibuka pukul 18.30 dengan sambutan Ketua HMIF dan perwakilan dosen, dilanjutkan penampilan unit kegiatan, penyerahan penghargaan pengurus berprestasi, serta makan malam bersama. Acara selesai pukul 22.05 WIB.',
    output: 'Terlaksananya malam puncak yang dihadiri 118 orang, lima penghargaan terserah, dan dokumentasi lengkap kegiatan.',
    penutup: 'Demikian laporan pertanggungjawaban ini disusun. Kami mohon maaf atas segala kekurangan dan berterima kasih atas dukungan seluruh pihak.',
    narasi,
    catatan_materi: 'Tidak ada materi pelatihan; sesi refleksi dibawakan Ketua HMIF.',
    materi: [{ judul: 'Refleksi dua belas tahun HMIF', pengisi: 'Ketua HMIF', tautan: '' }],
    daftar_hadir: 'Daftar hadir dikumpulkan di meja registrasi: 118 tamu undangan, 9 dosen, 31 alumni.',
    dokumentasi,
    pejabat: { kaprodi: PEJABAT.kaprodi, wd3: PEJABAT.wd3 },
    catatan_pengembalian: null,
  };
  await bendum.wajib('PUT', `/api/lpj/${kid}`, { manual }, 'simpan isian LPJ');
  await bendum.wajib('POST', `/api/lpj/${kid}/generate`, {}, 'generate LPJ');
  await bendum.wajib('POST', `/api/lpj/${kid}/approve`, { aksi: 'ajukan' }, 'ajukan LPJ');
  await bendum.wajib('POST', `/api/lpj/${kid}/approve`, { aksi: 'setujui' }, 'LPJ disetujui Bendahara Umum');
  await sesi.get('ketua')!.wajib('POST', `/api/lpj/${kid}/approve`, { aksi: 'setujui' }, 'LPJ disetujui Ketua Himpunan');
}

export async function isiDokumen(sql: Sql, sesi: Map<string, Sesi>, akun: Map<string, InfoAkun>, proker: Map<string, HasilProker>): Promise<void> {
  void akun;
  langkah('TOR & Proposal: isi editor → buat DOCX');
  for (const a of ACARA) {
    const kid = proker.get(a.kunci)?.kepanitiaanId;
    if (!kid) throw new Error(`Kepanitiaan ${a.kunci} tidak ada.`);
    const ketuplak = sesi.get(a.ketuplak)!;
    await isiTor(ketuplak, kid, a);
    if (!a.lengkap) {
      ok(`${a.nama}: TOR setengah jadi (draf)`);
      continue;
    }
    await ketuplak.wajib('POST', `/api/tor/${kid}/generate`, {}, `generate TOR ${a.kunci}`);
    await isiProposal(ketuplak, kid, a);
    if (a.kunci !== 'lkmm') await ketuplak.wajib('POST', `/api/proposal/${kid}/generate`, {}, `generate proposal ${a.kunci}`);
    ok(`${a.nama}: TOR ✓ DOCX · Proposal ${a.kunci !== 'lkmm' ? '✓ DOCX' : 'terisi, belum dibuat'}`);
  }

  langkah('LPJ Dies Natalis: dokumentasi → generate → Bendum → Ketua (FINAL)');
  await isiLpjDies(sql, sesi, proker.get('dies')!.kepanitiaanId!);
  const [lpj] = await sql<{ status: string }[]>`SELECT status::text FROM lpj WHERE kepanitiaan_id = ${proker.get('dies')!.kepanitiaanId!}::uuid`;
  const [rab] = await sql<{ status: string }[]>`SELECT status::text FROM rab_meta WHERE kepanitiaan_id = ${proker.get('dies')!.kepanitiaanId!}::uuid`;
  ok(`LPJ ${lpj?.status} · RAB ${rab?.status}`);
}

