/**
 * bench-galeri-nota — waktu muat galeri verifikasi 30 nota (T-102 kontrak 7).
 *
 *   npx tsx scripts/bench-galeri-nota.ts [--anggaran 2000] [--url http://localhost:3000]
 *
 * Membutuhkan server aplikasi yang sedang berjalan. Angka yang berarti hanya dari
 * build PRODUKSI (`next dev` menambah ±2 detik pada setiap halaman). Bila
 * `next dev` memakai port 3000, build berdampingan:
 *
 *   NEXT_DIST_DIR=.next-bench npx next build && git checkout tsconfig.json
 *   NEXT_DIST_DIR=.next-bench npx next start -p 3100
 *   npx tsx scripts/bench-galeri-nota.ts --url http://localhost:3100
 *
 * (`next build` menulis ulang tsconfig.json dengan include `.next-bench/types`;
 * pulihkan sesudahnya. Terukur 2026-10-16: median 936 ms, 0 permintaan master.)
 *
 * 1. Membuat 30 nota uji dengan 30 gambar BERBEDA (thumb/preview/master asli
 *    di storage — bukan satu URL yang di-cache browser) di satu acara uji.
 * 2. Masuk sebagai Bendahara uji, membuka /keuangan/nota/verifikasi sekali
 *    sebagai pemanasan (kompilasi rute dev tidak ikut dihitung), lalu 3 kali
 *    diukur dengan cache browser dikosongkan: navigasi → seluruh 30 kartu
 *    tampil DAN setiap thumbnail di viewport selesai dimuat (lazy loading
 *    memang menunda yang di luar layar — itulah rancangannya).
 * 3. Gagal bila median > anggaran ATAU ada satu saja permintaan berkas master.
 * 4. Membersihkan seluruh data & berkas uji.
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-102 · SYSTEM_DESIGN §9.5
 */

import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';
import sharp from 'sharp';

const AKAR = path.resolve(import.meta.dirname, '..');
const arg = (nama: string, bawaan: string) => {
  const i = process.argv.indexOf(nama);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : bawaan;
};
const ANGGARAN_MS = Number(arg('--anggaran', '2000'));
const URL_DASAR = arg('--url', process.env.E2E_BASE_URL ?? 'http://localhost:3000');
const JUMLAH = 30;

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

