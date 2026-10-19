/**
 * Kanban, Kendala, Ruangan, Backup, dan cron harian untuk data demo.
 * Kartu/kendala dibuat anggota & Kadept departemennya lewat API sungguhan;
 * status kolom, prioritas, dan balasan berulir diatur seperti pemakaian nyata.
 */

import { tokenMention } from '@/lib/kendala/skema';

import type { InfoAkun, Latar } from './akun';
import type { Sesi } from './klien';
import { dari, log, ok, PENANDA, peringatan, sebagai, type Sql } from './konfig';
import type { HasilProker } from './proker';
import { SKENARIO } from './proker';

type Kolom = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
type Prioritas = 'RENDAH' | 'SEDANG' | 'TINGGI' | 'KRITIS';

interface Kartu {
  judul: string;
  deskripsi: string;
  prioritas: Prioritas;
  kolom: Kolom;
  /** kunci akun; default Kadept */
  pic?: string;
  deadline: number | null;
  proker?: string;
  /** [teks, selesai] */
  checklist?: Array<[string, boolean]>;
  simpanTemplate?: string;
}

const KANBAN: Record<string, Kartu[]> = {
  KAD: [
    { judul: 'Menyusun modul LKMM-PD sesi kepemimpinan', deskripsi: 'Modul 20 halaman memuat materi, studi kasus, dan lembar kerja.', prioritas: 'TINGGI', kolom: 'IN_PROGRESS', pic: 'kad1', deadline: 10, proker: 'lkmm', checklist: [['Kerangka materi', true], ['Studi kasus', true], ['Lembar kerja peserta', false], ['Tinjauan Kadept', false]], simpanTemplate: 'Penyusunan modul pelatihan' },
    { judul: 'Menghubungi pemateri alumni LKMM-PD', deskripsi: 'Dua pemateri alumni untuk sesi manajemen waktu dan komunikasi.', prioritas: 'SEDANG', kolom: 'TODO', pic: 'kad2', deadline: 14, proker: 'lkmm' },
    { judul: 'Menyiapkan formulir pendaftaran LKMM-PD', deskripsi: 'Formulir daring dengan data diri dan kontak darurat peserta.', prioritas: 'SEDANG', kolom: 'REVIEW', pic: 'kad3', deadline: 5, proker: 'lkmm' },
    { judul: 'Rekap kehadiran kajian mingguan', deskripsi: 'Rekap kehadiran bulan ini untuk laporan kaderisasi.', prioritas: 'RENDAH', kolom: 'DONE', pic: 'kad3', deadline: -4 },
    { judul: 'Evaluasi program mentoring angkatan 2025', deskripsi: 'Kuesioner kepuasan dan rekomendasi perbaikan.', prioritas: 'SEDANG', kolom: 'DONE', deadline: -9 },
  ],
  MIKAT: [
    { judul: 'Membuka pendaftaran Informatics Cup', deskripsi: 'Publikasi pendaftaran dan buku panduan lomba pemrograman.', prioritas: 'TINGGI', kolom: 'IN_PROGRESS', pic: 'mikat1', deadline: 7, proker: 'cup', checklist: [['Buku panduan', true], ['Formulir pendaftaran', true], ['Publikasi poster', false]] },
    { judul: 'Menyusun soal babak penyisihan', deskripsi: 'Dua puluh soal algoritma tingkat dasar-menengah.', prioritas: 'TINGGI', kolom: 'TODO', pic: 'mikat2', deadline: 20, proker: 'cup' },
    { judul: 'Latihan rutin tim e-sport', deskripsi: 'Jadwal latihan mingguan menjelang turnamen antarprodi.', prioritas: 'RENDAH', kolom: 'IN_PROGRESS', pic: 'mikat3', deadline: 6 },
    { judul: 'Seleksi anggota unit musik', deskripsi: 'Audisi dan penentuan formasi tampil.', prioritas: 'SEDANG', kolom: 'DONE', pic: 'mikat1', deadline: -12 },
  ],
  INT: [
    { judul: 'Uji sistem tata suara aula', deskripsi: 'Uji bersama operator sebelum acara berikutnya di aula.', prioritas: 'TINGGI', kolom: 'REVIEW', pic: 'int3', deadline: 4, checklist: [['Cek mikrofon nirkabel', true], ['Cek mixer dan speaker', true], ['Uji bersama penampil', false]], simpanTemplate: 'Gladi tata suara' },
    { judul: 'Penyusunan LPJ Dies Natalis', deskripsi: 'LPJ lengkap dengan nota dan dokumentasi.', prioritas: 'TINGGI', kolom: 'DONE', pic: 'int2', deadline: -8, proker: 'dies' },
    { judul: 'Inventarisasi aset sekretariat', deskripsi: 'Pendataan ulang inventaris himpunan semester ini.', prioritas: 'SEDANG', kolom: 'IN_PROGRESS', pic: 'int1', deadline: 9 },
    { judul: 'Menyusun jadwal piket sekretariat', deskripsi: 'Jadwal piket bulanan pengurus.', prioritas: 'RENDAH', kolom: 'TODO', pic: 'int1', deadline: 3 },
  ],
  EKS: [
    { judul: 'Mengonfirmasi pembicara sesi 2 SYNCHRONIZE', deskripsi: 'Pembicara belum menjawab undangan resmi; hubungi via perwakilan.', prioritas: 'KRITIS', kolom: 'IN_PROGRESS', pic: 'eks2', deadline: 2, proker: 'sync', checklist: [['Kirim pengingat via email', true], ['Telepon sekretariat pembicara', false], ['Siapkan pembicara cadangan', false]] },
    { judul: 'Mengirim undangan ke SMA/SMK mitra', deskripsi: 'Dua belas sekolah mitra di Cilegon, Serang, dan Pandeglang.', prioritas: 'SEDANG', kolom: 'TODO', pic: 'eks3', deadline: 3, proker: 'sync' },
    { judul: 'Negosiasi sponsor utama', deskripsi: 'Presentasi proposal kepada dua calon sponsor utama.', prioritas: 'TINGGI', kolom: 'REVIEW', pic: 'eks1', deadline: 5, proker: 'sync' },
    { judul: 'Surat kunjungan industri', deskripsi: 'Permohonan kunjungan ke dua perusahaan di Jakarta.', prioritas: 'SEDANG', kolom: 'IN_PROGRESS', pic: 'eks2', deadline: 25, proker: 'visit' },
    { judul: 'Rekap kerja sama tahun lalu', deskripsi: 'Daftar mitra dan status kerja sama sebagai bahan negosiasi.', prioritas: 'RENDAH', kolom: 'DONE', deadline: -15 },
  ],
  KOMINFO: [
    { judul: 'Video rekap Dies Natalis ke-12', deskripsi: 'Video 3 menit berisi cuplikan acara dan testimoni.', prioritas: 'TINGGI', kolom: 'IN_PROGRESS', pic: 'kominfo2', deadline: 2, checklist: [['Seleksi footage', true], ['Pengeditan kasar', true], ['Musik dan teks', false], ['Persetujuan Ketua', false]] },
    { judul: 'Infografis jadwal SYNCHRONIZE', deskripsi: 'Infografis rundown dan profil pembicara.', prioritas: 'SEDANG', kolom: 'REVIEW', pic: 'kominfo3', deadline: 1 },
    { judul: 'Rebranding akun media sosial', deskripsi: 'Penyeragaman foto profil, bio, dan highlight.', prioritas: 'SEDANG', kolom: 'DONE', pic: 'kominfo1', deadline: -7 },
    { judul: 'Teaser SYNCHRONIZE minggu ke-2', deskripsi: 'Tiga konten teaser pembicara.', prioritas: 'TINGGI', kolom: 'TODO', pic: 'kominfo1', deadline: 4 },
  ],
  RND: [
    { judul: 'Prototipe sistem pendaftaran peserta SYNCHRONIZE', deskripsi: 'Formulir daring dengan unduh tiket dan verifikasi QR.', prioritas: 'TINGGI', kolom: 'IN_PROGRESS', pic: 'rnd1', deadline: 6, checklist: [['Skema database', true], ['Halaman pendaftaran', true], ['Tiket QR', false], ['Uji coba', false]] },
    { judul: 'Riset tren AI untuk materi pelatihan', deskripsi: 'Ringkasan tren sebagai bahan Departemen Kaderisasi.', prioritas: 'SEDANG', kolom: 'TODO', pic: 'rnd2', deadline: 18 },
    { judul: 'Dokumentasi API internal', deskripsi: 'Dokumentasi untuk pengembang periode berikutnya.', prioritas: 'RENDAH', kolom: 'REVIEW', pic: 'rnd3', deadline: 12 },
    { judul: 'Audit keamanan formulir pendaftaran', deskripsi: 'Pemeriksaan validasi dan pembatasan percobaan.', prioritas: 'TINGGI', kolom: 'DONE', pic: 'rnd1', deadline: -6 },
  ],
};

