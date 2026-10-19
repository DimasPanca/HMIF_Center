/**
 * Surat demo: tanda tangan Ketua, 11 jenis surat dengan semua status
 * (Draf, Menunggu approval, Terbit bernomor + DOCX, Ditolak, Dibatalkan) dan
 * satu batch Surat Keterangan Aktif massal — seluruhnya lewat API sungguhan.
 * Nomor surat dialokasikan sistem berurutan saat disetujui.
 */

import sharp from 'sharp';

import type { InfoAkun, Latar } from './akun';
import { GagalApi, type Sesi } from './klien';
import { dari, ok, rentangPanjang, type Sql } from './konfig';

const PRESET: Record<string, { nama: string; alamat: string }> = {
  'Kepala Bagian Sekretariat FT': { nama: 'Kepala Bagian Sekretariat Fakultas Teknik UNTIRTA', alamat: 'di Tempat' },
  'Wakil Dekan III': { nama: 'Wakil Dekan III Fakultas Teknik UNTIRTA', alamat: 'di Tempat' },
  'Ketua Jurusan': { nama: 'Ketua Jurusan Teknik Informatika FT UNTIRTA', alamat: 'di Tempat' },
  'BEM FT UNTIRTA': { nama: 'Ketua BEM FT UNTIRTA', alamat: 'di Tempat' },
  'DPM FT UNTIRTA': { nama: 'Ketua DPM FT UNTIRTA', alamat: 'di Tempat' },
};
const LAINNYA = 'Lainnya (isi manual)';

