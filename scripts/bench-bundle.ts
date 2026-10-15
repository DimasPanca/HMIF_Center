/**
 * bench-bundle — ukuran JS awal satu rute dari build produksi (T-100).
 *
 *   npx tsx scripts/bench-bundle.ts -- /keuangan/nota/upload [--anggaran 250] [--tanpa-build]
 *
 * Yang dihitung: seluruh chunk `.js` yang dibutuhkan halaman itu SAAT DIMUAT —
 * chunk page + seluruh layout di atasnya (termasuk route group), menurut
 * `.next/app-build-manifest.json`. Chunk yang hanya diambil lewat `import()`
 * tidak ada di manifest itu, dan memang itulah yang ingin dibuktikan: OpenCV
 * & jscanify-loader tidak ikut sebelum kamera dibuka (SYSTEM_DESIGN §19.1¹).
 *
 * Anggaran dibandingkan dengan ukuran GZIP (yang benar-benar diunduh browser);
 * ukuran mentah ikut dilaporkan. Selain angka, skrip memeriksa bahwa tidak ada
 * chunk awal yang memuat URL skrip pemindai — penjaga langsung terhadap
 * `import` statis yang tidak sengaja.
 *
 * Membangun ke `.next` bawaan, jadi skrip MENOLAK berjalan bila ada server di
 * port 3000: `next build` yang menimpa `.next` di bawah `next dev` yang hidup
 * merusak keduanya (terukur 2026-10-15: ENOENT prerender-manifest.json).
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-100 · SYSTEM_DESIGN §19.1
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';

const AKAR = process.cwd();
const DIST = path.join(AKAR, '.next');
// URL & hash SRI hanya ada di jscanify-loader.ts. (Nama fungsi seperti `muatPemindai`
// tetap muncul di chunk pemanggil `import()`, jadi bukan penanda yang sah.)
const PENANDA_LAZY = ['cdn.jsdelivr.net/npm/jscanify', 'gIQOiZ94Y7O29uYShJN17TQm'];

const arg = process.argv.slice(2).filter((a) => a !== '--');
const rute = arg.find((a) => a.startsWith('/'));
const anggaranKb = Number(arg[arg.indexOf('--anggaran') + 1]) || 250;
const tanpaBuild = arg.includes('--tanpa-build');

if (!rute) {
  console.error('Pakai: npx tsx scripts/bench-bundle.ts -- /rute [--anggaran 250] [--tanpa-build]');
  process.exit(2);
}

function portTerpakai(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => {
      s.destroy();
      ok(true);
    });
    s.once('error', () => ok(false));
  });
}

/** `/(dashboard)/keuangan/nota/upload/page` → `/keuangan/nota/upload` */
const tanpaGrup = (k: string) => k.replace(/\/\([^)]+\)/g, '').replace(/\/page$/, '') || '/';

async function main() {
  if (!tanpaBuild) {
    if (await portTerpakai(3000)) {
      console.error('Ada server di port 3000. Hentikan `next dev` dulu — build produksi menimpa .next yang sedang dipakainya.');
      process.exit(2);
    }
    console.log('Membangun produksi (next build --no-lint)…');
    execSync('npx next build --no-lint', { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'app-build-manifest.json'), 'utf8')) as { pages: Record<string, string[]> };
  const kunciPage = Object.keys(manifest.pages).find((k) => k.endsWith('/page') && tanpaGrup(k) === rute);
  if (!kunciPage) {
    console.error(`Rute ${rute} tidak ada di app-build-manifest.json. Rute yang ada:`);
    for (const k of Object.keys(manifest.pages).filter((k) => k.endsWith('/page'))) console.error(`  ${tanpaGrup(k)}`);
    process.exit(1);
  }

  // Layout di atas page: setiap prefiks direktori page (dengan grup) yang punya `/layout`.
  const dir = kunciPage.slice(0, -'/page'.length);
  const segmen = dir.split('/').filter(Boolean);
  const kunci = [kunciPage];
  for (let i = 0; i <= segmen.length; i++) {
    const k = `/${segmen.slice(0, i).join('/')}${i ? '/' : ''}layout`;
    if (manifest.pages[k]) kunci.push(k);
  }

  const chunk = [...new Set(kunci.flatMap((k) => manifest.pages[k] ?? []))].filter((c) => c.endsWith('.js'));
  let mentah = 0;
  let gzip = 0;
  const bocor: string[] = [];
  const rinci: { chunk: string; gz: number }[] = [];
  for (const c of chunk) {
    const isi = fs.readFileSync(path.join(DIST, c));
    const gz = zlib.gzipSync(isi, { level: 9 }).byteLength;
    mentah += isi.byteLength;
    gzip += gz;
    rinci.push({ chunk: c, gz });
    const teks = isi.toString('utf8');
    if (PENANDA_LAZY.some((p) => teks.includes(p))) bocor.push(c);
  }

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`\nRute ${rute}  (${kunci.join(' + ')})`);
  for (const r of rinci.sort((a, b) => b.gz - a.gz).slice(0, 8)) console.log(`  ${kb(r.gz).padStart(9)}  ${r.chunk}`);
  console.log(`  ${chunk.length} chunk JS · mentah ${kb(mentah)} · gzip ${kb(gzip)} · anggaran ${anggaranKb} KB (gzip)`);

  let gagal = false;
  if (bocor.length) {
    console.error(`GAGAL: skrip pemindai ikut dimuat di awal lewat ${bocor.join(', ')} — harus lewat import() saat kamera dibuka.`);
    gagal = true;
  }
  if (gzip > anggaranKb * 1024) {
    console.error(`GAGAL: ${kb(gzip)} melewati anggaran ${anggaranKb} KB.`);
    gagal = true;
  }
  if (!gagal) console.log('LULUS');
  process.exit(gagal ? 1 : 0);
}

void main();