export async function isiKanban(sesi: Map<string, Sesi>, akun: Map<string, InfoAkun>, latar: Latar, proker: Map<string, HasilProker>): Promise<void> {
  const deptProker = new Map(SKENARIO.map((s) => [s.kunci, s.dept]));
  let kartu = 0;
  let item = 0;
  for (const [kodeDept, daftar] of Object.entries(KANBAN)) {
    const kadept = sesi.get(`kadept.${kodeDept.toLowerCase()}`)!;
    const deptId = latar.dept.get(kodeDept)!;
    const perKolom: Record<Kolom, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
    for (const k of daftar) {
      const pic = akun.get(k.pic ?? `kadept.${kodeDept.toLowerCase()}`)!;
      const prokerId = k.proker && deptProker.get(k.proker) === kodeDept ? proker.get(k.proker)?.prokerId : undefined;
      if (k.proker && !prokerId) log(`    [INFO] kartu "${k.judul}": proker ${k.proker} bukan milik ${kodeDept}, tidak ditautkan`);
      const buat = await kadept.wajib(
        'POST',
        '/api/kanban',
        {
          departemen_id: deptId,
          proker_id: prokerId ?? null,
          judul: k.judul,
          deskripsi: k.deskripsi,
          prioritas: k.prioritas,
          assignee_id: pic.id,
          deadline: k.deadline === null ? null : dari(k.deadline),
        },
        `buat kartu "${k.judul}"`,
      );
      const id: string = buat.data.id;
      kartu++;
      if (k.kolom !== 'TODO') {
        await kadept.wajib('PATCH', `/api/kanban/${id}`, { kolom: k.kolom, urutan: perKolom[k.kolom]++ }, `geser kartu "${k.judul}"`);
      } else {
        perKolom.TODO++;
      }
      for (const [teks, selesai] of k.checklist ?? []) {
        const c = await kadept.wajib('POST', `/api/kanban/${id}/checklist`, { teks, assignee_id: pic.id }, `checklist "${teks}"`);
        if (selesai) {
          const cid: string = c.data.id ?? c.data.item?.id;
          await kadept.wajib('PATCH', `/api/kanban/${id}/checklist/${cid}`, { selesai: true }, `centang "${teks}"`);
        }
        item++;
      }
      if (k.simpanTemplate) {
        await kadept.wajib('POST', `/api/kanban/${id}/checklist/template`, { nama: k.simpanTemplate }, `simpan template "${k.simpanTemplate}"`);
      }
    }
  }
  ok(`${kartu} kartu Kanban di 6 departemen · ${item} butir checklist · 2 template checklist`);
}

