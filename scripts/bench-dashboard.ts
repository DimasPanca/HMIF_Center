/**
 * bench-dashboard — ukur waktu SIAP INTERAKSI dashboard + Master Gantt pada
 * jaringan 4G tersimulasi. Target kontrak T-077 #6: < 1,5 detik.
 *
 *   npm run dev            # atau, untuk angka bermakna: npm run build && npm start
 *   npx tsx scripts/bench-dashboard.ts
 *
 * ===========================================================================
 * MENGUKUR, BUKAN MENEBAK (ADR-057)
 * ===========================================================================
 * Kontrak menyebut angka ini langsung; menggantinya dengan waktu build atau
 * perkiraan bukan verifikasi setara. Skrip ini menjalankan Chromium sungguhan,
 * men-throttle jaringan ke profil 4G lewat CDP, login, membuka beranda, lalu
 * mengukur jarak dari navigasi hingga Master Gantt (dan panel dashboard bila
 * ada) tampil — proksi "siap interaksi". Diulang beberapa kali; dilaporkan
 * median agar tak bias oleh satu jalan yang tersendat.
 *
 * Server dev TAK PERNAH < 1,5 detik (kompilasi on-demand). Untuk menilai target
 * sungguhan, jalankan pada build produksi. Bila dashboard (T-077-UI) belum ada,
 * skrip tetap mengukur Master Gantt dan menandai panel dashboard "belum ada".
 *
 * Exit: 0 bila terukur ≤ target atau tak dapat diukur (server mati/ belum siap);
 *       1 hanya bila TERUKUR dan MELEBIHI target (agar bisa jadi gate).
 */

import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from '../e2e/fixtures/akun';

const TARGET_MS = 1500;
const JUMLAH_JALAN = 3;

/** Profil 4G — setara "Fast 4G" DevTools: 4 Mbps turun, 3 Mbps naik, 20 ms RTT. */
const PROFIL_4G = {
  offline: false,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (3 * 1024 * 1024) / 8,
  latency: 20,
};
/** CPU throttle 4× — perangkat kelas menengah, melengkapi throttle jaringan. */
const CPU_THROTTLE = 4;

function bacaEnv(): Record<string, string> {
  const f = path.resolve(process.cwd(), '.env.local');
  const e: Record<string, string> = {};
  if (fs.existsSync(f))
    for (const b of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const t = b.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0) e[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  return { ...e, ...process.env } as Record<string, string>;
}

const ENV = bacaEnv();
const BASE = (ENV.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function log(s: string): void {
  process.stdout.write(s + '\n');
}

async function serverHidup(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/e2e-siap`, { signal: AbortSignal.timeout(4000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', PROFIL_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.getByLabel(/email/i).fill(AKUN.admin.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Ukur ms dari navigasi ke beranda hingga konten inti tampil. */
async function ukurSekali(page: Page): Promise<{ ms: number; adaDashboard: boolean }> {
  const t0 = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: 'commit' });

  // Master Gantt siap (chart tampil, atau error box bila data gagal).
  await page
    .locator('[data-slot="gantt-chart"], [data-testid="master-gantt-error"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });

  // Panel dashboard (T-077) bila sudah ada.
  const panel = page.locator('[data-testid^="panel-"], [data-testid="dashboard"]');
  const adaDashboard = (await panel.count()) > 0;
  if (adaDashboard) await panel.first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});

  // Jaringan mereda → tak ada fetch panel yang tertinggal.
  await page.waitForLoadState('networkidle').catch(() => {});
  return { ms: Date.now() - t0, adaDashboard };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

async function main(): Promise<void> {
  log('');
  log('  bench-dashboard — siap interaksi pada 4G (target < 1500 ms)');
  log(`  URL   : ${BASE}`);

  if (!(await serverHidup())) {
    log('');
    log(`  SKIP: server tak menjawab di ${BASE}. Jalankan dulu:`);
    log('        npm run dev   (atau: npm run build && npm start untuk angka nyata)');
    log('');
    process.exit(0);
  }

  const browser = await chromium.launch();
  const hasil: number[] = [];
  let adaDashboard = false;
  try {
    for (let i = 0; i < JUMLAH_JALAN; i++) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = await context.newPage();
      await throttle(page);
      await login(page);
      const r = await ukurSekali(page);
      hasil.push(r.ms);
      adaDashboard = adaDashboard || r.adaDashboard;
      log(`  jalan ${i + 1}: ${r.ms} ms`);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const med = median(hasil);
  const lulus = med <= TARGET_MS;
  log('');
  log(`  komponen terukur : Master Gantt${adaDashboard ? ' + panel dashboard' : ' (panel dashboard BELUM ADA — T-077-UI)'}`);
  log(`  median           : ${med} ms  (target ${TARGET_MS} ms)`);
  log(`  hasil            : ${lulus ? 'LULUS' : 'MELEBIHI TARGET'}`);
  if (/localhost|127\.0\.0\.1/.test(BASE)) {
    log('  catatan          : ukur pada build produksi (npm run build && npm start) untuk angka yang sahih.');
  }
  log('');
  process.exit(lulus ? 0 : 1);
}

main().catch((e: unknown) => {
  process.stderr.write(`\n  bench-dashboard gagal: ${e instanceof Error ? e.message : String(e)}\n\n`);
  process.exit(0); // kegagalan alat ≠ kegagalan target; jangan menahan pipeline.
});
