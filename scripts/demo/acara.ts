/**
 * Mengisi acara besar (kepanitiaan yang dibentuk otomatis saat approval):
 * job desk per divisi, Gantt divisi & departemen (dengan dependensi), RAB lengkap,
 * pemasukan, data peserta, dan alur status RAB (ajukan → kunci oleh Bendahara).
 */

import { GagalApi, type Sesi } from './klien';
import { dari, langkah, ok, peringatan, rentangPanjang, sebagai, type Sql } from './konfig';
import { SKENARIO, type HasilProker } from './proker';
import type { InfoAkun, Latar } from './akun';

// ---------------------------------------------------------------------------
// Teks kaya (TipTap) — dipakai job desk, TOR, proposal, notulensi
// ---------------------------------------------------------------------------

export type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Array<{ type: string }> };

export const t = (teks: string, tebal = false): Node => ({ type: 'text', text: teks, ...(tebal ? { marks: [{ type: 'bold' }] } : {}) });
export const p = (...isi: Array<string | Node>): Node => ({ type: 'paragraph', content: isi.map((x) => (typeof x === 'string' ? t(x) : x)) });
export const h = (level: 1 | 2 | 3, teks: string): Node => ({ type: 'heading', attrs: { level }, content: [t(teks)] });
export const ul = (...butir: string[]): Node => ({
  type: 'bulletList',
  content: butir.map((b) => ({ type: 'listItem', content: [p(b)] })),
});
export const ol = (...butir: string[]): Node => ({
  type: 'orderedList',
  attrs: { start: 1 },
  content: butir.map((b) => ({ type: 'listItem', content: [p(b)] })),
});
export const doc = (...isi: Node[]): Node => ({ type: 'doc', content: isi });

// ---------------------------------------------------------------------------
// Data per acara
// ---------------------------------------------------------------------------

type BarisRab = [jenis: string, jumlah: number, satuan: string, harga: number, ket?: string];
type RabDivisi = Record<string, Array<{ section: string; items: BarisRab[] }>>;

