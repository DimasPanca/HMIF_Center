/**
 * gate-status — menghitung pass/skip/fail sebuah gate Playwright, supaya aturan
 * "task -UI selesai hanya bila gate-nya 0 skipped" dapat DIPERIKSA, bukan
 * diklaim.
 *
 *   npx tsx scripts/gate-status.ts periode
 *   npx tsx scripts/gate-status.ts sidebar-role --project=desktop
 *
 * ===========================================================================
 * KENAPA ADA ALAT INI
 * ===========================================================================
 * Gate yang seluruhnya `test.skip()` lolos HIJAU. Itu benar dan disengaja —
 * gate ditulis sebelum halamannya ada, dan skip-nya menyebut apa yang kurang.
 * Bahayanya baru muncul di ujung: seseorang melihat `npm run test:e2e` hijau
 * dan menyimpulkan fiturnya terverifikasi, padahal setiap testnya dilewati.
 *
 * Codex menandai ini. Aturannya: sebuah task `-UI` DONE hanya bila gate-nya
 * berjalan dengan 0 skipped dan >0 passed. Alat ini yang mengukurnya —
 * exit 0 hanya bila ada test yang benar-benar berjalan dan tidak ada yang
 * dilewati.
 *
 * Ini BUKAN pengganti `npm run test:e2e`. Ia menjalankan Playwright lalu
 * membaca hasilnya; kegagalan test tetap kegagalan. Yang ditambahkannya hanya
 * satu hal yang tidak dilihat exit code Playwright: apakah masih ada yang skip.
 */

import { spawnSync } from 'node:child_process';

interface HasilTest {
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
}
interface Spec {
  title: string;
  tests: { results: HasilTest[] }[];
}
interface Suite {
  suites?: Suite[];
  specs?: Spec[];
}
interface LaporanJson {
  suites?: Suite[];
}

function kumpulkan(suite: Suite, keluar: { title: string; status: string }[]): void {
  for (const s of suite.suites ?? []) kumpulkan(s, keluar);
  for (const spec of suite.specs ?? []) {
    const status = spec.tests[0]?.results[0]?.status ?? 'unknown';
    keluar.push({ title: spec.title, status });
  }
}

function main(): number {
  const argv = process.argv.slice(2);
  const nama = argv.find((a) => !a.startsWith('-'));
  if (!nama) {
    console.error('\n  Pemakaian: npx tsx scripts/gate-status.ts <nama-gate> [--project=desktop]\n');
    return 2;
  }
  const teruskan = argv.filter((a) => a.startsWith('-'));

  const jalan = spawnSync(
    'npx',
    ['playwright', 'test', nama, '--reporter=json', ...teruskan],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
  );

  const teks = jalan.stdout ?? '';
  const mulai = teks.indexOf('{');
  if (mulai === -1) {
    console.error('\n  Playwright tidak mengembalikan JSON. Keluaran mentah:\n');
    console.error(teks.slice(0, 2000) || jalan.stderr?.slice(0, 2000));
    return 2;
  }

  let laporan: LaporanJson;
  try {
    laporan = JSON.parse(teks.slice(mulai)) as LaporanJson;
  } catch {
    console.error('\n  Gagal mem-parse laporan JSON Playwright.\n');
    return 2;
  }

  const hasil: { title: string; status: string }[] = [];
  for (const s of laporan.suites ?? []) kumpulkan(s, hasil);

  const hitung = { passed: 0, skipped: 0, failed: 0, lain: 0 };
  for (const h of hasil) {
    if (h.status === 'passed') hitung.passed++;
    else if (h.status === 'skipped') hitung.skipped++;
    else if (h.status === 'failed' || h.status === 'timedOut') hitung.failed++;
    else hitung.lain++;
  }

  console.log(`\n  gate ${nama}`);
  console.log(
    `  passed ${hitung.passed}  ·  skipped ${hitung.skipped}  ·  ` +
      `failed ${hitung.failed}  ·  lain ${hitung.lain}\n`,
  );

  if (hitung.failed > 0) {
    console.log('  MERAH — ada test yang gagal.\n');
    return 1;
  }
  if (hitung.passed === 0) {
    console.log('  BELUM DIVERIFIKASI — tidak ada satu pun test yang berjalan.');
    console.log('  Gate ini masih menunggu berkas yang diujinya. Task belum boleh DONE.\n');
    return 1;
  }
  if (hitung.skipped > 0) {
    console.log(`  BELUM TUNTAS — ${hitung.skipped} test masih dilewati.`);
    console.log('  Task -UI DONE hanya bila gate-nya 0 skipped. Lihat RENCANA §11.4.\n');
    return 1;
  }

  console.log('  TUNTAS — semua test berjalan, tidak ada yang dilewati.\n');
  return 0;
}

process.exit(main());