async function gambar(i: number) {
  const warna = { r: 200 + (i * 7) % 55, g: 190 + (i * 13) % 65, b: 170 + (i * 19) % 85 };
  const master = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: warna } })
    .composite([{ input: Buffer.from(`<svg width="1600" height="1200"><text x="100" y="300" font-size="140" fill="#222">NOTA BENCH ${i + 1}</text></svg>`) }])
    .jpeg({ quality: 90 })
    .toBuffer();
  const preview = await sharp(master).resize(1280, 960).webp({ quality: 78 }).toBuffer();
  const thumb = await sharp(master).resize(400, 300).webp({ quality: 70 }).toBuffer();
  return { master, preview, thumb };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main(): Promise<number> {
  muatEnv();
  const { storage, keys } = await import('@/lib/storage');
  const { klienLangsung } = await import('@/lib/db/connection');
  const { AKUN, PASSWORD_UJI } = await import('../e2e/fixtures/akun');
  const sql = klienLangsung();
  const kunciBerkas: string[] = [];
  const imageIds: string[] = [];
  let prokerId = '';

  try {
    // --- 1. data uji ---------------------------------------------------------
    const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
    const [u] = await sql<{ id: string; dept: string }[]>`
      SELECT u.id::text, ur.departemen_id::text AS dept FROM app_user u JOIN user_role ur ON ur.user_id = u.id
      WHERE u.email = ${AKUN.kadept.email} AND ur.periode_id = ${p!.id}::uuid AND ur.departemen_id IS NOT NULL LIMIT 1`;
    const tag = Date.now().toString().slice(-6);
    const [pr] = await sql<{ id: string }[]>`
      INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
      VALUES (${p!.id}::uuid, ${u!.dept}::uuid, ${`BENCH GALERI ${tag}`}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
        '2026-11-01', '2026-12-06', '2026-12-07', ${u!.id}::uuid) RETURNING id::text`;
    prokerId = pr!.id;
    const [k] = await sql<{ id: string }[]>`
      INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (${prokerId}::uuid, ${`BENCH GALERI ${tag}`}) RETURNING id::text`;
    const [d] = await sql<{ id: string }[]>`INSERT INTO divisi (kepanitiaan_id, nama) VALUES (${k!.id}::uuid, 'Bench') RETURNING id::text`;

    process.stdout.write(`  menyiapkan ${JUMLAH} nota dengan gambar berbeda`);
    for (let i = 0; i < JUMLAH; i++) {
      const g = await gambar(i);
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
        VALUES (${u!.id}::uuid, ${`bench-${i + 1}.jpg`}, ${uuid}, ${km}, ${kp}, ${kt}, 'image/jpeg', 'image/jpeg',
                1600, 1200, 1600, 1200, ${g.master.length}, 'DOKUMEN') RETURNING id::text`;
      imageIds.push(img!.id);
      const [n] = await sql<{ id: string }[]>`
        INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota)
        VALUES (${d!.id}::uuid, ${img!.id}::uuid, ${u!.id}::uuid, '2026-10-01', ${10000 + i}) RETURNING id::text`;
      await sql`INSERT INTO nota_alokasi (nota_id, uraian_luar_rab, nominal) VALUES (${n!.id}::uuid, 'Bench', ${10000 + i})`;
      process.stdout.write('.');
    }
    console.log(' siap');

    // --- 2. ukur ---------------------------------------------------------------
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: URL_DASAR });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(AKUN.bendum.email);
    await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
    await page.getByRole('button', { name: /masuk|login/i }).click();
    await page.waitForURL((x) => !x.pathname.startsWith('/login'), { timeout: 60_000 });

    const master: string[] = [];
    page.on('request', (r) => {
      if (/nota\/master\/|\/download/.test(r.url())) master.push(r.url());
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');

    const rincian: { ttfb: number; dcl: number; thumb: number }[] = [];
    const ukurSekali = async (): Promise<number> => {
      await cdp.send('Network.clearBrowserCache');
      const mulai = Date.now();
      await page.goto('/keuangan/nota/verifikasi', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        (n) => {
          const grup = [...document.querySelectorAll('[data-testid="antrian-grup"]')].find((g) => g.textContent?.includes('BENCH GALERI'));
          if (!grup) return false;
          const kartu = grup.querySelectorAll('[data-testid="antrian-kartu"]');
          if (kartu.length < n) return false;
          const tinggi = window.innerHeight;
          return [...grup.querySelectorAll('img')].every((img) => {
            const r = img.getBoundingClientRect();
            const diViewport = r.bottom > 0 && r.top < tinggi;
            return !diViewport || (img.complete && img.naturalWidth > 0);
          });
        },
        JUMLAH,
        { timeout: 60_000, polling: 25 },
      );
      const total = Date.now() - mulai;
      rincian.push(
        await page.evaluate(() => {
          const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const thumb = performance.getEntriesByType('resource').filter((e) => e.name.includes('nota/thumb/')).length;
          return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), thumb };
        }),
      );
      return total;
    };

    /** Pembanding: TTFB halaman dashboard lain (layout + sesi yang sama) di server yang sama. */
    const ttfbPembanding = async (): Promise<number> => {
      await page.goto('/surat', { waitUntil: 'domcontentloaded' });
      return page.evaluate(() => Math.round((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).responseStart));
    };

    await ukurSekali(); // pemanasan
    await ttfbPembanding();
    const hasil: number[] = [];
    const pembanding: number[] = [];
    for (let i = 0; i < 3; i++) {
      hasil.push(await ukurSekali());
      pembanding.push(await ttfbPembanding());
    }
    await browser.close();

    const m = median(hasil);
    console.log(`\n  galeri ${JUMLAH} nota: ${hasil.map((x) => `${x} ms`).join(' · ')} → median ${m} ms (anggaran ${ANGGARAN_MS} ms)`);
    console.log(`  rincian (server TTFB / DOMContentLoaded): ${rincian.slice(1).map((x) => `${x.ttfb}/${x.dcl} ms`).join(' · ')}`);
    console.log(`  pembanding TTFB /surat (layout + sesi saja): ${pembanding.map((x) => `${x} ms`).join(' · ')}`);
    console.log(`  thumbnail dimuat per pengukuran: ${rincian.slice(1).map((x) => x.thumb).join(' · ')} · permintaan master: ${master.length}`);
    const lulus = m <= ANGGARAN_MS && master.length === 0;
    console.log(lulus ? '  [ OK ] galeri dalam anggaran, tanpa master' : '  [GAGAL] galeri melampaui anggaran atau memuat master');
    return lulus ? 0 : 1;
  } finally {
    // --- 3. bersihkan ----------------------------------------------------------
    if (prokerId) await sql`DELETE FROM proker WHERE id = ${prokerId}::uuid`.catch(() => {});
    if (imageIds.length) await sql`DELETE FROM image WHERE id = ANY(${imageIds}::uuid[])`.catch(() => {});
    await Promise.allSettled(kunciBerkas.map((k) => storage.delete(k)));
    await sql.end();
  }
}

main().then(
  (kode) => process.exit(kode),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
