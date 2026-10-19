/**
 * seed-demo — mengisi aplikasi dengan data demo yang lengkap supaya SEMUA fitur
 * dapat dilihat berjalan: 30 pengurus berakun, 15 proker (semua status), empat
 * acara besar dengan kepanitiaan/RAB/Gantt/nota, surat terbit (DOCX), TOR,
 * proposal, LPJ final, notulensi, Kanban, kendala, peminjaman ruangan, backup.
 *
 *   npm run dev            # atau: npm run build && npm start
 *   npm run seed:demo      # server HARUS berjalan; butuh .env.local lengkap
 *
 *   npx tsx scripts/seed-demo.ts --hapus       bersihkan seluruh data demo
 *   npx tsx scripts/seed-demo.ts --url http://localhost:3000
 *
 * Prasyarat: `npm run db:reset` (atau migrasi terkini), `npm run seed:e2e-auth`
 * (membuat periode aktif), dan `npx tsx scripts/upload-templates.ts` (template
 * surat/LPJ/TOR). Seeder TIDAK membuat periode — ia memakai periode AKTIF.
 *
 * Cara kerjanya: data biasa ditulis lewat SQL (dengan atribusi audit), sedangkan
 * alur bermesin status dan pembuat berkas — wizard & approval proker, status
 * RAB, verifikasi nota, penomoran & DOCX surat, TOR, proposal, LPJ, notulensi,
 * backup — dijalankan lewat API sungguhan sebagai pengguna demo. Jadi yang
 * Anda lihat adalah hasil kode produksi yang sama dengan yang dipakai UI.
 *
 * Seluruh tanggal relatif terhadap hari ini. AMAN dijalankan hanya pada DB
 * pengembangan: menolak NODE_ENV=production, dan membuat akun berkata sandi
 * yang diketahui umum.
 */

import fs from 'node:fs';
import path from 'node:path';

import postgres from 'postgres';

import { bacaLatar, buatAkun, isiDataPengurus } from './demo/akun';
import { isiAcara } from './demo/acara';
import { isiDokumen } from './demo/dokumen';
import { isiKanban, isiKanbanDivisi, isiKendala, isiRuangan, jalankanBackup, jalankanCron } from './demo/lain';
import { isiNotulensi } from './demo/notulensi';
import { hapusDemo } from './demo/hapus';
import { isiNota } from './demo/nota';
import { Sesi } from './demo/klien';
import { AKAR, DOMAIN_DEMO, PASSWORD_DEMO, langkah, log, muatEnv, ok, type Sql } from './demo/konfig';
import { jalankanProker, pulihkanProker } from './demo/proker';
import { isiSurat, unggahTandaTangan } from './demo/surat';
import { ROSTER, emailDemo } from './demo/roster';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (nama: string, bawaan: string): string => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : bawaan;
};

async function main(): Promise<number> {
  const env = muatEnv();
  Object.assign(process.env, env);

  if (env.NODE_ENV === 'production') {
    log('\n  Menolak berjalan dengan NODE_ENV=production.\n');
    return 1;
  }
  const baseUrl = arg('--url', env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const koneksi = env.DIRECT_URL || env.DATABASE_URL;
  if (!koneksi) throw new Error('DIRECT_URL/DATABASE_URL belum diisi. Jalankan: npm run check:env');

  const sql: Sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  const sesi = new Map<string, Sesi>();
  try {
    log('');
    log('  seed-demo — data demo lengkap HMIF Center');
    log(`  Server : ${baseUrl}`);

    try {
      const r = await fetch(`${baseUrl}/api/dashboard`, { signal: AbortSignal.timeout(8000) });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      log(`\n  Server tidak menjawab di ${baseUrl} (${e instanceof Error ? e.message : String(e)}).`);
      log('  Jalankan dulu: npm run dev   (atau npm run build && npm start)\n');
      return 1;
    }

    const latar = await bacaLatar(sql);

    if (argv.includes('--hapus')) {
      langkah('Membersihkan data demo');
      await hapusDemo(sql);
      log('');
      return 0;
    }

    // --hanya surat,nota,...  menjalankan ulang fase tertentu di atas data demo yang sudah ada.
    const hanya = new Set(arg('--hanya', '').split(',').filter(Boolean));
    const fase = (nama: string) => hanya.size === 0 || hanya.has(nama);

    if (hanya.size === 0) {
      const [ada] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM proker p JOIN app_user u ON u.id = p.dibuat_oleh WHERE u.email LIKE ${'%@' + DOMAIN_DEMO}`;
      if (ada!.n > 0) {
        log(`\n  Data demo sudah ada (${ada!.n} proker). Bersihkan dulu: npx tsx scripts/seed-demo.ts --hapus\n`);
        return 1;
      }
    }

    langkah('Akun & Data Pengurus');
    const akun = await buatAkun(sql, env, latar);
    if (hanya.size === 0) await isiDataPengurus(sql, latar, akun);

    langkah('Masuk sebagai seluruh pengguna demo');
    for (const o of ROSTER) {
      sesi.set(o.kunci, await Sesi.masuk(baseUrl, o.kunci, emailDemo(o.kunci, DOMAIN_DEMO)));
    }
    ok(`${sesi.size} sesi aktif`);

    const proker = hanya.size === 0 ? await jalankanProker(sql, sesi, latar, akun) : await pulihkanProker(sql);
    ok(`${proker.size} proker`);

    if (fase('acara')) await isiAcara(sql, sesi, akun, latar, proker);

    if (fase('nota')) {
      langkah('Nota belanja: unggah foto, verifikasi Bendahara');
      await isiNota(sql, sesi, akun, proker);
    }

    if (fase('surat')) {
      langkah('Surat: tanda tangan, approval, penomoran, DOCX, batch');
      await unggahTandaTangan(sesi.get('ketua')!);
      await isiSurat(sql, sesi, akun, latar);
    }

    if (fase('dokumen')) await isiDokumen(sql, sesi, akun, proker);

    if (fase('notulensi')) {
      langkah('Notulensi → Kanban');
      await isiNotulensi(sesi, akun, latar);
    }
    if (fase('kanban')) {
      langkah('Kanban per departemen');
      await isiKanban(sesi, akun, latar, proker);
      await isiKanbanDivisi(sql, akun, latar, proker);
    }
    if (fase('kendala')) {
      langkah('Kendala');
      await isiKendala(sesi, akun, latar, proker);
    }
    if (fase('ruangan')) {
      langkah('Ruangan & peminjaman');
      await isiRuangan(sql, sesi);
    }
    if (fase('sistem')) {
      langkah('Cron harian & backup');
      await jalankanCron(baseUrl, env.CRON_SECRET);
      await jalankanBackup(sesi);
    }

    log('');
    return 0;
  } finally {
    await Promise.allSettled([...sesi.values()].map((s) => s.tutup()));
    await sql.end();
  }
}

void path;
void fs;
void AKAR;
void PASSWORD_DEMO;
main().then(
  (k) => process.exit(k),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
