/**
 * Test Storage Adapter.
 *
 * Dua bagian dengan sifat berbeda:
 *
 *   MURNI       penamaan key, pemilihan bucket, pemilihan driver, batas umur
 *               signed URL. Tidak menyentuh jaringan, selalu berjalan.
 *
 *   NYATA       benar-benar mengunggah ke bucket dev lalu membuktikan berkas
 *               privat TIDAK dapat diambil tanpa signed URL. Ini tidak bisa
 *               dipalsukan dengan mock: yang diuji justru perilaku Supabase
 *               Storage, bukan perilaku kode kita. Dilewati bila kredensial
 *               tidak ada.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-044 · SYSTEM_DESIGN §12, §18.1 · INV-19
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// .env.local dimuat manual — vitest tidak membacanya.
const AKAR = path.resolve(import.meta.dirname, '..', '..', '..');
const berkasEnv = path.join(AKAR, '.env.local');
if (fs.existsSync(berkasEnv)) {
  for (const baris of fs.readFileSync(berkasEnv, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const nama = t.slice(0, i).trim();
    if (!process.env[nama]) process.env[nama] = t.slice(i + 1).trim();
  }
}

const {
  bucketUntuk,
  buatAdapter,
  keys,
  DETIK_SIGNED_URL,
  MAKS_DETIK_SIGNED_URL,
  NotImplementedError,
  SalahBucketError,
} = await import('../index');
const { pastikanBucketCocok } = await import('../keys');

const adaKredensial = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);

// ===========================================================================
// BAGIAN MURNI
// ===========================================================================

describe('keys — bentuk key menentukan bucket', () => {
  it('menaruh master nota DAN seluruh turunannya di bucket privat (ADR-011)', () => {
    // Inti INV-19 + ADR-011. Master hanya keluar lewat endpoint unduh;
    // preview/thumbnail memuat data keuangan yang sama — hanya lewat signed URL.
    expect(bucketUntuk(keys.notaMaster('abc'))).toBe('private');
    expect(bucketUntuk(keys.notaPreview('abc'))).toBe('private');
    expect(bucketUntuk(keys.notaThumb('abc'))).toBe('private');
  });

  it('menaruh tanda tangan di privat, avatar di publik', () => {
    // Tanda tangan adalah data pribadi yang dapat disalahgunakan; foto profil
    // memang ditampilkan di seluruh antarmuka.
    expect(bucketUntuk(keys.ttd('u1'))).toBe('private');
    expect(bucketUntuk(keys.avatar('u1'))).toBe('public');
  });

  it('menaruh seluruh dokumen, template, dan backup di privat', () => {
    for (const k of [
      keys.suratDocx('s1'),
      keys.suratPdf('s1'),
      keys.proposalDocx('k1'),
      keys.torDocx('k1'),
      keys.lpjDocx('k1'),
      keys.rabXlsx('k1'),
      keys.template('t1', 2),
      keys.backup('b1', 'skema.sql'),
    ]) {
      expect(bucketUntuk(k)).toBe('private');
    }
  });

  it('memakai daftar putih: prefix tak dikenal jatuh ke privat', () => {
    // Sifat yang disengaja. Jenis berkas baru yang lupa didaftarkan menjadi
    // privat — merepotkan, tetapi tidak membocorkan apa pun.
    expect(bucketUntuk('jenis/baru/belum-terdaftar.bin')).toBe('private');
  });

  it('menolak segmen yang mengandung path traversal', () => {
    // Nilai ini datang dari data. `../` di storage sama berbahayanya dengan
    // di filesystem.
    expect(() => keys.notaMaster('../../etc/passwd')).toThrow(/path/i);
    expect(() => keys.ttd('a/b')).toThrow(/path/i);
    expect(() => keys.avatar('')).toThrow(/kosong/i);
  });

  it('menghasilkan bentuk key persis SYSTEM_DESIGN 12.2', () => {
    expect(keys.notaMaster('u')).toBe('nota/master/u.webp');
    expect(keys.ttd('u')).toBe('ttd/u.png');
    expect(keys.suratDocx('s')).toBe('dokumen/surat/s.docx');
    expect(keys.template('t', 3)).toBe('template/t_v3.docx');
    expect(keys.backup('b', 'x.sql')).toBe('backup/b/x.sql');
  });
});

describe('pastikanBucketCocok — permintaan pemanggil tidak boleh menang', () => {
  it('menolak master nota yang diminta publik', () => {
    // Satu baris ini yang mencegah seluruh arsip nota keuangan pindah ke
    // bucket terbuka karena satu argumen yang salah.
    expect(() => pastikanBucketCocok(keys.notaMaster('x'), true)).toThrow(SalahBucketError);
  });

  it('menolak thumbnail nota yang diminta publik, dan avatar yang diminta privat', () => {
    expect(() => pastikanBucketCocok(keys.notaThumb('x'), true)).toThrow(SalahBucketError);
    expect(() => pastikanBucketCocok(keys.avatar('x'), false)).toThrow(SalahBucketError);
  });

  it('menerima bila permintaan cocok, dan bila tidak diminta apa-apa', () => {
    expect(pastikanBucketCocok(keys.notaMaster('x'), false)).toBe('private');
    expect(pastikanBucketCocok(keys.avatar('x'), true)).toBe('public');
    expect(pastikanBucketCocok(keys.notaMaster('x'))).toBe('private');
  });
});

describe('pemilihan driver', () => {
  it('memakai Supabase saat STORAGE_DRIVER kosong atau supabase', () => {
    expect(buatAdapter('supabase').constructor.name).toBe('SupabaseStorageAdapter');
    expect(buatAdapter(undefined).constructor.name).toBe('SupabaseStorageAdapter');
    expect(buatAdapter('').constructor.name).toBe('SupabaseStorageAdapter');
  });

  it('mengembalikan adapter yang diminta, bukan yang bawaan', () => {
    // Bukti bahwa mengganti backend cukup mengubah satu environment variable.
    expect(buatAdapter('gdrive').constructor.name).toBe('GoogleDriveAdapter');
    expect(buatAdapter('local').constructor.name).toBe('LocalDiskAdapter');
    expect(buatAdapter('s3').constructor.name).toBe('S3Adapter');
  });

  it('DAPAT DIBUAT TANPA KREDENSIAL APA PUN', () => {
    // Regresi. Versi pertama membaca environment variable di constructor,
    // sehingga sekadar MEMILIH driver menuntut SUPABASE_SECRET_KEY. Lane ui
    // melaporkannya: `npm run verify` di worktree mereka gagal, padahal
    // worktree itu memang sengaja tidak diberi secret key (hak minimum).
    //
    // Akibatnya bukan hanya di test — `next build` mengevaluasi modul yang
    // diimpor, jadi satu halaman yang mengimpor tipe dari sini akan
    // menggagalkan build Vercel bila env-nya belum lengkap.
    const simpan = { ...process.env };
    for (const k of [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'STORAGE_BUCKET_PRIVATE',
      'STORAGE_BUCKET_PUBLIC',
    ]) {
      delete process.env[k];
    }

    try {
      expect(() => buatAdapter('supabase')).not.toThrow();
      expect(() => buatAdapter('gdrive')).not.toThrow();
      expect(() => buatAdapter('local')).not.toThrow();
      expect(() => buatAdapter('s3')).not.toThrow();

      // Tetapi memakainya TANPA kredensial harus gagal keras, dan pesannya
      // harus menyebut nama variabelnya.
      expect(() => buatAdapter('supabase').getPublicUrl('aset/x.png')).toThrow(
        /NEXT_PUBLIC_SUPABASE_URL/,
      );
    } finally {
      Object.assign(process.env, simpan);
    }
  });

  it('menolak nama driver yang tidak dikenal alih-alih jatuh ke bawaan', () => {
    // Deployment yang dikira memakai S3 tetapi diam-diam menulis ke Supabase
    // baru ketahuan saat mencari berkas di tempat yang salah.
    expect(() => buatAdapter('s33')).toThrow(/tidak dikenal/i);
  });

  it('stub melempar pesan yang menyebut jalan keluarnya', () => {
    const g = buatAdapter('gdrive');
    expect(() => g.getPublicUrl('aset/x.png')).toThrow(NotImplementedError);
    expect(() => g.getPublicUrl('aset/x.png')).toThrow(/STORAGE_DRIVER=supabase/);
  });

  it('ketiga stub memenuhi kontrak yang sama', () => {
    // Kalau kontraknya tidak dapat diisi backend lain, abstraksinya tidak ada
    // gunanya sejak awal.
    const metode = ['put', 'get', 'getSignedUrl', 'getPublicUrl', 'delete', 'list', 'exists'];
    for (const d of ['gdrive', 'local', 's3'] as const) {
      const a = buatAdapter(d) as unknown as Record<string, unknown>;
      for (const m of metode) expect(typeof a[m]).toBe('function');
    }
  });
});

describe.skipIf(!adaKredensial)('batas umur signed URL', () => {
  it('menolak umur melewati batas SYSTEM_DESIGN 18.1', async () => {
    const a = buatAdapter('supabase');
    await expect(a.getSignedUrl(keys.notaMaster('x'), 86_400)).rejects.toThrow(/melebihi batas/i);
    await expect(a.getSignedUrl(keys.notaMaster('x'), MAKS_DETIK_SIGNED_URL + 1)).rejects.toThrow();
  });

  it('menolak umur nol atau negatif', async () => {
    const a = buatAdapter('supabase');
    await expect(a.getSignedUrl(keys.notaMaster('x'), 0)).rejects.toThrow(/positif/i);
    await expect(a.getSignedUrl(keys.notaMaster('x'), -1)).rejects.toThrow(/positif/i);
  });
});

// ===========================================================================
// BAGIAN NYATA — terhadap bucket dev sungguhan
// ===========================================================================

const UJI = `uji-t044-${Date.now()}`;
const KUNCI_PRIVAT = keys.notaMaster(UJI);
const KUNCI_PUBLIK = keys.avatar(UJI);
const ISI = Buffer.from(`berkas uji T-044 ${UJI}`, 'utf8');

afterAll(async () => {
  if (!adaKredensial) return;
  const a = buatAdapter('supabase');
  for (const k of [KUNCI_PRIVAT, KUNCI_PUBLIK]) {
    try {
      await a.delete(k);
    } catch {
      // Sudah tidak ada, atau memang gagal diunggah. Tidak menutupi apa pun:
      // assertion di bawah yang menentukan lulus atau tidak.
    }
  }
});

describe.skipIf(!adaKredensial)('bucket privat sungguhan', () => {
  it('menyimpan, memeriksa keberadaan, dan mengambil kembali isi yang sama', async () => {
    const a = buatAdapter('supabase');

    expect(await a.exists(KUNCI_PRIVAT)).toBe(false);
    await a.put(KUNCI_PRIVAT, ISI, 'application/octet-stream');
    expect(await a.exists(KUNCI_PRIVAT)).toBe(true);

    const kembali = await a.get(KUNCI_PRIVAT);
    expect(kembali.toString('utf8')).toBe(ISI.toString('utf8'));
  });

  it('TIDAK dapat diambil lewat URL publik langsung', async () => {
    // Inti "Selesai bila" T-044. URL disusun tangan persis seperti yang akan
    // dicoba seseorang yang menebak polanya. Supabase harus menolaknya.
    const dasar = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, '');
    const bucket = process.env.STORAGE_BUCKET_PRIVATE ?? 'private';
    const url = `${dasar}/storage/v1/object/public/${bucket}/${KUNCI_PRIVAT}`;

    const r = await fetch(url);
    expect(r.ok).toBe(false);
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('menolak memberi URL publik untuk key privat', async () => {
    // Mengembalikan URL yang berbentuk benar tetapi selalu ditolak hanya
    // memindahkan kegagalan ke gambar yang tidak muncul, tanpa pesan apa pun.
    const a = buatAdapter('supabase');
    expect(() => a.getPublicUrl(KUNCI_PRIVAT)).toThrow(SalahBucketError);
    expect(() => a.getPublicUrl(KUNCI_PRIVAT)).toThrow(/getSignedUrl/);
  });

  it('DAPAT diambil lewat signed URL, dengan isi yang utuh', async () => {
    const a = buatAdapter('supabase');
    const url = await a.getSignedUrl(KUNCI_PRIVAT, DETIK_SIGNED_URL);

    expect(url).toContain('token=');
    const r = await fetch(url);
    expect(r.ok).toBe(true);
    expect(Buffer.from(await r.arrayBuffer()).toString('utf8')).toBe(ISI.toString('utf8'));
  });

  it('muncul di list() dengan ukuran yang benar', async () => {
    const a = buatAdapter('supabase');
    const isi = await a.list(keys.prefixNotaMaster);
    const ketemu = isi.find((o) => o.key === KUNCI_PRIVAT);

    expect(ketemu).toBeDefined();
    expect(ketemu!.size).toBe(ISI.byteLength);
  });

  it('benar-benar hilang setelah delete', async () => {
    const a = buatAdapter('supabase');
    await a.delete(KUNCI_PRIVAT);
    expect(await a.exists(KUNCI_PRIVAT)).toBe(false);
  });
});

describe.skipIf(!adaKredensial)('bucket publik sungguhan', () => {
  it('dapat diambil lewat URL publik tanpa tanda tangan apa pun', async () => {
    const a = buatAdapter('supabase');
    await a.put(KUNCI_PUBLIK, ISI, 'image/webp');

    const url = a.getPublicUrl(KUNCI_PUBLIK);
    expect(url).not.toContain('token=');

    const r = await fetch(url);
    expect(r.ok).toBe(true);
    expect(Buffer.from(await r.arrayBuffer()).toString('utf8')).toBe(ISI.toString('utf8'));
  });

  it('menolak menyimpan master nota ke bucket publik', async () => {
    // Percobaan yang akan membocorkan seluruh arsip nota, ditolak sebelum
    // satu byte pun terkirim.
    const a = buatAdapter('supabase');
    await expect(
      a.put(keys.notaMaster(UJI), ISI, 'image/webp', { public: true }),
    ).rejects.toThrow(SalahBucketError);
  });
});
