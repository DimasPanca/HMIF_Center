/**
 * Notulensi demo: rapat tingkat Himpunan dan Departemen dengan daftar hadir,
 * keputusan, dan action item. Sebagian action item dikonversi menjadi kartu
 * Kanban lewat API yang sama dengan tombol "Jadikan kartu"; dua notulensi
 * diekspor ke DOCX.
 */

import { doc, h, ol, p, ul, type Node } from './acara';
import type { InfoAkun, Latar } from './akun';
import type { Sesi } from './klien';
import { dari, ok } from './konfig';
import { ROSTER } from './roster';

type Kehadiran = 'HADIR' | 'IZIN' | 'SAKIT' | 'ALFA';

interface ItemAksi {
  tugas: string;
  pic: string;
  deadline: number;
  /** departemen tujuan untuk rapat tingkat Himpunan */
  dept?: string;
  konversi?: boolean;
}

interface SpesifikasiNotulensi {
  pembuat: string;
  judul: string;
  hari: number;
  mulai: string;
  selesai: string;
  tempat: string;
  pemimpin: string;
  notulis: string;
  dept: string | null;
  konten: Node;
  keputusan: string[];
  /** kunci peserta (null = seluruh pengurus berakun) + pengecualian status */
  peserta: string[] | null;
  tidakHadir?: Record<string, Kehadiran>;
  aksi: ItemAksi[];
  docx?: boolean;
}

const KADEPT = ['kadept.kad', 'kadept.mikat', 'kadept.int', 'kadept.eks', 'kadept.kominfo', 'kadept.rnd'];
const BPH = ['ketua', 'wakil', 'sekum', 'bendum', 'bph'];

