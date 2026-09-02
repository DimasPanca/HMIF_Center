/**
 * prepare-assets — menormalkan aset brand sumber menjadi aset siap pakai.
 *
 *   npx tsx scripts/prepare-assets.ts
 *
 * Menghasilkan dua berkas:
 *
 *   public/logo-hmif.png     dari  Design/LOGO HMIF - SHADOW@3x.png
 *   public/stempel-hmif.png  dari  Template/Stempel Digital HMIF.jpeg
 *
 * Stempel sumber berformat JPEG berlatar putih. JPEG tidak punya kanal alpha,
 * sehingga bila dipakai apa adanya sebagai overlay tanda tangan, kotak putihnya
 * akan menutupi teks surat di bawahnya. Skrip ini mengubah area putih menjadi
 * transparan agar stempel bisa ditumpuk di atas teks seperti stempel sungguhan.
 *
 * Berkas sumber di Design/ dan Template/ tidak pernah diubah.
 *
 * Sumber: docs/ai/tasks/P0-prasyarat.md T-005 · PRD §13.1
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const AKAR = process.cwd();

const SUMBER_LOGO = path.join(AKAR, 'Design', 'LOGO HMIF - SHADOW@3x.png');
const SUMBER_STEMPEL = path.join(AKAR, 'Template', 'Stempel Digital HMIF.jpeg');
const KELUARAN_LOGO = path.join(AKAR, 'public', 'logo-hmif.png');
const KELUARAN_STEMPEL = path.join(AKAR, 'public', 'stempel-hmif.png');

/** Lebar maksimum logo. Cukup untuk cetak, tidak membengkakkan bundle. */
const LOGO_MAX = 512;

/** Sisi terpanjang stempel. Di bawah ini, teks di dalam stempel mulai pecah. */
const STEMPEL_MAX = 600;

/**
 * Ambang luminance untuk latar putih.
 *
 * Di atas PUTIH_PENUH piksel dianggap latar → alpha 0.
 * Di bawah TINTA_PENUH piksel dianggap tinta → alpha 255.
 * Di antaranya alpha diinterpolasi linear, supaya tepi stempel tidak bergerigi.
 * JPEG selalu meninggalkan gradasi di tepi garis, jadi ambang tunggal
 * menghasilkan pinggiran kasar yang terlihat jelas saat dicetak.
 */
const PUTIH_PENUH = 240;
const TINTA_PENUH = 205;

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

async function siapkanLogo(): Promise<void> {
  const meta = await sharp(SUMBER_LOGO).metadata();
  const lebarAsli = meta.width ?? 0;

  // Jangan pernah memperbesar: sumber lebih kecil dari batas dibiarkan apa adanya.
  const lebar = Math.min(LOGO_MAX, lebarAsli);

  await sharp(SUMBER_LOGO)
    .resize({ width: lebar, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toFile(KELUARAN_LOGO);

  const hasil = await sharp(KELUARAN_LOGO).metadata();
  console.log(
    `  logo-hmif.png      ${lebarAsli}px -> ${hasil.width}x${hasil.height}px, ` +
      `alpha=${hasil.hasAlpha}, ${(fs.statSync(KELUARAN_LOGO).size / 1024).toFixed(0)} KB`
  );
}

async function siapkanStempel(): Promise<void> {
  const { data, info } = await sharp(SUMBER_STEMPEL)
    .resize({ width: STEMPEL_MAX, height: STEMPEL_MAX, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const piksel = new Uint8ClampedArray(data);
  let transparan = 0;

  for (let i = 0; i < piksel.length; i += 4) {
    const lum = luminance(piksel[i]!, piksel[i + 1]!, piksel[i + 2]!);

    if (lum >= PUTIH_PENUH) {
      piksel[i + 3] = 0;
      transparan++;
    } else if (lum > TINTA_PENUH) {
      // Tepi: alpha turun bertahap dari tinta menuju latar.
      piksel[i + 3] = Math.round(255 * (1 - (lum - TINTA_PENUH) / (PUTIH_PENUH - TINTA_PENUH)));
    }
    // lum <= TINTA_PENUH: tinta stempel, alpha 255 dari ensureAlpha().
  }

  await sharp(Buffer.from(piksel.buffer), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(KELUARAN_STEMPEL);

  const persen = ((transparan / (info.width * info.height)) * 100).toFixed(1);
  console.log(
    `  stempel-hmif.png   ${info.width}x${info.height}px, ` +
      `${persen}% piksel jadi transparan, ` +
      `${(fs.statSync(KELUARAN_STEMPEL).size / 1024).toFixed(0)} KB`
  );
}

async function main(): Promise<void> {
  for (const f of [SUMBER_LOGO, SUMBER_STEMPEL]) {
    if (!fs.existsSync(f)) {
      console.error(`\n  Berkas sumber tidak ditemukan: ${f}\n`);
      process.exit(1);
    }
  }
  fs.mkdirSync(path.join(AKAR, 'public'), { recursive: true });

  console.log('\n  prepare-assets — HMIF Center\n');
  await siapkanLogo();
  await siapkanStempel();
  console.log('\n  Selesai. Berkas sumber tidak diubah.\n');
}

void main();
