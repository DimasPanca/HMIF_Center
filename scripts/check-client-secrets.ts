/**
 * check-client-secrets — memastikan rahasia server tidak pernah bocor ke browser.
 *
 *   npx tsx scripts/check-client-secrets.ts     (bagian dari `npm run verify`)
 *
 * AGENT_RULES K-08 melarang `SUPABASE_SECRET_KEY` diimpor di berkas ber-`"use client"`.
 * ESLint tidak bisa menegakkan ini sendiri: aturan flat config bekerja per pola
 * nama berkas, sedangkan `"use client"` adalah direktif di dalam isi berkas.
 * Pemeriksaan ini membaca isinya.
 *
 * Kenapa serius: berkas ber-`"use client"` di-bundle dan dikirim ke browser.
 * Satu referensi `process.env.SUPABASE_SECRET_KEY` di sana berarti kunci yang
 * melewati SELURUH policy RLS ikut terkirim ke setiap pengunjung.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-010 · AGENT_RULES K-08, §4 no.3
 */

import fs from 'node:fs';
import path from 'node:path';

const AKAR = process.cwd();
const DIPINDAI = ['app', 'components', 'lib', 'hooks'];

/** Nilai yang tidak boleh pernah sampai ke bundle browser. */
const RAHASIA = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', // nama lama, tetap dijaga bila ada sisa
  'CRON_SECRET',
  'GDRIVE_SERVICE_ACCOUNT_JSON',
  'DATABASE_URL',
  'DIRECT_URL',
];

/** Modul yang hanya boleh hidup di server. */
const MODUL_SERVER = ['@/lib/db', '@/lib/storage', 'postgres', '@prisma/client', 'node:fs'];

interface Temuan {
  berkas: string;
  baris: number;
  isi: string;
  sebab: string;
}

function berkasTs(dir: string, hasil: string[] = []): string[] {
  const penuh = path.join(AKAR, dir);
  if (!fs.existsSync(penuh)) return hasil;
  for (const entri of fs.readdirSync(penuh, { withFileTypes: true })) {
    const rel = path.join(dir, entri.name);
    if (entri.isDirectory()) {
      if (entri.name === 'node_modules' || entri.name === '__tests__') continue;
      berkasTs(rel, hasil);
    } else if (/\.(ts|tsx)$/.test(entri.name)) {
      hasil.push(rel);
    }
  }
  return hasil;
}

function main(): number {
  const temuan: Temuan[] = [];
  let jumlahClient = 0;

  for (const dir of DIPINDAI) {
    for (const rel of berkasTs(dir)) {
      const isi = fs.readFileSync(path.join(AKAR, rel), 'utf8');

      // Direktif harus berada di awal berkas, sebelum import apa pun.
      const awal = isi.slice(0, 400);
      if (!/^\s*(['"])use client\1/m.test(awal)) continue;
      jumlahClient++;

      const baris = isi.split(/\r?\n/);
      baris.forEach((teks, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(teks)) return; // lewati komentar

        for (const r of RAHASIA) {
          if (teks.includes(r)) {
            temuan.push({
              berkas: rel.replace(/\\/g, '/'),
              baris: i + 1,
              isi: teks.trim().slice(0, 78),
              sebab: `rahasia server "${r}" di berkas "use client"`,
            });
          }
        }
        const impor = teks.match(/from\s+['"]([^'"]+)['"]/);
        if (impor && MODUL_SERVER.some((m) => impor[1] === m || impor[1]!.startsWith(m + '/'))) {
          temuan.push({
            berkas: rel.replace(/\\/g, '/'),
            baris: i + 1,
            isi: teks.trim().slice(0, 78),
            sebab: `modul server-only "${impor[1]}" diimpor di berkas "use client"`,
          });
        }
      });
    }
  }

  console.log(`\n  check-client-secrets — ${jumlahClient} berkas "use client" dipindai`);

  if (!temuan.length) {
    console.log('  LULUS. Tidak ada rahasia server yang bocor ke sisi klien.\n');
    return 0;
  }

  console.error(`\n  PELANGGARAN (${temuan.length}):\n`);
  for (const t of temuan) {
    console.error(`    ${t.berkas}:${t.baris}`);
    console.error(`      ${t.isi}`);
    console.error(`      -> ${t.sebab}\n`);
  }
  console.error('  Berkas "use client" dikirim ke browser. Pindahkan akses rahasia ke');
  console.error('  Server Component, Route Handler, atau Server Action.\n');
  return 1;
}

process.exit(main());