// ---- Kanban tingkat divisi (ruang kerja panitia) -----------------------------

type KartuDivisi = [judul: string, pic: string, kolom: Kolom, prioritas: Prioritas, hari: number];

const KANBAN_DIVISI: Record<string, Record<string, KartuDivisi[]>> = {
  sync: {
    Acara: [
      ['Finalisasi rundown dan naskah MC', 'eks2', 'IN_PROGRESS', 'TINGGI', 5],
      ['Konfirmasi susunan pembicara', 'eks2', 'IN_PROGRESS', 'KRITIS', 2],
      ['Gladi bersih seminar', 'mikat2', 'TODO', 'SEDANG', 11],
      ['Menyiapkan doorprize peserta', 'kad1', 'TODO', 'RENDAH', 9],
      ['Menyusun daftar tamu undangan', 'mikat2', 'DONE', 'SEDANG', -3],
    ],
    Konsumsi: [
      ['Memesan snack box 200 kotak', 'int1', 'TODO', 'TINGGI', 9],
      ['Survei katering makan siang', 'int3', 'DONE', 'SEDANG', -4],
      ['Menyusun daftar kebutuhan konsumsi', 'int1', 'DONE', 'SEDANG', -6],
    ],
    Perlengkapan: [
      ['Cek proyektor dan sound system aula', 'rnd1', 'IN_PROGRESS', 'TINGGI', 4],
      ['Mencetak ID card panitia dan peserta', 'rnd2', 'TODO', 'SEDANG', 8],
      ['Memasang banner dan backdrop', 'mikat3', 'REVIEW', 'SEDANG', 6],
    ],
    PDD: [
      ['Poster utama SYNCHRONIZE', 'kominfo2', 'DONE', 'TINGGI', -9],
      ['Video teaser pembicara', 'kominfo3', 'IN_PROGRESS', 'TINGGI', 2],
      ['Rencana dokumentasi hari-H', 'rnd3', 'TODO', 'SEDANG', 10],
    ],
    Humas: [
      ['Presentasi ke sponsor utama', 'eks3', 'IN_PROGRESS', 'TINGGI', 3],
      ['Mengirim undangan ke sekolah mitra', 'kominfo1', 'TODO', 'SEDANG', 3],
      ['Rekap sponsor yang masuk', 'int2', 'REVIEW', 'SEDANG', 7],
    ],
  },
  dies: {
    Acara: [
      ['Rundown final malam puncak', 'int3', 'DONE', 'TINGGI', -22],
      ['Gladi bersih di aula', 'int3', 'DONE', 'TINGGI', -18],
      ['Mengatur urutan penampil', 'mikat2', 'DONE', 'SEDANG', -20],
    ],
    Konsumsi: [
      ['Memesan prasmanan 120 porsi', 'kad3', 'DONE', 'TINGGI', -21],
      ['Menyiapkan kue ulang tahun', 'int2', 'DONE', 'SEDANG', -19],
    ],
    Dokumentasi: [
      ['Dokumentasi foto dan video hari-H', 'kominfo2', 'DONE', 'TINGGI', -16],
      ['Menyerahkan hasil dokumentasi', 'kominfo3', 'DONE', 'SEDANG', -13],
    ],
  },
  lkmm: {
    Acara: [
      ['Menyusun materi sesi kepemimpinan', 'kad1', 'IN_PROGRESS', 'TINGGI', 12],
      ['Merancang skenario simulasi kepanitiaan', 'kad1', 'TODO', 'SEDANG', 20],
    ],
    Konsumsi: [['Survei katering untuk 80 peserta', 'int3', 'TODO', 'SEDANG', 18]],
    Perlengkapan: [['Inventaris perlengkapan outbound', 'rnd2', 'TODO', 'SEDANG', 25]],
    'Humas & Dokumentasi': [['Poster dan pendaftaran LKMM-PD', 'kominfo1', 'IN_PROGRESS', 'TINGGI', 6]],
  },
};

