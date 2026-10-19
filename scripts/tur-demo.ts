/**
 * tur-demo — memotret layar aplikasi yang sudah terisi `seed-demo` untuk
 * memeriksa SEMUA fitur tampil berisi (bukan kosong) dari sudut pandang
 * peran yang tepat. Hasil: PNG di folder keluaran + `indeks.json`.
 *
 *   npm run dev
 *   npx tsx scripts/tur-demo.ts [--url http://localhost:3000] [--keluar <folder>]
 *
 * Masuk lewat formulir login sungguhan dengan akun demo
 * (`<kunci>@demo.hmif.test` / DemoHMIF2026).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';
import sharp from 'sharp';

import { DOMAIN_DEMO, PASSWORD_DEMO, log, muatEnv } from './demo/konfig';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (nama: string, bawaan: string): string => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : bawaan;
};

interface Langkah {
  berkas: string;
  judul: string;
  peran: string;
  persona: string;
  rute: string;
  catatan: string;
  tunggu?: string;
  aksi?: (p: Page) => Promise<void>;
}

let ipKe = 1;
async function masuk(browser: Browser, baseUrl: string, kunci: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    extraHTTPHeaders: { 'x-forwarded-for': `10.77.${Math.floor(Date.now() / 1000) % 250}.${ipKe++ % 250}` },
  });
  const page = await ctx.newPage();
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(`${kunci}@${DOMAIN_DEMO}`);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_DEMO);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90_000 });
  return page;
}

async function main(): Promise<number> {
  const env = muatEnv();
  Object.assign(process.env, env);
  const baseUrl = arg('--url', env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const keluar = arg('--keluar', path.join(os.tmpdir(), 'hmif-tur-demo'));
  fs.mkdirSync(keluar, { recursive: true });

  const sql = postgres((env.DIRECT_URL || env.DATABASE_URL)!, { ssl: 'require', max: 1, onnotice: () => {} });
  const satu = async (q: Promise<Array<{ id: string }>>): Promise<string> => {
    const [r] = await q;
    if (!r) throw new Error('Data demo belum ada — jalankan: npm run seed:demo');
    return r.id;
  };
  const kid = (nama: string) => satu(sql`SELECT id::text FROM kepanitiaan WHERE nama_acara ILIKE ${nama + '%'} LIMIT 1`);
  const sync = await kid('SYNCHRONIZE');
  const dies = await kid('Dies Natalis');
  const lkmm = await kid('Latihan Kepemimpinan');
  const divisiSync = await satu(sql`SELECT id::text FROM divisi WHERE kepanitiaan_id = ${sync}::uuid AND nama = 'Konsumsi' LIMIT 1`);
  const prokerSync = await satu(sql`SELECT id::text FROM proker WHERE nama LIKE 'SYNCHRONIZE%' LIMIT 1`);
  const prokerMenunggu = await satu(sql`SELECT id::text FROM proker WHERE status = 'MENUNGGU_APPROVAL' AND nama LIKE 'Informatics Cup%' LIMIT 1`);
  const suratTerbit = await satu(sql`SELECT id::text FROM surat WHERE status = 'TERBIT' AND perihal LIKE 'Permohonan Sponsorship%' LIMIT 1`);
  const notulensi = await satu(sql`SELECT id::text FROM notulensi WHERE judul LIKE 'Rapat Evaluasi Dies%' LIMIT 1`);
  const kendala = await satu(sql`SELECT id::text FROM kendala WHERE judul LIKE 'Pembicara sesi 2%' LIMIT 1`);
  const chartSync = await satu(sql`SELECT g.id::text FROM gantt_chart g JOIN kepanitiaan k ON k.id = g.kepanitiaan_id WHERE k.id = ${sync}::uuid LIMIT 1`).catch(() => '');
  await sql.end();

  const L: Langkah[] = [
    { berkas: '01-dashboard-ketua', judul: 'Dashboard Ketua', peran: 'Ketua HMIF', persona: 'ketua', rute: '/', catatan: 'Ringkasan proker, deadline, approval tertunda, kendala kritis.' },
    { berkas: '02-proker-daftar', judul: 'Daftar Program Kerja', peran: 'Ketua HMIF', persona: 'ketua', rute: '/proker', catatan: '15 proker dengan seluruh status siklus hidup.' },
    { berkas: '03-proker-detail', judul: 'Detail Proker SYNCHRONIZE', peran: 'Ketua HMIF', persona: 'ketua', rute: `/proker/${prokerSync}`, catatan: 'Jadwal, anggaran, sumber dana, dan tautan ke kepanitiaan.' },
    { berkas: '04-approval-proker', judul: 'Antrean Approval Proker', peran: 'Ketua HMIF', persona: 'ketua', rute: `/proker/approval/${prokerMenunggu}`, catatan: 'Ketua menimbang proker yang diajukan Kadept.' },
    { berkas: '05-kalender', judul: 'Kalender Kegiatan', peran: 'Ketua HMIF', persona: 'ketua', rute: '/proker/kalender', catatan: 'Seluruh proker berjadwal dan berkala dalam satu kalender.' },
    { berkas: '06-master-gantt', judul: 'Master Gantt', peran: 'Ketua HMIF', persona: 'ketua', rute: '/proker/gantt', catatan: 'Garis waktu gabungan semua departemen dan acara.' },
    { berkas: '07-acara-daftar', judul: 'Daftar Acara', peran: 'Ketua HMIF', persona: 'ketua', rute: '/acara', catatan: 'Empat acara besar dengan kepanitiaan.' },
    { berkas: '08-acara-sync', judul: 'Acara SYNCHRONIZE 2026', peran: 'Ketua HMIF', persona: 'ketua', rute: `/acara/${sync}`, catatan: 'Panitia, divisi, RAB, pemasukan, peserta, dan Gantt acara.' },
    { berkas: '09-divisi-rab', judul: 'Divisi Konsumsi — RAB dan Nota', peran: 'Bendum', persona: 'bendum', rute: `/acara/${sync}/divisi/${divisiSync}`, catatan: 'Item RAB, realisasi, dan nota terverifikasi per divisi.' },
    { berkas: '10-tor', judul: 'TOR SYNCHRONIZE', peran: 'Ketua Pelaksana', persona: 'eks1', rute: `/acara/${sync}/tor`, catatan: 'Empat belas bagian TOR, rundown, anggaran tertarik dari RAB.' },
    { berkas: '11-proposal', judul: 'Proposal SYNCHRONIZE', peran: 'Ketua Pelaksana', persona: 'eks1', rute: `/acara/${sync}/proposal`, catatan: 'Isi otomatis dari TOR/proker/panitia, lembar pengesahan, DOCX.' },
    { berkas: '12-lpj-final', judul: 'LPJ Dies Natalis (FINAL)', peran: 'Bendum', persona: 'bendum', rute: `/acara/${dies}/lpj`, catatan: 'LPJ disetujui Bendum dan Ketua; RAB berstatus Selesai.' },
    { berkas: '13-acara-lkmm', judul: 'Acara LKMM-PD', peran: 'Ketua HMIF', persona: 'ketua', rute: `/acara/${lkmm}`, catatan: 'RAB berstatus Diajukan menunggu Bendum.' },
    { berkas: '14-nota-bendum', judul: 'Verifikasi Nota', peran: 'Bendum', persona: 'bendum', rute: '/keuangan/nota/verifikasi', catatan: 'Foto struk, alokasi ke RAB, setujui / tolak / minta perbaikan.' },
    { berkas: '15-nota-daftar', judul: 'Daftar Nota', peran: 'Bendum', persona: 'bendum', rute: '/keuangan/nota', catatan: 'Nota terverifikasi, menunggu, ditolak, dan perlu perbaikan.' },
    { berkas: '16-surat-arsip', judul: 'Arsip Surat', peran: 'Sekum', persona: 'sekum', rute: '/surat', catatan: 'Surat bernomor, draf, ditolak, dan dibatalkan.' },
    { berkas: '17-surat-approval', judul: 'Approval Surat', peran: 'Ketua HMIF', persona: 'ketua', rute: '/surat/approval', catatan: 'Surat menunggu tanda tangan Ketua.' },
    { berkas: '18-surat-detail', judul: 'Detail Surat Terbit', peran: 'Sekum', persona: 'sekum', rute: `/surat/${suratTerbit}`, catatan: 'Nomor surat, pratinjau, unduh DOCX, riwayat persetujuan.' },
    { berkas: '19-surat-massal', judul: 'Surat Massal', peran: 'Sekum', persona: 'sekum', rute: '/surat/massal', catatan: 'Surat Keterangan Aktif satu batch.' },
    { berkas: '20-notulensi-daftar', judul: 'Notulensi', peran: 'Sekum', persona: 'sekum', rute: '/sekretariat/notulensi', catatan: 'Notulensi Himpunan dan Departemen.' },
    { berkas: '21-notulensi-detail', judul: 'Detail Notulensi', peran: 'Ketua HMIF', persona: 'ketua', rute: `/sekretariat/notulensi/${notulensi}`, catatan: 'Daftar hadir, keputusan, action item → kartu Kanban.' },
    { berkas: '22-data-pengurus', judul: 'Data Pengurus', peran: 'Sekum', persona: 'sekum', rute: '/sekretariat/pengurus', catatan: '41 pengurus, termasuk yang belum punya akun.' },
    { berkas: '23-ruangan', judul: 'Peminjaman Ruangan', peran: 'Sekum', persona: 'sekum', rute: '/sekretariat/ruangan', catatan: 'Ruangan, jadwal peminjaman, deteksi bentrok.' },
    { berkas: '24-kanban', judul: 'Kanban Departemen Eksternal', peran: 'Kadept Eksternal', persona: 'kadept.eks', rute: '/departemen/EKS/kanban', catatan: 'Kartu di empat kolom, checklist, dan tenggat.' },
    { berkas: '25-kendala-daftar', judul: 'Kendala Departemen', peran: 'Kadept Eksternal', persona: 'kadept.eks', rute: '/departemen/EKS/kendala', catatan: 'Kendala dengan prioritas dan status.' },
    { berkas: '26-kendala-detail', judul: 'Detail Kendala + Diskusi', peran: 'Kadept Eksternal', persona: 'kadept.eks', rute: `/departemen/kendala/${kendala}`, catatan: 'Utas balasan berulir dengan @mention.' },
    { berkas: '27-gantt-departemen', judul: 'Gantt Departemen', peran: 'Kadept Eksternal', persona: 'kadept.eks', rute: '/departemen/EKS/gantt', catatan: 'Timeline departemen dengan progres.' },
    { berkas: '28-dashboard-anggota', judul: 'Dashboard Anggota', peran: 'Anggota Eksternal', persona: 'eks2', rute: '/', catatan: 'Tampilan yang dipersempit sesuai peran.' },
    { berkas: '29-admin-pengguna', judul: 'Admin — Pengguna', peran: 'Admin', persona: 'admin', rute: '/admin/pengguna', catatan: '30 akun demo dengan role periode aktif.' },
    { berkas: '30-admin-audit', judul: 'Admin — Audit Log', peran: 'Admin', persona: 'admin', rute: '/admin/audit', catatan: 'Jejak seluruh mutasi (append-only).' },
    { berkas: '31-admin-backup', judul: 'Admin — Backup', peran: 'Admin', persona: 'admin', rute: '/admin/backup', catatan: 'Backup manual berhasil dengan bundel Excel + berkas.' },
    { berkas: '32-admin-periode', judul: 'Admin — Periode', peran: 'Admin', persona: 'admin', rute: '/admin/periode', catatan: 'Periode aktif dan arsip.' },
  ];
  void chartSync;

  const browser = await chromium.launch();
  const sesi = new Map<string, Page>();
  const indeks: Array<Omit<Langkah, 'aksi'> & { ukuranKb: number; status: 'ok' | 'gagal'; pesan?: string }> = [];
  try {
    for (const l of L) {
      let page = sesi.get(l.persona);
      if (!page) {
        page = await masuk(browser, baseUrl, l.persona);
        sesi.set(l.persona, page);
      }
      try {
        await page.goto(l.rute, { waitUntil: 'networkidle', timeout: 120_000 });
        await l.aksi?.(page);
        // Komponen klien memuat datanya sendiri (kalender, Gantt, dsb.) — tunggu sampai selesai.
        await page.waitForFunction(() => !/Memuat/.test(document.body.innerText), null, { timeout: 25_000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        const png = await page.screenshot({ fullPage: true });
        const meta = await sharp(png).metadata();
        const potong = (meta.height ?? 0) > 2600 ? sharp(png).extract({ left: 0, top: 0, width: meta.width!, height: 2600 }) : sharp(png);
        const jpg = await potong.jpeg({ quality: 72, mozjpeg: true }).toBuffer();
        fs.writeFileSync(path.join(keluar, `${l.berkas}.jpg`), jpg);
        const { aksi: _a, ...tanpaAksi } = l;
        void _a;
        indeks.push({ ...tanpaAksi, ukuranKb: Math.round(jpg.length / 1024), status: 'ok' });
        log(`  [ OK ] ${l.berkas}  ${l.rute}  ${(jpg.length / 1024).toFixed(0)} KB`);
      } catch (e) {
        const pesan = e instanceof Error ? e.message.split('\n')[0]! : String(e);
        const { aksi: _a, ...tanpaAksi } = l;
        void _a;
        indeks.push({ ...tanpaAksi, ukuranKb: 0, status: 'gagal', pesan });
        log(`  [GAGAL] ${l.berkas}  ${l.rute} — ${pesan}`);
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(keluar, 'indeks.json'), JSON.stringify(indeks, null, 2));
  log(`\n  ${indeks.filter((i) => i.status === 'ok').length}/${indeks.length} halaman dipotret → ${keluar}\n`);
  return indeks.every((i) => i.status === 'ok') ? 0 : 1;
}

main().then(
  (k) => process.exit(k),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
