/**
 * tangkap-panduan — tangkapan layar untuk panduan pengguna per role (T-116).
 *
 *   npm run build && npm start      # atau npm run dev; produksi lebih cepat & stabil
 *   npx tsx scripts/tangkap-panduan.ts [--url http://localhost:3000] [--simpan-data]
 *
 * 1. Menyemai data demo bernama wajar (proker tiap departemen, acara
 *    "SYNCHRONIZE 2026" lengkap dengan divisi, RAB, Gantt, nota bergambar,
 *    surat berbagai status, kartu Kanban, kendala). Penanda: akhiran tak
 *    terlihat di `proker/kanban_card/kendala.deskripsi`,
 *    `surat.data_dinamis.demo_panduan`, `image.original_filename`.
 * 2. Masuk sebagai kedelapan akun uji (satu per role), mencatat menu sidebar
 *    yang benar-benar tampil (→ `--menu` JSON, bahan tabel "Menu Anda"), lalu
 *    memotret layar yang dirujuk panduan ke `docs/panduan/img/*.png`
 *    (PNG terpalet supaya repo tetap ringan).
 * 3. Menghapus data demo (kecuali `--simpan-data`).
 *
 * Gerak dikurangi (`reducedMotion`) supaya tidak ada animasi setengah jalan.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-116
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';
import sharp from 'sharp';

import { AKUN, PASSWORD_UJI, type AkunUji } from '../e2e/fixtures/akun';

const AKAR = path.resolve(import.meta.dirname, '..');
const DIR_GAMBAR = path.join(AKAR, 'docs/panduan/img');
/**
 * Penanda data demo: karakter tak terlihat U+2063 di akhir deskripsi wajar —
 * tidak muncul di tangkapan layar, tetapi dapat dicari saat membersihkan
 * (termasuk sisa jalan yang terhenti).
 */
const PENANDA_TAK_TERLIHAT = '\u2063';
const PENANDA = `Rangkaian kegiatan untuk meningkatkan kompetensi dan kebersamaan mahasiswa Informatika.${PENANDA_TAK_TERLIHAT}`;

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (nama: string, bawaan: string): string => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : bawaan;
};