const DAFTAR: SpesifikasiNotulensi[] = [
  {
    pembuat: 'sekum',
    judul: 'Rapat Pleno Pengurus — Evaluasi Awal Periode',
    hari: -21,
    mulai: '19:00',
    selesai: '21:15',
    tempat: 'Ruang Rapat Himpunan, Gedung Fakultas Teknik',
    pemimpin: 'ketua',
    notulis: 'sekum',
    dept: null,
    konten: doc(
      h(2, 'Pembukaan'),
      p('Rapat dibuka pukul 19.00 WIB oleh Ketua HMIF dengan membahas capaian dua bulan pertama kepengurusan.'),
      h(2, 'Pokok bahasan'),
      ol('Laporan kegiatan tiap departemen', 'Kesiapan Dies Natalis HMIF ke-12', 'Rencana SYNCHRONIZE 2026 dan LKMM-PD', 'Pengelolaan kas himpunan'),
      h(2, 'Catatan diskusi'),
      p('Departemen Internal melaporkan persiapan Dies Natalis berjalan 80%. Departemen Eksternal memaparkan daftar sponsor potensial untuk SYNCHRONIZE. Bendahara Umum mengingatkan seluruh panitia untuk mengumpulkan nota maksimal tiga hari setelah belanja.'),
    ),
    keputusan: [
      'Dies Natalis HMIF ke-12 dilaksanakan satu malam di aula fakultas.',
      'SYNCHRONIZE 2026 dilaksanakan dua hari dengan target 200 peserta.',
      'Nota belanja wajib diunggah paling lambat tiga hari setelah transaksi.',
    ],
    peserta: null,
    tidakHadir: { rnd3: 'IZIN', mikat3: 'SAKIT', eks3: 'ALFA' },
    aksi: [
      { tugas: 'Menyusun daftar sponsor dan jadwal penjajakan SYNCHRONIZE', pic: 'kadept.eks', deadline: -14, dept: 'EKS', konversi: true },
      { tugas: 'Menyiapkan format laporan kegiatan bulanan seluruh departemen', pic: 'sekum', deadline: -10 },
    ],
  },
  {
    pembuat: 'ketua',
    judul: 'Rapat Evaluasi Dies Natalis HMIF ke-12',
    hari: -10,
    mulai: '16:00',
    selesai: '17:30',
    tempat: 'Ruang Rapat Himpunan, Gedung Fakultas Teknik',
    pemimpin: 'ketua',
    notulis: 'kominfo3',
    dept: null,
    konten: doc(
      h(2, 'Ringkasan'),
      p('Panitia memaparkan pelaksanaan Dies Natalis ke-12 yang dihadiri 118 tamu. Acara berjalan sesuai rundown; kendala utama ada pada tata suara dan jumlah porsi konsumsi.'),
      h(2, 'Yang berjalan baik'),
      ul('Rundown tepat waktu', 'Dokumentasi lengkap', 'Penggunaan anggaran sesuai RAB'),
      h(2, 'Perlu diperbaiki'),
      ul('Uji tata suara bersama penampil', 'Cadangan porsi konsumsi sepuluh persen', 'Pendataan tamu undangan lebih awal'),
    ),
    keputusan: [
      'LPJ Dies Natalis diselesaikan paling lambat dua minggu setelah acara.',
      'Catatan perbaikan dijadikan acuan checklist panitia acara berikutnya.',
    ],
    peserta: [...BPH, ...KADEPT, 'int1', 'int2', 'int3', 'kad1', 'kominfo2', 'kominfo3'],
    tidakHadir: { bph: 'IZIN' },
    aksi: [
      { tugas: 'Menyusun checklist uji tata suara dan gladi bersih', pic: 'int3', deadline: -3, dept: 'INT', konversi: true },
      { tugas: 'Menyerahkan seluruh dokumentasi ke Departemen Kominfo', pic: 'kominfo2', deadline: -5 },
    ],
    docx: true,
  },
  {
    pembuat: 'sekum',
    judul: 'Rapat Koordinasi BPH Mingguan',
    hari: -7,
    mulai: '20:00',
    selesai: '21:00',
    tempat: 'Daring — Google Meet',
    pemimpin: 'ketua',
    notulis: 'sekum',
    dept: null,
    konten: doc(
      h(2, 'Agenda'),
      ol('Progres persiapan SYNCHRONIZE', 'Penjadwalan LKMM-PD', 'Perizinan ruangan'),
      h(2, 'Catatan'),
      p('Ketua Pelaksana SYNCHRONIZE melaporkan pembicara sesi 1 telah konfirmasi, sesi 2 menunggu jawaban. Departemen Kaderisasi mengusulkan LKMM-PD dilaksanakan akhir November agar tidak bentrok dengan UTS.'),
    ),
    keputusan: ['LKMM-PD dijadwalkan dua hari pada akhir November.', 'Sekretaris mengurus peminjaman aula untuk SYNCHRONIZE dan LKMM-PD.'],
    peserta: [...BPH, ...KADEPT],
    aksi: [
      { tugas: 'Mengurus peminjaman aula fakultas untuk SYNCHRONIZE dan LKMM-PD', pic: 'sekum', deadline: 3 },
      { tugas: 'Memastikan konfirmasi pembicara sesi 2 SYNCHRONIZE', pic: 'kadept.eks', deadline: 2, dept: 'EKS', konversi: true },
      { tugas: 'Menyusun modul LKMM-PD versi final', pic: 'kadept.kad', deadline: 14, dept: 'KAD', konversi: true },
    ],
    docx: true,
  },
  {
    pembuat: 'sekum',
    judul: 'Rapat Panitia SYNCHRONIZE 2026 — H-12',
    hari: -1,
    mulai: '15:30',
    selesai: '17:00',
    tempat: 'Ruang Seminar Lt. 3',
    pemimpin: 'eks1',
    notulis: 'kominfo1',
    dept: null,
    konten: doc(
      h(2, 'Laporan divisi'),
      ul('Acara: rundown final menunggu konfirmasi pembicara sesi 2', 'Konsumsi: menu telah disepakati, pemesanan H-3', 'Perlengkapan: proyektor dan tata suara aman', 'PDD: poster dan teaser telah tayang', 'Humas: dua sponsor menyatakan minat'),
      h(2, 'Catatan'),
      p('Pendaftaran peserta telah mencapai 75% kuota. Humas menargetkan satu sponsor tambahan sebelum H-7.'),
    ),
    keputusan: ['Kuota pendaftaran tetap 200 peserta.', 'Gladi bersih dilaksanakan H-1 pukul 15.00.'],
    peserta: ['eks1', 'mikat1', 'kominfo1', 'int2', 'eks2', 'mikat2', 'kad1', 'int1', 'int3', 'kad2', 'rnd1', 'rnd2', 'mikat3', 'eks3', 'kominfo2', 'kominfo3', 'rnd3'],
    tidakHadir: { rnd3: 'IZIN', mikat3: 'SAKIT' },
    aksi: [
      { tugas: 'Mengirim ulang undangan ke SMA/SMK mitra', pic: 'eks3', deadline: 3, dept: 'EKS', konversi: true },
      { tugas: 'Mencetak ID card panitia dan peserta', pic: 'rnd1', deadline: 8, dept: 'RND', konversi: true },
      { tugas: 'Menyusun naskah MC dan susunan pembawa acara', pic: 'eks2', deadline: 7 },
    ],
  },
  {
    pembuat: 'kadept.kad',
    judul: 'Rapat Departemen Kaderisasi — Persiapan LKMM-PD',
    hari: -3,
    mulai: '18:30',
    selesai: '19:45',
    tempat: 'Sekretariat HMIF',
    pemimpin: 'kadept.kad',
    notulis: 'kad3',
    dept: 'KAD',
    konten: doc(
      h(2, 'Pembahasan'),
      p('Departemen menyusun garis besar materi LKMM-PD dan membagi tugas penyusunan modul antaranggota.'),
      ul('Materi 1: Kepemimpinan dan organisasi', 'Materi 2: Manajemen waktu dan komunikasi', 'Simulasi kepanitiaan'),
    ),
    keputusan: ['Modul disusun dalam tiga bagian dan ditinjau Kadept sebelum dicetak.', 'Pemateri eksternal dihubungi melalui Departemen Eksternal.'],
    peserta: ['kadept.kad', 'kad1', 'kad2', 'kad3'],
    aksi: [
      { tugas: 'Menyusun modul materi kepemimpinan dan organisasi', pic: 'kad1', deadline: 10, konversi: true },
      { tugas: 'Menyusun modul manajemen waktu dan komunikasi', pic: 'kad2', deadline: 12, konversi: true },
      { tugas: 'Merancang skenario simulasi kepanitiaan', pic: 'kad3', deadline: 15 },
    ],
  },
  {
    pembuat: 'kadept.kominfo',
    judul: 'Rapat Departemen Kominfo — Kalender Konten Oktober',
    hari: -2,
    mulai: '19:30',
    selesai: '20:30',
    tempat: 'Daring — Discord',
    pemimpin: 'kadept.kominfo',
    notulis: 'kominfo2',
    dept: 'KOMINFO',
    konten: doc(
      h(2, 'Kalender konten'),
      p('Departemen menetapkan tema konten mingguan: teaser SYNCHRONIZE, rekap Dies Natalis, dan profil pengurus.'),
      ul('Senin: infografis', 'Rabu: video pendek', 'Jumat: profil pengurus'),
    ),
    keputusan: ['Teaser SYNCHRONIZE tayang tiga kali seminggu hingga H-1.', 'Rekap Dies Natalis tayang minggu ini.'],
    peserta: ['kadept.kominfo', 'kominfo1', 'kominfo2', 'kominfo3'],
    aksi: [
      { tugas: 'Mengedit video rekap Dies Natalis ke-12', pic: 'kominfo2', deadline: 2, konversi: true },
      { tugas: 'Membuat desain infografis jadwal SYNCHRONIZE', pic: 'kominfo3', deadline: 1, konversi: true },
    ],
  },
];