const RAB: Record<string, RabDivisi> = {
  sync: {
    Acara: [
      {
        section: 'HONOR & AKOMODASI PEMBICARA',
        items: [
          ['Honor pembicara nasional', 3, 'orang', 1_500_000],
          ['Akomodasi pembicara (hotel 1 malam)', 3, 'orang', 400_000],
          ['Honor moderator dan MC', 2, 'orang', 250_000],
          ['Plakat penghargaan pembicara', 3, 'buah', 150_000],
        ],
      },
      { section: 'SESI TANYA JAWAB', items: [['Hadiah doorprize peserta', 10, 'buah', 40_000], ['Sertifikat peserta (cetak)', 200, 'lembar', 2_000]] },
    ],
    Konsumsi: [
      {
        section: 'KONSUMSI PESERTA & PANITIA',
        items: [
          ['Snack box peserta', 200, 'kotak', 10_000],
          ['Makan siang pembicara dan panitia', 60, 'porsi', 20_000],
          ['Air mineral kemasan', 12, 'dus', 45_000],
        ],
      },
    ],
    Perlengkapan: [
      {
        section: 'SEWA PERALATAN',
        items: [
          ['Sewa sound system dan mikrofon', 1, 'paket', 1_000_000],
          ['Sewa LCD proyektor', 2, 'unit', 250_000],
          ['Banner dan backdrop utama', 1, 'paket', 600_000],
        ],
      },
      { section: 'ATRIBUT PANITIA', items: [['ID card dan lanyard', 240, 'set', 4_000], ['Kaos panitia', 40, 'buah', 35_000]] },
    ],
    PDD: [
      {
        section: 'DOKUMENTASI',
        items: [
          ['Jasa fotografer', 1, 'orang', 600_000],
          ['Jasa videografer', 1, 'orang', 600_000],
          ['Live streaming', 1, 'paket', 500_000],
          ['Cetak foto dokumentasi', 30, 'lembar', 5_000],
        ],
      },
    ],
    Humas: [
      {
        section: 'PUBLIKASI & SPONSORSHIP',
        items: [
          ['Iklan media sosial berbayar', 1, 'paket', 450_000],
          ['Cetak poster A3', 40, 'lembar', 7_500],
          ['Cetak flyer', 300, 'lembar', 800],
          ['Cetak proposal sponsorship', 10, 'eksemplar', 15_000],
        ],
      },
    ],
  },
  dies: {
    Acara: [
      {
        section: 'PENGISI ACARA & PENGHARGAAN',
        items: [
          ['Honor pengisi acara musik', 1, 'grup', 1_500_000],
          ['Piala pengurus berprestasi', 6, 'buah', 175_000],
          ['Sertifikat penghargaan', 30, 'lembar', 4_000],
        ],
      },
    ],
    Konsumsi: [
      { section: 'KONSUMSI MALAM PUNCAK', items: [['Prasmanan tamu dan alumni', 120, 'porsi', 45_000], ['Snack dan kue ulang tahun', 1, 'paket', 700_000], ['Air mineral', 8, 'dus', 45_000]] },
    ],
    Dokumentasi: [
      { section: 'DOKUMENTASI & DEKORASI', items: [['Jasa fotografer dan videografer', 1, 'paket', 1_400_000], ['Dekorasi panggung', 1, 'paket', 2_000_000], ['Cetak backdrop', 1, 'buah', 650_000]] },
    ],
  },
  lkmm: {
    Acara: [{ section: 'MATERI & PEMATERI', items: [['Honor pemateri', 3, 'orang', 500_000], ['Modul pelatihan (cetak)', 80, 'eksemplar', 15_000], ['Sertifikat peserta', 80, 'lembar', 3_500]] }],
    Konsumsi: [{ section: 'KONSUMSI 2 HARI', items: [['Makan berat peserta (3 kali)', 80, 'porsi', 30_000], ['Snack peserta (4 kali)', 80, 'kotak', 20_000]] }],
    Perlengkapan: [{ section: 'PERLENGKAPAN', items: [['Sewa lokasi (aula)', 2, 'hari', 400_000], ['Perlengkapan outbound', 1, 'paket', 500_000]] }],
    'Humas & Dokumentasi': [{ section: 'PUBLIKASI', items: [['Cetak banner dan ID card', 1, 'paket', 450_000], ['Dokumentasi foto', 1, 'paket', 300_000]] }],
  },
  visit: {
    'Acara & Transportasi': [{ section: 'TRANSPORTASI', items: [['Sewa bus pariwisata', 1, 'unit', 4_500_000], ['Tol dan parkir', 1, 'paket', 600_000]] }],
    Konsumsi: [{ section: 'KONSUMSI', items: [['Makan siang peserta', 45, 'porsi', 35_000]] }],
  },
};

const PEMASUKAN: Record<string, Array<[string, number]>> = {
  sync: [['Sponsor PT Krakatau Digital Solusi', 8_000_000], ['Sponsor Bank Banten Syariah', 4_000_000], ['Iuran peserta (tiket seminar)', 4_000_000], ['Kas HMIF', 2_650_000]],
  dies: [['Kas HMIF', 7_000_000], ['Sponsor alumni', 4_500_000], ['Dana fakultas', 3_000_000]],
  lkmm: [['Kas HMIF', 5_200_000], ['Dana fakultas (pembinaan kemahasiswaan)', 4_000_000]],
  visit: [['Iuran peserta', 9_000_000], ['Kas HMIF', 3_000_000]],
};