export async function isiKanbanDivisi(sql: Sql, akun: Map<string, InfoAkun>, latar: Latar, proker: Map<string, HasilProker>): Promise<void> {
  let total = 0;
  for (const [kunci, perDivisi] of Object.entries(KANBAN_DIVISI)) {
    const kid = proker.get(kunci)?.kepanitiaanId;
    if (!kid) continue;
    for (const [namaDivisi, kartu] of Object.entries(perDivisi)) {
      const [d] = await sql<{ id: string; koordinator_id: string }[]>`
        SELECT id::text, koordinator_id::text FROM divisi WHERE kepanitiaan_id = ${kid}::uuid AND nama = ${namaDivisi} LIMIT 1`;
      if (!d) throw new Error(`Divisi "${namaDivisi}" tidak ada di acara ${kunci}.`);
      const perKolom: Record<Kolom, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
      await sebagai(sql, d.koordinator_id, latar.periodeId, async (tx) => {
        for (const [judul, pic, kolom, prioritas, hari] of kartu) {
          await tx`
            INSERT INTO kanban_card (divisi_id, judul, kolom, prioritas, assignee_id, deadline, urutan, created_by)
            VALUES (${d.id}::uuid, ${judul}, ${kolom}::kanban_kolom, ${prioritas}::prioritas, ${akun.get(pic)!.id}::uuid,
                    ${dari(hari)}::date, ${perKolom[kolom]++}, ${d.koordinator_id}::uuid)`;
          total++;
        }
      });
    }
  }
  ok(`${total} kartu Kanban tingkat divisi (progres tampil di halaman acara & ruang kerja divisi)`);
}

// ---- Kendala -----------------------------------------------------------------