function muatEnv(): void {
  const f = path.join(AKAR, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const baris of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
muatEnv();

const URL_DASAR = arg('--url', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const BERKAS_MENU = arg('--menu', '');
const SIMPAN_DATA = argv.includes('--simpan-data');

const log = (s = ''): void => {
  process.stdout.write(s + '\n');
};

type Sql = ReturnType<typeof postgres>;

const hariKe = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hariIni = (): string => new Date().toISOString().slice(0, 10);

async function idAkun(sql: Sql, a: AkunUji): Promise<string> {
  const [r] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${a.email}`;
  if (!r) throw new Error(`Akun ${a.email} belum ada — jalankan npm run seed:e2e-auth.`);
  return r.id;
}

// ---------------------------------------------------------------------------
// Data demo
// ---------------------------------------------------------------------------

interface DataDemo {
  acaraId: string;
  chartId: string;
  divisiKonsumsi: string;
  prokerMenunggu: string;
  kunciBerkas: string[];
}

async function bersihkan(sql: Sql, kunciBerkas: string[]): Promise<void> {
  const { storage } = await import('@/lib/storage');
  const sisa = await sql<{ m: string; p: string; t: string }[]>`
    SELECT master_path AS m, preview_path AS p, thumbnail_path AS t FROM image
    WHERE original_filename LIKE 'demo-panduan-%'`;
  const berkas = new Set([...kunciBerkas, ...sisa.flatMap((r) => [r.m, r.p, r.t]).filter(Boolean)]);
  await sql`DELETE FROM surat WHERE data_dinamis->>'demo_panduan' = 'true'`;
  await sql`DELETE FROM kanban_card WHERE deskripsi LIKE ${'%' + PENANDA_TAK_TERLIHAT}`;
  await sql`DELETE FROM kendala WHERE deskripsi LIKE ${'%' + PENANDA_TAK_TERLIHAT}`;
  await sql`DELETE FROM booking_ruangan WHERE ruangan_id IN (SELECT id FROM ruangan WHERE catatan LIKE ${'%' + PENANDA_TAK_TERLIHAT})`;
  await sql`DELETE FROM ruangan WHERE catatan LIKE ${'%' + PENANDA_TAK_TERLIHAT}`;
  await sql`DELETE FROM proker WHERE deskripsi LIKE ${'%' + PENANDA_TAK_TERLIHAT}`;
  await sql`DELETE FROM image WHERE original_filename LIKE 'demo-panduan-%'`;
  await Promise.allSettled([...berkas].map((k) => storage.delete(k)));
}

/** Foto struk sederhana — cukup untuk kartu galeri verifikasi. */
async function gambarStruk(toko: string, total: string): Promise<{ master: Buffer; preview: Buffer; thumb: Buffer }> {
  const svg = `<svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="1600" fill="#f4f1ea"/>
    <text x="600" y="180" font-size="64" text-anchor="middle" font-family="monospace" fill="#222">${toko}</text>
    <text x="600" y="260" font-size="36" text-anchor="middle" font-family="monospace" fill="#444">Jl. Jenderal Sudirman, Cilegon</text>
    <line x1="120" y1="320" x2="1080" y2="320" stroke="#999" stroke-dasharray="12 8" stroke-width="4"/>
    <text x="140" y="420" font-size="40" font-family="monospace" fill="#222">Snack box ............ 40</text>
    <text x="140" y="500" font-size="40" font-family="monospace" fill="#222">Air mineral .......... 2 dus</text>
    <line x1="120" y1="1300" x2="1080" y2="1300" stroke="#999" stroke-dasharray="12 8" stroke-width="4"/>
    <text x="140" y="1400" font-size="56" font-family="monospace" fill="#111">TOTAL  ${total}</text>
  </svg>`;
  const master = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  const [preview, thumb] = await Promise.all([
    sharp(master).resize(960, 1280).webp({ quality: 78 }).toBuffer(),
    sharp(master).resize(300, 400).webp({ quality: 70 }).toBuffer(),
  ]);
  return { master, preview, thumb };
}

async function semai(sql: Sql): Promise<DataDemo> {
  const { storage, keys } = await import('@/lib/storage');
  await bersihkan(sql, []);

  const [periode] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  if (!periode) throw new Error('Tidak ada periode AKTIF.');
  const periodeId = periode.id;
  const dept = new Map(
    (await sql<{ id: string; kode: string }[]>`SELECT id::text, kode FROM departemen WHERE is_active`).map((d) => [d.kode, d.id]),
  );
  const [admin, kadept, anggota, sekum, bendum] = await Promise.all([
    idAkun(sql, AKUN.admin),
    idAkun(sql, AKUN.kadept),
    idAkun(sql, AKUN.anggota),
    idAkun(sql, AKUN.sekum),
    idAkun(sql, AKUN.bendum),
  ]);
  const kunciBerkas: string[] = [];

  // --- Proker -----------------------------------------------------------------
  type Rencana = [kode: string, nama: string, kategori: 'TERJADWAL' | 'BERKALA', status: string, mulai: number, hariH: number];
  const rencana: Rencana[] = [
    ['EKS', 'SYNCHRONIZE 2026 — Seminar Nasional Teknologi', 'TERJADWAL', 'SETUJUI', -10, 22],
    ['KAD', 'Latihan Kepemimpinan Dasar (LKMM-PD)', 'TERJADWAL', 'SETUJUI', 30, 52],
    ['MIKAT', 'Informatics Cup 2026', 'TERJADWAL', 'MENUNGGU_APPROVAL', 75, 100],
    ['KAD', 'Kajian Rutin Mingguan', 'BERKALA', 'BERJALAN', -30, 60],
    ['KAD', 'Mentoring Mahasiswa Baru', 'BERKALA', 'DRAFT', 20, 45],
    ['MIKAT', 'Latihan Rutin E-Sport', 'BERKALA', 'DISETUJUI', 5, 40],
    ['INT', 'Rapat Kerja Pengurus', 'BERKALA', 'BERJALAN', -20, 10],
    ['INT', 'Malam Keakraban HMIF', 'BERKALA', 'MENUNGGU_APPROVAL', 60, 85],
    ['EKS', 'Kunjungan Industri', 'BERKALA', 'DISETUJUI', 40, 70],
    ['KOMINFO', 'Pelatihan Desain Grafis', 'BERKALA', 'BERJALAN', -15, 20],
    ['KOMINFO', 'Podcast HMIF', 'BERKALA', 'DISETUJUI', 10, 90],
    ['RND', 'Workshop Machine Learning', 'BERKALA', 'DISETUJUI', 25, 50],
    ['RND', 'Riset Bersama Dosen', 'BERKALA', 'DRAFT', 45, 120],
  ];
  const id = new Map<string, string>();
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_agent', 'tangkap-panduan', true)`;
    await tx`SELECT set_config('app.periode_id', ${periodeId}, true)`;
    for (const [kode, nama, kategori, status, mulai, hariH] of rencana) {
      const tMulai = hariKe(hariIni(), mulai);
      const tHariH = hariKe(hariIni(), hariH);
      const setujui = status === 'SETUJUI';
      const [p] = await tx<{ id: string }[]>`
        INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, deskripsi, tujuan, sasaran,
          estimasi_peserta, sumber_dana, tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
          penanggung_jawab, dibuat_oleh, diajukan_at)
        VALUES (${periodeId}::uuid, ${dept.get(kode)!}::uuid, ${nama}, ${kategori}::proker_kategori,
          ${setujui ? 'MENUNGGU_APPROVAL' : status}::proker_status, ${PENANDA},
          'Meningkatkan kompetensi dan kebersamaan mahasiswa Informatika.', 'Mahasiswa Informatika FT UNTIRTA',
          ${kategori === 'TERJADWAL' ? 150 : 40}, ARRAY['KAS_HMIF','SPONSOR']::text[],
          ${tMulai}::date, ${tHariH}::date, ${hariKe(tHariH, 1)}::date, ${kadept}::uuid, ${kadept}::uuid,
          ${status === 'DRAFT' ? null : new Date()})
        RETURNING id::text`;
      id.set(nama, p!.id);
      if (setujui) {
        const [r] = await tx<{ hasil: { ok: boolean; reason?: string } }[]>`
          SELECT setujui_proker(${p!.id}::uuid, ${admin}::uuid) AS hasil`;
        if (!r?.hasil.ok) throw new Error(`setujui_proker menolak ${nama}: ${r?.hasil.reason ?? '?'}`);
      }
    }
  });
  const prokerAcara = id.get('SYNCHRONIZE 2026 — Seminar Nasional Teknologi')!;

  // --- Acara SYNCHRONIZE 2026 ------------------------------------------------------
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, tema, kode_kegiatan, ketua_pelaksana, bendahara, target_anggaran)
    VALUES (${prokerAcara}::uuid, 'SYNCHRONIZE 2026', 'Kecerdasan Buatan untuk Indonesia Tangguh', 'SYNC',
            ${sekum}::uuid, ${bendum}::uuid, 15000000)
    RETURNING id::text`;
  const acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id, status) VALUES (${acaraId}::uuid, 'DRAFT')`;
  const itemRab: Record<string, Array<[string, number, number]>> = {
    Acara: [['Honor pembicara', 2, 1500000], ['Plakat pembicara', 2, 150000], ['Sertifikat peserta', 150, 2500]],
    Konsumsi: [['Snack box peserta', 150, 12000], ['Makan siang panitia', 40, 20000], ['Air mineral (dus)', 10, 45000]],
    Perlengkapan: [['Sewa sound system', 1, 750000], ['Banner 3×1 m', 2, 120000], ['ID card panitia', 40, 5000]],
    PDD: [['Sewa kamera', 2, 200000], ['Cetak foto dokumentasi', 20, 5000]],
    Humas: [['Iklan media sosial', 1, 300000], ['Cetak poster A3', 30, 6000]],
  };
  const divisi = new Map<string, string>();
  const item = new Map<string, string>();
  let urut = 1;
  for (const [nama, daftar] of Object.entries(itemRab)) {
    const [dv] = await sql<{ id: string }[]>`
      INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan)
      VALUES (${acaraId}::uuid, ${nama}, ${nama === 'Konsumsi' ? anggota : null}::uuid, ${urut++}) RETURNING id::text`;
    divisi.set(nama, dv!.id);
    const [sec] = await sql<{ id: string }[]>`
      INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dv!.id}::uuid, ${nama.toUpperCase()}, 0) RETURNING id::text`;
    for (const [i, [jenis, jumlah, harga]] of daftar.entries()) {
      const [it] = await sql<{ id: string }[]>`
        INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
        VALUES (${sec!.id}::uuid, ${i + 1}, ${jenis}, ${String(jumlah)}, ${jumlah}, ${harga}, ${jumlah * harga})
        RETURNING id::text`;
      item.set(jenis, it!.id);
    }
  }
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${divisi.get('Konsumsi')!}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;

  // Gantt acara
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO gantt_chart (scope, proker_id, judul) VALUES ('PROKER', ${prokerAcara}::uuid, 'Timeline SYNCHRONIZE 2026')
    RETURNING id::text`;
  const chartId = c!.id;
  const grup: Array<[string, string, Array<[string, number, number, number]>]> = [
    ['Persiapan', '#2563EB', [['Rapat perdana panitia', -10, -9, 100], ['Penyusunan TOR & proposal', -8, -2, 100], ['Perizinan tempat', -3, 4, 60]]],
    ['Publikasi', '#D97706', [['Desain poster', -2, 3, 70], ['Open registration', 4, 18, 10], ['Teaser media sosial', 6, 20, 0]]],
    ['Pelaksanaan', '#16A34A', [['Gladi resik', 21, 21, 0], ['Hari-H seminar', 22, 23, 0], ['Evaluasi & LPJ', 24, 35, 0]]],
  ];
  let urutTask = 0;
  for (const [g, [nama, warna, tugas]] of grup.entries()) {
    const [gr] = await sql<{ id: string }[]>`
      INSERT INTO gantt_group (chart_id, nama, warna, urutan) VALUES (${chartId}::uuid, ${nama}, ${warna}, ${g}) RETURNING id::text`;
    for (const [judul, a, b, progres] of tugas) {
      await sql`
        INSERT INTO gantt_task (group_id, chart_id, nama, tanggal_mulai, tanggal_selesai, progres, urutan)
        VALUES (${gr!.id}::uuid, ${chartId}::uuid, ${judul}, ${hariKe(hariIni(), a)}::date, ${hariKe(hariIni(), b)}::date,
                ${progres}, ${urutTask++})`;
    }
  }

  // Nota menunggu verifikasi
  const nota: Array<[string, string, number, string]> = [
    ['Toko Berkah Snack', 'Snack box peserta', 480000, 'Rp480.000'],
    ['Agen Air Sejuk', 'Air mineral (dus)', 225000, 'Rp225.000'],
    ['Warung Bu Sari', 'Makan siang panitia', 400000, 'Rp400.000'],
    ['Toko Berkah Snack', 'Snack box peserta', 360000, 'Rp360.000'],
  ];
  for (const [i, [toko, jenis, nominal, teks]] of nota.entries()) {
    const g = await gambarStruk(toko, teks);
    const uuid = crypto.randomUUID();
    const km = keys.notaMaster(uuid, 'jpg');
    const kp = keys.notaPreview(uuid, 'webp');
    const kt = keys.notaThumb(uuid, 'webp');
    await Promise.all([
      storage.put(km, g.master, 'image/jpeg', { upsert: true }),
      storage.put(kp, g.preview, 'image/webp', { upsert: true }),
      storage.put(kt, g.thumb, 'image/webp', { upsert: true }),
    ]);
    kunciBerkas.push(km, kp, kt);
    const [img] = await sql<{ id: string }[]>`
      INSERT INTO image (uploader_id, original_filename, storage_uuid, master_path, preview_path, thumbnail_path,
                         original_mime_type, master_mime_type, original_width, original_height,
                         master_width, master_height, master_file_size, kind)
      VALUES (${anggota}::uuid, ${`demo-panduan-${i + 1}.jpg`}, ${uuid}, ${km}, ${kp}, ${kt}, 'image/jpeg', 'image/jpeg',
              1200, 1600, 1200, 1600, ${g.master.length}, 'DOKUMEN')
      RETURNING id::text`;
    const [n] = await sql<{ id: string }[]>`
      INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota, keterangan)
      VALUES (${divisi.get('Konsumsi')!}::uuid, ${img!.id}::uuid, ${anggota}::uuid, ${hariKe(hariIni(), -i)}::date, ${nominal},
              ${`Belanja di ${toko}`})
      RETURNING id::text`;
    await sql`INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal) VALUES (${n!.id}::uuid, ${item.get(jenis)!}::uuid, ${nominal})`;
  }

  // --- Surat ---------------------------------------------------------------------------
  const surat: Array<[string, string, string]> = [
    ['Permohonan Peminjaman Auditorium FT', 'Kepala Bagian Sekretariat FT', 'TERBIT'],
    ['Undangan Pembicara Seminar Nasional', 'Dr. Rina Kartika, M.Kom.', 'TERBIT'],
    ['Permohonan Dana Sponsorship', 'PT Krakatau Digital', 'TERBIT'],
    ['Permohonan Izin Kegiatan LKMM-PD', 'Wakil Dekan III FT UNTIRTA', 'MENUNGGU_APPROVAL'],
    ['Undangan Rapat Kerja Pengurus', 'Seluruh Pengurus HMIF', 'MENUNGGU_APPROVAL'],
    ['Permohonan Peminjaman Lab Komputer', 'Kepala Laboratorium Informatika', 'DRAFT'],
    ['Surat Keterangan Aktif Organisasi', 'Bagian Kemahasiswaan', 'DITOLAK'],
  ];
  for (const [i, [perihal, tujuan, status]] of surat.entries()) {
    const terbit = status === 'TERBIT';
    const nomor = 900 + i;
    await sql`
      INSERT INTO surat (periode_id, kode_surat, nomor_urut, bulan_romawi, tahun, nomor_lengkap, tanggal_surat,
                         perihal, tujuan_nama, tujuan_alamat, status, data_dinamis, dibuat_oleh, disetujui_oleh,
                         disetujui_at, diajukan_at, alasan_penolakan, kepanitiaan_id)
      VALUES (${periodeId}::uuid, '01', ${terbit ? nomor : null}, ${terbit ? 'X' : null}, ${terbit ? 2026 : null},
              ${terbit ? `${nomor}/UN43.3.7/HMIF/X/2026` : null}, ${hariKe(hariIni(), -i)}::date, ${perihal}, ${tujuan},
              'Fakultas Teknik Universitas Sultan Ageng Tirtayasa', ${status}::surat_status,
              ${sql.json({ demo_panduan: true })}, ${sekum}::uuid, ${terbit ? admin : null}::uuid,
              ${terbit ? new Date() : null}, ${status === 'DRAFT' ? null : new Date()},
              ${status === 'DITOLAK' ? 'Lampirkan daftar nama pengurus yang diajukan.' : null},
              ${i < 3 ? acaraId : null}::uuid)`;
  }

  // --- Kanban & kendala (departemen Kaderisasi) ----------------------------------
  const kad = dept.get('KAD')!;
  const kartu: Array<[string, string, string]> = [
    ['Susun materi LKMM-PD', 'IN_PROGRESS', 'TINGGI'],
    ['Hubungi pemateri kajian', 'TODO', 'SEDANG'],
    ['Rekap presensi kajian bulan ini', 'REVIEW', 'RENDAH'],
    ['Booking ruang kelas untuk mentoring', 'TODO', 'SEDANG'],
    ['Evaluasi kajian minggu lalu', 'DONE', 'RENDAH'],
  ];
  for (const [i, [judul, kolom, prioritas]] of kartu.entries()) {
    await sql`
      INSERT INTO kanban_card (departemen_id, judul, deskripsi, kolom, prioritas, assignee_id, deadline, urutan, created_by)
      VALUES (${kad}::uuid, ${judul}, ${PENANDA}, ${kolom}::kanban_kolom, ${prioritas}::prioritas, ${anggota}::uuid,
              ${hariKe(hariIni(), 3 + i * 4)}::date, ${i}, ${kadept}::uuid)`;
  }
  await sql`
    INSERT INTO kendala (departemen_id, judul, deskripsi, prioritas, status, dibuat_oleh, periode_id)
    VALUES (${kad}::uuid, 'Pemateri LKMM-PD batal hadir', ${PENANDA}, 'KRITIS', 'TERBUKA', ${kadept}::uuid, ${periodeId}::uuid),
           (${kad}::uuid, 'Ruang kelas bentrok jadwal UTS', ${PENANDA}, 'SEDANG', 'SEDANG_DITANGANI', ${kadept}::uuid, ${periodeId}::uuid)`;

  // --- Ruangan & peminjaman --------------------------------------------------------
  const ruang = await sql<{ id: string }[]>`
    INSERT INTO ruangan (nama, lokasi, kapasitas, pengelola, catatan) VALUES
      ('Auditorium Fakultas Teknik', 'Gedung A lantai 3', 300, 'Bagian Sekretariat FT', ${'Perlu surat ke Kabag Sekretariat.' + PENANDA_TAK_TERLIHAT}),
      ('Ruang Sidang Jurusan', 'Gedung Informatika', 40, 'Jurusan Informatika', ${'Konfirmasi ke admin jurusan.' + PENANDA_TAK_TERLIHAT})
    RETURNING id::text`;
  await sql`
    INSERT INTO booking_ruangan (ruangan_id, periode_id, kegiatan, tanggal, waktu_mulai, waktu_selesai, jumlah_peserta, keperluan, dibuat_oleh)
    VALUES (${ruang[0]!.id}::uuid, ${periodeId}::uuid, 'SYNCHRONIZE 2026', ${hariKe(hariIni(), 22)}::date, '08:00', '15:00', 150,
            'Seminar nasional', ${sekum}::uuid),
           (${ruang[1]!.id}::uuid, ${periodeId}::uuid, 'Rapat Kerja Pengurus', ${hariKe(hariIni(), 4)}::date, '13:00', '16:00', 35,
            'Rapat kerja', ${sekum}::uuid)`;

  return {
    acaraId,
    chartId,
    divisiKonsumsi: divisi.get('Konsumsi')!,
    prokerMenunggu: id.get('Informatics Cup 2026')!,
    kunciBerkas,
  };
}

// ---------------------------------------------------------------------------
// Nama tampilan
// ---------------------------------------------------------------------------

/**
 * Akun uji bernama "Uji E2E …" dan periodenya "Periode Uji E2E". Selama
 * pemotretan nama tampilannya diganti nama jabatan, lalu DIPULIHKAN — gate
 * e2e bergantung pada nama aslinya (NAMA_PERIODE_UJI).
 */
const NAMA_PERSONA: Array<[AkunUji, string]> = [
  [AKUN.admin, 'Admin Sistem HMIF'],
  [AKUN.aktif, 'Ketua Umum HMIF'],
  [AKUN.wakil, 'Wakil Ketua HMIF'],
  [AKUN.sekum, 'Sekretaris Umum'],
  [AKUN.bendum, 'Bendahara Umum'],
  [AKUN.kadept, 'Kadept Kaderisasi'],
  [AKUN.anggota, 'Anggota Kaderisasi'],
  [AKUN.bacaSaja, 'Badan Pengurus Harian'],
  [AKUN.multi, 'Pengurus Rangkap Jabatan'],
  [AKUN.nonaktif, 'Anggota Nonaktif'],
];

async function pakaiPersona(sql: Sql): Promise<() => Promise<void>> {
  const asli = await sql<{ email: string; nama: string }[]>`
    SELECT email, nama_lengkap AS nama FROM app_user WHERE email IN ${sql(NAMA_PERSONA.map(([a]) => a.email))}`;
  const [periode] = await sql<{ id: string; nama: string }[]>`SELECT id::text, nama FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const pulihkan = async () => {
    for (const r of asli) await sql`UPDATE app_user SET nama_lengkap = ${r.nama} WHERE email = ${r.email}`;
    if (periode) await sql`UPDATE periode SET nama = ${periode.nama} WHERE id = ${periode.id}::uuid`;
  };
  for (const [a, nama] of NAMA_PERSONA) await sql`UPDATE app_user SET nama_lengkap = ${nama} WHERE email = ${a.email}`;
  if (periode) await sql`UPDATE periode SET nama = 'Kepengurusan 2026/2027' WHERE id = ${periode.id}::uuid`;
  return pulihkan;
}

