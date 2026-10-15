/**
 * Gate T-098 — validasi & penyimpanan gambar sisi server.
 *
 *   - `foto.jpg` yang sebenarnya PDF ditolak (magic bytes, bukan ekstensi);
 *   - GPS hilang dari master (dibaca dengan exifr), piksel tidak di-encode ulang;
 *   - kegagalan di titik mana pun tidak menyisakan berkas maupun record.
 */
import exifr from 'exifr';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { FileTidakValidError, MAKS_BYTE, sanitasiNamaBerkas, validasiGambar } from '@/lib/images/server-validate';
import { bersihkanJpeg, bersihkanPng, bersihkanWebp } from '@/lib/images/strip-metadata';
import { unggahGambar, type DepsUnggah, type MasukanUnggah, type RecordGambar } from '@/lib/images/upload';

const GPS = {
  IFD0: { Make: 'PonselUji', Model: 'X1', Copyright: 'rahasia' },
  IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 7/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '106/1 9/1 0/1' },
};

let jpegGps: Buffer;
let pngTeks: Buffer;
let webpExif: Buffer;
let preview: Buffer;
let thumb: Buffer;

async function gambar(lebar: number, tinggi: number) {
  // Derau acak supaya kompresi tidak menghasilkan berkas remeh.
  const piksel = Buffer.alloc(lebar * tinggi * 3);
  for (let i = 0; i < piksel.length; i++) piksel[i] = (i * 7919) % 251;
  return sharp(piksel, { raw: { width: lebar, height: tinggi, channels: 3 } });
}

beforeAll(async () => {
  jpegGps = await (await gambar(800, 600)).jpeg({ quality: 90 }).withExif(GPS).toBuffer();
  pngTeks = await (await gambar(300, 200)).png().withExif(GPS).toBuffer();
  webpExif = await (await gambar(320, 240)).webp().withExif(GPS).toBuffer();
  preview = await (await gambar(640, 480)).webp({ quality: 78 }).toBuffer();
  thumb = await (await gambar(400, 300)).webp({ quality: 70 }).toBuffer();
});

/** Storage dalam memori yang dapat diperintah gagal pada operasi tertentu. */
function storageUji(gagalPada?: { put?: string; get?: boolean }) {
  const isi = new Map<string, Buffer>();
  const s: DepsUnggah['storage'] = {
    async put(key, data) {
      if (gagalPada?.put && key.includes(gagalPada.put)) throw new Error('storage putus');
      isi.set(key, Buffer.from(data as Buffer));
      return { key, size: (data as Buffer).length } as never;
    },
    async get(key) {
      if (gagalPada?.get) return Buffer.from('rusak');
      const b = isi.get(key);
      if (!b) throw new Error('tidak ada');
      return b;
    },
    async delete(key) {
      isi.delete(key);
    },
  };
  return { s, isi };
}

function masukan(ubah: Partial<MasukanUnggah> = {}): MasukanUnggah {
  return {
    master: jpegGps,
    preview,
    thumb,
    namaAsli: 'IMG_2026.jpg',
    meta: { original_width: 4000, original_height: 3000, original_mime_type: 'image/heic', kind: 'DOKUMEN', is_scanned: true },
    uploaderId: '11111111-1111-4111-8111-111111111111',
    ...ubah,
  };
}

describe('validasiGambar — jenis dari isi, bukan nama', () => {
  it('PDF bernama foto.jpg ditolak', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF');
    await expect(validasiGambar(pdf, 'master')).rejects.toThrow(/bukan gambar JPG, PNG, atau WEBP \(terdeteksi PDF\)/);
  });

  it('GIF ditolak walau gambar sah', async () => {
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } }).gif().toBuffer();
    await expect(validasiGambar(gif, 'master')).rejects.toBeInstanceOf(FileTidakValidError);
  });

  it('melebihi 15 MB ditolak dengan pesan ukuran', async () => {
    const besar = Buffer.concat([jpegGps, Buffer.alloc(MAKS_BYTE)]);
    await expect(validasiGambar(besar, 'master')).rejects.toThrow(/melebihi batas 15 MB/);
  });

  it('JPEG terpotong ditolak (decode penuh, bukan hanya kepala)', async () => {
    await expect(validasiGambar(jpegGps.subarray(0, Math.floor(jpegGps.length / 2)), 'master')).rejects.toThrow(/rusak atau terpotong|tidak dapat dibaca/);
  });

  it('thumbnail lebih besar dari 400px ditolak', async () => {
    await expect(validasiGambar(preview, 'thumb')).rejects.toThrow(/melebihi sisi maksimal 400px/);
  });

  it('tag orientasi tersisa ditolak (berkas tidak lewat pipeline)', async () => {
    const miring = await (await gambar(60, 40)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    await expect(validasiGambar(miring, 'master')).rejects.toThrow(/orientasi/);
  });
});

