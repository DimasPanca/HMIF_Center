/**
 * Skenario proker demo — 16 proker di enam departemen dengan SELURUH status:
 * Draf, Menunggu approval, Disetujui (mengunci kalender), Berjalan, Selesai,
 * Perlu revisi, Ditolak, dan Menunggu approval revisi (edit proker terkunci).
 *
 * Semuanya lahir lewat wizard + approval API sungguhan: Kadept menyimpan draf
 * dan mengajukan, Ketua menyetujui/menolak/meminta revisi. Kepanitiaan acara
 * besar terbentuk otomatis oleh sistem saat disetujui.
 */

import { GagalApi, type Sesi } from './klien';
import { dari, langkah, ok, rentangPanjang, type Sql } from './konfig';
import { orang, type KodeDept } from './roster';
import type { InfoAkun, Latar } from './akun';

type Nasib = 'SETUJUI' | 'MENUNGGU' | 'REVISI' | 'TOLAK' | 'DRAFT' | 'SETUJUI_LALU_EDIT';

export interface ScenarioProker {
  kunci: string;
  dept: KodeDept;
  nama: string;
  kategori: 'TERJADWAL' | 'BERKALA' | 'RESPONSIF';
  deskripsi: string;
  tujuan: string;
  sasaran: string;
  peserta: number;
  anggaran: number;
  sumberDana: Array<'KAS_HIMPUNAN' | 'IURAN_PESERTA' | 'SPONSOR' | 'DANA_FAKULTAS'>;
  /** TERJADWAL: persiapan/hari-H relatif hari ini (hari). RESPONSIF: hari-H. */
  jadwal?: { persiapan?: number; hariH: number; hariHSelesai: number };
  pola?: { frekuensi: 'MINGGUAN' | 'BULANAN'; hari: string[]; mulai: number; selesai: number };
  kepanitiaan?: {
    tema: string;
    ketuplak: string;
    wakil?: string;
    sekretaris?: string;
    bendahara?: string;
    target: number;
    divisi: Array<{ nama: string; koordinator: string; anggota: string[]; warna: string }>;
  };
  gantt?: Array<{ fase: string; warna: string; pj?: string; tugas: Array<[nama: string, mulai: number, selesai: number, progres?: number, milestone?: boolean]> }>;
  nasib: Nasib;
  catatan?: string;
}

const gantt3 = (hariH: number, mulai: number): NonNullable<ScenarioProker['gantt']> => [
  {
    fase: 'Persiapan',
    warna: '#2563EB',
    tugas: [
      ['Rapat perdana panitia', mulai, mulai + 1, 100],
      ['Penyusunan TOR & proposal', mulai + 2, mulai + 8, 100],
      ['Pengajuan perizinan & ruangan', mulai + 6, mulai + 14, 80],
    ],
  },
  {
    fase: 'Publikasi',
    warna: '#D97706',
    tugas: [
      ['Desain poster & kit media sosial', mulai + 7, mulai + 13, 90],
      ['Open registration peserta', mulai + 14, hariH - 3, 40],
    ],
  },
  {
    fase: 'Pelaksanaan',
    warna: '#16A34A',
    tugas: [
      ['Gladi resik', hariH - 1, hariH - 1, 0],
      ['Hari-H kegiatan', hariH, hariH + 1, 0, true],
      ['Evaluasi & penyusunan LPJ', hariH + 2, hariH + 12, 0],
    ],
  },
];