const NAMA_PESERTA = [
  'Adrian Maulana', 'Bella Kusuma Dewi', 'Chandra Wijaya', 'Dewi Sartika', 'Eko Saputro', 'Farah Diba', 'Gunawan Santoso', 'Hesti Purwanti',
  'Indra Kusuma', 'Joko Susilo', 'Kartika Sari', 'Lutfi Hakim', 'Maya Anggraeni', 'Naufal Rizqi', 'Okta Viani', 'Prasetyo Adi',
  'Qori Ananda', 'Rahmat Hidayat', 'Sinta Dewi', 'Taufik Hidayat', 'Umi Kulsum', 'Vino Bastian', 'Winda Lestari', 'Yoga Pratama',
  'Zulfa Maesaroh', 'Alif Fadhilah', 'Bunga Melati', 'Cahyo Nugroho', 'Dian Pertiwi', 'Erlangga Putra', 'Fanny Rahayu', 'Galang Samudra',
  'Hanifah Zahra', 'Irfan Maulidi', 'Jihan Aulia', 'Khoirul Anam', 'Lestari Ningsih', 'Miftahul Huda', 'Nurul Fadilah', 'Oky Firmansyah',
  'Pratiwi Utami', 'Qiara Salsabila', 'Reza Pahlevi', 'Salma Nabila', 'Tegar Wicaksono',
];

// ---------------------------------------------------------------------------

const hargaTotal = (jumlah: number, harga: number) => Math.round(jumlah * harga);

export async function isiRab(sql: Sql, latar: Latar, bySesi: string, kunci: string, kepanitiaanId: string): Promise<number> {
  const data = RAB[kunci];
  if (!data) return 0;
  const divisi = await sql<{ id: string; nama: string }[]>`SELECT id::text, nama FROM divisi WHERE kepanitiaan_id = ${kepanitiaanId}::uuid`;
  let n = 0;
  await sebagai(sql, bySesi, latar.periodeId, async (tx) => {
    for (const d of divisi) {
      const daftar = data[d.nama];
      if (!daftar) continue;
      for (const [si, s] of daftar.entries()) {
        const [sec] = await tx<{ id: string }[]>`
          INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${d.id}::uuid, ${s.section}, ${si}) RETURNING id::text`;
        for (const [ii, [jenis, jumlah, satuan, harga]] of s.items.entries()) {
          await tx`
            INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
            VALUES (${sec!.id}::uuid, ${ii + 1}, ${jenis}, ${`${jumlah} ${satuan}`}, ${jumlah}, ${harga}, ${hargaTotal(jumlah, harga)})`;
          n++;
        }
      }
    }
  });
  return n;
}

async function isiPemasukanPeserta(sesi: Sesi, kunci: string, kepanitiaanId: string): Promise<{ sumber: number; peserta: number }> {
  let sumber = 0;
  for (const [ket, saldo] of PEMASUKAN[kunci] ?? []) {
    await sesi.wajib('POST', `/api/kepanitiaan/${kepanitiaanId}/pemasukan`, { keterangan: ket, saldo }, `pemasukan ${kunci}`);
    sumber++;
  }
  let peserta = 0;
  const jumlahPeserta = kunci === 'sync' ? 45 : kunci === 'dies' ? 0 : kunci === 'visit' ? 18 : 0;
  for (let i = 0; i < jumlahPeserta; i++) {
    const bayar = i % 4 !== 3;
    await sesi.wajib(
      'POST',
      `/api/kepanitiaan/${kepanitiaanId}/peserta`,
      {
        nama_lengkap: NAMA_PESERTA[i % NAMA_PESERTA.length]!,
        nim: `33372${String(30000 + i * 7).slice(0, 5)}`,
        sudah_bayar: bayar,
        tanggal_bayar: bayar ? dari(-12 + (i % 9)) : null,
        jumlah: kunci === 'sync' ? 25_000 : 500_000,
      },
      `peserta ${kunci} #${i}`,
    );
    peserta++;
  }
  return { sumber, peserta };
}

