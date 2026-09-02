/**
 * verify-assets — membuktikan aset hasil prepare-assets benar-benar layak pakai.
 *
 *   npx tsx scripts/verify-assets.ts
 *
 * Yang diperiksa bukan sekadar "berkas ada", melainkan sifat yang menentukan
 * apakah aset berfungsi di dokumen resmi:
 *
 *   1. Kedua berkas ada dan berformat PNG
 *   2. Keduanya punya kanal alpha
 *   3. Keempat sudut stempel benar-benar transparan (latar putih hilang)
 *   4. Tinta stempel masih utuh — tidak ikut terhapus bersama latar
 *   5. Stempel tidak melebihi 600 px dan aspect ratio-nya sama dengan sumber
 *   6. Logo tidak melebihi 512 px dan aspect ratio-nya sama dengan sumber
 *   7. Berkas sumber tidak berubah ukurannya
 *
 * Sumber: docs/ai/tasks/P0-prasyarat.md T-005
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const AKAR = process.cwd();
const SUMBER_LOGO = path.join(AKAR, 'Design', 'LOGO HMIF - SHADOW@3x.png');
const SUMBER_STEMPEL = path.join(AKAR, 'Template', 'Stempel Digital HMIF.jpeg');
const LOGO = path.join(AKAR, 'public', 'logo-hmif.png');
const STEMPEL = path.join(AKAR, 'public', 'stempel-hmif.png');

let gagal = 0;

function periksa(nama: string, lulus: boolean, detail: string): void {
  console.log(`  [${lulus ? '  OK  ' : ' GAGAL'}] ${nama}\n           ${detail}`);
  if (!lulus) gagal++;
}

/** Nilai alpha satu piksel pada koordinat tertentu. */
async function alphaDi(file: string, x: number, y: number): Promise<number> {
  const { data } = await sharp(file)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[3] ?? 255;
}

async function main(): Promise<void> {
  console.log('\n  verify-assets — HMIF Center\n');

  for (const f of [LOGO, STEMPEL]) {
    if (!fs.existsSync(f)) {
      periksa(path.basename(f), false, 'berkas tidak ada — jalankan prepare-assets lebih dulu');
      console.log('\n  GAGAL\n');
      process.exit(1);
    }
  }

  const mLogo = await sharp(LOGO).metadata();
  const mStempel = await sharp(STEMPEL).metadata();
  const sLogo = await sharp(SUMBER_LOGO).metadata();
  const sStempel = await sharp(SUMBER_STEMPEL).metadata();

  // 1 & 2 — format dan kanal alpha
  periksa(
    'logo-hmif.png format & alpha',
    mLogo.format === 'png' && mLogo.hasAlpha === true,
    `format=${mLogo.format}, alpha=${mLogo.hasAlpha}`
  );
  periksa(
    'stempel-hmif.png format & alpha',
    mStempel.format === 'png' && mStempel.hasAlpha === true,
    `format=${mStempel.format}, alpha=${mStempel.hasAlpha}`
  );

  // 3 — keempat sudut stempel harus transparan
  const w = mStempel.width ?? 1;
  const h = mStempel.height ?? 1;
  const sudut = await Promise.all([
    alphaDi(STEMPEL, 0, 0),
    alphaDi(STEMPEL, w - 1, 0),
    alphaDi(STEMPEL, 0, h - 1),
    alphaDi(STEMPEL, w - 1, h - 1),
  ]);
  periksa(
    'sudut stempel transparan',
    sudut.every((a) => a === 0),
    `alpha sudut = [${sudut.join(', ')}] (harus semuanya 0)`
  );

  // 4 — tinta stempel harus selamat: sebagian piksel masih opak
  const { data: rawStempel } = await sharp(STEMPEL)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opak = 0;
  let total = 0;
  for (let i = 3; i < rawStempel.length; i += 4) {
    total++;
    if ((rawStempel[i] ?? 0) > 200) opak++;
  }
  const persenOpak = (opak / total) * 100;
  periksa(
    'tinta stempel utuh',
    persenOpak > 2 && persenOpak < 70,
    `${persenOpak.toFixed(1)}% piksel opak — tinta ada, latar sudah hilang`
  );

  // 5 & 6 — dimensi dan aspect ratio dipertahankan
  const rasio = (a?: number, b?: number) => (a && b ? a / b : 0);
  const bedaRasioStempel = Math.abs(
    rasio(mStempel.width, mStempel.height) - rasio(sStempel.width, sStempel.height)
  );
  periksa(
    'dimensi stempel',
    Math.max(w, h) <= 600 && bedaRasioStempel < 0.01,
    `${sStempel.width}x${sStempel.height} -> ${w}x${h}, selisih rasio ${bedaRasioStempel.toFixed(4)}`
  );

  const bedaRasioLogo = Math.abs(
    rasio(mLogo.width, mLogo.height) - rasio(sLogo.width, sLogo.height)
  );
  periksa(
    'dimensi logo',
    (mLogo.width ?? 0) <= 512 && bedaRasioLogo < 0.01,
    `${sLogo.width}x${sLogo.height} -> ${mLogo.width}x${mLogo.height}, selisih rasio ${bedaRasioLogo.toFixed(4)}`
  );

  // 7 — sumber tidak tersentuh
  periksa(
    'berkas sumber utuh',
    sLogo.width === 3210 && sStempel.width === 828,
    `logo ${sLogo.width}x${sLogo.height}, stempel ${sStempel.width}x${sStempel.height}`
  );

  console.log(gagal === 0 ? '\n  SELURUH PEMERIKSAAN LULUS\n' : `\n  ${gagal} PEMERIKSAAN GAGAL\n`);
  process.exit(gagal === 0 ? 0 : 1);
}

void main();