describe('metadata dibuang tanpa re-encode', () => {
  it('JPEG: GPS & perangkat hilang, data citra identik byte demi byte', async () => {
    expect((await exifr.gps(jpegGps))?.latitude).toBeLessThan(0); // prasyarat: GPS memang ada
    const hasil = await validasiGambar(jpegGps, 'master');
    expect(hasil.mime).toBe('image/jpeg');
    expect(await exifr.gps(hasil.isi)).toBeUndefined();
    expect(await exifr.parse(hasil.isi)).toBeUndefined();
    // Data setelah SOS (piksel terkompresi) tidak berubah sedikit pun.
    const sos = (b: Buffer) => b.subarray(b.indexOf(Buffer.from([0xff, 0xda])));
    expect(sos(hasil.isi).equals(sos(jpegGps))).toBe(true);
    expect(hasil.isi.length).toBeLessThan(jpegGps.length);
  });

  it('PNG & WebP: chunk EXIF dibuang, gambar tetap terbaca', async () => {
    for (const [b, fn] of [
      [pngTeks, bersihkanPng],
      [webpExif, bersihkanWebp],
    ] as const) {
      // exifr tidak membaca WebP; sharp membaca blok EXIF keduanya.
      expect((await sharp(b).metadata()).exif?.length).toBeGreaterThan(0);
      const bersih = fn(b);
      expect((await sharp(bersih).metadata()).exif).toBeUndefined();
      expect(bersih.includes(Buffer.from('PonselUji'))).toBe(false);
      expect((await sharp(bersih).stats()).channels.length).toBeGreaterThan(0);
    }
  });

  it('JPEG rusak struktur ditolak', () => {
    expect(() => bersihkanJpeg(Buffer.from([0xff, 0xd8, 0x00, 0x11]))).toThrow();
  });
});

describe('unggahGambar — semua atau tidak sama sekali', () => {
  it('sukses: tiga berkas ber-UUID, record dibuat setelah verifikasi', async () => {
    const { s, isi } = storageUji();
    const record: RecordGambar[] = [];
    const h = await unggahGambar(
      { storage: s, uuid: () => 'a1b2c3', simpanRecord: async (r) => (record.push(r), { id: 'img-1' }) },
      masukan(),
    );
    expect(h).toEqual({ id: 'img-1', master_width: 800, master_height: 600, master_mime_type: 'image/jpeg' });
    expect([...isi.keys()].sort()).toEqual(['nota/master/a1b2c3.jpg', 'nota/preview/a1b2c3.webp', 'nota/thumb/a1b2c3.webp']);
    expect(record[0]).toMatchObject({ original_filename: 'IMG_2026.jpg', storage_uuid: 'a1b2c3', master_mime_type: 'image/jpeg', kind: 'DOKUMEN' });
    expect(await exifr.gps(isi.get('nota/master/a1b2c3.jpg')!)).toBeUndefined();
  });

  for (const [nama, gagal, harapan] of [
    ['storage gagal di tengah (thumb)', { put: 'thumb' }, /storage putus/],
    ['verifikasi baca ulang gagal', { get: true }, /./],
  ] as const) {
    it(`${nama}: tidak ada berkas tersisa & tidak ada record`, async () => {
      const { s, isi } = storageUji(gagal);
      let dipanggil = false;
      await expect(
        unggahGambar({ storage: s, simpanRecord: async () => ((dipanggil = true), { id: 'x' }) }, masukan()),
      ).rejects.toThrow(harapan);
      expect(isi.size).toBe(0);
      expect(dipanggil).toBe(false);
    });
  }

  it('record gagal ditulis: berkas yang sudah tersimpan dihapus semua', async () => {
    const { s, isi } = storageUji();
    await expect(
      unggahGambar({ storage: s, simpanRecord: async () => Promise.reject(new Error('DB putus')) }, masukan()),
    ).rejects.toThrow('DB putus');
    expect(isi.size).toBe(0);
  });

  it('validasi gagal: storage tidak pernah disentuh', async () => {
    const { s, isi } = storageUji();
    await expect(unggahGambar({ storage: s, simpanRecord: async () => ({ id: 'x' }) }, masukan({ thumb: Buffer.from('%PDF-1.4') }))).rejects.toBeInstanceOf(
      FileTidakValidError,
    );
    expect(isi.size).toBe(0);
  });

  it('dimensi asli lebih kecil dari master ditolak sebelum menyimpan', async () => {
    const { s, isi } = storageUji();
    await expect(
      unggahGambar(
        { storage: s, simpanRecord: async () => ({ id: 'x' }) },
        masukan({ meta: { original_width: 100, original_height: 100, original_mime_type: 'image/jpeg', kind: 'FOTO', is_scanned: false } }),
      ),
    ).rejects.toThrow(/asli/);
    expect(isi.size).toBe(0);
  });
});

describe('sanitasiNamaBerkas', () => {
  it('membuang path traversal & karakter kendali', () => {
    expect(sanitasiNamaBerkas('../../etc/passwd')).toBe('passwd');
    expect(sanitasiNamaBerkas(String.raw`C:\Users\a\nota "toko".jpg`)).toBe('nota toko.jpg');
    expect(sanitasiNamaBerkas('...')).toBe('nota.jpg');
  });
});