interface Balasan {
  oleh: string;
  isi: string;
  sebut?: string;
  /** indeks balasan induk (0-based dalam daftar kendala ini) */
  induk?: number;
}

interface SpesifikasiKendala {
  dept: string;
  pelapor: string;
  judul: string;
  deskripsi: string;
  prioritas: Prioritas;
  pic: string;
  proker?: string;
  status: 'TERBUKA' | 'SEDANG_DITANGANI' | 'SELESAI';
  catatan?: string;
  balasan: Balasan[];
}

const KENDALA: SpesifikasiKendala[] = [
  {
    dept: 'EKS',
    pelapor: 'eks3',
    judul: 'Pembicara sesi 2 SYNCHRONIZE belum konfirmasi',
    deskripsi: 'Undangan resmi telah dikirim 10 hari lalu, tetapi belum ada jawaban. Rundown hari 1 sesi siang bergantung pada pembicara ini.',
    prioritas: 'KRITIS',
    pic: 'kadept.eks',
    proker: 'sync',
    status: 'TERBUKA',
    balasan: [
      { oleh: 'kadept.eks', isi: 'Sudah saya telepon sekretariat beliau, katanya jadwal sedang dicek. Mohon tunggu sampai besok.' },
      { oleh: 'eks3', isi: 'Siap Kak. Saya siapkan pembicara cadangan dari alumni sebagai opsi.', induk: 0 },
      { oleh: 'ketua', isi: 'Kalau sampai lusa belum ada kepastian, langsung pakai pembicara cadangan. Kabari saya.', sebut: 'kadept.eks' },
    ],
  },
  {
    dept: 'EKS',
    pelapor: 'eks1',
    judul: 'Sponsor utama belum merespons proposal',
    deskripsi: 'Proposal sponsorship dikirim ke PT Krakatau Digital Solusi 12 hari lalu. Belum ada balasan dan target dana sponsor baru terpenuhi 60%.',
    prioritas: 'TINGGI',
    pic: 'kadept.eks',
    proker: 'sync',
    status: 'SEDANG_DITANGANI',
    balasan: [
      { oleh: 'kadept.eks', isi: 'Presentasi langsung dijadwalkan Kamis depan pukul 10.00 di kantor mereka.' },
      { oleh: 'wakil', isi: 'Mohon kabari nominal yang dimohon supaya bisa disesuaikan dengan RAB.', induk: 0 },
    ],
  },
  {
    dept: 'INT',
    pelapor: 'int3',
    judul: 'Mikrofon nirkabel aula bermasalah saat gladi',
    deskripsi: 'Dua mikrofon nirkabel putus-putus saat gladi bersih Dies Natalis. Operator aula menyebut baterai penerima lemah.',
    prioritas: 'TINGGI',
    pic: 'kadept.int',
    proker: 'dies',
    status: 'SELESAI',
    catatan: 'Baterai penerima diganti oleh operator aula dan dilakukan uji ulang 30 menit sebelum acara. Mikrofon cadangan disiapkan dan tidak terpakai.',
    balasan: [
      { oleh: 'kadept.int', isi: 'Saya sudah hubungi operator aula, penggantian baterai dilakukan sore ini.' },
      { oleh: 'int3', isi: 'Sudah diuji ulang, suara stabil. Terima kasih Kak.', induk: 0 },
    ],
  },
  {
    dept: 'KAD',
    pelapor: 'kad1',
    judul: 'Kuota peserta LKMM-PD melebihi kapasitas aula',
    deskripsi: 'Pendaftar awal sudah 95 orang sedangkan kapasitas aula untuk format kelompok kecil sekitar 80.',
    prioritas: 'TINGGI',
    pic: 'kadept.kad',
    proker: 'lkmm',
    status: 'TERBUKA',
    balasan: [
      { oleh: 'kadept.kad', isi: 'Opsi: batasi 80 peserta atau pakai dua ruang. Saya bahas di rapat BPH.' },
      { oleh: 'wakil', isi: 'Ruang Seminar Lt. 3 masih kosong pada tanggal itu, Sekum bisa mengajukannya.', sebut: 'kadept.kad', induk: 0 },
    ],
  },
  {
    dept: 'KOMINFO',
    pelapor: 'kominfo2',
    judul: 'Akses akun media sosial HMIF masih di admin lama',
    deskripsi: 'Dua akun media sosial utama masih menggunakan email admin periode sebelumnya sehingga tidak bisa diganti sandi atau pemulihan.',
    prioritas: 'SEDANG',
    pic: 'kadept.kominfo',
    status: 'SEDANG_DITANGANI',
    balasan: [{ oleh: 'kadept.kominfo', isi: 'Sudah menghubungi ketua periode lalu untuk serah terima akses. Proses pemulihan dimulai.' }],
  },
  {
    dept: 'MIKAT',
    pelapor: 'mikat2',
    judul: 'Jadwal babak final Informatics Cup berbenturan dengan UTS',
    deskripsi: 'Jadwal final yang direncanakan berada di pekan UTS beberapa angkatan sehingga berpotensi mengurangi jumlah peserta.',
    prioritas: 'KRITIS',
    pic: 'kadept.mikat',
    proker: 'cup',
    status: 'SEDANG_DITANGANI',
    balasan: [
      { oleh: 'kadept.mikat', isi: 'Opsi: mundur sepekan atau final dilaksanakan Sabtu. Menunggu konfirmasi jadwal UTS dari prodi.' },
      { oleh: 'wakil', isi: 'Saya tanyakan ke bagian akademik hari ini.', induk: 0 },
    ],
  },
  {
    dept: 'RND',
    pelapor: 'rnd2',
    judul: 'Halaman alumni pada website HMIF belum tersedia',
    deskripsi: 'Alumni meminta halaman daftar dan kontak untuk keperluan temu alumni dan jejaring kerja.',
    prioritas: 'RENDAH',
    pic: 'kadept.rnd',
    status: 'TERBUKA',
    balasan: [],
  },
  {
    dept: 'INT',
    pelapor: 'int2',
    judul: 'Sertifikat penghargaan Dies Natalis terlambat dicetak',
    deskripsi: 'Percetakan terlambat dua hari dari jadwal sehingga hampir tidak sempat diserahkan pada malam puncak.',
    prioritas: 'SEDANG',
    pic: 'kadept.int',
    proker: 'dies',
    status: 'SELESAI',
    catatan: 'Sertifikat selesai dicetak H-1 pada percetakan alternatif dan diserahkan tepat waktu. Pesanan berikutnya dipesan minimal tujuh hari sebelum acara.',
    balasan: [{ oleh: 'kadept.int', isi: 'Pindah ke percetakan alternatif, selesai besok pagi.' }],
  },
];

