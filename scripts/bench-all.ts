/**
 * bench-all — sepuluh metrik PRD §8.1 dan anggaran bundle SYSTEM_DESIGN §19.1
 * dalam satu jalan (T-114).
 *
 *   npm run build && npm start            # WAJIB build produksi; angka dev tidak sahih
 *   npx tsx scripts/bench-all.ts [--url http://localhost:3000] [--jalan 5] [--cpu 4]
 *                                [--json hasil.json] [--hanya fcp,dashboard,...] [--simpan-data]
 *
 * ===========================================================================
 * PROFIL & DATA
 * ===========================================================================
 * Seluruh metrik browser memakai SATU profil: jaringan 4G tersimulasi lewat
 * CDP (4 Mbps turun, 3 Mbps naik, RTT 20 ms — sama dengan bench-dashboard
 * T-077) dan CPU diperlambat `--cpu` kali (bawaan 4×, perangkat kelas
 * menengah). Satu profil untuk semua supaya angka-angkanya dapat dibandingkan.
 *
 * Sebelum mengukur, skrip menyemai data realistis berpenanda `BENCH114`:
 * 60 proker (10 per departemen; 48 berjalan/disetujui → 48 bar Master Gantt,
 * 12 di antaranya TERJADWAL dan mengunci kalender lewat `setujui_proker`),
 * satu acara dengan 5 divisi, 100 item RAB, chart Gantt 100 task dalam 6 grup,
 * 50 nota bergambar sungguhan di storage (30 menunggu verifikasi), dan 500
 * surat berbagai status. Semuanya dihapus di akhir (kecuali `--simpan-data`).
 *
 * ===========================================================================
 * DEFINISI SETIAP ANGKA — dibaca bersama PERFORMANCE_REPORT.md
 * ===========================================================================
 *  1 FCP            paint `first-contentful-paint` /login, cache kosong.
 *  2 Dashboard siap navigasi beranda (cache kosong, sesi Ketua) → frame
 *                   pertama yang memuat bar Master Gantt DAN seluruh panel
 *                   dashboard tanpa skeleton. Diukur di halaman (rAF), bukan
 *                   `networkidle` yang menambah 500 ms diam.
 *  3 Master Gantt   `responseEnd` /api/gantt/master → frame pertama berisi bar.
 *                   Murni kerja klien; jaringan tidak ikut.
 *  4 Gantt 100 task navigasi klien dari indeks Gantt: max(klik, payload RSC
 *                   & chunk JS terakhir tiba) → frame pertama berisi bar.
 *  5 Cek konflik    round-trip POST /api/proker/cek-konflik dari browser (4G),
 *                   rentang yang menabrak kunci; plus EXPLAIN ANALYZE SQL.
 *  6 Pratinjau      event `input` terakhir → DOM pratinjau memuat teks baru
 *                   (debounce termasuk), sama dengan gate surat-preview.
 *  7 Pipeline       klik "Gunakan" → POST /api/images/upload dimulai: tiga
 *                   turunan dari foto 12 MP. Unggahan dibatalkan (tanpa sisa).
 *  8 Hitung RAB     event `input` harga → total acara berubah + satu frame,
 *                   pada grid 100 item.
 *  9 Galeri         navigasi verifikasi (cache kosong) → 30 kartu tampil dan
 *                   setiap thumbnail di viewport selesai dimuat.
 * 10 Scroll         interval rAF saat menggulir chart 100 task horizontal dan
 *                   vertikal; median → fps, plus persentase frame tersendat.
 *
 * Exit 0 bila semua terukur dan memenuhi target, 1 bila ada yang meleset atau
 * gagal diukur. Angka median dari `--jalan` kali (bawaan 5; galeri &
 * pipeline 3 karena mahal).
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-114 · PRD §8.1 · SYSTEM_DESIGN §19
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';
import sharp from 'sharp';

import { AKUN, PASSWORD_UJI, type AkunUji } from '../e2e/fixtures/akun';

const AKAR = path.resolve(import.meta.dirname, '..');
const PENANDA = 'BENCH114';

// ---------------------------------------------------------------------------
// Argumen & environment
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (nama: string, bawaan: string): string => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : bawaan;
};

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
muatEnv();

const URL_DASAR = arg('--url', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const JALAN = Math.max(1, Number(arg('--jalan', '5')));
const CPU = Math.max(1, Number(arg('--cpu', '4')));
const BERKAS_JSON = arg('--json', '');
const HANYA = new Set(arg('--hanya', '').split(',').filter(Boolean));
const SIMPAN_DATA = argv.includes('--simpan-data');

/** Profil 4G — setara "Fast 4G" DevTools; sama dengan scripts/bench-dashboard.ts. */
const PROFIL_4G = {
  offline: false,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (3 * 1024 * 1024) / 8,
  latency: 20,
};

const log = (s = ''): void => {
  process.stdout.write(s + '\n');
};
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const p95 = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!;
};
const bulat = (n: number): number => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Hasil
// ---------------------------------------------------------------------------

interface Hasil {
  no: number;
  kunci: string;
  metrik: string;
  target: string;
  /** Angka yang dibandingkan dengan target (median kecuali disebut lain). */
  nilai: number | null;
  satuan: 'ms' | 'fps' | 'KB';
  lulus: boolean | null;
  sampel: number[];
  rincian: string;
}

const hasil: Hasil[] = [];

function catat(h: Omit<Hasil, 'lulus'> & { lulus?: boolean | null; batas?: number; lebihBesarLebihBaik?: boolean }): void {
  const { batas, lebihBesarLebihBaik, ...isi } = h;
  const lulus =
    isi.nilai === null || batas === undefined
      ? (h.lulus ?? null)
      : lebihBesarLebihBaik
        ? isi.nilai >= batas
        : isi.nilai < batas;
  hasil.push({ ...isi, lulus });
  const angka = isi.nilai === null ? 'TIDAK TERUKUR' : `${bulat(isi.nilai)} ${isi.satuan}`;
  log(`  ${lulus === null ? '[ ?? ]' : lulus ? '[ OK ]' : '[GAGAL]'} ${isi.metrik}: ${angka} (target ${isi.target})`);
  if (isi.rincian) log(`         ${isi.rincian}`);
}

const ikut = (kunci: string): boolean => HANYA.size === 0 || HANYA.has(kunci);

// ---------------------------------------------------------------------------
// Data uji
// ---------------------------------------------------------------------------

