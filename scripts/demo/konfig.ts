/**
 * Konfigurasi & utilitas bersama seeder demo (scripts/seed-demo.ts).
 *
 * Seluruh tanggal dihitung RELATIF terhadap hari ini (WIB), supaya demo selalu
 * terlihat "sedang berjalan" kapan pun dijalankan: ada acara yang sudah
 * selesai, sedang berjalan, dan akan datang.
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

export const AKAR = path.resolve(import.meta.dirname, '..', '..');

export type Sql = ReturnType<typeof postgres>;

/** Kata sandi seluruh akun demo — ditampilkan di akhir proses. */
export const PASSWORD_DEMO = 'DemoHMIF2026';
export const DOMAIN_DEMO = 'demo.hmif.test';

/**
 * Penanda data demo yang TIDAK terlihat di layar (U+2063, pemisah tak terlihat)
 * di akhir `deskripsi`/`catatan`. Dipakai `--hapus` supaya hanya baris demo yang
 * dibersihkan. Sama dengan penanda scripts/tangkap-panduan.ts, tetapi dengan
 * akhiran kedua agar kedua skrip tidak saling menghapus.
 */
export const PENANDA = '⁣⁣';

export function muatEnv(): Record<string, string> {
  const hasil: Record<string, string> = {};
  const f = path.join(AKAR, '.env.local');
  if (fs.existsSync(f)) {
    for (const baris of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const t = baris.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      hasil[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) hasil[k] = v;
  return hasil;
}

export const log = (s = ''): void => {
  process.stdout.write(s + '\n');
};
export const langkah = (s: string): void => log(`\n  ── ${s}`);
export const ok = (s: string): void => log(`    [ OK ] ${s}`);
export const peringatan = (s: string): void => log(`    [PERIKSA] ${s}`);

// ---------------------------------------------------------------------------
// Tanggal
// ---------------------------------------------------------------------------

/** Hari ini menurut WIB, `YYYY-MM-DD`. */
export const HARI_INI: string = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

export function hariKe(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Tanggal `n` hari dari hari ini (negatif = lampau). */
export const dari = (n: number): string => hariKe(HARI_INI, n);

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** `Kamis, 29 Oktober 2026`. */
export function tanggalPanjang(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${NAMA_HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${NAMA_BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `29 - 30 Oktober 2026` (atau satu hari). */
export function rentangPanjang(mulai: string, selesai: string): string {
  if (mulai === selesai) return tanggalPanjang(mulai);
  const a = new Date(`${mulai}T00:00:00Z`);
  const b = new Date(`${selesai}T00:00:00Z`);
  const bulanSama = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return bulanSama
    ? `${NAMA_HARI[a.getUTCDay()]} - ${NAMA_HARI[b.getUTCDay()]}, ${a.getUTCDate()} - ${b.getUTCDate()} ${NAMA_BULAN[b.getUTCMonth()]} ${b.getUTCFullYear()}`
    : `${tanggalPanjang(mulai)} - ${tanggalPanjang(selesai)}`;
}

export const tidur = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Atribusi audit untuk penulisan SQL langsung
// ---------------------------------------------------------------------------

/**
 * Menjalankan `fn` dalam transaksi yang menyetel `app.user_id` dst., persis
 * seperti `withAuditContext` — supaya baris audit hasil seed SQL punya pelaku
 * (INV-07) dan jejaknya terbaca di halaman Audit Log.
 */
export async function sebagai<T>(sql: Sql, userId: string | null, periodeId: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_id', ${userId ?? ''}, true)`;
    await tx`SELECT set_config('app.periode_id', ${periodeId}, true)`;
    await tx`SELECT set_config('app.user_agent', 'seed-demo', true)`;
    await tx`SELECT set_config('app.ip', '127.0.0.1', true)`;
    return fn(tx as unknown as Sql);
  })) as T;
}
