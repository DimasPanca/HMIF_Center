/**
 * Test lapisan sesi dan pembatas percobaan login.
 *
 * Dua bagian:
 *
 *   MURNI   `tujuanAman` dan pembantu lain. Tidak menyentuh apa pun, selalu
 *           berjalan. `tujuanAman` mendapat porsi terbesar karena ia
 *           satu-satunya yang berdiri di antara halaman login yang sah dan
 *           penyalahgunaannya sebagai batu loncatan phishing.
 *
 *   NYATA   `periksaBatas` terhadap database sungguhan. Perilaku yang diuji
 *           — hitungan direset oleh login sukses pada `audit_log` yang
 *           append-only — tidak dapat dipalsukan dengan mock, karena yang
 *           diuji justru kuerinya.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-045 · PRD F-1.1 · USER_FLOW §2.3
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const adaDb = Boolean(process.env.DATABASE_URL);

const { tujuanAman } = await import('../session');
const { normalkanEmail, kalimatTunggu, periksaBatas, BATAS_PERCOBAAN, MENIT_JENDELA, ENTITAS_AUTH } =
  await import('../rate-limit');

// ===========================================================================
// MURNI
// ===========================================================================

describe('tujuanAman — pencegah open redirect', () => {
  it('menerima path relatif biasa', () => {
    expect(tujuanAman('/proker')).toBe('/proker');
    expect(tujuanAman('/surat/baru?jenis=05')).toBe('/surat/baru?jenis=05');
    expect(tujuanAman('/kepanitiaan/abc-123')).toBe('/kepanitiaan/abc-123');
  });

  it('menolak URL absolut ke domain lain', () => {
    // Inti masalahnya. Tautan /login?next=https://situs-palsu.example membuat
    // korban melihat domain HMIF yang benar, memasukkan password, lalu
    // dilempar ke tempat lain — halaman login yang sah menjadi batu loncatan.
    for (const jahat of [
      'https://situs-palsu.example',
      'http://situs-palsu.example/login',
      'https://hmif.example.evil.com',
    ]) {
      expect(tujuanAman(jahat)).toBe('/');
    }
  });

  it('menolak URL protokol-relatif', () => {
    // Peramban membaca //jahat.example sebagai https://jahat.example.
    // Ia lolos pemeriksaan "diawali garis miring" yang naif.
    expect(tujuanAman('//jahat.example')).toBe('/');
    expect(tujuanAman('//jahat.example/curi')).toBe('/');
  });

  it('menolak garis miring terbalik yang disalahartikan sebagian peramban', () => {
    expect(tujuanAman('/\\jahat.example')).toBe('/');
  });

  it('menolak skema selain http', () => {
    expect(tujuanAman('javascript://alert(1)')).toBe('/');
    expect(tujuanAman('data://text/html,x')).toBe('/');
  });

  it('menolak kembali ke /login sendiri', () => {
    // Tanpa ini, login sukses mengalihkan ke halaman login lagi, dan
    // middleware mengalihkannya kembali ke beranda — pengguna melihat
    // kedipan yang tidak dapat dijelaskan.
    expect(tujuanAman('/login')).toBe('/');
    expect(tujuanAman('/login?next=/proker')).toBe('/');
  });

  it('mengembalikan beranda untuk nilai kosong', () => {
    expect(tujuanAman(null)).toBe('/');
    expect(tujuanAman(undefined)).toBe('/');
    expect(tujuanAman('')).toBe('/');
    expect(tujuanAman('   ')).toBe('/');
  });

  it('menolak path yang tidak diawali garis miring', () => {
    expect(tujuanAman('proker')).toBe('/');
    expect(tujuanAman('situs-palsu.example')).toBe('/');
  });
});

describe('normalkanEmail', () => {
  it('membuat huruf besar-kecil dan spasi tidak berpengaruh', () => {
    // Kalau tidak, "Budi@X.com" dan "budi@x.com" dihitung sebagai dua sasaran
    // berbeda dan pembatas percobaan dapat dilewati dengan mengubah kapital.
    expect(normalkanEmail('  Budi@X.com ')).toBe('budi@x.com');
    expect(normalkanEmail('BUDI@X.COM')).toBe('budi@x.com');
  });

  it('menerima nilai kosong tanpa melempar', () => {
    expect(normalkanEmail('')).toBe('');
    expect(normalkanEmail(null as unknown as string)).toBe('');
  });

  it('memotong masukan yang sangat panjang', () => {
    // Nilai ini masuk ke audit_log.entitas_id dan datang dari penyerang.
    expect(normalkanEmail('a'.repeat(500)).length).toBe(254);
  });
});

describe('kalimatTunggu', () => {
  it('membulatkan ke atas supaya tidak menjanjikan lebih cepat dari kenyataan', () => {
    expect(kalimatTunggu(61)).toBe('2 menit');
    expect(kalimatTunggu(120)).toBe('2 menit');
    expect(kalimatTunggu(121)).toBe('3 menit');
  });

  it('memakai kalimat khusus di bawah satu menit', () => {
    expect(kalimatTunggu(1)).toBe('kurang dari 1 menit');
    expect(kalimatTunggu(60)).toBe('kurang dari 1 menit');
  });
});

// ===========================================================================
// NYATA — terhadap database
// ===========================================================================

const EMAIL = 'uji-batas-login@contoh.test';
const IP = '198.51.100.77';

let db: typeof import('@/lib/db/client').db;

beforeAll(async () => {
  if (!adaDb) return;
  ({ db } = await import('@/lib/db/client'));
  await bersihkan();
});

afterAll(async () => {
  if (!adaDb) return;
  await bersihkan();
  await db.$disconnect();
});

/**
 * `audit_log` append-only, jadi baris uji tidak bisa dihapus lewat aplikasi.
 * Pembersihan dilakukan dengan menonaktifkan trigger penolak sesaat — hanya
 * sah di database pengembangan, dan hanya untuk baris bertanda uji.
 */