/** Tanda tangan: goresan bersambung berlatar transparan (PNG). */
async function pngTandaTangan(): Promise<Buffer> {
  const svg = `<svg width="520" height="200" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 140 C 60 40, 100 40, 120 120 S 170 190, 200 90 S 250 30, 270 110 S 320 170, 360 70 S 420 40, 500 120"
          fill="none" stroke="#1b2a5c" stroke-width="7" stroke-linecap="round"/>
    <path d="M70 165 C 200 150, 330 175, 470 150" fill="none" stroke="#1b2a5c" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function unggahTandaTangan(sesiKetua: Sesi): Promise<void> {
  const r = await sesiKetua.unggah('/api/users/me/signature', {
    file: { name: 'ttd-ketua.png', mimeType: 'image/png', buffer: await pngTandaTangan() },
  });
  if (!r.ok) throw new GagalApi('unggah tanda tangan Ketua', r);
}

type Nasib = 'TERBIT' | 'MENUNGGU' | 'DRAFT' | 'DITOLAK' | 'BATAL';

interface SpesifikasiSurat {
  kunci: string;
  pembuat: string;
  penyetuju?: 'ketua' | 'wakil' | 'sekum';
  nasib: Nasib;
  alasan?: string;
  body: Record<string, unknown>;
}

function html(...paragraf: string[]): string {
  return paragraf.map((p) => `<p>${p}</p>`).join('');
}

export async function isiSurat(sql: Sql, sesi: Map<string, Sesi>, akun: Map<string, InfoAkun>, latar: Latar): Promise<Map<string, string>> {
  void latar;
  const orang = (k: string) => akun.get(k)!;
  const kiri = (jabatan: string, kunci: string) => {
    const o = orang(kunci);
    return [{ jabatan, nama: o.orang.nama, nim: o.orang.nim, user_id: o.id }];
  };
  const sync = { nama: 'SYNCHRONIZE 2026', tema: 'Kecerdasan Buatan untuk Indonesia Tangguh', hari: rentangPanjang(dari(12), dari(13)) };
  const ketuplakSync = kiri('Ketua Pelaksana SYNCHRONIZE 2026', 'eks1');
  const tgt = (label: string) => ({ tujuan_preset: label, tujuan_nama: PRESET[label]!.nama, tujuan_alamat: PRESET[label]!.alamat });
  const manual = (nama: string, alamat = 'di Tempat') => ({ tujuan_preset: LAINNYA, tujuan_nama: nama, tujuan_alamat: alamat });

  const daftar: SpesifikasiSurat[] = [
    {
      kunci: 'pengajuan-sponsor',
      pembuat: 'sekum',
      penyetuju: 'ketua',
      nasib: 'TERBIT',
      body: {
        jenis: 'PENGAJUAN',
        kode_kegiatan: 'SYNC',
        tanggal_surat: dari(-14),
        lampiran: '1 (satu) Berkas Proposal',
        perihal: 'Permohonan Sponsorship Kegiatan SYNCHRONIZE 2026',
        ...manual('Direktur PT Krakatau Digital Solusi'),
        isi_surat: html(
          'Dengan hormat,',
          `Sehubungan dengan akan diselenggarakannya seminar nasional <strong>${sync.nama}</strong> bertema “${sync.tema}” pada ${sync.hari} di Fakultas Teknik Universitas Sultan Ageng Tirtayasa, kami bermaksud memohon dukungan sponsorship dari Bapak/Ibu.`,
          'Rincian kegiatan dan kebutuhan dana terlampir pada proposal. Besar harapan kami agar permohonan ini dapat dipertimbangkan.',
          'Demikian surat ini kami sampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.',
        ),
        format_output: 'DOCX',
        data_dinamis: {},
        penandatangan_tambahan: ketuplakSync,
      },
    },
    {
      kunci: 'pemateri-1',
      pembuat: 'sekum',
      penyetuju: 'wakil',
      nasib: 'TERBIT',
      body: {
        jenis: 'UNDANGAN_PEMATERI',
        kode_kegiatan: 'SYNC',
        tanggal_surat: dari(-13),
        lampiran: '1 (satu) Berkas TOR',
        perihal: 'Undangan Pemateri Seminar Nasional SYNCHRONIZE 2026',
        ...manual('Dr. Rina Kartika, M.Kom.'),
        penandatangan_tambahan: ketuplakSync,
        format_output: 'DOCX',
        data_dinamis: {
          nama_kegiatan: sync.nama,
          tema_kegiatan: sync.tema,
          tujuan_jabatan: 'Dosen Ilmu Komputer Universitas Indonesia',
          topik_materi: 'Peluang dan Tantangan AI Generatif di Industri',
          hari_tanggal: sync.hari,
          waktu: '09.00 WIB s.d. 12.00 WIB',
          tempat: 'Aula Fakultas Teknik UNTIRTA',
          label_atas: 'Panitia SYNCHRONIZE 2026',
          lampirkan_tor: false,
        },
      },
    },
    {
      kunci: 'pemateri-2',
      pembuat: 'sekum',
      penyetuju: 'sekum',
      nasib: 'TERBIT',
      body: {
        jenis: 'UNDANGAN_PEMATERI',
        kode_kegiatan: 'SYNC',
        tanggal_surat: dari(-12),
        lampiran: '1 (satu) Berkas TOR',
        perihal: 'Undangan Pemateri Seminar Nasional SYNCHRONIZE 2026',
        ...manual('Bayu Setiadi, S.T., M.T.'),
        penandatangan_tambahan: ketuplakSync,
        format_output: 'DOCX',
        data_dinamis: {
          nama_kegiatan: sync.nama,
          tema_kegiatan: sync.tema,
          tujuan_jabatan: 'Chief Technology Officer, Teknologi Nusantara',
          topik_materi: 'Membangun Produk AI yang Bertanggung Jawab',
          hari_tanggal: sync.hari,
          waktu: '13.00 WIB s.d. 15.00 WIB',
          tempat: 'Aula Fakultas Teknik UNTIRTA',
          label_atas: 'Panitia SYNCHRONIZE 2026',
          lampirkan_tor: false,
        },
      },
    },
    {
      kunci: 'kerjasama',
      pembuat: 'sekum',
      penyetuju: 'ketua',
      nasib: 'TERBIT',
      body: {
        jenis: 'KERJA_SAMA',
        kode_kegiatan: 'SYNC',
        tanggal_surat: dari(-9),
        lampiran: '-',
        perihal: 'Kerja Sama Sponsorship SYNCHRONIZE 2026',
        ...manual('Pimpinan Bank Banten Syariah Cabang Cilegon'),
        penandatangan_tambahan: ketuplakSync,
        format_output: 'DOCX',
        data_dinamis: {
          nama_kegiatan: sync.nama,
          tema_kegiatan: sync.tema,
          jenis_mitra: 'Lembaga Keuangan (Sponsor)',
          hari_tanggal: sync.hari,
          tempat: 'Aula Fakultas Teknik UNTIRTA',
          label_atas: 'Panitia SYNCHRONIZE 2026',
          label_kanan: 'Mengetahui,',
        },
      },
    },
    {
      kunci: 'barang',
      pembuat: 'sekum',
      penyetuju: 'wakil',
      nasib: 'TERBIT',
      body: {
        jenis: 'PEMINJAMAN_BARANG',
        kode_kegiatan: 'SYNC',
        tanggal_surat: dari(-8),
        lampiran: '-',
        perihal: 'Permohonan Peminjaman Perlengkapan',
        ...tgt('Kepala Bagian Sekretariat FT'),
        penandatangan_tambahan: ketuplakSync,
        format_output: 'DOCX',
        data_dinamis: {
          nama_kegiatan: sync.nama,
          tema_kegiatan: sync.tema,
          barang: 'Perangkat presentasi dan tata suara',
          hari_tanggal: sync.hari,
          tempat: 'Aula Fakultas Teknik UNTIRTA',
          label_atas: 'Panitia SYNCHRONIZE 2026',
          items: [
            { kebutuhan: 'LCD proyektor', banyaknya: '2 unit' },
            { kebutuhan: 'Layar proyektor', banyaknya: '1 unit' },
            { kebutuhan: 'Kabel HDMI dan terminal listrik', banyaknya: '3 set' },
          ],
          label_kanan: 'Mengetahui,',
        },
      },
    },
    {
      kunci: 'sk-panitia',
      pembuat: 'sekum',
      penyetuju: 'ketua',
      nasib: 'TERBIT',
      body: {
        jenis: 'KEPUTUSAN',
        kode_kegiatan: 'SYNC',
        tanggal_surat: dari(-15),
        lampiran: '1 (satu) Lembar Susunan Panitia',
        perihal: 'Surat Keputusan Susunan Kepanitiaan SYNCHRONIZE 2026',
        ...manual('Seluruh Panitia SYNCHRONIZE 2026', 'di Tempat'),
        isi_surat: html(
          'Menimbang bahwa untuk kelancaran penyelenggaraan SYNCHRONIZE 2026 perlu dibentuk panitia pelaksana.',
          'Memutuskan: menetapkan susunan kepanitiaan SYNCHRONIZE 2026 sebagaimana tercantum dalam lampiran surat keputusan ini, terhitung sejak tanggal ditetapkan.',
        ),
        penandatangan_tambahan: [],
        format_output: 'DOCX',
        data_dinamis: {},
      },
    },
    {
      kunci: 'piagam',
      pembuat: 'sekum',
      penyetuju: 'ketua',
      nasib: 'TERBIT',
      body: {
        jenis: 'PIAGAM',
        kode_kegiatan: 'DIES',
        tanggal_surat: dari(-17),
        lampiran: '-',
        perihal: 'Piagam Penghargaan Pengurus Berprestasi',
        ...manual('Aulia Rahmawati', 'Wakil Ketua HMIF'),
        isi_surat: html('Diberikan kepada <strong>Aulia Rahmawati</strong> atas dedikasi dan kontribusi luar biasa sebagai Pengurus Berprestasi HMIF periode 2026/2027 pada Dies Natalis HMIF ke-12.'),
        penandatangan_tambahan: [],
        format_output: 'DOCX',
        data_dinamis: {},
      },
    },
    {
      kunci: 'aktif-1',
      pembuat: 'kadept.kad',
      penyetuju: 'sekum',
      nasib: 'TERBIT',
      body: {
        jenis: 'KETERANGAN_AKTIF',
        kode_kegiatan: 'HMIF',
        tanggal_surat: dari(-7),
        format_output: 'DOCX',
        data_dinamis: { nama_pemohon: 'Ahmad Fauzan Hakim', nim_pemohon: orang('kad1').orang.nim, jabatan_pemohon: 'Staff Departemen Kaderisasi', keperluan: 'Kelengkapan Persyaratan Administrasi Beasiswa' },
      },
    },
    {
      kunci: 'aktif-2',
      pembuat: 'kadept.rnd',
      penyetuju: 'ketua',
      nasib: 'TERBIT',
      body: {
        jenis: 'KETERANGAN_AKTIF',
        kode_kegiatan: 'HMIF',
        tanggal_surat: dari(-6),
        format_output: 'DOCX',
        data_dinamis: { nama_pemohon: 'Fikri Haikal', nim_pemohon: orang('rnd1').orang.nim, jabatan_pemohon: 'Staff Departemen Riset dan Development', keperluan: 'Pendaftaran Program Magang Industri' },
      },
    },
    {
      kunci: 'sambutan-batal',
      pembuat: 'sekum',
      penyetuju: 'wakil',
      nasib: 'BATAL',
      alasan: 'Tanggal pelaksanaan pada surat keliru (tertulis hari Jumat, seharusnya Sabtu). Surat pengganti akan diterbitkan.',
      body: {
        jenis: 'UNDANGAN_SAMBUTAN',
        kode_kegiatan: 'SYNC',
        tanggal_surat: dari(-5),
        lampiran: '-',
        perihal: 'Undangan Sambutan Seminar Nasional SYNCHRONIZE 2026',
        ...tgt('Wakil Dekan III'),
        penandatangan_tambahan: ketuplakSync,
        format_output: 'DOCX',
        data_dinamis: {
          nama_kegiatan: sync.nama,
          tema_kegiatan: sync.tema,
          hari_tanggal: sync.hari,
          waktu: '08.00 WIB s.d. Selesai',
          tempat: 'Aula Fakultas Teknik UNTIRTA',
          rundown: [
            { hari_tanggal: tanggalAwal(), waktu: '08.00 - 08.30', acara: 'Registrasi peserta', keterangan: '' },
            { hari_tanggal: '', waktu: '08.30 - 09.00', acara: 'Pembukaan dan sambutan', keterangan: 'Wakil Dekan III' },
          ],
          label_kanan: 'Mengetahui,',
        },
      },
    },
    {
      kunci: 'sponsor-ditolak',
      pembuat: 'sekum',
      nasib: 'DITOLAK',
      alasan: 'Besaran dana yang dimohon belum sesuai RAB terbaru. Revisi nominal lalu ajukan kembali.',
      body: {
        jenis: 'PENGAJUAN',
        kode_kegiatan: 'LKMM',
        tanggal_surat: dari(-3),
        lampiran: '1 (satu) Berkas Proposal',
        perihal: 'Permohonan Dana Pembinaan Kemahasiswaan LKMM-PD 2026',
        ...tgt('Wakil Dekan III'),
        isi_surat: html('Dengan hormat,', 'Kami memohon dukungan dana pembinaan kemahasiswaan sebesar Rp5.000.000 untuk pelaksanaan LKMM-PD 2026.', 'Demikian permohonan ini kami sampaikan.'),
        penandatangan_tambahan: [],
        format_output: 'DOCX',
        data_dinamis: {},
      },
    },
    // ---- menunggu approval ----
    {
      kunci: 'aspirasi',
      pembuat: 'sekum',
      nasib: 'MENUNGGU',
      body: {
        jenis: 'ASPIRASI',
        kode_kegiatan: 'HMIF',
        tanggal_surat: dari(-1),
        lampiran: '-',
        perihal: 'Pemberitahuan Aspirasi Mahasiswa Informatika',
        ...tgt('Ketua Jurusan'),
        isi_surat: html('Dengan hormat,', 'Berikut aspirasi mahasiswa Informatika yang kami himpun melalui forum diskusi.'),
        format_output: 'DOCX',
        data_dinamis: {
          label_atas: 'Hormat Kami,',
          poin: [
            { judul: 'Ketersediaan laboratorium', paragraf: ['Mahasiswa mengusulkan penambahan jam akses laboratorium komputer di luar jam kuliah untuk keperluan tugas akhir.'] },
            { judul: 'Pembaruan kurikulum', paragraf: ['Mahasiswa berharap mata kuliah pilihan terkait kecerdasan buatan dan keamanan siber dapat dibuka pada semester genap.'] },
          ],
        },
      },
    },
    {
      kunci: 'izin-lkmm',
      pembuat: 'kadept.kad',
      nasib: 'MENUNGGU',
      body: {
        jenis: 'PENGAJUAN',
        kode_kegiatan: 'LKMM',
        tanggal_surat: dari(0),
        lampiran: '1 (satu) Berkas Proposal',
        perihal: 'Permohonan Izin Pelaksanaan LKMM-PD 2026',
        ...tgt('Wakil Dekan III'),
        isi_surat: html('Dengan hormat,', 'Kami mengajukan izin pelaksanaan LKMM-PD 2026 bagi mahasiswa baru angkatan 2026 pada akhir November mendatang.', 'Atas perhatian Bapak, kami ucapkan terima kasih.'),
        penandatangan_tambahan: [],
        format_output: 'DOCX',
        data_dinamis: {},
      },
    },
    {
      kunci: 'aktif-3',
      pembuat: 'kadept.mikat',
      nasib: 'MENUNGGU',
      body: {
        jenis: 'KETERANGAN_AKTIF',
        kode_kegiatan: 'HMIF',
        tanggal_surat: dari(0),
        format_output: 'DOCX',
        data_dinamis: { nama_pemohon: 'Zahra Amalia Putri', nim_pemohon: orang('mikat1').orang.nim, jabatan_pemohon: 'Staff Departemen Minat dan Bakat', keperluan: 'Syarat Pendaftaran Lomba Tingkat Nasional' },
      },
    },
    // ---- draf ----
    {
      kunci: 'draf-peringatan',
      pembuat: 'sekum',
      nasib: 'DRAFT',
      body: {
        jenis: 'PERINGATAN',
        kode_kegiatan: 'HMIF',
        tanggal_surat: dari(0),
        lampiran: '-',
        perihal: 'Peringatan Keterlambatan Pengumpulan LPJ',
        ...manual('Ketua Pelaksana kegiatan periode berjalan'),
        isi_surat: html('Diberitahukan bahwa batas pengumpulan LPJ kegiatan adalah 14 hari setelah acara.'),
        penandatangan_tambahan: [],
        format_output: 'DOCX',
        data_dinamis: {},
      },
    },
    {
      kunci: 'draf-barang',
      pembuat: 'kadept.kad',
      nasib: 'DRAFT',
      body: {
        jenis: 'PEMINJAMAN_BARANG',
        kode_kegiatan: 'LKMM',
        tanggal_surat: dari(0),
        perihal: 'Permohonan Peminjaman Perlengkapan Outbound',
        ...tgt('Kepala Bagian Sekretariat FT'),
        data_dinamis: { nama_kegiatan: 'LKMM-PD 2026', tema_kegiatan: 'Menjadi Pemimpin yang Berdampak', barang: 'Perlengkapan outbound', items: [] },
      },
    },
  ];

  function tanggalAwal(): string {
    return dari(12);
  }

  const idSurat = new Map<string, string>();
  const hitung: Record<Nasib, number> = { TERBIT: 0, MENUNGGU: 0, DRAFT: 0, DITOLAK: 0, BATAL: 0 };
  const penyetuju = (k: 'ketua' | 'wakil' | 'sekum') => sesi.get(k)!;

  for (const s of daftar) {
    const pembuat = sesi.get(s.pembuat)!;
    const buat = await pembuat.wajib('POST', '/api/surat', s.body, `buat surat ${s.kunci}`);
    const id: string = buat.data.id;
    idSurat.set(s.kunci, id);
    if (s.nasib === 'DRAFT') {
      hitung.DRAFT++;
      continue;
    }
    await pembuat.wajib('POST', `/api/surat/${id}/submit`, {}, `ajukan surat ${s.kunci}`);
    if (s.nasib === 'MENUNGGU') {
      hitung.MENUNGGU++;
      continue;
    }
    if (s.nasib === 'DITOLAK') {
      await penyetuju('ketua').wajib('POST', `/api/surat/${id}/reject`, { alasan: s.alasan }, `tolak surat ${s.kunci}`);
      hitung.DITOLAK++;
      continue;
    }
    const ap = penyetuju(s.penyetuju ?? 'ketua');
    await ap.wajib('POST', `/api/surat/${id}/approve`, {}, `setujui surat ${s.kunci}`);
    if (s.nasib === 'BATAL') {
      await sesi.get('sekum')!.wajib('POST', `/api/surat/${id}/cancel`, { alasan: s.alasan }, `batalkan surat ${s.kunci}`);
      hitung.BATAL++;
    } else {
      hitung.TERBIT++;
    }
  }

  // Satu surat terbit diunduh untuk memastikan DOCX benar-benar ada.
  const uji = await sesi.get('sekum')!.unduh(`/api/surat/${idSurat.get('pengajuan-sponsor')}/download`);
  ok(
    `${daftar.length} surat: ${hitung.TERBIT} terbit · ${hitung.MENUNGGU} menunggu approval · ${hitung.DRAFT} draf · ${hitung.DITOLAK} ditolak · ${hitung.BATAL} dibatalkan` +
      ` (unduh DOCX contoh: HTTP ${uji.status}, ${Math.round(uji.ukuran / 1024)} KB)`,
  );

  // ---- Batch Surat Keterangan Aktif massal -------------------------------------
  const pengurus = await sql<{ id: string }[]>`
    SELECT id::text FROM pengurus WHERE user_id IS NULL AND nim BETWEEN '3337230100' AND '3337230111' ORDER BY nim LIMIT 8`;
  const sk = sesi.get('sekum')!;
  const batch = await sk.wajib('POST', '/api/surat/batch', { aksi: 'buat', pengurus: pengurus.map((p) => p.id), keperluan: 'Persyaratan Beasiswa Prestasi Akademik', tanggal_surat: dari(-2) }, 'buat batch');
  const idBatch: string = batch.data?.batchId ?? batch.data?.batch_id;
  const setuju = await sesi.get('ketua')!.panggil('POST', '/api/surat/batch', { aksi: 'setujui', batch: idBatch });
  if (!setuju.ok) throw new GagalApi('setujui batch', setuju);
  ok(`Surat Keterangan Aktif massal: ${pengurus.length} surat satu batch, disetujui & diterbitkan`);
  return idSurat;
}