/** Tugas Gantt divisi (nama, mulai, selesai, progres) per acara — relatif hari ini. */
const GANTT_DIVISI: Record<string, Record<string, Array<{ grup: string; warna: string; tugas: Array<[string, number, number, number]> }>>> = {
  sync: {
    Acara: [
      { grup: 'Konsep & narasumber', warna: '#2563EB', tugas: [['Menyusun rundown & susunan acara', -14, -8, 100], ['Menghubungi dan konfirmasi 3 pembicara', -12, -4, 100], ['Briefing MC dan moderator', 8, 10, 0]] },
      { grup: 'Hari-H', warna: '#16A34A', tugas: [['Gladi resik di aula', 11, 11, 0], ['Pelaksanaan seminar', 12, 13, 0]] },
    ],
    Konsumsi: [{ grup: 'Pengadaan', warna: '#D97706', tugas: [['Survei dan pilih katering', -10, -5, 100], ['Pemesanan snack & makan siang', 3, 6, 40], ['Distribusi konsumsi hari-H', 12, 12, 0]] }],
    Perlengkapan: [{ grup: 'Sewa & alat', warna: '#DC2626', tugas: [['Survei vendor sound system', -9, -4, 100], ['Sewa proyektor dan backdrop', 2, 5, 60], ['Pemasangan dan uji alat', 11, 11, 0]] }],
    PDD: [{ grup: 'Publikasi & dokumentasi', warna: '#7C3AED', tugas: [['Desain poster dan kit media sosial', -10, -3, 100], ['Teaser pembicara (3 konten)', -2, 6, 50], ['Dokumentasi foto-video hari-H', 12, 13, 0]] }],
    Humas: [{ grup: 'Sponsor & peserta', warna: '#0891B2', tugas: [['Mengirim proposal ke 10 calon sponsor', -13, -6, 100], ['Follow-up sponsor', -5, 4, 70], ['Open registration peserta', -3, 9, 55]] }],
  },
  dies: {
    Acara: [{ grup: 'Persiapan acara', warna: '#2563EB', tugas: [['Menyusun rundown malam puncak', -40, -34, 100], ['Latihan pengisi acara', -28, -20, 100], ['Malam puncak Dies Natalis', -17, -16, 100]] }],
    Konsumsi: [{ grup: 'Konsumsi', warna: '#D97706', tugas: [['Pemesanan prasmanan', -30, -24, 100], ['Distribusi konsumsi', -17, -17, 100]] }],
    Dokumentasi: [{ grup: 'Dokumentasi', warna: '#7C3AED', tugas: [['Dekorasi dan dokumentasi', -20, -16, 100]] }],
  },
  lkmm: {
    Acara: [{ grup: 'Materi', warna: '#2563EB', tugas: [['Menyusun modul pelatihan', 15, 28, 20], ['Konfirmasi pemateri', 18, 30, 10]] }],
    Konsumsi: [{ grup: 'Konsumsi', warna: '#D97706', tugas: [['Survei katering', 25, 32, 0]] }],
  },
};

async function isiGanttDivisi(sql: Sql, pic: Sesi, kunci: string, kepanitiaanId: string): Promise<number> {
  const data = GANTT_DIVISI[kunci];
  if (!data) return 0;
  // Menambah grup/task butuh hak `gantt.create`, yang tidak dimiliki role Anggota
  // (hanya ubah). Penyusunnya Kadept penanggung jawab acara (departemen PIC).
  const chart = await sql<{ id: string; judul: string }[]>`
    SELECT g.id::text, g.judul FROM gantt_chart g
    JOIN divisi d ON d.id = g.divisi_id WHERE g.scope = 'DIVISI' AND d.kepanitiaan_id = ${kepanitiaanId}::uuid`;
  let n = 0;
  for (const c of chart) {
    const kelompok = data[c.judul];
    if (!kelompok) continue;
    for (const g of kelompok) {
      const grup = await pic.wajib('POST', `/api/gantt/${c.id}`, { jenis: 'grup', data: { nama: g.grup, warna: g.warna } }, `grup gantt ${c.judul}`);
      const grupId: string = grup.data?.id ?? grup.data?.grup?.id;
      let sebelumnya: string | null = null;
      for (const [nama, a, b, progres] of g.tugas) {
        const r: Awaited<ReturnType<Sesi['wajib']>> = await pic.wajib(
          'POST',
          `/api/gantt/${c.id}`,
          { jenis: 'task', data: { group_id: grupId, nama, tanggal_mulai: dari(a), tanggal_selesai: dari(b), progres, bergantung_pada: sebelumnya ? [sebelumnya] : [] } },
          `task gantt ${nama}`,
        );
        sebelumnya = r.data?.id ?? r.data?.task?.id ?? null;
        n++;
      }
    }
  }
  return n;
}