async function bersihkan(): Promise<void> {
  await db.$executeRawUnsafe('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_tolak_delete');
  try {
    await db.$executeRaw`
      DELETE FROM audit_log WHERE entitas = ${ENTITAS_AUTH} AND entitas_id = ${EMAIL}
    `;
  } finally {
    await db.$executeRawUnsafe('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_tolak_delete');
  }
}

async function catat(aksi: 'LOGIN' | 'LOGIN_GAGAL', menitLalu = 0): Promise<void> {
  await db.$executeRaw`
    INSERT INTO audit_log (aksi, entitas, entitas_id, ip_address, created_at)
    VALUES (${aksi}, ${ENTITAS_AUTH}, ${EMAIL}, ${IP}::inet,
            now() - (${menitLalu} || ' minutes')::interval)
  `;
}

describe.skipIf(!adaDb)('periksaBatas', () => {
  it('membuka penuh saat belum ada kegagalan', async () => {
    await bersihkan();
    const s = await periksaBatas(EMAIL, IP);
    expect(s.terkunci).toBe(false);
    expect(s.sisaPercobaan).toBe(BATAS_PERCOBAAN);
  });

  it('menghitung mundur sisa percobaan', async () => {
    await bersihkan();
    for (let i = 1; i <= 3; i++) {
      await catat('LOGIN_GAGAL');
      const s = await periksaBatas(EMAIL, IP);
      expect(s.terkunci).toBe(false);
      expect(s.sisaPercobaan).toBe(BATAS_PERCOBAAN - i);
    }
  });

  it('mengunci tepat pada kegagalan kelima', async () => {
    await bersihkan();
    for (let i = 0; i < BATAS_PERCOBAAN - 1; i++) await catat('LOGIN_GAGAL');
    expect((await periksaBatas(EMAIL, IP)).terkunci).toBe(false);

    await catat('LOGIN_GAGAL');
    const s = await periksaBatas(EMAIL, IP);
    expect(s.terkunci).toBe(true);
    expect(s.sisaPercobaan).toBe(0);
    expect(s.sisaDetik).toBeGreaterThan(0);
    expect(s.sisaDetik).toBeLessThanOrEqual(MENIT_JENDELA * 60);
  });

  it('melupakan kegagalan yang sudah keluar jendela', async () => {
    await bersihkan();
    // Lima kegagalan, tetapi semuanya lebih tua dari 15 menit.
    for (let i = 0; i < BATAS_PERCOBAAN; i++) await catat('LOGIN_GAGAL', MENIT_JENDELA + 1);
    const s = await periksaBatas(EMAIL, IP);
    expect(s.terkunci).toBe(false);
    expect(s.sisaPercobaan).toBe(BATAS_PERCOBAAN);
  });

  it('LOGIN SUKSES MERESET HITUNGAN meski barisnya tidak dapat dihapus', async () => {
    // Inti rancangannya. audit_log append-only (INV-06), jadi hitungan tidak
    // bisa dinolkan dengan DELETE. Tanpa aturan "hanya hitung kegagalan
    // setelah sukses terakhir", pengguna yang salah ketik empat kali lalu
    // berhasil masuk akan tetap membawa empat kegagalan itu selama 15 menit
    // dan terkunci pada percobaan berikutnya — walau sudah membuktikan diri.
    await bersihkan();
    for (let i = 0; i < 4; i++) await catat('LOGIN_GAGAL', 5);
    expect((await periksaBatas(EMAIL, IP)).sisaPercobaan).toBe(1);

    await catat('LOGIN', 4);
    const s = await periksaBatas(EMAIL, IP);
    expect(s.terkunci).toBe(false);
    expect(s.sisaPercobaan).toBe(BATAS_PERCOBAAN);

    // Kegagalan SETELAH sukses tetap dihitung.
    await catat('LOGIN_GAGAL', 1);
    expect((await periksaBatas(EMAIL, IP)).sisaPercobaan).toBe(BATAS_PERCOBAAN - 1);
  });

  it('menghitung per pasangan email + IP, bukan per email saja', async () => {
    // Kalau hanya per email, siapa pun dapat mengunci akun orang lain dengan
    // lima percobaan asal-asalan — penolakan layanan yang sangat murah.
    await bersihkan();
    for (let i = 0; i < BATAS_PERCOBAAN; i++) await catat('LOGIN_GAGAL');

    expect((await periksaBatas(EMAIL, IP)).terkunci).toBe(true);
    expect((await periksaBatas(EMAIL, '203.0.113.9')).terkunci).toBe(false);
  });

  it('menangani IP yang tidak diketahui tanpa melempar', async () => {
    await bersihkan();
    const s = await periksaBatas(EMAIL, null);
    expect(s.terkunci).toBe(false);
  });
});