export const SKENARIO: ScenarioProker[] = [
  // ---- Selesai: seluruh siklus hidup (RAB → nota → LPJ final) -------------------
  {
    kunci: 'dies',
    dept: 'INT',
    nama: 'Dies Natalis HMIF ke-12 — Malam Puncak',
    kategori: 'TERJADWAL',
    deskripsi: 'Malam puncak peringatan Dies Natalis HMIF: penampilan unit kegiatan, penyerahan penghargaan pengurus berprestasi, dan temu alumni.',
    tujuan: 'Mempererat kekeluargaan pengurus, anggota, dan alumni Informatika UNTIRTA.',
    sasaran: 'Anggota HMIF, alumni, dan dosen Informatika',
    peserta: 120,
    anggaran: 14_500_000,
    sumberDana: ['KAS_HIMPUNAN', 'SPONSOR'],
    jadwal: { persiapan: -46, hariH: -17, hariHSelesai: -16 },
    kepanitiaan: {
      tema: 'Satu Langkah, Seribu Karya',
      ketuplak: 'int1',
      wakil: 'kad1',
      sekretaris: 'kominfo3',
      bendahara: 'int2',
      target: 14_500_000,
      divisi: [
        { nama: 'Acara', koordinator: 'int3', anggota: ['kad2', 'mikat2'], warna: '#2563EB' },
        { nama: 'Konsumsi', koordinator: 'kad3', anggota: ['int2', 'eks3'], warna: '#D97706' },
        { nama: 'Dokumentasi', koordinator: 'kominfo2', anggota: ['kominfo3', 'rnd3'], warna: '#7C3AED' },
      ],
    },
    gantt: gantt3(-17, -46),
    nasib: 'SETUJUI',
  },
  // ---- Berjalan: acara utama, isi paling lengkap ---------------------------------
  {
    kunci: 'sync',
    dept: 'EKS',
    nama: 'SYNCHRONIZE 2026 — Seminar Nasional Teknologi',
    kategori: 'TERJADWAL',
    deskripsi: 'Seminar nasional satu hari dengan tiga pembicara dari industri dan akademisi, sesi tanya jawab, serta pameran proyek mahasiswa.',
    tujuan: 'Memperluas wawasan mahasiswa tentang kecerdasan buatan dan peluang kariernya.',
    sasaran: 'Mahasiswa Informatika, SMA/SMK se-Banten, dan umum',
    peserta: 200,
    anggaran: 18_650_000,
    sumberDana: ['SPONSOR', 'IURAN_PESERTA', 'KAS_HIMPUNAN'],
    jadwal: { persiapan: -15, hariH: 12, hariHSelesai: 13 },
    kepanitiaan: {
      tema: 'Kecerdasan Buatan untuk Indonesia Tangguh',
      ketuplak: 'eks1',
      wakil: 'mikat1',
      sekretaris: 'kominfo1',
      bendahara: 'int2',
      target: 18_650_000,
      divisi: [
        { nama: 'Acara', koordinator: 'eks2', anggota: ['mikat2', 'kad1'], warna: '#2563EB' },
        { nama: 'Konsumsi', koordinator: 'int1', anggota: ['int3', 'kad2'], warna: '#D97706' },
        { nama: 'Perlengkapan', koordinator: 'rnd1', anggota: ['rnd2', 'mikat3'], warna: '#DC2626' },
        { nama: 'PDD', koordinator: 'kominfo2', anggota: ['kominfo3', 'rnd3'], warna: '#7C3AED' },
        { nama: 'Humas', koordinator: 'eks3', anggota: ['kominfo1', 'int2'], warna: '#0891B2' },
      ],
    },
    gantt: gantt3(12, -15),
    nasib: 'SETUJUI',
  },
  // ---- Disetujui, mendatang -----------------------------------------------------
  {
    kunci: 'lkmm',
    dept: 'KAD',
    nama: 'Latihan Kepemimpinan dan Manajemen Mahasiswa Pra-Dasar (LKMM-PD) 2026',
    kategori: 'TERJADWAL',
    deskripsi: 'Pelatihan kepemimpinan dua hari untuk anggota baru dengan materi organisasi, manajemen waktu, dan simulasi kepanitiaan.',
    tujuan: 'Membentuk kader yang siap memimpin dan berorganisasi.',
    sasaran: 'Mahasiswa baru angkatan 2026',
    peserta: 80,
    anggaran: 9_200_000,
    sumberDana: ['KAS_HIMPUNAN', 'DANA_FAKULTAS'],
    jadwal: { persiapan: 14, hariH: 41, hariHSelesai: 42 },
    kepanitiaan: {
      tema: 'Menjadi Pemimpin yang Berdampak',
      ketuplak: 'kad2',
      wakil: 'kad3',
      sekretaris: 'mikat3',
      bendahara: 'int2',
      target: 9_200_000,
      divisi: [
        { nama: 'Acara', koordinator: 'kad1', anggota: ['mikat1', 'int1'], warna: '#2563EB' },
        { nama: 'Konsumsi', koordinator: 'int3', anggota: ['kad3', 'eks3', 'int2'], warna: '#D97706' },
        { nama: 'Perlengkapan', koordinator: 'rnd2', anggota: ['rnd1', 'mikat2'], warna: '#DC2626' },
        { nama: 'Humas & Dokumentasi', koordinator: 'kominfo1', anggota: ['kominfo2', 'kominfo3'], warna: '#7C3AED' },
      ],
    },
    gantt: gantt3(41, 14),
    nasib: 'SETUJUI',
  },
  {
    kunci: 'visit',
    dept: 'EKS',
    nama: 'Kunjungan Industri ke Perusahaan Teknologi Jakarta',
    kategori: 'TERJADWAL',
    deskripsi: 'Kunjungan ke dua perusahaan rintisan di Jakarta untuk melihat budaya kerja dan proses pengembangan produk.',
    tujuan: 'Memberi gambaran dunia kerja bagi mahasiswa tingkat akhir.',
    sasaran: 'Mahasiswa semester 5 ke atas',
    peserta: 45,
    anggaran: 12_000_000,
    sumberDana: ['IURAN_PESERTA', 'KAS_HIMPUNAN'],
    jadwal: { persiapan: 80, hariH: 110, hariHSelesai: 110 },
    kepanitiaan: {
      tema: 'Melihat Industri dari Dekat',
      ketuplak: 'eks2',
      sekretaris: 'eks3',
      bendahara: 'int2',
      target: 12_000_000,
      divisi: [
        { nama: 'Acara & Transportasi', koordinator: 'eks3', anggota: ['eks1'], warna: '#2563EB' },
        { nama: 'Konsumsi', koordinator: 'int1', anggota: ['int3', 'int2'], warna: '#D97706' },
      ],
    },
    gantt: gantt3(110, 80),
    nasib: 'SETUJUI_LALU_EDIT',
  },
  // ---- Menunggu approval --------------------------------------------------------
  {
    kunci: 'cup',
    dept: 'MIKAT',
    nama: 'Informatics Cup 2026 — Kompetisi Pemrograman',
    kategori: 'TERJADWAL',
    deskripsi: 'Kompetisi pemrograman kompetitif tingkat mahasiswa dengan babak penyisihan daring dan final luring.',
    tujuan: 'Mengasah kemampuan algoritma dan pemecahan masalah mahasiswa.',
    sasaran: 'Mahasiswa Informatika dan Teknik Elektro',
    peserta: 100,
    anggaran: 7_500_000,
    sumberDana: ['SPONSOR', 'IURAN_PESERTA'],
    jadwal: { persiapan: 43, hariH: 75, hariHSelesai: 76 },
    kepanitiaan: {
      tema: 'Code. Compete. Conquer.',
      ketuplak: 'mikat2',
      wakil: 'mikat3',
      sekretaris: 'kominfo3',
      bendahara: 'int2',
      target: 7_500_000,
      divisi: [
        { nama: 'Acara', koordinator: 'mikat3', anggota: ['rnd3', 'kad1'], warna: '#2563EB' },
        { nama: 'Juri & Soal', koordinator: 'rnd1', anggota: ['rnd2', 'rnd3'], warna: '#16A34A' },
        { nama: 'Humas', koordinator: 'kominfo2', anggota: ['kominfo1'], warna: '#0891B2' },
      ],
    },
    gantt: gantt3(75, 43),
    nasib: 'MENUNGGU',
  },
  // ---- Perlu revisi & ditolak ---------------------------------------------------
  {
    kunci: 'workshop',
    dept: 'KOMINFO',
    nama: 'Workshop Desain dan Konten Kreatif',
    kategori: 'TERJADWAL',
    deskripsi: 'Workshop desain grafis dan produksi konten untuk pengelola media sosial organisasi.',
    tujuan: 'Meningkatkan kualitas publikasi organisasi kemahasiswaan.',
    sasaran: 'Pengelola media sosial HMIF dan UKM',
    peserta: 40,
    anggaran: 4_000_000,
    sumberDana: ['KAS_HIMPUNAN'],
    jadwal: { persiapan: 20, hariH: 45, hariHSelesai: 45 },
    kepanitiaan: {
      tema: 'Cerita Lewat Desain',
      ketuplak: 'kominfo2',
      sekretaris: 'kominfo3',
      bendahara: 'int2',
      target: 4_000_000,
      divisi: [{ nama: 'Acara', koordinator: 'kominfo3', anggota: ['kominfo1'], warna: '#2563EB' }],
    },
    gantt: gantt3(45, 20),
    nasib: 'REVISI',
    catatan: 'Tanggal pelaksanaan beririsan dengan persiapan LKMM-PD. Geser Hari-H ke minggu pertama Desember dan lengkapi rincian anggaran per divisi.',
  },
  {
    kunci: 'hackathon',
    dept: 'RND',
    nama: 'Hackathon Internal HMIF',
    kategori: 'TERJADWAL',
    deskripsi: 'Hackathon 24 jam untuk membangun prototipe aplikasi pendukung kegiatan himpunan.',
    tujuan: 'Mendorong budaya membangun produk di kalangan anggota.',
    sasaran: 'Anggota HMIF',
    peserta: 60,
    anggaran: 6_000_000,
    sumberDana: ['KAS_HIMPUNAN'],
    jadwal: { persiapan: -5, hariH: 20, hariHSelesai: 21 },
    kepanitiaan: {
      tema: 'Build Something Useful',
      ketuplak: 'rnd2',
      sekretaris: 'rnd3',
      bendahara: 'int2',
      target: 6_000_000,
      divisi: [{ nama: 'Acara', koordinator: 'rnd3', anggota: ['rnd1'], warna: '#2563EB' }],
    },
    gantt: gantt3(20, -5),
    nasib: 'TOLAK',
    catatan: 'Jadwal bentrok dengan SYNCHRONIZE 2026 dan belum ada sumber dana yang pasti. Ajukan ulang setelah SYNCHRONIZE selesai.',
  },
  // ---- Responsif ------------------------------------------------------------------
  {
    kunci: 'banjir',
    dept: 'INT',
    nama: 'Aksi Peduli Banjir — Penggalangan Dana dan Logistik',
    kategori: 'RESPONSIF',
    deskripsi: 'Penggalangan dana dan pengumpulan logistik untuk warga terdampak banjir di sekitar kampus.',
    tujuan: 'Membantu warga terdampak secara cepat.',
    sasaran: 'Warga terdampak dan seluruh sivitas fakultas',
    peserta: 30,
    anggaran: 2_500_000,
    sumberDana: ['KAS_HIMPUNAN'],
    jadwal: { hariH: 3, hariHSelesai: 4 },
    nasib: 'SETUJUI',
  },
  {
    kunci: 'bakti',
    dept: 'EKS',
    nama: 'Bakti Sosial Panti Asuhan Al-Ikhlas',
    kategori: 'RESPONSIF',
    deskripsi: 'Kunjungan dan donasi ke panti asuhan terdekat atas permintaan pengurus panti.',
    tujuan: 'Menumbuhkan kepedulian sosial anggota.',
    sasaran: 'Anak-anak panti asuhan',
    peserta: 25,
    anggaran: 1_800_000,
    sumberDana: ['KAS_HIMPUNAN'],
    jadwal: { hariH: 9, hariHSelesai: 9 },
    nasib: 'MENUNGGU',
  },
  // ---- Berkala (otomatis disetujui) -----------------------------------------------
  {
    kunci: 'kajian',
    dept: 'KAD',
    nama: 'Kajian Rutin Mingguan',
    kategori: 'BERKALA',
    deskripsi: 'Kajian keilmuan dan keislaman setiap pekan di musala fakultas.',
    tujuan: 'Pembinaan rutin anggota.',
    sasaran: 'Anggota HMIF',
    peserta: 40,
    anggaran: 1_200_000,
    sumberDana: ['KAS_HIMPUNAN'],
    pola: { frekuensi: 'MINGGUAN', hari: ['JUMAT'], mulai: -45, selesai: 120 },
    nasib: 'SETUJUI',
  },
  {
    kunci: 'esport',
    dept: 'MIKAT',
    nama: 'Latihan Rutin Tim E-Sport',
    kategori: 'BERKALA',
    deskripsi: 'Latihan tim e-sport HMIF menjelang turnamen antar-jurusan.',
    tujuan: 'Pembinaan minat dan bakat.',
    sasaran: 'Anggota tim e-sport',
    peserta: 15,
    anggaran: 900_000,
    sumberDana: ['KAS_HIMPUNAN'],
    pola: { frekuensi: 'MINGGUAN', hari: ['SELASA', 'KAMIS'], mulai: -30, selesai: 90 },
    nasib: 'SETUJUI',
  },
  {
    kunci: 'evaluasi',
    dept: 'INT',
    nama: 'Rapat Evaluasi Bulanan Pengurus',
    kategori: 'BERKALA',
    deskripsi: 'Rapat evaluasi kinerja seluruh departemen setiap bulan.',
    tujuan: 'Memastikan program kerja berjalan sesuai rencana.',
    sasaran: 'Seluruh pengurus',
    peserta: 40,
    anggaran: 600_000,
    sumberDana: ['KAS_HIMPUNAN'],
    pola: { frekuensi: 'BULANAN', hari: ['SABTU'], mulai: -40, selesai: 200 },
    nasib: 'SETUJUI',
  },
  {
    kunci: 'podcast',
    dept: 'KOMINFO',
    nama: 'Podcast HMIF — Cerita Alumni',
    kategori: 'BERKALA',
    deskripsi: 'Podcast dua mingguan yang menghadirkan alumni dan praktisi.',
    tujuan: 'Berbagi pengalaman karier alumni.',
    sasaran: 'Mahasiswa Informatika',
    peserta: 500,
    anggaran: 1_500_000,
    sumberDana: ['KAS_HIMPUNAN'],
    pola: { frekuensi: 'MINGGUAN', hari: ['RABU'], mulai: -20, selesai: 150 },
    nasib: 'SETUJUI',
  },
  {
    kunci: 'riset',
    dept: 'RND',
    nama: 'Riset Bersama Dosen — Kelompok Studi',
    kategori: 'BERKALA',
    deskripsi: 'Kelompok studi riset yang bertemu mingguan dengan dosen pembimbing.',
    tujuan: 'Menumbuhkan budaya riset.',
    sasaran: 'Mahasiswa peminat riset',
    peserta: 20,
    anggaran: 800_000,
    sumberDana: ['KAS_HIMPUNAN'],
    pola: { frekuensi: 'MINGGUAN', hari: ['SENIN'], mulai: -35, selesai: 100 },
    nasib: 'SETUJUI',
  },
  // ---- Draf -------------------------------------------------------------------------
  {
    kunci: 'ramadan',
    dept: 'KAD',
    nama: 'Bakti Sosial Ramadan 2027',
    kategori: 'TERJADWAL',
    deskripsi: 'Rencana bakti sosial dan buka puasa bersama. Masih tahap penyusunan.',
    tujuan: 'Berbagi di bulan Ramadan.',
    sasaran: 'Warga sekitar kampus',
    peserta: 60,
    anggaran: 5_000_000,
    sumberDana: ['KAS_HIMPUNAN'],
    jadwal: { persiapan: 120, hariH: 150, hariHSelesai: 150 },
    nasib: 'DRAFT',
  },
];