/** Gantt tingkat departemen (dengan dependensi Finish-to-Start). */
const GANTT_DEPT: Record<string, Array<{ grup: string; warna: string; tugas: Array<[string, number, number, number]> }>> = {
  KAD: [
    { grup: 'Program Unggulan', warna: '#2563EB', tugas: [['Persiapan LKMM-PD', 14, 41, 15], ['Pelaksanaan LKMM-PD', 41, 42, 0], ['Evaluasi kaderisasi semester', 50, 60, 0]] },
    { grup: 'Pembinaan Rutin', warna: '#16A34A', tugas: [['Kajian mingguan (siklus 1)', -30, 20, 55], ['Mentoring angkatan 2026', 0, 45, 25]] },
  ],
  EKS: [
    { grup: 'Acara Eksternal', warna: '#D97706', tugas: [['Persiapan SYNCHRONIZE 2026', -15, 12, 60], ['Pelaksanaan SYNCHRONIZE', 12, 13, 0], ['Persiapan kunjungan industri', 80, 110, 0]] },
    { grup: 'Kemitraan', warna: '#0891B2', tugas: [['Penjajakan sponsor tahap 2', -5, 25, 40]] },
  ],
  KOMINFO: [
    { grup: 'Publikasi', warna: '#7C3AED', tugas: [['Konten SYNCHRONIZE (teaser & rilis)', -10, 12, 55], ['Podcast HMIF episode 6–9', -20, 30, 45], ['Rebranding akun media sosial', -45, -10, 100]] },
  ],
};

async function isiGanttDepartemen(sesi: Map<string, Sesi>, latar: Latar): Promise<number> {
  let n = 0;
  for (const [kode, kelompok] of Object.entries(GANTT_DEPT)) {
    const kadept = sesi.get(`kadept.${kode.toLowerCase()}`)!;
    const chart = await kadept.wajib('POST', '/api/gantt/departemen', { departemen_id: latar.dept.get(kode) }, `chart departemen ${kode}`);
    const chartId: string = chart.data.id;
    for (const g of kelompok) {
      const grup = await kadept.wajib('POST', `/api/gantt/${chartId}`, { jenis: 'grup', data: { nama: g.grup, warna: g.warna } }, `grup ${kode}`);
      const grupId: string = grup.data?.id ?? grup.data?.grup?.id;
      let sebelumnya: string | null = null;
      for (const [nama, a, b, progres] of g.tugas) {
        const r: Awaited<ReturnType<Sesi['wajib']>> = await kadept.wajib(
          'POST',
          `/api/gantt/${chartId}`,
          { jenis: 'task', data: { group_id: grupId, nama, tanggal_mulai: dari(a), tanggal_selesai: dari(b), progres, bergantung_pada: sebelumnya && nama.startsWith('Pelaksanaan') ? [sebelumnya] : [] } },
          `task ${nama}`,
        );
        sebelumnya = r.data?.id ?? r.data?.task?.id ?? null;
        n++;
      }
    }
  }
  return n;
}

const JOB_DESK: Record<string, string[]> = {
  Acara: ['Menyusun rundown dan susunan acara', 'Menghubungi dan mengonfirmasi narasumber', 'Mengoordinasikan MC, moderator, dan gladi resik', 'Memastikan kelancaran acara pada hari-H'],
  Konsumsi: ['Survei dan memesan katering', 'Menghitung kebutuhan konsumsi peserta dan panitia', 'Mendistribusikan konsumsi tepat waktu', 'Mencatat dan menyimpan seluruh nota belanja'],
  Perlengkapan: ['Mendata kebutuhan peralatan dan sewa vendor', 'Memasang dan menguji peralatan sebelum acara', 'Mengelola inventaris dan pengembalian barang'],
  PDD: ['Membuat desain publikasi (poster, kit media sosial)', 'Mendokumentasikan acara (foto dan video)', 'Mengelola live streaming dan arsip dokumentasi'],
  Humas: ['Menjalin dan menindaklanjuti kerja sama sponsor', 'Menyebarkan publikasi ke jejaring kampus', 'Mengelola pendaftaran peserta'],
  Dokumentasi: ['Mendokumentasikan acara', 'Mengurus dekorasi panggung'],
  'Humas & Dokumentasi': ['Mengurus publikasi dan pendaftaran', 'Mendokumentasikan seluruh rangkaian kegiatan'],
  'Acara & Transportasi': ['Mengatur jadwal kunjungan dan transportasi', 'Menghubungi pihak perusahaan'],
};