export async function isiKendala(sesi: Map<string, Sesi>, akun: Map<string, InfoAkun>, latar: Latar, proker: Map<string, HasilProker>): Promise<void> {
  const hitung = { TERBUKA: 0, SEDANG_DITANGANI: 0, SELESAI: 0 };
  let balasan = 0;
  for (const k of KENDALA) {
    const pelapor = sesi.get(k.pelapor)!;
    const pic = akun.get(k.pic)!;
    const prokerId = k.proker ? proker.get(k.proker)?.prokerId : undefined;
    const buat = await pelapor.wajib(
      'POST',
      '/api/kendala',
      { departemen_id: latar.dept.get(k.dept)!, judul: k.judul, deskripsi: k.deskripsi, prioritas: k.prioritas, assignee_id: pic.id, proker_id: prokerId ?? null },
      `lapor kendala "${k.judul}"`,
    );
    const id: string = buat.data.id;
    const idBalasan: string[] = [];
    for (const b of k.balasan) {
      const konten = b.sebut ? `${tokenMention(akun.get(b.sebut)!.orang.nama, akun.get(b.sebut)!.id)} ${b.isi}` : b.isi;
      const r = await sesi.get(b.oleh)!.wajib(
        'POST',
        `/api/kendala/${id}/reply`,
        { konten, parent_id: b.induk !== undefined ? idBalasan[b.induk]! : null },
        `balas kendala "${k.judul}"`,
      );
      idBalasan.push(r.data.id);
      balasan++;
    }
    if (k.status !== 'TERBUKA') {
      const kadept = sesi.get(k.pic)!;
      await kadept.wajib('PATCH', `/api/kendala/${id}`, { status: k.status, ...(k.catatan ? { catatan_penyelesaian: k.catatan } : {}) }, `ubah status kendala "${k.judul}"`);
    }
    hitung[k.status]++;
  }
  ok(`${KENDALA.length} kendala (${hitung.TERBUKA} terbuka · ${hitung.SEDANG_DITANGANI} ditangani · ${hitung.SELESAI} selesai) · ${balasan} balasan berulir dengan @mention`);
}

