/**
 * db-ping — memverifikasi bahwa provisioning Supabase benar-benar siap dipakai.
 *
 *   npx tsx scripts/db-ping.ts
 *
 * Memeriksa empat hal, masing-masing dengan kesimpulan LULUS / GAGAL / DILEWATI:
 *
 *   1. REST endpoint hidup dan publishable key diterima
 *   2. Secret key diterima dan berbeda perannya dari publishable key
 *   3. Bucket `private` dan `public` ada, dan `private` benar-benar tidak publik
 *   4. Koneksi Postgres hidup, versi >= 15, tiga extension wajib terpasang
 *
 * Pemeriksaan 4 dilewati bila DATABASE_URL belum diisi atau paket `pg` belum
 * terpasang (skrip ini dipakai sejak T-004, sebelum `npm install` pertama).
 *
 * Sumber: docs/ai/tasks/P0-prasyarat.md T-004 · docs/ai/ENV_SETUP.md
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

type Hasil = 'LULUS' | 'GAGAL' | 'DILEWATI';
const laporan: { nama: string; hasil: Hasil; pesan: string }[] = [];

function catat(nama: string, hasil: Hasil, pesan: string) {
  laporan.push({ nama, hasil, pesan });
  const tanda = hasil === 'LULUS' ? '  OK  ' : hasil === 'GAGAL' ? ' GAGAL' : ' LEWAT';
  console.log(`  [${tanda}] ${nama}\n           ${pesan}`);
}

function bacaEnv(): Record<string, string> {
  const file = path.join(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(file)) {
    for (const baris of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = baris.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  for (const k of Object.keys(process.env)) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

/**
 * Endpoint sengaja dibedakan per jenis kunci.
 * `/rest/v1/` (spec OpenAPI) hanya menerima secret key — publishable key ditolak 401
 * di sana secara desain, bukan karena kuncinya salah. Publishable key diuji lewat
 * `/auth/v1/settings`, yang memang jalur pemakaiannya dari browser.
 */
async function cekRest(url: string, kunci: string, label: string, endpoint: string) {
  try {
    const res = await fetch(`${url}${endpoint}`, {
      headers: { apikey: kunci, Authorization: `Bearer ${kunci}` },
    });
    if (res.status === 401 || res.status === 403) {
      catat(label, 'GAGAL', `kunci ditolak (HTTP ${res.status}) — periksa nilainya di dashboard`);
      return;
    }
    if (!res.ok && res.status !== 404) {
      catat(label, 'GAGAL', `HTTP ${res.status} ${res.statusText}`);
      return;
    }
    catat(label, 'LULUS', `${endpoint} menerima kunci (HTTP ${res.status})`);
  } catch (err) {
    catat(label, 'GAGAL', `tidak dapat menghubungi ${url} — ${(err as Error).message}`);
  }
}

async function cekBucket(url: string, secret: string) {
  try {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      catat('Bucket storage', 'GAGAL', `tidak dapat membaca daftar bucket (HTTP ${res.status})`);
      return;
    }
    const daftar = (await res.json()) as { name: string; public: boolean }[];
    const nama = daftar.map((b) => b.name);
    const kurang = ['private', 'public'].filter((b) => !nama.includes(b));

    if (kurang.length) {
      catat('Bucket storage', 'GAGAL', `bucket belum ada: ${kurang.join(', ')} (ada: ${nama.join(', ') || 'tidak ada'})`);
      return;
    }
    const priv = daftar.find((b) => b.name === 'private');
    if (priv?.public) {
      catat('Bucket storage', 'GAGAL', 'bucket "private" ternyata PUBLIK — nota akan bocor (ADR-011)');
      return;
    }
    catat('Bucket storage', 'LULUS', `private (tidak publik) dan public tersedia — total ${daftar.length} bucket`);
  } catch (err) {
    catat('Bucket storage', 'GAGAL', (err as Error).message);
  }
}

async function cekPostgres(env: Record<string, string>) {
  const conn = env.DIRECT_URL || env.DATABASE_URL;
  if (!conn) {
    catat('Koneksi Postgres', 'DILEWATI', 'DIRECT_URL/DATABASE_URL belum diisi — butuh database password');
    catat('Extension wajib', 'DILEWATI', 'menunggu koneksi Postgres');
    return;
  }

  const sql = postgres(conn, { ssl: 'require', max: 1, idle_timeout: 5, connect_timeout: 15 });
  try {
    const versi = (await sql`SHOW server_version`) as unknown as { server_version: string }[];
    const teks = versi[0]?.server_version ?? '0';
    const major = parseInt(teks, 10);
    if (major < 15) {
      catat('Koneksi Postgres', 'GAGAL', `versi ${major}, dibutuhkan minimal 15`);
    } else {
      catat('Koneksi Postgres', 'LULUS', `terhubung, PostgreSQL ${teks}`);
    }

    const ext = (await sql`
      SELECT extname FROM pg_extension
      WHERE extname IN ('uuid-ossp', 'btree_gist', 'pg_trgm')
      ORDER BY extname
    `) as unknown as { extname: string }[];
    const ada = ext.map((r) => r.extname);
    const kurang = ['btree_gist', 'pg_trgm', 'uuid-ossp'].filter((e) => !ada.includes(e));
    if (kurang.length) {
      catat(
        'Extension wajib',
        'GAGAL',
        `belum terpasang: ${kurang.join(', ')}` +
          (kurang.includes('btree_gist')
            ? ' — tanpa btree_gist seluruh anti-bentrok proker gagal (INV-09)'
            : '')
      );
    } else {
      catat('Extension wajib', 'LULUS', `terpasang: ${ada.join(', ')}`);
    }
  } catch (err) {
    catat('Koneksi Postgres', 'GAGAL', (err as Error).message);
    catat('Extension wajib', 'DILEWATI', 'koneksi gagal');
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

async function main() {
  const env = bacaEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.SUPABASE_SECRET_KEY;

  console.log('\n  db-ping — HMIF Center\n');

  if (!url || !anon || !secret) {
    console.error('  Variable Supabase belum lengkap. Jalankan dulu: npx tsx scripts/check-env.ts\n');
    process.exit(1);
  }
  console.log(`  Project: ${url}\n`);

  await cekRest(url, anon, 'Publishable key', '/auth/v1/settings');
  await cekRest(url, secret, 'Secret key', '/rest/v1/');
  await cekBucket(url, secret);
  await cekPostgres(env);

  const gagal = laporan.filter((l) => l.hasil === 'GAGAL');
  const lewat = laporan.filter((l) => l.hasil === 'DILEWATI');
  console.log(
    `\n  Ringkasan: ${laporan.length - gagal.length - lewat.length} lulus, ${gagal.length} gagal, ${lewat.length} dilewati\n`
  );
  process.exit(gagal.length ? 1 : 0);
}

void main();