type Sql = ReturnType<typeof postgres>;

interface DataUji {
  periodeId: string;
  acaraId: string;
  chartId: string;
  divisiAnggota: string;
  itemUkur: string;
  kunciBerkas: string[];
  rentangKonflik: { mulai: string; selesai: string };
}

const hariKe = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hariIni = (): string => new Date().toISOString().slice(0, 10);

async function idAkun(sql: Sql, a: AkunUji): Promise<string> {
  const [r] = await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${a.email}`;
  if (!r) throw new Error(`Akun ${a.email} belum ada — jalankan npm run seed:e2e-auth.`);
  return r.id;
}

/** Gambar nota berbeda-beda, ukuran turunan sama dengan pipeline sungguhan. */
async function gambarNota(i: number): Promise<{ master: Buffer; preview: Buffer; thumb: Buffer }> {
  const warna = { r: 200 + ((i * 7) % 55), g: 190 + ((i * 13) % 65), b: 170 + ((i * 19) % 85) };
  const teks = `<svg width="1600" height="1200"><text x="100" y="300" font-size="140" fill="#222">NOTA ${PENANDA} ${i + 1}</text></svg>`;
  const master = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: warna } })
    .composite([{ input: Buffer.from(teks) }])
    .jpeg({ quality: 90 })
    .toBuffer();
  const [preview, thumb] = await Promise.all([
    sharp(master).resize(1280, 960).webp({ quality: 78 }).toBuffer(),
    sharp(master).resize(400, 300).webp({ quality: 70 }).toBuffer(),
  ]);
  return { master, preview, thumb };
}

async function bersihkan(sql: Sql, kunciBerkas: string[]): Promise<void> {
  const { storage } = await import('@/lib/storage');
  const sisa = await sql<{ m: string; p: string; t: string }[]>`
    SELECT master_path AS m, preview_path AS p, thumbnail_path AS t FROM image
    WHERE original_filename LIKE ${`${PENANDA.toLowerCase()}-%`}`;
  const berkas = new Set([...kunciBerkas, ...sisa.flatMap((r) => [r.m, r.p, r.t]).filter(Boolean)]);
  await sql`DELETE FROM surat WHERE perihal LIKE ${PENANDA + ' %'}`;
  await sql`DELETE FROM proker WHERE nama LIKE ${PENANDA + ' %'}`;
  await sql`DELETE FROM image WHERE original_filename LIKE ${`${PENANDA.toLowerCase()}-%`}`;
  await Promise.allSettled([...berkas].map((k) => storage.delete(k)));
}

async function semai(sql: Sql): Promise<DataUji> {
  const { storage, keys } = await import('@/lib/storage');
  await bersihkan(sql, []);

  const [periode] = await sql<{ id: string; mulai: string }[]>`
    SELECT id::text, tanggal_mulai::text AS mulai FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  if (!periode) throw new Error('Tidak ada periode AKTIF.');
  const departemen = await sql<{ id: string; kode: string }[]>`
    SELECT id::text, kode FROM departemen WHERE is_active ORDER BY urutan LIMIT 6`;
  const [admin, ketua, kadept, anggota, sekum, bendum] = await Promise.all([
    idAkun(sql, AKUN.admin),
    idAkun(sql, AKUN.aktif),
    idAkun(sql, AKUN.kadept),
    idAkun(sql, AKUN.anggota),
    idAkun(sql, AKUN.sekum),
    idAkun(sql, AKUN.bendum),
  ]);
  const periodeId = periode.id;
  const kunciBerkas: string[] = [];

  // --- 60 proker ------------------------------------------------------------
  // Kunci kalender global per periode (EXCLUDE), jadi 12 TERJADWAL disusun
  // berurutan: persiapan 15 hari + hari-H 2 hari, berjarak 19 hari, mulai
  // seminggu dari sekarang — semuanya di jendela Master Gantt (+6 bulan).
  const awalKunci = hariKe(hariIni(), 7);
  let indeksTerjadwal = 0;
  let prokerAcara = '';
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_agent', 'bench-all', true)`;
    await tx`SELECT set_config('app.periode_id', ${periodeId}, true)`;
    for (const [di, d] of departemen.entries()) {
      for (let i = 0; i < 10; i++) {
        const nama = `${PENANDA} ${d.kode} ${String(i + 1).padStart(2, '0')}`;
        if (i < 2) {
          const mulai = hariKe(awalKunci, indeksTerjadwal++ * 19);
          const [p] = await tx<{ id: string }[]>`
            INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
              tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
              penanggung_jawab, dibuat_oleh, diajukan_at)
            VALUES (${periodeId}::uuid, ${d.id}::uuid, ${nama}, 'TERJADWAL', 'MENUNGGU_APPROVAL', '{}'::text[],
              ${mulai}::date, ${hariKe(mulai, 15)}::date, ${hariKe(mulai, 16)}::date,
              ${kadept}::uuid, ${kadept}::uuid, now())
            RETURNING id::text`;
          const [r] = await tx<{ hasil: { ok: boolean; locked?: boolean; reason?: string } }[]>`
            SELECT setujui_proker(${p!.id}::uuid, ${admin}::uuid) AS hasil`;
          if (!r?.hasil.ok || !r.hasil.locked) {
            throw new Error(`setujui_proker menolak ${nama}: ${r?.hasil.reason ?? '?'} — ada kunci lain yang beririsan?`);
          }
          if (di === 0 && i === 0) prokerAcara = p!.id;
          continue;
        }
        // 6 berkala yang disetujui/berjalan → total 8 bar per departemen;
        // 2 sisanya draft & menunggu approval (tidak tampil di Master Gantt).
        const status = i < 5 ? 'DISETUJUI' : i < 8 ? 'BERJALAN' : i === 8 ? 'DRAFT' : 'MENUNGGU_APPROVAL';
        const mulai = status === 'BERJALAN' ? hariKe(hariIni(), -20 - i) : hariKe(hariIni(), 3 + di * 9 + i * 13);
        await tx`
          INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
            tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
          VALUES (${periodeId}::uuid, ${d.id}::uuid, ${nama}, 'BERKALA', ${status}::proker_status, '{}'::text[],
            ${mulai}::date, ${hariKe(mulai, 30)}::date, ${hariKe(mulai, 31)}::date, ${kadept}::uuid)`;
      }
    }
  });

  // --- Acara: 5 divisi, 100 item RAB ------------------------------------------
  const [k] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
    VALUES (${prokerAcara}::uuid, ${`${PENANDA} Acara Utama`}, 'BENCH', ${sekum}::uuid) RETURNING id::text`;
  const acaraId = k!.id;
  await sql`INSERT INTO rab_meta (kepanitiaan_id, status) VALUES (${acaraId}::uuid, 'DRAFT')`;
  const namaDivisi = ['Konsumsi', 'Acara', 'Perlengkapan', 'PDD', 'Humas'];
  const divisiIds: string[] = [];
  const itemIds: string[] = [];
  for (const [i, nama] of namaDivisi.entries()) {
    const [dv] = await sql<{ id: string }[]>`
      INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan)
      VALUES (${acaraId}::uuid, ${nama}, ${i === 0 ? anggota : null}::uuid, ${i + 1}) RETURNING id::text`;
    divisiIds.push(dv!.id);
    for (let s = 0; s < 2; s++) {
      const [sec] = await sql<{ id: string }[]>`
        INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dv!.id}::uuid, ${`${nama.toUpperCase()} ${s + 1}`}, ${s})
        RETURNING id::text`;
      for (let n = 0; n < 10; n++) {
        const jumlah = 1 + ((i * 7 + s * 3 + n) % 12);
        const harga = 5000 + ((i * 31 + s * 17 + n * 11) % 40) * 2500;
        const [it] = await sql<{ id: string }[]>`
          INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total)
          VALUES (${sec!.id}::uuid, ${n + 1}, ${`Barang ${nama} ${s + 1}.${n + 1}`}, ${String(jumlah)}, ${jumlah},
                  ${harga}, ${jumlah * harga})
          RETURNING id::text`;
        itemIds.push(it!.id);
      }
    }
  }
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${divisiIds[0]!}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;

  // --- Gantt 100 task dalam 6 grup ---------------------------------------------
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO gantt_chart (scope, proker_id, judul) VALUES ('PROKER', ${prokerAcara}::uuid, ${`${PENANDA} Gantt 100 task`})
    RETURNING id::text`;
  const chartId = c!.id;
  const warna = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2'];
  let urutTask = 0;
  for (let g = 0; g < 6; g++) {
    const [grup] = await sql<{ id: string }[]>`
      INSERT INTO gantt_group (chart_id, nama, warna, urutan) VALUES (${chartId}::uuid, ${`Grup ${g + 1}`}, ${warna[g]!}, ${g})
      RETURNING id::text`;
    const jumlah = g < 4 ? 17 : 16;
    for (let t = 0; t < jumlah; t++) {
      const mulai = hariKe(hariIni(), -14 + g * 9 + t * 3);
      await sql`
        INSERT INTO gantt_task (group_id, chart_id, nama, tanggal_mulai, tanggal_selesai, progres, urutan)
        VALUES (${grup!.id}::uuid, ${chartId}::uuid, ${`Task ${g + 1}.${t + 1}`}, ${mulai}::date,
                ${hariKe(mulai, 2 + (t % 6))}::date, ${(t * 13) % 101}, ${urutTask++})`;
    }
  }

  // --- 50 nota bergambar ---------------------------------------------------------
  process.stdout.write('  menyemai 50 nota bergambar ');
  for (let i = 0; i < 50; i++) {
    const g = await gambarNota(i);
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
      VALUES (${anggota}::uuid, ${`${PENANDA.toLowerCase()}-${i + 1}.jpg`}, ${uuid}, ${km}, ${kp}, ${kt},
              'image/jpeg', 'image/jpeg', 1600, 1200, 1600, 1200, ${g.master.length}, 'DOKUMEN')
      RETURNING id::text`;
    const nominal = 15000 + i * 1000;
    const terverifikasi = i >= 30;
    const [n] = await sql<{ id: string }[]>`
      INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota, status, verified_by, verified_at)
      VALUES (${divisiIds[i % 5]!}::uuid, ${img!.id}::uuid, ${anggota}::uuid, ${hariKe(hariIni(), -(i % 20))}::date, ${nominal},
              ${terverifikasi ? 'TERVERIFIKASI' : 'MENUNGGU_VERIFIKASI'}::nota_status,
              ${terverifikasi ? bendum : null}::uuid, ${terverifikasi ? new Date() : null})
      RETURNING id::text`;
    await sql`INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal)
              VALUES (${n!.id}::uuid, ${itemIds[(i % 5) * 20]!}::uuid, ${nominal})`;
    if (i % 10 === 9) process.stdout.write('.');
  }
  log(' siap');

  // --- 500 surat ---------------------------------------------------------------------
  // 300 terbit bernomor, 100 menunggu approval, 80 draft, 20 ditolak.
  await sql`
    INSERT INTO surat (periode_id, kode_surat, nomor_urut, bulan_romawi, tahun, nomor_lengkap, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, status, dibuat_oleh, disetujui_oleh, disetujui_at,
                       diajukan_at, alasan_penolakan)
    SELECT ${periodeId}::uuid, '01',
           CASE WHEN g <= 300 THEN 5000 + g END,
           CASE WHEN g <= 300 THEN 'X' END,
           CASE WHEN g <= 300 THEN 2026 END,
           CASE WHEN g <= 300 THEN lpad((5000 + g)::text, 3, '0') || '/UN43.3.7/HMIF/X/2026' END,
           (CURRENT_DATE - (g % 60)),
           ${PENANDA} || ' Surat ' || g, 'Tujuan ' || g, 'Kampus UNTIRTA',
           (CASE WHEN g <= 300 THEN 'TERBIT' WHEN g <= 400 THEN 'MENUNGGU_APPROVAL'
                 WHEN g <= 480 THEN 'DRAFT' ELSE 'DITOLAK' END)::surat_status,
           ${sekum}::uuid,
           CASE WHEN g <= 300 THEN ${ketua}::uuid END,
           CASE WHEN g <= 300 THEN now() END,
           CASE WHEN g <= 400 THEN now() - (g || ' minutes')::interval END,
           CASE WHEN g > 480 THEN 'Data belum lengkap' END
    FROM generate_series(1, 500) AS g`;

  // Rentang yang pasti menabrak kunci ke-3 dan ke-4.
  const tabrak = hariKe(awalKunci, 2 * 19 + 10);
  return {
    periodeId,
    acaraId,
    chartId,
    divisiAnggota: divisiIds[0]!,
    itemUkur: itemIds[3]!,
    kunciBerkas,
    rentangKonflik: { mulai: tabrak, selesai: hariKe(tabrak, 20) },
  };
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

let nomorIp = 1;

async function konteks(browser: Browser, opsi: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  // IP sintetis per konteks: batas umum 300/menit/IP (middleware produksi)
  // tidak boleh ikut terukur sebagai 429.
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    baseURL: URL_DASAR,
    extraHTTPHeaders: { 'x-forwarded-for': `10.114.${Math.floor(Date.now() / 1000) % 250}.${nomorIp++ % 250}` },
    ...opsi,
  });
  // tsx (esbuild keepNames) membungkus fungsi bernama di dalam callback
  // evaluate/addInitScript dengan `__name(...)`, yang tidak ada di browser.
  await ctx.addInitScript({ content: 'globalThis.__name = (f) => f;' });
  return ctx;
}

async function masuk(page: Page, akun: AkunUji): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function throttle(page: Page, opsi: { kosongkanCache?: boolean } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (opsi.kosongkanCache) await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', PROFIL_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  return cdp;
}

async function sesi(browser: Browser, akun: AkunUji, opsi: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await konteks(browser, opsi);
  const page = await ctx.newPage();
  await masuk(page, akun);
  return { ctx, page };
}

// ---------------------------------------------------------------------------
// 1 · FCP
// ---------------------------------------------------------------------------

async function ukurFcp(browser: Browser): Promise<void> {
  const sampel: number[] = [];
  const lcp: number[] = [];
  const hidrasi: number[] = [];
  for (let i = 0; i < JALAN; i++) {
    const ctx = await konteks(browser);
    const page = await ctx.newPage();
    await throttle(page, { kosongkanCache: true });
    await page.goto('/login', { waitUntil: 'commit' });
    // Pelengkap anggaran §19.1 login (LCP < 0,8 s, TTI < 1,0 s): saat tombol
    // Masuk terhidrasi (React memasang props-nya) = halaman siap dipakai.
    await page.waitForFunction(
      () => {
        const tombol = document.querySelector('form button[type="submit"]');
        if (!tombol || !Object.keys(tombol).some((k) => k.startsWith('__reactProps'))) return false;
        const w = window as unknown as { __hidrasi?: number };
        w.__hidrasi ??= performance.now();
        return true;
      },
      undefined,
      { timeout: 60_000, polling: 10 },
    );
    const r = await page.evaluate(
      () =>
        new Promise<{ fcp: number; lcp: number; hidrasi: number }>((ok) => {
          const hidrasi = (window as unknown as { __hidrasi: number }).__hidrasi;
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1;
          new PerformanceObserver((l) => {
            const e = l.getEntries();
            ok({ fcp, lcp: e[e.length - 1]!.startTime, hidrasi });
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        }),
    );
    sampel.push(r.fcp);
    lcp.push(r.lcp);
    hidrasi.push(r.hidrasi);
    await ctx.close();
  }
  catat({
    no: 1,
    kunci: 'fcp',
    metrik: 'First Contentful Paint (/login)',
    target: '< 1000 ms',
    nilai: median(sampel),
    satuan: 'ms',
    sampel,
    batas: 1000,
    rincian:
      `sampel ${sampel.map((x) => Math.round(x)).join(' · ')} ms · ` +
      `LCP median ${Math.round(median(lcp))} ms (§19.1 < 800) · terhidrasi median ${Math.round(median(hidrasi))} ms (§19.1 TTI < 1000)`,
  });
}

// ---------------------------------------------------------------------------
// 2 & 3 · Dashboard siap + render Master Gantt
// ---------------------------------------------------------------------------

/**
 * Dipasang sebelum skrip halaman: catat saat tiap kondisi pertama terpenuhi.
 *
 * MutationObserver: kondisi diperiksa tepat saat DOM berubah, bukan per
 * interval. Saat terpenuhi, frame berikutnya (rAF) dicatat sebagai saat
 * tergambar; cadangan 200 ms bila rAF tak datang.
 */
const PENGAMAT_BERANDA = () => {
  const w = window as unknown as { __bench: Record<string, number> };
  w.__bench = {};
  const tandai = (k: string) => {
    if (w.__bench[k + 'Dom'] !== undefined) return;
    const t = performance.now();
    w.__bench[k + 'Dom'] = t;
    requestAnimationFrame(() => (w.__bench[k] ??= performance.now()));
    setTimeout(() => (w.__bench[k] ??= t), 200);
  };
  const cek = () => {
    const master = document.querySelector('[data-testid="master-gantt"]');
    if (master?.querySelector('[data-testid^="gantt-bar-"]')) tandai('bar');
    const dash = document.querySelector('[data-testid="dashboard"]');
    if (dash?.querySelector('[data-testid^="panel-"]') && !dash.querySelector('[aria-busy="true"]')) tandai('panel');
    if (w.__bench.barDom !== undefined && w.__bench.panelDom !== undefined) amati.disconnect();
  };
  const amati = new MutationObserver(cek);
  amati.observe(document, { subtree: true, childList: true, attributes: true });
};

async function ukurBeranda(browser: Browser): Promise<void> {
  const siap: number[] = [];
  const render: number[] = [];
  const fcpBeranda: number[] = [];
  let baris = 0;
  for (let i = 0; i < JALAN; i++) {
    const { ctx, page } = await sesi(browser, AKUN.aktif);
    await page.addInitScript(PENGAMAT_BERANDA);
    await throttle(page, { kosongkanCache: true });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(
      () => {
        const b = (window as unknown as { __bench?: Record<string, number> }).__bench;
        return b?.bar !== undefined && b.panel !== undefined;
      },
      undefined,
      { timeout: 60_000, polling: 100 },
    );
    const r = await page.evaluate(() => {
      const b = (window as unknown as { __bench: Record<string, number> }).__bench;
      const api = performance
        .getEntriesByType('resource')
        .filter((e) => e.name.includes('/api/gantt/master'))
        .map((e) => (e as PerformanceResourceTiming).responseEnd);
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1;
      const root = document.querySelector('[data-testid="master-gantt"] [data-slot="gantt-chart"]');
      return { bar: b.bar!, panel: b.panel!, api: Math.min(...api), fcp, baris: Number(root?.getAttribute('data-total-row-count') ?? 0) };
    });
    siap.push(Math.max(r.bar, r.panel));
    render.push(r.bar - r.api);
    fcpBeranda.push(r.fcp);
    baris = r.baris;
    await ctx.close();
  }
  catat({
    no: 2,
    kunci: 'dashboard',
    metrik: 'Dashboard + Master Gantt siap (4G)',
    target: '< 1500 ms',
    nilai: median(siap),
    satuan: 'ms',
    sampel: siap,
    batas: 1500,
    rincian: `sampel ${siap.map((x) => Math.round(x)).join(' · ')} ms · FCP beranda median ${Math.round(median(fcpBeranda))} ms`,
  });
  catat({
    no: 3,
    kunci: 'master-gantt',
    metrik: 'Render Master Gantt (48 bar)',
    target: '< 500 ms',
    nilai: median(render),
    satuan: 'ms',
    sampel: render,
    batas: 500,
    rincian: `sampel ${render.map((x) => Math.round(x)).join(' · ')} ms · ${baris} baris data di chart`,
  });
}

// ---------------------------------------------------------------------------
// 4 & 10 · Gantt 100 task + scroll
// ---------------------------------------------------------------------------

async function ukurGantt(browser: Browser, data: DataUji): Promise<void> {
  const render: number[] = [];
  let rincian = '';
  let fpsH: number[] = [];
  let fpsV: number[] = [];
  for (let i = 0; i < JALAN; i++) {
    const { ctx, page } = await sesi(browser, AKUN.admin);
    await throttle(page);
    await page.goto('/proker/gantt', { waitUntil: 'load' });
    const tautan = page.getByTestId(`gantt-indeks-${data.chartId}`);
    await tautan.waitFor({ timeout: 30_000 });
    await page.evaluate((id) => {
      const w = window as unknown as { __g: { klik?: number; tampil?: number } };
      w.__g = {};
      document.querySelector(`[data-testid="gantt-indeks-${id}"]`)!.addEventListener(
        'click',
        () => {
          w.__g.klik = performance.now();
          const amati = new MutationObserver(() => {
            const root = document.querySelector('[data-slot="gantt-chart"][data-total-row-count="106"]');
            if (!root?.querySelector('[data-testid^="gantt-bar-"]')) return;
            amati.disconnect();
            const t = performance.now();
            requestAnimationFrame(() => (w.__g.tampil ??= performance.now()));
            setTimeout(() => (w.__g.tampil ??= t), 200);
          });
          amati.observe(document, { subtree: true, childList: true, attributes: true });
        },
        { capture: true },
      );
    }, data.chartId);
    await tautan.click();
    await page.waitForFunction(() => (window as unknown as { __g: { tampil?: number } }).__g.tampil !== undefined, undefined, {
      timeout: 60_000,
      polling: 100,
    });
    const r = await page.evaluate((id) => {
      const g = (window as unknown as { __g: { klik: number; tampil: number } }).__g;
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const rsc = res.filter((e) => e.name.includes(`/gantt/${id}`) && e.responseEnd > 0).map((e) => e.responseEnd);
      const js = res.filter((e) => e.initiatorType === 'script' && e.responseEnd > g.klik && e.responseEnd < g.tampil).map((e) => e.responseEnd);
      const root = document.querySelector('[data-slot="gantt-chart"]')!;
      return {
        ...g,
        dataTiba: Math.max(g.klik, ...rsc, ...js),
        dirender: Number(root.getAttribute('data-rendered-row-count')),
        total: Number(root.getAttribute('data-total-row-count')),
      };
    }, data.chartId);
    render.push(r.tampil - r.dataTiba);
    rincian = `klik→bar ${Math.round(r.tampil - r.klik)} ms (termasuk jaringan) · ${r.dirender}/${r.total} baris dirender (virtualisasi)`;

    if (i === 0 && ikut('scroll')) {
      // Scroll diukur sekali pada jalan pertama, 120 frame per arah.
      const ukurScroll = (arah: 'h' | 'v') =>
        page.evaluate(async (a) => {
          const el = document.querySelector(a === 'h' ? '[data-testid="gantt-scroll"]' : '[data-testid="gantt-vertical-scroll"]') as HTMLElement;
          const maks = a === 'h' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
          const langkah = Math.max(6, maks / 120);
          const d: number[] = [];
          let pos = 0;
          let lalu = performance.now();
          await new Promise<void>((ok) => {
            const f = (t: number) => {
              d.push(t - lalu);
              lalu = t;
              pos = Math.min(pos + langkah, maks);
              if (a === 'h') el.scrollLeft = pos;
              else el.scrollTop = pos;
              if (d.length >= 120) ok();
              else requestAnimationFrame(f);
            };
            requestAnimationFrame(f);
          });
          return d.slice(5);
        }, arah);
      fpsH = await ukurScroll('h');
      fpsV = await ukurScroll('v');
    }
    await ctx.close();
  }
  catat({
    no: 4,
    kunci: 'gantt-100',
    metrik: 'Render Gantt (100 task)',
    target: '< 500 ms',
    nilai: median(render),
    satuan: 'ms',
    sampel: render,
    batas: 500,
    rincian: `sampel ${render.map((x) => Math.round(x)).join(' · ')} ms · ${rincian}`,
  });

  if (ikut('scroll') && fpsH.length) {
    const ambang = (1000 / 60) * 1.5;
    const ringkas = (d: number[]) => ({
      fps: 1000 / median(d),
      tersendat: d.filter((x) => x > ambang).length / d.length,
      p95: p95(d),
    });
    const h = ringkas(fpsH);
    const v = ringkas(fpsV);
    const terburuk = Math.min(h.fps, v.fps);
    const sendat = Math.max(h.tersendat, v.tersendat);
    catat({
      no: 10,
      kunci: 'scroll',
      metrik: 'Scroll Gantt (100 task)',
      target: '60 fps (median ≥ 55, ≤ 10% frame > 25 ms)',
      nilai: terburuk,
      satuan: 'fps',
      sampel: [h.fps, v.fps],
      lulus: terburuk >= 55 && sendat <= 0.1,
      rincian:
        `horizontal ${h.fps.toFixed(1)} fps p95 ${h.p95.toFixed(1)} ms ${(h.tersendat * 100).toFixed(0)}% tersendat · ` +
        `vertikal ${v.fps.toFixed(1)} fps p95 ${v.p95.toFixed(1)} ms ${(v.tersendat * 100).toFixed(0)}% tersendat`,
    });
  }
}

// ---------------------------------------------------------------------------
// 5 · Cek konflik
// ---------------------------------------------------------------------------

async function ukurKonflik(browser: Browser, sql: Sql, data: DataUji): Promise<void> {
  const { ctx, page } = await sesi(browser, AKUN.kadept);
  await throttle(page);
  const sampel: number[] = [];
  let jumlahKonflik = 0;
  for (let i = 0; i < Math.max(10, JALAN); i++) {
    const r = await page.evaluate(async (rentang) => {
      const t0 = performance.now();
      const res = await fetch('/api/proker/cek-konflik', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(rentang),
      });
      const body = (await res.json()) as { ok: boolean; data?: unknown[] };
      return { ms: performance.now() - t0, ok: body.ok, n: Array.isArray(body.data) ? body.data.length : -1 };
    }, data.rentangKonflik);
    if (!r.ok) throw new Error('cek-konflik menjawab ok:false');
    sampel.push(r.ms);
    jumlahKonflik = r.n;
  }
  await ctx.close();

  // SYSTEM_DESIGN §19.3: kueri SQL-nya sendiri, target < 10 ms dan GiST.
  const rencana = await sql.unsafe(
    `EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM cek_konflik_proker($1::uuid, $2::date, $3::date)`,
    [data.periodeId, data.rentangKonflik.mulai, data.rentangKonflik.selesai],
  );
  const planSql = (rencana[0] as unknown as { 'QUERY PLAN': Array<{ 'Execution Time': number }> })['QUERY PLAN'][0]!['Execution Time'];
  // Dengan belasan kunci planner wajar memilih seq scan; yang dibuktikan di
  // sini: indeks GiST ADA dan dipakai begitu tabelnya cukup besar (seq scan
  // dimatikan sementara di dalam transaksi).
  const kueriGist = `EXPLAIN SELECT 1 FROM proker_lock WHERE periode_id = $1::uuid AND rentang && daterange($2::date, $3::date, '[]')`;
  const param = [data.periodeId, data.rentangKonflik.mulai, data.rentangKonflik.selesai];
  const teksRencana = (baris: readonly object[]) => baris.map((r) => String(Object.values(r)[0])).join(' ');
  const alami = /Index|Bitmap/.test(teksRencana(await sql.unsafe(kueriGist, param))) ? 'indeks' : 'seq scan';
  const dipaksa = await sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL enable_seqscan = off');
    return teksRencana(await tx.unsafe(kueriGist, param));
  });
  const namaIndeks = /Index Scan using (\w+)|Bitmap Index Scan on (\w+)/.exec(dipaksa);
  const pakaiIndeks = `${alami}; tanpa seq scan → ${namaIndeks ? namaIndeks[1] ?? namaIndeks[2] : 'TIDAK ADA INDEKS'}`;

  catat({
    no: 5,
    kunci: 'konflik',
    metrik: 'Validasi konflik proker (round-trip 4G)',
    target: '< 500 ms',
    nilai: median(sampel),
    satuan: 'ms',
    sampel,
    batas: 500,
    rincian:
      `p95 ${Math.round(p95(sampel))} ms · ${jumlahKonflik} bentrokan ditemukan · ` +
      `SQL ${planSql.toFixed(2)} ms (target §19.3 < 10 ms, ${pakaiIndeks})`,
  });
}

// ---------------------------------------------------------------------------
// 6 · Pratinjau surat
// ---------------------------------------------------------------------------

async function ukurPratinjau(browser: Browser): Promise<void> {
  const { ctx, page } = await sesi(browser, AKUN.sekum);
  await page.goto('/surat/baru?jenis=PEMINJAMAN_RUANGAN', { waitUntil: 'load' });
  await page.getByTestId('surat-pratinjau-kertas').waitFor({ timeout: 60_000 });
  await throttle(page);
  const sampel: number[] = [];
  for (let i = 0; i < JALAN; i++) {
    const penanda = `UKUR-${i}-${Date.now() % 10_000}`;
    await page.evaluate((p) => {
      const w = window as unknown as { __ketik?: number; __tampil?: number };
      w.__ketik = undefined;
      w.__tampil = undefined;
      document.addEventListener('input', () => (w.__ketik = performance.now()), true);
      const target = document.querySelector('[data-testid="surat-pratinjau-perihal"]')!;
      new MutationObserver(() => {
        if (w.__tampil === undefined && target.textContent?.includes(p)) w.__tampil = performance.now();
      }).observe(target, { subtree: true, childList: true, characterData: true });
    }, penanda);
    const input = page.getByTestId('surat-field-perihal');
    await input.fill('');
    await input.pressSequentially(penanda, { delay: 40 });
    await page.waitForFunction(() => (window as unknown as { __tampil?: number }).__tampil !== undefined, undefined, {
      timeout: 10_000,
    });
    sampel.push(
      await page.evaluate(() => {
        const w = window as unknown as { __ketik: number; __tampil: number };
        return w.__tampil - w.__ketik;
      }),
    );
  }
  await ctx.close();
  catat({
    no: 6,
    kunci: 'pratinjau',
    metrik: 'Pratinjau surat memperbarui',
    target: '< 300 ms',
    nilai: median(sampel),
    satuan: 'ms',
    sampel,
    batas: 300,
    rincian: `sampel ${sampel.map((x) => Math.round(x)).join(' · ')} ms (termasuk debounce)`,
  });
}

// ---------------------------------------------------------------------------
// 7 · Pipeline gambar
// ---------------------------------------------------------------------------

/** Foto 12 MP (4000×3000) berderau — ukuran & entropi setara foto ponsel. */
async function foto12mp(): Promise<Buffer> {
  const w = 4000;
  const h = 3000;
  const raw = Buffer.alloc(w * h * 3);
  let s = 12345;
  for (let i = 0; i < raw.length; i += 3) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const y = Math.floor(i / 3 / w);
    const base = 150 + ((y >> 4) % 60);
    const n = (s >> 16) % 40;
    raw[i] = base + n;
    raw[i + 1] = base + n - 5;
    raw[i + 2] = base + n - 15;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

async function ukurPipeline(browser: Browser, data: DataUji): Promise<void> {
  const foto = await foto12mp();
  const sampel: number[] = [];
  const n = Math.min(3, JALAN);
  for (let i = 0; i < n; i++) {
    const { ctx, page } = await sesi(browser, AKUN.anggota, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    // Pemindai OpenCV dari CDN tidak ikut diukur (bukan bagian pipeline;
    // dimuat saat kamera dibuka). Unggahan dibatalkan: tanpa sisa data.
    await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
    await page.route('**/api/images/upload', (r) => r.abort());
    await page.addInitScript(() => {
      const w = window as unknown as { __p: { klik?: number; unggah?: number } };
      w.__p = {};
      const asli = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input instanceof Request ? input.url : input).includes('/api/images/upload')) w.__p.unggah = performance.now();
        return asli(input, init);
      };
      document.addEventListener(
        'click',
        (e) => {
          if ((e.target as Element | null)?.closest('[data-testid="scan-gunakan"]')) w.__p.klik = performance.now();
        },
        true,
      );
    });
    await page.goto('/keuangan/nota/upload', { waitUntil: 'load' });
    await page.getByTestId('nota-form').and(page.locator('[data-siap="1"]')).waitFor({ timeout: 60_000 });
    if (await page.locator('#nota-divisi').count()) await page.locator('#nota-divisi').selectOption(data.divisiAnggota);
    const opsi = page.locator('#nota-pilih-item option').filter({ hasText: /Barang Konsumsi/ }).first();
    await page.locator('#nota-pilih-item').selectOption((await opsi.getAttribute('value'))!);
    await throttle(page);
    await page.getByTestId('nota-buka-kamera').click();
    const [pemilih] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('kamera-galeri').click({ timeout: 60_000 }),
    ]);
    await pemilih.setFiles({ name: 'foto-12mp.jpg', mimeType: 'image/jpeg', buffer: foto });
    await page.getByTestId('scan-gunakan').click({ timeout: 60_000 });
    await page.waitForFunction(() => (window as unknown as { __p: { unggah?: number } }).__p.unggah !== undefined, undefined, {
      timeout: 60_000,
      polling: 100,
    });
    sampel.push(
      await page.evaluate(() => {
        const p = (window as unknown as { __p: { klik: number; unggah: number } }).__p;
        return p.unggah - p.klik;
      }),
    );
    await ctx.close();
  }
  catat({
    no: 7,
    kunci: 'pipeline',
    metrik: 'Pemrosesan gambar 12 MP (3 turunan, ponsel 375 px)',
    target: '< 5000 ms',
    nilai: median(sampel),
    satuan: 'ms',
    sampel,
    batas: 5000,
    rincian: `sampel ${sampel.map((x) => Math.round(x)).join(' · ')} ms · foto ${(foto.length / 1024 / 1024).toFixed(1)} MB`,
  });
}

// ---------------------------------------------------------------------------
// 8 · Hitung ulang RAB
// ---------------------------------------------------------------------------

async function ukurRab(browser: Browser, data: DataUji): Promise<void> {
  const { ctx, page } = await sesi(browser, AKUN.anggota);
  await page.goto(`/acara/${data.acaraId}?tab=rab`, { waitUntil: 'load' });
  await page.getByTestId('rab-grid').and(page.locator('[data-siap="1"]')).waitFor({ timeout: 60_000 });
  const jumlahItem = await page.getByTestId('rab-item').count();
  await throttle(page);
  const sampel: number[] = [];
  for (let i = 0; i < JALAN; i++) {
    const ms = await page.evaluate(
      ({ id, nilai }) => {
        const input = document.querySelector<HTMLInputElement>(`[data-item-id="${id}"] [data-testid="rab-harga"]`)!;
        const total = document.querySelector('[data-testid="rab-total-acara"]')!;
        const awal = total.textContent;
        return new Promise<number>((selesai) => {
          const t0 = performance.now();
          const amati = new MutationObserver(() => {
            if (total.textContent !== awal) {
              amati.disconnect();
              requestAnimationFrame(() => selesai(performance.now() - t0));
            }
          });
          amati.observe(total, { characterData: true, childList: true, subtree: true });
          setTimeout(() => {
            amati.disconnect();
            selesai(-1);
          }, 5_000);
          input.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(nilai));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      },
      { id: data.itemUkur, nilai: 7000 + i * 500 },
    );
    if (ms < 0) throw new Error('total acara tidak berubah setelah harga diubah');
    sampel.push(ms);
  }
  await ctx.close();
  catat({
    no: 8,
    kunci: 'rab',
    metrik: 'Perhitungan ulang RAB',
    target: '< 100 ms',
    nilai: median(sampel),
    satuan: 'ms',
    sampel,
    batas: 100,
    rincian: `sampel ${sampel.map((x) => Math.round(x)).join(' · ')} ms · ${jumlahItem} item di grid`,
  });
}

// ---------------------------------------------------------------------------
// 9 · Galeri 30 nota
// ---------------------------------------------------------------------------

async function ukurGaleri(browser: Browser): Promise<void> {
  const { ctx, page } = await sesi(browser, AKUN.bendum, { viewport: { width: 1440, height: 900 } });
  const master: string[] = [];
  page.on('request', (r) => {
    if (/nota\/master\//.test(r.url())) master.push(r.url());
  });
  const cdp = await throttle(page);
  const sampel: number[] = [];
  const n = Math.min(3, JALAN);
  for (let i = 0; i < n + 1; i++) {
    await cdp.send('Network.clearBrowserCache');
    await page.goto('/keuangan/nota/verifikasi', { waitUntil: 'commit' });
    await page.waitForFunction(
      (penanda) => {
        // Antrian dikelompokkan per acara · divisi (5 grup × 6 nota uji).
        const grup = [...document.querySelectorAll('[data-testid="antrian-grup"]')].filter((g) => g.textContent?.includes(penanda));
        if (grup.reduce((n, g) => n + g.querySelectorAll('[data-testid="antrian-kartu"]').length, 0) < 30) return false;
        const tinggi = window.innerHeight;
        return grup.flatMap((g) => [...g.querySelectorAll('img')]).every((img) => {
          const r = img.getBoundingClientRect();
          return !(r.bottom > 0 && r.top < tinggi) || (img.complete && img.naturalWidth > 0);
        });
      },
      PENANDA,
      { timeout: 60_000, polling: 25 },
    );
    const ms = await page.evaluate(() => performance.now());
    if (i > 0) sampel.push(ms); // jalan pertama = pemanasan server
  }
  await ctx.close();
  catat({
    no: 9,
    kunci: 'galeri',
    metrik: 'Galeri verifikasi 30 nota',
    target: '< 2000 ms',
    nilai: median(sampel),
    satuan: 'ms',
    sampel,
    lulus: median(sampel) < 2000 && master.length === 0,
    rincian: `sampel ${sampel.map((x) => Math.round(x)).join(' · ')} ms · permintaan berkas master: ${master.length}`,
  });
}

// ---------------------------------------------------------------------------
// Anggaran bundle (SYSTEM_DESIGN §19.1)
// ---------------------------------------------------------------------------

function ukurBundle(): void {
  const rute: Array<[string, string, number]> = [
    ['/login', 'Login', 80],
    ['/', 'Beranda (Master Gantt)', 180],
    ['/acara/[id]', 'Editor RAB', 200],
    ['/keuangan/nota/upload', 'Upload Nota', 250],
  ];
  for (const [r, nama, anggaran] of rute) {
    const p = spawnSync('npx', ['tsx', 'scripts/bench-bundle.ts', '--', r, '--anggaran', String(anggaran), '--tanpa-build'], {
      cwd: AKAR,
      encoding: 'utf8',
    });
    const teks = `${p.stdout}\n${p.stderr}`;
    const m = /gzip ([\d.]+) KB/.exec(teks);
    const kb = m ? Number(m[1]) : null;
    hasil.push({
      no: 0,
      kunci: `bundle${r}`,
      metrik: `Bundle JS awal ${nama} (${r})`,
      target: `< ${anggaran} KB gzip`,
      nilai: kb,
      satuan: 'KB',
      lulus: kb === null ? null : kb < anggaran,
      sampel: kb === null ? [] : [kb],
      rincian: kb === null ? teks.trim().split('\n').slice(-2).join(' ') : '',
    });
    log(`  ${kb === null ? '[ ?? ]' : kb < anggaran ? '[ OK ]' : '[GAGAL]'} bundle ${nama}: ${kb ?? '?'} KB (anggaran ${anggaran} KB)`);
  }
}

// ---------------------------------------------------------------------------
// §19.3 — kueri kritis
// ---------------------------------------------------------------------------

async function ukurKueri(sql: Sql): Promise<string> {
  const r = await sql.unsafe(
    `EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM v_master_gantt ORDER BY departemen_urutan, tanggal_mulai_persiapan`,
  );
  const plan = (r[0] as unknown as { 'QUERY PLAN': Array<{ 'Execution Time': number }> })['QUERY PLAN'][0]!;
  const [jumlah] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM v_master_gantt`;
  const teks = `v_master_gantt ${plan['Execution Time'].toFixed(2)} ms untuk ${jumlah!.n} baris (target §19.3 < 50 ms)`;
  log(`  [info] ${teks}`);
  return teks;
}