// ---- Ruangan & peminjaman ----------------------------------------------------

const RUANGAN = [
  { nama: 'Aula Fakultas Teknik', lokasi: 'Gedung A Lantai 1, Kampus Cilegon', kapasitas: 300, pengelola: 'Bagian Sekretariat FT UNTIRTA', catatan: 'Ruang utama untuk seminar dan acara besar.' },
  { nama: 'Ruang Seminar Lantai 3', lokasi: 'Gedung B Lantai 3', kapasitas: 80, pengelola: 'Bagian Sekretariat FT UNTIRTA', catatan: 'Dilengkapi proyektor dan pendingin ruangan.' },
  { nama: 'Laboratorium Komputer 1', lokasi: 'Gedung C Lantai 2', kapasitas: 40, pengelola: 'Laboratorium Informatika', catatan: 'Hanya untuk pelatihan dan lomba; izin kepala lab.' },
  { nama: 'Laboratorium Jaringan', lokasi: 'Gedung C Lantai 2', kapasitas: 36, pengelola: 'Laboratorium Informatika', catatan: 'Tersedia perangkat jaringan untuk praktik.' },
  { nama: 'Sekretariat HMIF', lokasi: 'Gedung B Lantai 1', kapasitas: 20, pengelola: 'HMIF', catatan: 'Ruang rapat internal himpunan dan penyimpanan arsip.' },
];

interface Booking {
  ruangan: string;
  kegiatan: string;
  hari: number;
  mulai: string;
  selesai: string | null;
  peserta: number;
  keperluan: string;
  oleh: string;
  /** buat surat peminjaman dari booking ini */
  surat?: boolean;
  bentrok?: boolean;
}

const BOOKING: Booking[] = [
  { ruangan: 'Aula Fakultas Teknik', kegiatan: 'Dies Natalis HMIF ke-12 — Malam Puncak', hari: -17, mulai: '16:00', selesai: '22:30', peserta: 120, keperluan: 'Gladi bersih dan acara malam puncak', oleh: 'sekum' },
  { ruangan: 'Aula Fakultas Teknik', kegiatan: 'SYNCHRONIZE 2026 — Hari 1 Seminar', hari: 12, mulai: '07:00', selesai: '16:30', peserta: 200, keperluan: 'Seminar nasional dan registrasi', oleh: 'sekum', surat: true },
  { ruangan: 'Aula Fakultas Teknik', kegiatan: 'LKMM-PD 2026 — Hari 1', hari: 41, mulai: '07:30', selesai: '17:30', peserta: 80, keperluan: 'Materi pelatihan kepemimpinan', oleh: 'kadept.kad' },
  { ruangan: 'Aula Fakultas Teknik', kegiatan: 'LKMM-PD 2026 — Hari 2', hari: 42, mulai: '07:30', selesai: '16:30', peserta: 80, keperluan: 'Simulasi kepanitiaan', oleh: 'kadept.kad' },
  { ruangan: 'Ruang Seminar Lantai 3', kegiatan: 'Rapat Panitia SYNCHRONIZE 2026', hari: -1, mulai: '15:00', selesai: '17:30', peserta: 17, keperluan: 'Rapat koordinasi H-12', oleh: 'sekum' },
  { ruangan: 'Ruang Seminar Lantai 3', kegiatan: 'Workshop UI/UX untuk pemula', hari: 25, mulai: '09:00', selesai: '15:00', peserta: 60, keperluan: 'Workshop Departemen Minat dan Bakat', oleh: 'kadept.mikat' },
  { ruangan: 'Laboratorium Komputer 1', kegiatan: 'Babak penyisihan Informatics Cup', hari: 28, mulai: '08:00', selesai: '12:00', peserta: 40, keperluan: 'Penyisihan lomba pemrograman luring', oleh: 'kadept.mikat' },
  { ruangan: 'Laboratorium Jaringan', kegiatan: 'Pelatihan dasar jaringan komputer', hari: 18, mulai: '13:00', selesai: '16:00', peserta: 30, keperluan: 'Pelatihan Departemen Riset dan Development', oleh: 'kadept.rnd' },
  { ruangan: 'Sekretariat HMIF', kegiatan: 'Rapat Koordinasi BPH Mingguan', hari: 3, mulai: '19:00', selesai: '21:00', peserta: 11, keperluan: 'Rapat BPH dan Kadept', oleh: 'sekum' },
  { ruangan: 'Aula Fakultas Teknik', kegiatan: 'Seminar Prodi — Pengenalan Kurikulum Baru', hari: 12, mulai: '13:00', selesai: '15:00', peserta: 150, keperluan: 'Kegiatan program studi pada hari yang sama', oleh: 'kadept.int', bentrok: true },
];