export interface HasilProker {
  prokerId: string;
  kepanitiaanId?: string;
}

function draftDari(s: ScenarioProker, deptId: string, pj: string, akun: Map<string, InfoAkun>) {
  const idOf = (k: string) => akun.get(k)!.id;
  const draft: Record<string, unknown> = {
    departemen_id: deptId,
    nama: s.nama,
    kategori: s.kategori,
    deskripsi: s.deskripsi,
    tujuan: s.tujuan,
    sasaran: s.sasaran,
    estimasi_peserta: s.peserta,
    penanggung_jawab: pj,
    estimasi_anggaran: s.anggaran,
    sumber_dana: s.sumberDana,
  };
  if (s.jadwal) {
    if (s.jadwal.persiapan !== undefined) draft.tanggal_mulai_persiapan = dari(s.jadwal.persiapan);
    draft.tanggal_hari_h_mulai = dari(s.jadwal.hariH);
    draft.tanggal_hari_h_selesai = dari(s.jadwal.hariHSelesai);
  }
  if (s.pola) {
    draft.pola_ulang = { frekuensi: s.pola.frekuensi, hari: s.pola.hari, mulai: dari(s.pola.mulai), selesai: dari(s.pola.selesai) };
  }
  if (s.kepanitiaan) {
    const k = s.kepanitiaan;
    draft.kepanitiaan = {
      nama_acara: s.nama.split(' — ')[0]!.length >= 3 ? s.nama.split(' — ')[0] : s.nama,
      tema: k.tema,
      ketua_pelaksana: idOf(k.ketuplak),
      ...(k.wakil ? { wakil_pelaksana: idOf(k.wakil) } : {}),
      ...(k.sekretaris ? { sekretaris: idOf(k.sekretaris) } : {}),
      ...(k.bendahara ? { bendahara: idOf(k.bendahara) } : {}),
      target_anggaran: k.target,
      divisi: k.divisi.map((d) => ({
        nama: d.nama,
        koordinator_id: idOf(d.koordinator),
        warna: d.warna,
        anggota: [...new Set(d.anggota.filter((a) => a !== d.koordinator))].map(idOf),
      })),
    };
  }
  if (s.gantt) {
    draft.gantt = {
      judul: `Timeline ${s.nama.split(' — ')[0]}`,
      groups: s.gantt.map((g) => ({
        nama: g.fase,
        warna: g.warna,
        ...(g.pj ? { pj_nama: g.pj } : {}),
        tasks: g.tugas.map(([nama, a, b, progres, ms]) => ({
          nama,
          tanggal_mulai: dari(a),
          tanggal_selesai: dari(b),
          ...(progres !== undefined ? { progres } : {}),
          ...(ms ? { is_milestone: true } : {}),
        })),
      })),
    };
  }
  return draft;
}

