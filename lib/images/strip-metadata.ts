/**
 * Pembuang metadata gambar TANPA menyentuh piksel (T-098 #4, PRD I5).
 *
 * ===========================================================================
 * KENAPA TIDAK `sharp().withMetadata({ exif: {} }).toBuffer()`
 * ===========================================================================
 * Contoh di SYSTEM_DESIGN §9.3 memakai sharp, tetapi sharp SELALU men-decode
 * lalu meng-encode ulang keluarannya — master JPEG nota dikompresi kedua
 * kalinya, persis yang dilarang I3 ("tidak pernah rekompresi") dan yang
 * merusak tepi teks angka pada nota. Maksud kontraknya "tanpa re-encode
 * piksel"; satu-satunya cara jujur memenuhinya adalah membuang SEGMEN
 * metadata pada tingkat byte dan menyalin data gambar apa adanya:
 *
 *   JPEG  buang APP1 (EXIF/XMP — tempat GPS & nomor seri), APP13 (IPTC),
 *         COM; pertahankan APP0 (JFIF), APP2 (profil ICC), APP14 (Adobe).
 *   PNG   buang eXIf, tEXt, zTXt, iTXt, tIME.
 *   WebP  buang chunk EXIF & XMP, matikan bendera VP8X-nya, perbaiki ukuran RIFF.
 *
 * Orientasi EXIF ikut terbuang — aman, karena pipeline klien (T-097) sudah
 * memutar pikselnya; server menolak gambar yang masih bergantung pada tag
 * orientasi (lihat server-validate).
 *
 * Murni (Buffer → Buffer), diuji unit. Sumber: T-098 · PRD F-11.2 I3, I5 · ADR-031
 */

export class MetadataRusakError extends Error {}

function bacaU16(b: Buffer, i: number): number {
  if (i + 2 > b.length) throw new MetadataRusakError('Struktur JPEG terpotong.');
  return b.readUInt16BE(i);
}

const APP_DIBUANG = new Set([0xe1, 0xed, 0xfe]); // APP1, APP13, COM

export function bersihkanJpeg(b: Buffer): Buffer {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new MetadataRusakError('Bukan JPEG.');
  const bagian: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new MetadataRusakError('Penanda JPEG tidak sah.');
    const penanda = b[i + 1]!;
    // Pengisi 0xFF berulang diperbolehkan sebelum penanda.
    if (penanda === 0xff) {
      i++;
      continue;
    }
    // SOS: sisa berkas adalah data citra terkompresi + EOI — disalin utuh.
    if (penanda === 0xda) {
      bagian.push(b.subarray(i));
      return Buffer.concat(bagian);
    }
    // Penanda tanpa panjang (RSTn, TEM, EOI).
    if ((penanda >= 0xd0 && penanda <= 0xd7) || penanda === 0x01 || penanda === 0xd9) {
      bagian.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const panjang = bacaU16(b, i + 2);
    if (panjang < 2 || i + 2 + panjang > b.length) throw new MetadataRusakError('Segmen JPEG terpotong.');
    const akhir = i + 2 + panjang;
    if (!APP_DIBUANG.has(penanda)) bagian.push(b.subarray(i, akhir));
    i = akhir;
  }
  throw new MetadataRusakError('JPEG tanpa data citra (SOS).');
}

const CHUNK_PNG_DIBUANG = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
const TANDA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function bersihkanPng(b: Buffer): Buffer {
  if (!b.subarray(0, 8).equals(TANDA_PNG)) throw new MetadataRusakError('Bukan PNG.');
  const bagian: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  while (i < b.length) {
    if (i + 12 > b.length) throw new MetadataRusakError('Chunk PNG terpotong.');
    const panjang = b.readUInt32BE(i);
    const jenis = b.subarray(i + 4, i + 8).toString('latin1');
    const akhir = i + 12 + panjang;
    if (akhir > b.length) throw new MetadataRusakError('Chunk PNG terpotong.');
    if (!CHUNK_PNG_DIBUANG.has(jenis)) bagian.push(b.subarray(i, akhir));
    i = akhir;
    if (jenis === 'IEND') return Buffer.concat(bagian);
  }
  throw new MetadataRusakError('PNG tanpa IEND.');
}

export function bersihkanWebp(b: Buffer): Buffer {
  if (b.subarray(0, 4).toString('latin1') !== 'RIFF' || b.subarray(8, 12).toString('latin1') !== 'WEBP') {
    throw new MetadataRusakError('Bukan WebP.');
  }
  const bagian: Buffer[] = [];
  let i = 12;
  while (i < b.length) {
    if (i + 8 > b.length) throw new MetadataRusakError('Chunk WebP terpotong.');
    const jenis = b.subarray(i, i + 4).toString('latin1');
    const panjang = b.readUInt32LE(i + 4);
    const akhir = i + 8 + panjang + (panjang % 2); // chunk RIFF berpadding genap
    if (i + 8 + panjang > b.length) throw new MetadataRusakError('Chunk WebP terpotong.');
    if (jenis === 'VP8X') {
      const salinan = Buffer.from(b.subarray(i, Math.min(akhir, b.length)));
      // Bendera VP8X: bit 3 = EXIF, bit 2 = XMP. Dimatikan karena chunk-nya dibuang.
      salinan[8] = salinan[8]! & ~0x0c;
      bagian.push(salinan);
    } else if (jenis !== 'EXIF' && jenis !== 'XMP ') {
      bagian.push(b.subarray(i, Math.min(akhir, b.length)));
    }
    i = akhir;
  }
  const isi = Buffer.concat(bagian);
  const kepala = Buffer.alloc(12);
  kepala.write('RIFF', 0, 'latin1');
  kepala.writeUInt32LE(isi.length + 4, 4);
  kepala.write('WEBP', 8, 'latin1');
  return Buffer.concat([kepala, isi]);
}

export function bersihkanMetadata(b: Buffer, mime: string): Buffer {
  if (mime === 'image/jpeg') return bersihkanJpeg(b);
  if (mime === 'image/png') return bersihkanPng(b);
  if (mime === 'image/webp') return bersihkanWebp(b);
  throw new MetadataRusakError(`Jenis ${mime} tidak didukung.`);
}
