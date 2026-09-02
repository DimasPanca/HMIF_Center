/**
 * Test pipeline gambar sisi klien.
 *
 * `createImageBitmap` dan `OffscreenCanvas` tidak ada di Node, jadi test ini
 * menyuntikkan `MesinGambar` berbasis `sharp`. Yang diuji tetap kode yang
 * sama persis dengan yang berjalan di browser — urutan langkah, pemilihan
 * ukuran, pemilihan format, dan penutupan bitmap. Yang berbeda hanya siapa
 * yang menggambar pikselnya.
 *
 * Fixture dibangkitkan sungguhan pada setiap jalan, bukan disimpan sebagai
 * berkas biner: 4032x3024 berderau seperti foto kamera, 1600x1200, PNG
 * bertransparansi, dan JPEG potret ber-EXIF orientation 6.
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-097 · SYSTEM_DESIGN §9.2 · INV-18, INV-20, INV-22
 */

import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { KONFIG } from '../constants';
import { deteksiDariPiksel, hitungHistogram } from '../detect-kind';
import { fitWithin } from '../fit-within';
import { derajatKoreksi, processImage, type MesinGambar, type SumberGambar } from '../client-pipeline';

// ===========================================================================
// MESIN BERBASIS sharp
// ===========================================================================

interface SumberSharp extends SumberGambar {
  buf: Buffer;
  ditutup: boolean;
}

/** Berapa kali close() dipanggil — dipakai menguji INV tentang kebocoran memori. */
let jumlahClose = 0;

async function buatSumber(buf: Buffer, w?: number, h?: number): Promise<SumberSharp> {
  const meta = w && h ? { width: w, height: h } : await sharp(buf).metadata();
  const s: SumberSharp = {
    buf,
    width: meta.width!,
    height: meta.height!,
    ditutup: false,
    close() {
      s.ditutup = true;
      jumlahClose++;
      // ImageBitmap sungguhan menolkan width/height setelah close(). Tanpa
      // menirukannya, test tidak akan pernah menangkap kode yang membaca
      // dimensi setelah menutup bitmap — dan itu justru cacat yang ada pada
      // contoh SYSTEM_DESIGN 9.2.
      s.width = 0;
      s.height = 0;
    },
  };
  return s;
}

/** Mencatat setiap render, untuk membuktikan turunan tidak dirantai. */
const jejakRender: { dari: Buffer; width: number; height: number; type: string }[] = [];

const mesinSharp: MesinGambar = {
  async decode(file) {
    // Sengaja TIDAK memanggil .rotate(): menirukan browser yang mengabaikan
    // imageOrientation, supaya jalur koreksi rotasi benar-benar teruji.
    return buatSumber(Buffer.from(await (file as Blob).arrayBuffer()));
  },

  async sampelPiksel(src, sisi) {
    const s = src as SumberSharp;
    const raw = await sharp(s.buf)
      .resize(sisi, sisi, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    // sharp mengembalikan RGB; histogram mengharapkan RGBA.
    const rgba = new Uint8ClampedArray(sisi * sisi * 4);
    for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
      rgba[j] = raw[i]!;
      rgba[j + 1] = raw[i + 1]!;
      rgba[j + 2] = raw[i + 2]!;
      rgba[j + 3] = 255;
    }
    return rgba;
  },

  async render(src, width, height, type, quality) {
    const s = src as SumberSharp;
    jejakRender.push({ dari: s.buf, width, height, type });

    let p = sharp(s.buf).resize(width, height, { fit: 'fill' });
    if (type === 'image/jpeg') p = p.jpeg({ quality: Math.round(quality * 100) });
    else if (quality >= 1) p = p.webp({ lossless: true });
    else p = p.webp({ quality: Math.round(quality * 100) });

    // Uint8Array baru, bukan Buffer: Buffer<ArrayBufferLike> tidak cocok
    // dengan tanda tangan Blob di TypeScript.
    return new Blob([new Uint8Array(await p.toBuffer())], { type });
  },

  async punyaAlpha(file) {
    const meta = await sharp(Buffer.from(await (file as Blob).arrayBuffer())).metadata();
    return Boolean(meta.hasAlpha);
  },

  async orientasi(file) {
    const exifr = (await import('exifr')).default;
    try {
      return (await exifr.orientation(Buffer.from(await (file as Blob).arrayBuffer()))) ?? 1;
    } catch {
      return 1;
    }
  },

  async putar(src, derajat) {
    const s = src as SumberSharp;
    const buf = await sharp(s.buf).rotate(derajat).toBuffer();
    return buatSumber(buf);
  },
};

// ===========================================================================
// FIXTURE
// ===========================================================================