export async function isiRuangan(sql: Sql, sesi: Map<string, Sesi>): Promise<void> {
  const sekum = sesi.get('sekum')!;
  const idRuangan = new Map<string, string>();
  for (const r of RUANGAN) {
    const x = await sekum.wajib('POST', '/api/ruangan', { ...r, catatan: `${r.catatan}${PENANDA}` }, `buat ruangan ${r.nama}`);
    idRuangan.set(r.nama, x.data.id);
  }
  let surat = 0;
  let bentrok = 0;
  for (const b of BOOKING) {
    const pembuat = sesi.get(b.oleh)!;
    const body = {
      ruangan_id: idRuangan.get(b.ruangan)!,
      kegiatan: b.kegiatan,
      tanggal: dari(b.hari),
      waktu_mulai: b.mulai,
      waktu_selesai: b.selesai,
      jumlah_peserta: b.peserta,
      keperluan: b.keperluan,
      ...(b.bentrok ? { lanjutkan_meski_bentrok: true } : {}),
    };
    const r = await pembuat.wajib('POST', '/api/ruangan/booking', body, `booking ${b.kegiatan}`);
    if (b.bentrok) bentrok++;
    if (b.surat) {
      await pembuat.wajib('POST', `/api/ruangan/booking/${r.data.id}/surat`, {}, `surat booking ${b.kegiatan}`);
      surat++;
    }
  }
  void sql;
  ok(`${RUANGAN.length} ruangan · ${BOOKING.length} peminjaman (${bentrok} bentrok ditandai) · ${surat} draf surat dari booking`);
}

// ---- Backup & cron -----------------------------------------------------------

export async function jalankanBackup(sesi: Map<string, Sesi>): Promise<void> {
  const admin = sesi.get('admin')!;
  const mulai = await admin.panggil('POST', '/api/backup', {});
  if (!mulai.ok) {
    peringatan(`Backup manual dilewati: HTTP ${mulai.status} ${mulai.badan?.error?.message ?? ''}`);
    return;
  }
  const id: string = mulai.data.id;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const d = await admin.panggil('GET', '/api/backup');
    const daftar: Array<{ id: string; status: string; ukuran?: number | string | null }> = d.data?.backup ?? d.data?.daftar ?? (Array.isArray(d.data) ? d.data : []);
    const b = daftar.find((x) => x.id === id);
    if (b && b.status !== 'BERJALAN') {
      ok(`Backup manual ${b.status}${b.ukuran ? ` (${Math.round(Number(b.ukuran) / 1024)} KB)` : ''}`);
      return;
    }
  }
  peringatan('Backup belum selesai setelah 3 menit — periksa Pengaturan → Backup.');
}

export async function jalankanCron(baseUrl: string, secret: string | undefined): Promise<void> {
  if (!secret) {
    peringatan('CRON_SECRET kosong — cron harian tidak dijalankan.');
    return;
  }
  // Siklus status proker maju satu tahap per panggilan (DISETUJUI → BERJALAN → SELESAI);
  // ulangi sampai tidak ada perubahan supaya acara yang sudah lewat langsung SELESAI.
  let terakhir: Record<string, unknown> = {};
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${baseUrl}/api/cron/harian`, { headers: { Authorization: `Bearer ${secret}` } });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; data?: { lepas?: { jadi_selesai?: number; jadi_berjalan?: number } } & Record<string, unknown> } | null;
    if (!r.ok || !j?.ok) {
      peringatan(`Cron harian gagal: HTTP ${r.status}`);
      return;
    }
    terakhir = j.data ?? {};
    const lepas = j.data?.lepas;
    if (!lepas?.jadi_selesai && !lepas?.jadi_berjalan) break;
  }
  ok(`Cron harian dijalankan — status proker mengikuti tanggal (batas deadline: ${JSON.stringify(terakhir.deadline)})`);
}
