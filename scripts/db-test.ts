/**
 * db-test — menjalankan test SQL terhadap database sungguhan.
 *
 *   npm run db:test              jalankan seluruh berkas
 *   npm run db:test -- 004       jalankan hanya berkas yang namanya memuat "004"
 *
 * Setiap berkas dijalankan di dalam transaksi yang **selalu di-ROLLBACK**,
 * apa pun hasilnya. Konsekuensinya penting: test boleh membuat tabel, menyisipkan
 * baris, dan memancing exception sesuka hati tanpa pernah mengotori data.
 *
 * Test ditulis memakai blok assert plpgsql, tanpa pgTAP:
 *
 *   DO $$
 *   BEGIN
 *     ASSERT (SELECT count(*) FROM departemen) = 6, 'harus ada 6 departemen';
 *     RAISE NOTICE 'OK: seed departemen';
 *   END $$;
 *
 * Kenapa perlu runner sendiri, bukan Vitest: aturan paling kritis di sistem ini
 * hidup di database — EXCLUDE constraint anti-bentrok, advisory lock penomoran
 * surat, policy RLS, trigger audit. Menguji semua itu lewat lapisan aplikasi
 * berarti menguji yang salah.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-010, T-036 · AI_EXECUTION_PLAN §5.1
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const AKAR = process.cwd();
const DIR_TEST = path.join(AKAR, 'supabase', 'tests');

function bacaEnv(): Record<string, string> {
  const f = path.join(AKAR, '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(f)) {
    for (const baris of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const t = baris.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  for (const k of Object.keys(process.env)) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

/** Sinyal rollback yang disengaja — bukan kegagalan test. */
const SINYAL_ROLLBACK = '__ROLLBACK_DISENGAJA__';

async function main(): Promise<void> {
  const saring = process.argv[2];
  const env = bacaEnv();
  const conn = env.DIRECT_URL || env.DATABASE_URL;

  if (!conn) {
    console.error('\n  DIRECT_URL/DATABASE_URL belum diisi. Jalankan: npm run check:env\n');
    process.exit(1);
  }

  if (!fs.existsSync(DIR_TEST)) {
    console.log('\n  Belum ada supabase/tests/. Tidak ada yang dijalankan.\n');
    return;
  }

  const berkas = fs
    .readdirSync(DIR_TEST)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !saring || f.includes(saring))
    .sort();

  if (!berkas.length) {
    console.log(
      saring
        ? `\n  Tidak ada berkas test yang cocok dengan "${saring}".\n`
        : '\n  Belum ada berkas test SQL.\n',
    );
    return;
  }

  const sql = postgres(conn, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  const catatan: string[] = [];
  let lulus = 0;
  let gagal = 0;

  console.log(`\n  db-test — ${berkas.length} berkas\n`);

  try {
    for (const nama of berkas) {
      const isi = fs.readFileSync(path.join(DIR_TEST, nama), 'utf8');
      const mulai = Date.now();
      try {
        await sql.begin(async (tx) => {
          // ==============================================================
          // KEADAAN AWAL YANG SAMA, APA PUN ISI DATABASENYA
          // ==============================================================
          // `periode_hanya_satu_aktif` mengizinkan paling banyak satu periode
          // berstatus AKTIF di seluruh database. Test yang butuh periode aktif
          // membuatnya sendiri — dan gagal bila sudah ada satu di luar sana.
          //
          // Fixture E2E memang meninggalkan satu: `seed:e2e-auth` menyiapkan
          // "Periode Uji E2E" supaya login dapat diuji, dan periode itu harus
          // tetap aktif. Akibatnya kedua gate saling meniadakan — diukur, 18
          // dari 22 berkas gagal dengan pesan yang menyebut constraint itu,
          // dan tidak satu pun menyebut fixture yang sebenarnya menjadi sebab.
          //
          // Pengarsipan di bawah ikut di-ROLLBACK bersama seluruh transaksi,
          // jadi fixture E2E tetap utuh sesudahnya. Yang berubah hanya keadaan
          // awal yang dilihat test: kosong, seperti yang memang diasumsikannya.
          await tx.unsafe(`UPDATE periode SET status = 'ARSIP' WHERE status = 'AKTIF'`);

          // NOTICE dari RAISE NOTICE dikumpulkan supaya pesan test terlihat.
          await tx.unsafe(isi);
          // Selalu batalkan: test tidak boleh meninggalkan jejak apa pun.
          throw new Error(SINYAL_ROLLBACK);
        });
        // Tidak pernah sampai sini — begin() selalu melempar sinyal rollback.
        console.log(`    [ OK ] ${nama}`);
        lulus++;
      } catch (err) {
        const pesan = (err as Error).message;
        if (pesan === SINYAL_ROLLBACK) {
          console.log(`    [ OK ] ${nama.padEnd(34)} ${Date.now() - mulai} ms`);
          lulus++;
        } else {
          console.log(`    [GAGAL] ${nama.padEnd(34)} ${Date.now() - mulai} ms`);
          catatan.push(`${nama}\n      ${pesan.split('\n')[0]}`);
          gagal++;
        }
      }
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  if (catatan.length) {
    console.log('\n  KEGAGALAN:\n');
    catatan.forEach((c) => console.log(`    ${c}`));
  }

  console.log(`\n  ${lulus} lulus, ${gagal} gagal dari ${berkas.length} berkas\n`);
  process.exit(gagal ? 1 : 0);
}

void main();
