/**
 * check-lazy-env — memastikan tidak ada modul yang membaca environment
 * variable saat DIMUAT, bukan saat dipakai.
 *
 *   npx tsx scripts/check-lazy-env.ts
 *
 * ===========================================================================
 * INI MENGGANTIKAN JARING PENGAMAN YANG HILANG
 * ===========================================================================
 * Sampai 2026-09-04, worktree lane ui sengaja TIDAK memegang kredensial penuh —
 * tidak ada `DATABASE_URL`, tidak ada `SUPABASE_SECRET_KEY`. Itu bukan sekadar
 * hak minimum: ia menjadi detektor.
 *
 * Pola bug yang sama tertangkap TIGA kali karenanya — `lib/storage/index.ts`,
 * `lib/storage/supabase-adapter.ts`, dan `lib/db/client.ts` masing-masing
 * pernah membaca env di tingkat modul. Gejalanya selalu sama dan selalu
 * membingungkan: lane ui gagal bahkan untuk test yang tidak menyentuh
 * kredensial sama sekali, dan build Vercel ikut gagal dengan pesan yang
 * menunjuk ke dalam node_modules.
 *
 * Sebabnya: `next build` dan Vitest mengevaluasi modul yang diimpor. Satu
 * `const url = process.env.DATABASE_URL!` di tingkat modul membuat SELURUH
 * berkas yang mengimpornya — walau hanya untuk tipe — meledak di lingkungan
 * yang env-nya belum lengkap.
 *
 * Sejak kedua worktree memegang kredensial penuh, detektor itu HILANG. Bug
 * yang sama akan lolos sampai deploy. Skrip ini menggantikannya: ia mengosongkan
 * environment, lalu mengimpor setiap modul server di `lib/` satu per satu.
 *
 * Yang benar akan diam saja — kegagalannya baru muncul saat fungsinya dipanggil,
 * dan di situ pesannya menyebut nama variabelnya (lihat `buatKlien()` di
 * lib/db/client.ts). Yang salah melempar saat diimpor, dan skrip ini menyebut
 * berkasnya.
 *
 * Sumber: AGENT_RULES K-13 · HANDOFF-DATA §4.4 · lib/db/client.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = process.cwd();
const DIR = path.join(AKAR, 'lib');

/**
 * Variabel yang dikosongkan.
 *
 * Bukan seluruh `process.env`: mengosongkan PATH dan NODE_ENV membuat Node
 * sendiri berperilaku aneh, dan kegagalan yang muncul tidak ada hubungannya
 * dengan yang sedang dicari. Yang dikosongkan hanya yang memang rahasia atau
 * memang berbeda antar-lingkungan.
 */
const DIKOSONGKAN = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'STORAGE_DRIVER',
  'STORAGE_BUCKET_PRIVATE',
  'STORAGE_BUCKET_PUBLIC',
  'GDRIVE_ENABLED',
  'GDRIVE_SERVICE_ACCOUNT_JSON',
  'GDRIVE_BACKUP_FOLDER_ID',
  'PDF_ENABLED',
  'GOTENBERG_URL',
  'SOFFICE_PATH',
  'NEXT_PUBLIC_APP_URL',
  'CRON_SECRET',
  'SCHEMA_VERSION',
  'MAX_UPLOAD_BYTES',
];

/** Berkas TypeScript di bawah `lib/`, kecuali test dan komponen klien. */
function modulServer(dir: string): string[] {
  const keluar: string[] = [];

  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const jalur = path.join(dir, entri.name);

    if (entri.isDirectory()) {
      if (entri.name === '__tests__') continue;
      keluar.push(...modulServer(jalur));
      continue;
    }

    if (!entri.name.endsWith('.ts') && !entri.name.endsWith('.tsx')) continue;
    if (entri.name.endsWith('.test.ts') || entri.name.endsWith('.test.tsx')) continue;

    // Komponen klien dilewati: mengimpornya di Node menyeret React DOM dan
    // gagal karena alasan yang sama sekali bukan urusan skrip ini.
    const isi = fs.readFileSync(jalur, 'utf8');
    if (/^\s*['"]use client['"]/m.test(isi.slice(0, 200))) continue;

    keluar.push(jalur);
  }

  return keluar;
}

async function main(): Promise<void> {
  if (!fs.existsSync(DIR)) {
    console.log('\n  Tidak ada lib/. Tidak ada yang diperiksa.\n');
    return;
  }

  const disimpan = new Map<string, string | undefined>();
  for (const k of DIKOSONGKAN) {
    disimpan.set(k, process.env[k]);
    delete process.env[k];
  }

  const berkas = modulServer(DIR).sort();
  const gagal: { berkas: string; pesan: string }[] = [];

  console.log(`\n  check-lazy-env — ${berkas.length} modul server di lib/`);
  console.log(`  ${DIKOSONGKAN.length} environment variable dikosongkan\n`);

  try {
    for (const f of berkas) {
      const relatif = path.relative(AKAR, f).replace(/\\/g, '/');
      try {
        await import(pathToFileURL(f).href);
      } catch (e) {
        const pesan = (e as Error).message.split('\n')[0] ?? String(e);

        // Modul yang memang menolak dimuat di luar server bukan pelanggaran —
        // itu penjaga yang disengaja (lihat kepala lib/db/client.ts). Yang
        // dicari adalah modul yang MENUNTUT nilai env saat dimuat.
        if (/server-only|tidak boleh diimpor dari sisi klien/i.test(pesan)) continue;

        gagal.push({ berkas: relatif, pesan });
      }
    }
  } finally {
    for (const [k, v] of disimpan) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  if (!gagal.length) {
    console.log(`  [ OK ] Seluruh ${berkas.length} modul dapat dimuat tanpa kredensial.\n`);
    return;
  }

  console.log(`  PELANGGARAN (${gagal.length}):\n`);
  for (const g of gagal) {
    console.log(`    ${g.berkas}`);
    console.log(`      ${g.pesan}\n`);
  }
  console.log('  Modul di atas membaca environment saat DIMUAT, bukan saat dipakai.');
  console.log('  Akibatnya `next build` gagal di lingkungan yang env-nya belum lengkap,');
  console.log('  dengan pesan yang menunjuk ke dalam node_modules.');
  console.log('');
  console.log('  Perbaikannya: pindahkan pembacaan env ke DALAM fungsi. Pola yang sudah');
  console.log('  dipakai ada di lib/db/client.ts — Proxy yang membuat klien saat method');
  console.log('  pertama dipanggil, dan tetap gagal keras menyebut nama variabelnya.\n');

  process.exit(1);
}

void main();
