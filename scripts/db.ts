/**
 * db — menjalankan migrasi database secara berurutan dan terlacak.
 *
 *   npm run db:migrate     terapkan migrasi yang belum diterapkan
 *   npm run db:reset       hapus schema public, lalu terapkan seluruh migrasi dari nol
 *   npm run db:status      lihat migrasi mana yang sudah diterapkan
 *
 * Tiga hal yang dijaga skrip ini:
 *
 *   1. URUTAN. Berkas dijalankan urut nama, dan urutan itu mengikat
 *      (ADR-005: 005_kepanitiaan wajib sebelum 006_gantt, karena gantt_chart
 *      punya foreign key ke divisi dan kepanitiaan).
 *
 *   2. CHECKSUM. Migrasi yang sudah diterapkan lalu diubah isinya akan DITOLAK.
 *      Mengubah migrasi lama berarti database orang lain tidak akan pernah
 *      sama dengan database kita — kesalahan yang baru terasa berminggu-minggu
 *      kemudian dan hampir mustahil dilacak.
 *
 *   3. KESELAMATAN. `db:reset` menghapus seluruh schema public. Ia menolak jalan
 *      bila NODE_ENV=production atau bila connection string menunjuk host yang
 *      tidak dikenali sebagai lingkungan pengembangan.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-010, T-019 · AI_EXECUTION_PLAN §4, §5
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';

const AKAR = process.cwd();
const DIR_MIGRASI = path.join(AKAR, 'supabase', 'migrations');

type Perintah = 'migrate' | 'reset' | 'status';

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

function checksum(isi: string): string {
  // Normalkan akhir baris supaya checksum tidak berubah hanya karena CRLF/LF.
  return crypto.createHash('sha256').update(isi.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

function daftarMigrasi(): { nama: string; isi: string; checksum: string }[] {
  if (!fs.existsSync(DIR_MIGRASI)) return [];
  return fs
    .readdirSync(DIR_MIGRASI)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((nama) => {
      const isi = fs.readFileSync(path.join(DIR_MIGRASI, nama), 'utf8');
      return { nama, isi, checksum: checksum(isi) };
    });
}

/** `db:reset` menghapus data. Pastikan targetnya memang database pengembangan. */
function pastikanAman(conn: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('\n  DITOLAK: db:reset tidak boleh dijalankan dengan NODE_ENV=production.\n');
    process.exit(1);
  }
  if (/prod|production/i.test(conn)) {
    console.error('\n  DITOLAK: connection string mengandung kata "prod".');
    console.error('  Bila ini memang database pengembangan, ganti namanya agar tidak ambigu.\n');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const perintah = (process.argv[2] ?? 'migrate') as Perintah;
  const env = bacaEnv();
  const conn = env.DIRECT_URL || env.DATABASE_URL;

  if (!conn) {
    console.error('\n  DIRECT_URL/DATABASE_URL belum diisi. Jalankan: npm run check:env\n');
    process.exit(1);
  }

  const sql = postgres(conn, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  try {
    if (perintah === 'reset') {
      pastikanAman(conn);
      console.log('\n  db:reset — menghapus schema public dan membangun ulang dari nol\n');
      await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
      await sql.unsafe('CREATE SCHEMA public');
      // Supabase menggantungkan akses Data API pada grant ini; tanpa dikembalikan,
      // seluruh REST endpoint berhenti bekerja setelah reset.
      await sql.unsafe('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role');
      await sql.unsafe('GRANT ALL ON SCHEMA public TO postgres');
      console.log('  Schema public dibuat ulang beserta grant Supabase.');
      // btree_gist dan pg_trgm terpasang di schema public, jadi ikut terhapus.
      // Migrasi 001_extensions.sql yang mengembalikannya. Bila belum ada migrasi,
      // database sengaja dibiarkan tanpa extension supaya kondisinya jujur —
      // menyembunyikannya berarti kegagalan baru ketahuan saat migrasi anti-bentrok.
      console.log('  Extension di schema public ikut terhapus;');
      console.log('  dikembalikan oleh migrasi 001_extensions.sql.\n');
    }

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS _migrasi (
        nama       TEXT PRIMARY KEY,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        durasi_ms  INTEGER
      )
    `);

    const diterapkan = new Map<string, string>(
      (
        (await sql`SELECT nama, checksum FROM _migrasi`) as unknown as {
          nama: string;
          checksum: string;
        }[]
      ).map((r) => [r.nama, r.checksum]),
    );

    const berkas = daftarMigrasi();

    if (perintah === 'status') {
      console.log(`\n  Status migrasi — ${berkas.length} berkas\n`);
      if (!berkas.length) console.log('    (belum ada berkas migrasi)');
      for (const m of berkas) {
        const lama = diterapkan.get(m.nama);
        const tanda = !lama ? 'BELUM ' : lama === m.checksum ? 'OK    ' : 'BERUBAH';
        console.log(`    [${tanda}] ${m.nama}`);
      }
      console.log('');
      return;
    }

    // Tolak migrasi yang isinya berubah setelah diterapkan.
    const berubah = berkas.filter((m) => {
      const lama = diterapkan.get(m.nama);
      return lama !== undefined && lama !== m.checksum;
    });
    if (berubah.length) {
      console.error('\n  DITOLAK: migrasi berikut sudah diterapkan tetapi isinya berubah:\n');
      berubah.forEach((m) => console.error(`    ${m.nama}`));
      console.error('\n  Migrasi yang sudah diterapkan tidak boleh diedit. Buat berkas migrasi');
      console.error('  baru, atau jalankan `npm run db:reset` bila ini database pengembangan.\n');
      process.exit(1);
    }

    const belum = berkas.filter((m) => !diterapkan.has(m.nama));
    if (!belum.length) {
      console.log(`\n  Tidak ada migrasi baru. ${berkas.length} berkas sudah diterapkan.\n`);
      return;
    }

    console.log(`\n  Menerapkan ${belum.length} migrasi:\n`);
    for (const m of belum) {
      const mulai = Date.now();
      try {
        // Satu berkas = satu transaksi. Gagal di tengah tidak meninggalkan
        // separuh migrasi yang membuat database tidak konsisten.
        await sql.begin(async (tx) => {
          await tx.unsafe(m.isi);
          await tx`INSERT INTO _migrasi (nama, checksum, durasi_ms)
                   VALUES (${m.nama}, ${m.checksum}, ${Date.now() - mulai})`;
        });
        console.log(`    [ OK ] ${m.nama.padEnd(34)} ${Date.now() - mulai} ms`);
      } catch (err) {
        console.error(`    [GAGAL] ${m.nama}\n`);
        console.error(`      ${(err as Error).message}\n`);
        console.error('  Migrasi dihentikan. Tidak ada perubahan parsial yang tersimpan.\n');
        process.exit(1);
      }
    }
    console.log('');
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

void main();