export interface HasilNotulensi {
  jumlah: number;
  kartu: number;
}

export async function isiNotulensi(sesi: Map<string, Sesi>, akun: Map<string, InfoAkun>, latar: Latar): Promise<HasilNotulensi> {
  const id = (k: string): string => {
    const a = akun.get(k);
    if (!a) throw new Error(`Akun demo "${k}" tidak ada.`);
    return a.id;
  };
  let kartu = 0;
  let docx = 0;

  for (const n of DAFTAR) {
    const pembuat = sesi.get(n.pembuat)!;
    const semua = n.peserta ?? ROSTER.map((r) => r.kunci);
    const kehadiran = semua.map((k) => ({ user_id: id(k), status: (n.tidakHadir?.[k] ?? 'HADIR') as Kehadiran }));
    const body = {
      judul: n.judul,
      tanggal: dari(n.hari),
      waktu_mulai: n.mulai,
      waktu_selesai: n.selesai,
      tempat: n.tempat,
      pemimpin_id: id(n.pemimpin),
      notulis_id: id(n.notulis),
      departemen_id: n.dept ? latar.dept.get(n.dept)! : null,
      konten: n.konten,
      keputusan: n.keputusan,
      kehadiran,
      action_items: n.aksi.map((a) => ({
        tugas: a.tugas,
        pic_id: id(a.pic),
        deadline: dari(a.deadline),
        departemen_id: a.dept ? latar.dept.get(a.dept)! : null,
      })),
    };
    const r = await pembuat.wajib('POST', '/api/notulensi', body, `buat notulensi "${n.judul}"`);
    const notulensiId: string = r.data.id;

    const rinci = await pembuat.wajib('GET', `/api/notulensi/${notulensiId}`, undefined, `muat notulensi "${n.judul}"`);
    const items: Array<{ id: string; tugas: string }> = rinci.data.action_items ?? [];
    for (const a of n.aksi) {
      if (!a.konversi) continue;
      const it = items.find((x) => x.tugas === a.tugas);
      if (!it) throw new Error(`Action item "${a.tugas}" tidak ditemukan pada notulensi.`);
      await pembuat.wajib('POST', `/api/notulensi/${notulensiId}/action-item/${it.id}/convert`, a.dept ? { departemen_id: latar.dept.get(a.dept)! } : {}, `konversi "${a.tugas}"`);
      kartu++;
    }
    if (n.docx) {
      const g = await pembuat.panggil('POST', `/api/notulensi/${notulensiId}/generate`, {});
      if (g.status >= 400) throw new Error(`Generate DOCX notulensi gagal: HTTP ${g.status}`);
      docx++;
    }
  }
  ok(`${DAFTAR.length} notulensi (${DAFTAR.filter((d) => d.dept).length} tingkat departemen) · ${kartu} action item dijadikan kartu Kanban · ${docx} DOCX`);
  return { jumlah: DAFTAR.length, kartu };
}