export async function jalankanProker(
  sql: Sql,
  sesi: Map<string, Sesi>,
  latar: Latar,
  akun: Map<string, InfoAkun>,
): Promise<Map<string, HasilProker>> {
  langkah('Program kerja: wizard → approval (Kadept mengajukan, Ketua memutuskan)');
  const hasil = new Map<string, HasilProker>();
  const ketua = sesi.get('ketua')!;

  // Urut kronologis menurut hari-H supaya kunci kalender terbentuk tanpa tabrakan.
  const urut = [...SKENARIO].sort((a, b) => (a.jadwal?.hariH ?? a.pola?.mulai ?? 0) - (b.jadwal?.hariH ?? b.pola?.mulai ?? 0));

  for (const s of urut) {
    const kadept = sesi.get(`kadept.${s.dept.toLowerCase()}`)!;
    const deptId = latar.dept.get(s.dept)!;
    const pj = akun.get(`kadept.${s.dept.toLowerCase()}`)!.id;
    const draft = draftDari(s, deptId, pj, akun);

    let prokerId: string;
    if (s.nasib === 'DRAFT') {
      const r = await kadept.wajib('POST', '/api/proker', draft, `buat draf ${s.kunci}`);
      prokerId = r.data.id;
      hasil.set(s.kunci, { prokerId });
      ok(`${s.nama} — Draf`);
      continue;
    }

    await kadept.wajib('PUT', '/api/proker/draft', { data: draft, langkah: 6 }, `simpan draft ${s.kunci}`);
    const aju = await kadept.wajib('POST', '/api/proker/submit', {}, `submit ${s.kunci}`);
    prokerId = aju.data.proker_id;
    let status: string = aju.data.status;

    if (s.nasib === 'SETUJUI' || s.nasib === 'SETUJUI_LALU_EDIT') {
      if (status === 'MENUNGGU_APPROVAL') {
        await ketua.wajib('POST', `/api/proker/${prokerId}/approve`, {}, `setujui ${s.kunci}`);
        status = 'DISETUJUI';
      }
    } else if (s.nasib === 'REVISI') {
      await ketua.wajib('POST', `/api/proker/${prokerId}/revisi`, { catatan: s.catatan }, `revisi ${s.kunci}`);
      status = 'PERLU_REVISI';
    } else if (s.nasib === 'TOLAK') {
      await ketua.wajib('POST', `/api/proker/${prokerId}/reject`, { alasan: s.catatan }, `tolak ${s.kunci}`);
      status = 'DITOLAK';
    }

    if (s.nasib === 'SETUJUI_LALU_EDIT') {
      // Perubahan MAYOR proker terkunci: Hari-H digeser sehari → butuh persetujuan ulang.
      const e = await kadept.wajib(
        'PATCH',
        `/api/proker/${prokerId}`,
        { tanggal_hari_h_mulai: dari(s.jadwal!.hariH + 1), tanggal_hari_h_selesai: dari(s.jadwal!.hariHSelesai + 1) },
        `edit terkunci ${s.kunci}`,
      );
      status = e.data?.status ?? 'MENUNGGU_APPROVAL_REVISI';
    }

    const [kp] = await sql<{ id: string }[]>`SELECT id::text FROM kepanitiaan WHERE proker_id = ${prokerId}::uuid`;
    hasil.set(s.kunci, { prokerId, kepanitiaanId: kp?.id });
    const jadwal = s.jadwal ? ` (${rentangPanjang(dari(s.jadwal.hariH), dari(s.jadwal.hariHSelesai))})` : '';
    ok(`${s.nama}${jadwal} — ${status}${kp ? ' · kepanitiaan terbentuk' : ''}`);
  }
  return hasil;
}

/** Memulihkan peta kunci → id dari DB (untuk menjalankan ulang satu fase saja). */
export async function pulihkanProker(sql: Sql): Promise<Map<string, HasilProker>> {
  const hasil = new Map<string, HasilProker>();
  for (const s of SKENARIO) {
    const [r] = await sql<{ id: string; kid: string | null }[]>`
      SELECT p.id::text, k.id::text AS kid FROM proker p LEFT JOIN kepanitiaan k ON k.proker_id = p.id
      WHERE p.nama = ${s.nama} ORDER BY p.created_at DESC LIMIT 1`;
    if (r) hasil.set(s.kunci, { prokerId: r.id, kepanitiaanId: r.kid ?? undefined });
  }
  if (hasil.size === 0) throw new Error('Tidak ada proker demo di DB — jalankan seeder penuh dulu.');
  return hasil;
}

export const KEPANITIAAN_AKTIF = ['dies', 'sync', 'lkmm', 'visit'] as const;
export { GagalApi, orang };