async function isiJobDesk(sql: Sql, sesi: Map<string, Sesi>, ketuplakKunci: string, kepanitiaanId: string): Promise<number> {
  const divisi = await sql<{ id: string; nama: string }[]>`SELECT id::text, nama FROM divisi WHERE kepanitiaan_id = ${kepanitiaanId}::uuid`;
  const ketuplak = sesi.get(ketuplakKunci)!;
  let n = 0;
  for (const d of divisi) {
    const butir = JOB_DESK[d.nama];
    if (!butir) continue;
    await ketuplak.wajib(
      'PUT',
      `/api/divisi/${d.id}/job-desk`,
      { konten: doc(h(2, `Tanggung jawab divisi ${d.nama}`), ul(...butir), p('Koordinasi harian lewat grup panitia; laporan progres setiap Jumat.')) },
      `job desk ${d.nama}`,
    );
    n++;
  }
  return n;
}

export async function isiAcara(
  sql: Sql,
  sesi: Map<string, Sesi>,
  akun: Map<string, InfoAkun>,
  latar: Latar,
  proker: Map<string, HasilProker>,
): Promise<void> {
  langkah('Acara besar: job desk, Gantt, RAB, pemasukan, peserta');
  const bendum = sesi.get('bendum')!;
  for (const s of SKENARIO) {
    const hasil = proker.get(s.kunci);
    if (!hasil?.kepanitiaanId || !s.kepanitiaan) continue;
    const kid = hasil.kepanitiaanId;
    const ketuplak = s.kepanitiaan.ketuplak;
    const ringkas: string[] = [];

    const jd = await isiJobDesk(sql, sesi, ketuplak, kid);
    ringkas.push(`${jd} job desk`);
    const gd = await isiGanttDivisi(sql, sesi.get(`kadept.${s.dept.toLowerCase()}`)!, s.kunci, kid);
    if (gd) ringkas.push(`${gd} task Gantt divisi`);
    const nRab = await isiRab(sql, latar, akun.get(s.kepanitiaan.bendahara ?? ketuplak)!.id, s.kunci, kid);
    if (nRab) ringkas.push(`${nRab} item RAB`);
    const pp = await isiPemasukanPeserta(sesi.get(s.kepanitiaan.bendahara ?? ketuplak)!, s.kunci, kid);
    if (pp.sumber) ringkas.push(`${pp.sumber} sumber dana`);
    if (pp.peserta) ringkas.push(`${pp.peserta} peserta`);

    // Status RAB: dies & sync → diajukan lalu dikunci Bendahara; lkmm → diajukan saja.
    let status = 'DRAFT';
    if (['dies', 'sync', 'lkmm'].includes(s.kunci)) {
      await sesi.get(ketuplak)!.wajib('POST', `/api/rab/${kid}/submit`, {}, `ajukan RAB ${s.kunci}`);
      status = 'DIAJUKAN';
    }
    if (['dies', 'sync'].includes(s.kunci)) {
      await bendum.wajib('POST', `/api/rab/${kid}/lock`, {}, `kunci RAB ${s.kunci}`);
      status = 'DISETUJUI';
    }
    ringkas.push(`RAB ${status}`);
    ok(`${s.nama.split(' — ')[0]}: ${ringkas.join(' · ')}`);
  }

  const gDept = await isiGanttDepartemen(sesi, latar);
  ok(`Gantt departemen: ${gDept} task (Kaderisasi, Eksternal, Kominfo)`);
  void GagalApi;
  void peringatan;
  void rentangPanjang;
}