// ---------------------------------------------------------------------------

async function serverHidup(): Promise<boolean> {
  try {
    const r = await fetch(`${URL_DASAR}/api/e2e-siap`, { signal: AbortSignal.timeout(5000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  log('');
  log(`  bench-all — T-114 · ${URL_DASAR} · 4G + CPU ${CPU}× · ${JALAN} jalan`);
  log('');

  if (ikut('bundle')) {
    log('  Anggaran bundle (SYSTEM_DESIGN §19.1, dari .next build terakhir)');
    ukurBundle();
    log('');
  }

  const browserPerlu = [...['fcp', 'dashboard', 'master-gantt', 'gantt-100', 'scroll', 'konflik', 'pratinjau', 'pipeline', 'rab', 'galeri']].some(ikut);
  if (browserPerlu && !(await serverHidup())) {
    log(`  Server tidak menjawab di ${URL_DASAR}. Jalankan build produksi dulu: npm run build && npm start`);
    return 1;
  }

  const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!conn) throw new Error('DIRECT_URL/DATABASE_URL belum diisi.');
  const sql = postgres(conn, { ssl: 'require', max: 1, onnotice: () => {} });
  let data: DataUji | null = null;
  let infoKueri = '';
  let browser: Browser | null = null;
  try {
    if (browserPerlu) {
      log('  Menyemai data realistis (60 proker · 100 item RAB · 100 task · 50 nota · 500 surat)');
      data = await semai(sql);
      infoKueri = await ukurKueri(sql);
      log('');
      browser = await chromium.launch();
      const langkah: Array<[string, () => Promise<void>]> = [
        ['fcp', () => ukurFcp(browser!)],
        ['dashboard', () => ukurBeranda(browser!)],
        ['gantt-100', () => ukurGantt(browser!, data!)],
        ['konflik', () => ukurKonflik(browser!, sql, data!)],
        ['pratinjau', () => ukurPratinjau(browser!)],
        ['pipeline', () => ukurPipeline(browser!, data!)],
        ['rab', () => ukurRab(browser!, data!)],
        ['galeri', () => ukurGaleri(browser!)],
      ];
      for (const [kunci, jalankan] of langkah) {
        const tercakup = kunci === 'dashboard' ? ikut('dashboard') || ikut('master-gantt') : kunci === 'gantt-100' ? ikut('gantt-100') || ikut('scroll') : ikut(kunci);
        if (!tercakup) continue;
        try {
          await jalankan();
        } catch (e) {
          const pesan = e instanceof Error ? e.message.split('\n')[0]! : String(e);
          log(`  [ ?? ] ${kunci}: gagal diukur — ${pesan}`);
          hasil.push({ no: 0, kunci, metrik: kunci, target: '-', nilai: null, satuan: 'ms', lulus: null, sampel: [], rincian: pesan });
        }
      }
    }
  } finally {
    await browser?.close();
    if (data && !SIMPAN_DATA) {
      await bersihkan(sql, data.kunciBerkas);
      log('');
      log('  Data BENCH114 dibersihkan.');
    }
    await sql.end();
  }

  if (BERKAS_JSON) {
    fs.writeFileSync(
      path.resolve(BERKAS_JSON),
      JSON.stringify({ waktu: new Date().toISOString(), url: URL_DASAR, cpu: CPU, jalan: JALAN, kueri: infoKueri, hasil }, null, 2),
    );
    log(`  Hasil mentah: ${BERKAS_JSON}`);
  }

  const gagal = hasil.filter((h) => h.lulus !== true);
  log('');
  log(gagal.length ? `  ${gagal.length} metrik meleset atau tidak terukur: ${gagal.map((h) => h.kunci).join(', ')}` : '  Seluruh metrik memenuhi target.');
  log('');
  return gagal.length ? 1 : 0;
}

main().then(
  (kode) => process.exit(kode),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