// ---------------------------------------------------------------------------
// Tangkapan layar
// ---------------------------------------------------------------------------

let nomorIp = 1;

async function halaman(browser: Browser, akun: AkunUji | null, ponsel = false): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: URL_DASAR,
    viewport: ponsel ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: ponsel,
    hasTouch: ponsel,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    extraHTTPHeaders: { 'x-forwarded-for': `10.116.${Math.floor(Date.now() / 1000) % 250}.${nomorIp++ % 250}` },
  });
  const page = await ctx.newPage();
  if (akun) {
    await page.goto('/login', { waitUntil: 'load' });
    await page.getByLabel(/email/i).fill(akun.email);
    await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
    await page.getByRole('button', { name: /masuk|login/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  }
  return page;
}

async function potret(page: Page, nama: string, rute: string, siapkan?: (p: Page) => Promise<void>): Promise<void> {
  try {
    await page.goto(rute, { waitUntil: 'networkidle', timeout: 90_000 });
    await siapkan?.(page);
    await page.waitForTimeout(600);
    const png = await page.screenshot({ fullPage: false });
    const kecil = await sharp(png).png({ palette: true, quality: 85, compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(DIR_GAMBAR, `${nama}.png`), kecil);
    log(`  [ OK ] ${nama}.png  ${rute}  ${(kecil.length / 1024).toFixed(0)} KB`);
  } catch (e) {
    log(`  [GAGAL] ${nama}  ${rute} — ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}

interface MenuRole {
  menu: Array<{ label: string; mode: string | null; sub: string[] }>;
}

async function catatMenu(page: Page): Promise<MenuRole> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Menu aplikasi"]');
    const utama = [...(nav?.querySelectorAll('[data-testid^="sidebar-menu-"]') ?? [])];
    return {
      menu: utama.map((el) => {
        const li = el.closest('li');
        const sub = [...(li?.querySelectorAll('ul a') ?? [])].map((a) => (a.textContent ?? '').trim());
        return { label: (el.textContent ?? '').trim(), mode: el.getAttribute('data-mode'), sub };
      }),
    };
  });
}

async function main(): Promise<number> {
  const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!conn) throw new Error('DIRECT_URL/DATABASE_URL belum diisi.');
  fs.mkdirSync(DIR_GAMBAR, { recursive: true });
  const sql = postgres(conn, { ssl: 'require', max: 1, onnotice: () => {} });
  let data: DataDemo | null = null;
  let browser: Browser | null = null;
  let pulihkanNama: (() => Promise<void>) | null = null;
  let pengurusContohBaru = false;
  const menu: Record<string, MenuRole> = {};
  try {
    log('\n  Menyemai data demo panduan');
    data = await semai(sql);
    pulihkanNama = await pakaiPersona(sql);
    // Data Pengurus contoh (label "(Contoh)", NIM 980000…) — dihapus lagi di
    // akhir HANYA bila sebelumnya belum ada (DB dev sengaja menyimpannya).
    const [contoh] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pengurus WHERE nama_lengkap LIKE '% (Contoh)'`;
    pengurusContohBaru = contoh!.n === 0;
    if (pengurusContohBaru) spawnSync('npx', ['tsx', 'scripts/seed-pengurus-contoh.ts'], { cwd: AKAR, stdio: 'ignore' });
    browser = await chromium.launch();
    const d = data;

    const anon = await halaman(browser, null);
    await potret(anon, 'login', '/login');
    const anonPonsel = await halaman(browser, null, true);
    await potret(anonPonsel, 'login-ponsel', '/login');

    const roles: Array<[string, AkunUji]> = [
      ['admin', AKUN.admin],
      ['ketua', AKUN.aktif],
      ['wakil', AKUN.wakil],
      ['sekum', AKUN.sekum],
      ['bendum', AKUN.bendum],
      ['kadept', AKUN.kadept],
      ['anggota', AKUN.anggota],
      ['bph', AKUN.bacaSaja],
    ];
    for (const [role, akun] of roles) {
      const page = await halaman(browser, akun);
      await page.goto('/', { waitUntil: 'networkidle' });
      menu[role] = await catatMenu(page);
      // Master Gantt sama untuk semua role; cukup dipotret untuk panduan yang memakainya.
      if (['admin', 'ketua', 'wakil', 'kadept', 'bph'].includes(role)) await potret(page, `beranda-${role}`, '/');
      await potret(page, `dashboard-${role}`, '/', async (p) => {
        await p.getByTestId('dashboard').scrollIntoViewIfNeeded();
        await p.evaluate(() => document.querySelector('[data-testid="dashboard"]')?.scrollIntoView({ block: 'start' }));
      });

      switch (role) {
        case 'admin':
          await potret(page, 'admin-pengguna', '/admin/pengguna');
          await potret(page, 'admin-periode', '/admin/periode');
          await potret(page, 'admin-backup', '/admin/backup');
          await potret(page, 'admin-audit', '/admin/audit');
          break;
        case 'ketua':
          await potret(page, 'proker-approval', '/proker/approval');
          await potret(page, 'proker-approval-detail', `/proker/approval/${d.prokerMenunggu}`);
          await potret(page, 'surat-approval', '/surat/approval');
          await potret(page, 'profil', '/profil');
          break;
        case 'wakil':
          await potret(page, 'proker-daftar', '/proker');
          break;
        case 'sekum':
          await potret(page, 'surat-baru', '/surat/baru?jenis=PEMINJAMAN_RUANGAN', async (p) => {
            await p.getByTestId('surat-field-perihal').fill('Permohonan Peminjaman Auditorium FT').catch(() => {});
            await p.getByTestId('surat-dinamis-ruangan').fill('Auditorium Fakultas Teknik').catch(() => {});
            await p.evaluate(() => window.scrollTo(0, 0));
          });
          await potret(page, 'surat-arsip', '/surat');
          await potret(page, 'notulensi', '/sekretariat/notulensi');
          await potret(page, 'pengurus', '/sekretariat/pengurus');
          await potret(page, 'ruangan', '/sekretariat/ruangan');
          await potret(page, 'acara-tor', `/acara/${d.acaraId}?tab=tor`);
          await potret(page, 'acara-ruang', `/acara/${d.acaraId}`);
          await potret(page, 'gantt-acara', `/gantt/${d.chartId}`);
          break;
        case 'bendum':
          await potret(page, 'nota-verifikasi', '/keuangan/nota/verifikasi');
          await potret(page, 'acara-rab', `/acara/${d.acaraId}?tab=rab`);
          await potret(page, 'acara-lpj', `/acara/${d.acaraId}?tab=lpj`);
          break;
        case 'kadept':
          await potret(page, 'proker-baru', '/proker/baru');
          await potret(page, 'proker-kalender', '/proker/kalender');
          await potret(page, 'gantt-departemen', '/departemen/KAD/gantt');
          await potret(page, 'kanban', '/departemen/KAD/kanban');
          await potret(page, 'kendala', '/departemen/KAD/kendala');
          break;
        case 'anggota': {
          await potret(page, 'divisi-ruang', `/acara/${d.acaraId}/divisi/${d.divisiKonsumsi}`);
          const hp = await halaman(browser, akun, true);
          await potret(hp, 'nota-upload-ponsel', '/keuangan/nota/upload');
          await potret(hp, 'nota-saya-ponsel', '/keuangan/nota');
          await potret(hp, 'kanban-ponsel', '/departemen/KAD/kanban');
          await hp.context().close();
          break;
        }
        case 'bph':
          await potret(page, 'bph-audit', '/admin/audit');
          await potret(page, 'acara-daftar', '/acara');
          break;
      }
      await page.context().close();
    }
    await anon.context().close();
    await anonPonsel.context().close();
  } finally {
    await browser?.close();
    await pulihkanNama?.();
    if (pengurusContohBaru && !SIMPAN_DATA) {
      spawnSync('npx', ['tsx', 'scripts/seed-pengurus-contoh.ts', '--hapus'], { cwd: AKAR, stdio: 'ignore' });
    }
    if (data && !SIMPAN_DATA) {
      await bersihkan(sql, data.kunciBerkas);
      log('\n  Data demo dibersihkan.');
    }
    await sql.end();
  }
  if (BERKAS_MENU) fs.writeFileSync(path.resolve(BERKAS_MENU), JSON.stringify(menu, null, 2));
  return 0;
}

main().then(
  (kode) => process.exit(kode),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