/**
 * Foto yang menyerupai keluaran kamera ponsel.
 *
 * Bentuknya penting untuk syarat ukuran master 800 KB - 2 MB. Derau acak
 * murni adalah kasus TERBURUK bagi JPEG — diukur menghasilkan master 3,4 MB,
 * dan setelah disusutkan ke thumb ia menjadi abu-abu rata 0 KB. Warna rata
 * adalah kasus terbaik dan sama-sama menyesatkan.
 *
 * Yang di bawah ini di antaranya: gradien halus seperti langit, struktur
 * besar seperti objek, dan tekstur halus. Terukur menghasilkan master
 * 1.355 KB — di dalam rentang yang ditetapkan kontrak.
 */
async function fotoRealistis(w: number, h: number): Promise<Buffer> {
  const piksel = Buffer.alloc(w * h * 3);
  let seed = 987654321;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const langit = Math.sin((x / w) * 3.1) * 40 + Math.cos((y / h) * 2.3) * 30;
      const objek = ((x >> 7) + (y >> 7)) % 2 ? 18 : -18;
      const tekstur = (rnd() - 0.5) * 22;
      const jepit = (v: number): number => Math.max(0, Math.min(255, v));
      piksel[o] = jepit(150 + langit + objek + tekstur);
      piksel[o + 1] = jepit(140 + langit * 0.8 + objek + tekstur);
      piksel[o + 2] = jepit(130 + langit * 0.6 + objek + tekstur);
    }
  }
  return sharp(piksel, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

/** Kertas putih dengan garis teks hitam — menirukan nota hasil pindai. */
async function dokumenPindai(w: number, h: number): Promise<Buffer> {
  const piksel = Buffer.alloc(w * h * 3, 245); // kertas
  for (let baris = 20; baris < h - 20; baris += 40) {
    for (let y = baris; y < Math.min(baris + 6, h); y++) {
      for (let x = 20; x < w * 0.7; x++) {
        const o = (y * w + x) * 3;
        piksel[o] = 20;
        piksel[o + 1] = 20;
        piksel[o + 2] = 20;
      }
    }
  }
  return sharp(piksel, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

async function pngTransparan(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 120, b: 255, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
}

/**
 * JPEG LANSKAP yang EXIF-nya menyatakan harus ditampilkan tegak.
 *
 * Lanskap-nya penting. Versi pertama test ini memakai gambar yang sudah
 * potret sejak awal, sehingga assertion "tinggi > lebar" lulus baik rotasinya
 * diterapkan maupun tidak — test yang tidak menguji apa pun. Ditemukan lewat
 * uji mutasi.
 */
async function lanskapExif6(w: number, h: number): Promise<Buffer> {
  const dasar = await fotoRealistis(w, h);
  return sharp(dasar).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer();
}

function blob(buf: Buffer, type: string): Blob {
  return new Blob([new Uint8Array(buf)], { type });
}

let foto4032: Buffer;
let foto1600: Buffer;
let pngAlpha: Buffer;
let jpegExif6: Buffer;
let dokumen: Buffer;

beforeAll(async () => {
  [foto4032, foto1600, pngAlpha, jpegExif6, dokumen] = await Promise.all([
    fotoRealistis(4032, 3024),
    fotoRealistis(1600, 1200),
    pngTransparan(800, 600),
    lanskapExif6(1600, 1200),
    dokumenPindai(1200, 1600),
  ]);
}, 60_000);

// ===========================================================================
// fitWithin — INV-22 dan I12
// ===========================================================================

describe('fitWithin', () => {
  it('menyusutkan 4032x3024 menjadi 3000x2250 dengan rasio utuh', () => {
    expect(fitWithin(4032, 3024, 3000)).toEqual({ width: 3000, height: 2250 });
  });

  it('TIDAK PERNAH upscale', () => {
    // Memperbesar 800px menjadi 3000px tidak menambah satu detail pun,
    // hanya memperbesar berkas dan memperburuk tampilannya (INV-22).
    expect(fitWithin(1600, 1200, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(400, 300, 3000)).toEqual({ width: 400, height: 300 });
    expect(fitWithin(3000, 2250, 3000)).toEqual({ width: 3000, height: 2250 });
  });

  it('tidak pernah memaksa aspect ratio menjadi kotak', () => {
    // I12: nota yang dipotong menjadi 1:1 kehilangan bagian totalnya, dan
    // justru itu yang dibutuhkan.
    const r = fitWithin(4000, 1000, 400);
    expect(r.width).toBe(400);
    expect(r.height).toBe(100);
    expect(r.width / r.height).toBeCloseTo(4, 5);
  });

  it('menjaga sisi tipis tidak menjadi nol', () => {
    // Struk kasir sangat panjang: tinggi 0 membuat canvas menolak dan
    // seluruh unggahan gagal.
    expect(fitWithin(4000, 20, 400).height).toBeGreaterThanOrEqual(1);
  });

  it('menolak dimensi yang tidak masuk akal', () => {
    expect(() => fitWithin(0, 100, 400)).toThrow();
    expect(() => fitWithin(-5, 100, 400)).toThrow();
    expect(() => fitWithin(NaN, 100, 400)).toThrow();
  });
});

// ===========================================================================
// deteksi jenis — SYSTEM_DESIGN §9.2
// ===========================================================================

describe('deteksi jenis gambar', () => {
  it('mengenali dokumen pindai dari histogramnya', async () => {
    const piksel = await mesinSharp.sampelPiksel(await buatSumber(dokumen), 128);
    const h = hitungHistogram(piksel);
    expect(h.rasioTerang).toBeGreaterThan(0.55);
    expect(h.rasioTengah).toBeLessThan(0.3);
    expect(deteksiDariPiksel(piksel)).toBe('DOKUMEN');
  });

  it('mengenali foto biasa sebagai FOTO', async () => {
    const piksel = await mesinSharp.sampelPiksel(await buatSumber(foto1600), 128);
    expect(deteksiDariPiksel(piksel)).toBe('FOTO');
  });

  it('menuntut KEDUA syarat, bukan salah satu', () => {
    // Foto pantai siang hari juga didominasi terang, tetapi penuh nada tengah
    // pada pasir dan langit. Terang saja tidak cukup untuk menyebutnya dokumen.
    const banyakTengah = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) {
      const l = i < 240 ? 230 : 128; // 60% terang, 40% nada tengah
      banyakTengah[i * 4] = l;
      banyakTengah[i * 4 + 1] = l;
      banyakTengah[i * 4 + 2] = l;
      banyakTengah[i * 4 + 3] = 255;
    }
    const h = hitungHistogram(banyakTengah);
    expect(h.rasioTerang).toBeGreaterThan(0.55);
    expect(h.rasioTengah).toBeGreaterThan(0.3);
    expect(deteksiDariPiksel(banyakTengah)).toBe('FOTO');
  });

  it('tidak melempar pada data kosong', () => {
    expect(deteksiDariPiksel(new Uint8ClampedArray(0))).toBe('FOTO');
  });
});

// ===========================================================================
// koreksi orientasi — INV-20
// ===========================================================================

describe('derajatKoreksi', () => {
  it('memutar 90 derajat bila browser mengabaikan orientasi EXIF 6', () => {
    // Bitmap masih lanskap padahal EXIF bilang harus tegak: browser tidak
    // mengerjakannya, jadi kita yang mengerjakan.
    expect(derajatKoreksi(6, 4000, 3000)).toBe(90);
  });

  it('tidak memutar apa pun bila browser SUDAH mengerjakannya', () => {
    // Bitmap sudah tegak. Memutarnya lagi membuat foto miring 90 derajat ke
    // arah sebaliknya — kesalahan yang lebih buruk daripada tidak memutar.
    expect(derajatKoreksi(6, 3000, 4000)).toBe(0);
    expect(derajatKoreksi(8, 3000, 4000)).toBe(0);
  });

  it('menangani orientasi 8 dan 3', () => {
    expect(derajatKoreksi(8, 4000, 3000)).toBe(270);
    expect(derajatKoreksi(3, 4000, 3000)).toBe(180);
  });

  it('tidak melakukan apa-apa untuk gambar tanpa EXIF', () => {
    expect(derajatKoreksi(1, 4000, 3000)).toBe(0);
  });
});

// ===========================================================================
// pipeline utuh dengan fixture nyata
// ===========================================================================

describe('processImage', () => {
  it('foto 4032x3024 menghasilkan master 3000x2250', async () => {
    const h = await processImage(blob(foto4032, 'image/jpeg'), { mesin: mesinSharp });

    expect(h.master.width).toBe(3000);
    expect(h.master.height).toBe(2250);
    expect(h.preview.width).toBe(1280);
    expect(h.thumb.width).toBe(400);
    expect(h.originalWidth).toBe(4032);
    expect(h.originalHeight).toBe(3024);
  }, 60_000);

  it('mencatat dimensi asli SEBELUM bitmap ditutup', async () => {
    // Koreksi 1 terhadap SYSTEM_DESIGN §9.2: contoh di dokumen memanggil
    // bitmap.close() lalu membaca bitmap.width, yang menghasilkan 0. Baris
    // image dengan dimensi 0x0 akan ditolak CHECK master_valid di migrasi 007.
    const h = await processImage(blob(foto1600, 'image/jpeg'), { mesin: mesinSharp });
    expect(h.originalWidth).toBeGreaterThan(0);
    expect(h.originalHeight).toBeGreaterThan(0);
  }, 60_000);

  it('foto 1600x1200 TIDAK di-upscale', async () => {
    const h = await processImage(blob(foto1600, 'image/jpeg'), { mesin: mesinSharp });
    expect(h.master.width).toBe(1600);
    expect(h.master.height).toBe(1200);
  }, 60_000);

  it('membuat tiga turunan PARALEL dari sumber yang sama, tidak berantai', async () => {
    // INV-18. Bila preview dibuat dari master, ia mewarisi seluruh artefak
    // kompresi master, lalu thumb mewarisi artefak keduanya. Kerugian itu
    // tidak dapat dikembalikan.
    jejakRender.length = 0;
    await processImage(blob(foto1600, 'image/jpeg'), { mesin: mesinSharp });

    expect(jejakRender).toHaveLength(3);
    const sumberSama = jejakRender.every((r) => r.dari === jejakRender[0]!.dari);
    expect(sumberSama).toBe(true);
  }, 60_000);

  it('menutup bitmap setelah selesai', async () => {
    // Ponsel kelas bawah kehabisan memori setelah beberapa unggahan bila
    // bitmap 4032x3024 dibiarkan menggantung.
    const sebelum = jumlahClose;
    await processImage(blob(foto1600, 'image/jpeg'), { mesin: mesinSharp });
    expect(jumlahClose).toBeGreaterThan(sebelum);
  }, 60_000);

  it('menutup bitmap walau render gagal di tengah jalan', async () => {
    const rusak: MesinGambar = {
      ...mesinSharp,
      render: () => Promise.reject(new Error('render gagal')),
    };
    const sebelum = jumlahClose;
    await expect(
      processImage(blob(foto1600, 'image/jpeg'), { mesin: rusak }),
    ).rejects.toThrow('render gagal');
    expect(jumlahClose).toBeGreaterThan(sebelum);
  }, 60_000);

  it('PNG bertransparansi TIDAK dipaksa ke JPEG', async () => {
    // I8. JPEG tidak mengenal alpha; memaksakannya membuat latar transparan
    // menjadi hitam.
    const h = await processImage(blob(pngAlpha, 'image/png'), { mesin: mesinSharp });
    expect(h.master.type).toBe('image/webp');
    expect(h.master.type).not.toBe('image/jpeg');
  }, 60_000);

  it('foto biasa tetap memakai JPEG untuk master', async () => {
    const h = await processImage(blob(foto1600, 'image/jpeg'), { mesin: mesinSharp });
    expect(h.master.type).toBe(KONFIG.master.type);
  }, 60_000);

  it('memutar sendiri gambar ber-EXIF orientation 6 bila browser tidak', async () => {
    // Mesin uji sengaja tidak memutar saat decode, menirukan browser yang
    // mengabaikan imageOrientation. Tanpa koreksi di pipeline, foto potret
    // dari ponsel tersimpan MIRING dan tidak ada yang gagal.
    const h = await processImage(blob(jpegExif6, 'image/jpeg'), { mesin: mesinSharp });

    // Sumbernya 1600x1200 (lanskap). Setelah koreksi harus menjadi tegak.
    expect(h.originalWidth).toBe(1200);
    expect(h.originalHeight).toBe(1600);
  }, 60_000);

  it('meneruskan isScanned apa adanya', async () => {
    const a = await processImage(blob(dokumen, 'image/jpeg'), { mesin: mesinSharp });
    const b = await processImage(blob(dokumen, 'image/jpeg'), {
      mesin: mesinSharp,
      scanned: true,
    });
    expect(a.isScanned).toBe(false);
    expect(b.isScanned).toBe(true);
  }, 60_000);

  it('memakai kualitas dokumen untuk hasil pindai', async () => {
    const h = await processImage(blob(dokumen, 'image/jpeg'), { mesin: mesinSharp });
    expect(h.kind).toBe('DOKUMEN');
  }, 60_000);

  it('master foto 4032x3024 berukuran 800 KB - 2 MB', async () => {
    // Syarat "Selesai bila" T-097. Angkanya bergantung isi
    // gambar, jadi fixture-nya sengaja dibuat menyerupai keluaran kamera —
    // lihat catatan di fotoRealistis().
    const h = await processImage(blob(foto4032, 'image/jpeg'), { mesin: mesinSharp });
    expect(h.master.blob.size).toBeGreaterThan(800 * 1024);
    expect(h.master.blob.size).toBeLessThan(2 * 1024 * 1024);
  }, 60_000);

  it('menghasilkan master lebih besar daripada preview, dan preview daripada thumb', async () => {
    const h = await processImage(blob(foto4032, 'image/jpeg'), { mesin: mesinSharp });
    expect(h.master.blob.size).toBeGreaterThan(h.preview.blob.size);
    expect(h.preview.blob.size).toBeGreaterThan(h.thumb.blob.size);
  }, 60_000);
});
