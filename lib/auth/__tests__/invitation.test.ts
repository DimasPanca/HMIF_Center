/**
 * Test undangan dan manajemen pengguna.
 *
 * Tidak menyentuh database maupun Supabase. Kueri diuji lewat klien tiruan yang
 * merekam SQL beserta parameternya, dan Admin API lewat `fetch` yang distub.
 *
 * Yang paling penting di berkas ini bukan test skema melainkan satu invarian:
 * **token mentah tidak pernah masuk parameter SQL apa pun.** Bila ia bocor ke
 * sana suatu hari, tidak ada satu pun test lain yang akan berubah warna — kolom
 * yang salah isi tetap menyimpan sesuatu, undangannya tetap dapat dibuka, dan
 * seluruh alur tetap bekerja. Yang hilang hanya jaminan bahwa isi database yang
 * bocor tidak dapat ditebus penemunya.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-047 · PRD F-1.2 · USER_FLOW §2.1, §2.2
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SkemaAktivasi,
  SkemaUbahPengguna,
  SkemaUndang,
  aktivasi,
  hashToken,
  kataSandi,
  ubahPengguna,
  undang,
} from '../invitation';

// ---------------------------------------------------------------------------
// Klien dan fetch tiruan
// ---------------------------------------------------------------------------

interface Panggilan {
  sql: string;
  params: unknown[];
}

function klienTiruan(hasil: unknown[][] = []) {
  const panggilan: Panggilan[] = [];
  let ke = 0;

  const rekam = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.raw
      .map((s, i) => s + (i < params.length ? `$${i + 1}` : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    panggilan.push({ sql, params });
    return Promise.resolve(hasil[ke++] ?? []);
  };

  return {
    panggilan,
    /** Seluruh parameter dari seluruh kueri, diratakan. */
    semuaParam: () => panggilan.flatMap((p) => p.params),
    tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof undang>[0],
  };
}

const KONTEKS = {
  sesi: {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'admin@hmif.test',
    namaLengkap: 'Admin Uji',
    isActive: true,
  },
  periodeId: '22222222-2222-4222-8222-222222222222',
  roles: ['ADMIN'] as const,
  departemenIds: [],
};

const konteks = (ubah: Partial<typeof KONTEKS> = {}) =>
  ({ ...KONTEKS, ...ubah }) as unknown as Parameters<typeof undang>[1];

const DEPT = '33333333-3333-4333-8333-333333333333';
const ID_BARU = '44444444-4444-4444-8444-444444444444';

const UNDANGAN_SAH = {
  nama_lengkap: 'Nadia Putri',
  nim: '3337220100',
  email: 'Nadia@Untirta.AC.ID',
  angkatan: 2022,
  roles: [{ role: 'KADEPT' as const, departemen_id: DEPT }],
};

/** Meniru Admin API Supabase; mengembalikan id tetap supaya dapat di-assert. */
function stubAuth(opsi: { gagalBuat?: boolean; gagalHapus?: boolean } = {}) {
  const jejak: { url: string; method: string }[] = [];

  vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
    jejak.push({ url: String(url), method: init?.method ?? 'GET' });

    if (String(url).includes('/admin/users') && init?.method === 'POST') {
      return Promise.resolve({
        ok: !opsi.gagalBuat,
        status: opsi.gagalBuat ? 500 : 200,
        text: () => Promise.resolve('gagal'),
        json: () => Promise.resolve({ id: ID_BARU }),
      } as Response);
    }
    return Promise.resolve({
      ok: !opsi.gagalHapus,
      status: opsi.gagalHapus ? 500 : 200,
      text: () => Promise.resolve('gagal'),
      json: () => Promise.resolve({}),
    } as Response);
  });

  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://uji.supabase.test';
  process.env.SUPABASE_SECRET_KEY ??= 'rahasia-uji';

  return jejak;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

describe('hashToken', () => {
  it('menghasilkan 64 karakter heksadesimal', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deterministik — pencarian tetap satu indeks', () => {
    expect(hashToken('token-yang-sama')).toBe(hashToken('token-yang-sama'));
  });

  it('token berbeda menghasilkan hash berbeda', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('hash tidak memuat tokennya', () => {
    const t = 'rahasia-sekali';
    expect(hashToken(t)).not.toContain(t);
  });
});

// ---------------------------------------------------------------------------
// Skema
// ---------------------------------------------------------------------------

describe('kataSandi — PRD F-1.1', () => {
  const kasus: [string, boolean, string][] = [
    ['Rahasia1', true, 'delapan karakter, huruf dan angka'],
    ['Rahasia', false, 'tanpa angka'],
    ['12345678', false, 'tanpa huruf'],
    ['Rhs1', false, 'kurang dari delapan'],
    ['Rahasia12345', true, 'lebih panjang tetap sah'],
  ];

  for (const [nilai, sah, kenapa] of kasus) {
    it(`"${nilai}" ${sah ? 'diterima' : 'ditolak'} — ${kenapa}`, () => {
      expect(kataSandi.safeParse(nilai).success).toBe(sah);
    });
  }

  it('pesan menyebut syarat yang belum terpenuhi, bukan "tidak valid"', () => {
    const h = kataSandi.safeParse('Rahasiaa');
    expect(h.success).toBe(false);
    if (h.success) return;
    expect(h.error.issues[0]!.message).toContain('angka');
  });
});

describe('SkemaUndang', () => {
  it('menerima undangan yang lengkap', () => {
    expect(SkemaUndang.safeParse(UNDANGAN_SAH).success).toBe(true);
  });

  it('email dinormalkan menjadi huruf kecil', () => {
    const h = SkemaUndang.safeParse(UNDANGAN_SAH);
    expect(h.success).toBe(true);
    if (!h.success) return;
    // Kolom email UNIQUE membandingkan apa adanya. Tanpa normalisasi,
    // "Nadia@..." dan "nadia@..." menjadi dua akun untuk satu orang.
    expect(h.data.email).toBe('nadia@untirta.ac.id');
  });

  // Menyalin CHECK `role_dept_wajib` migrasi 003.
  it('KADEPT tanpa departemen ditolak', () => {
    const h = SkemaUndang.safeParse({
      ...UNDANGAN_SAH,
      roles: [{ role: 'KADEPT' }],
    });
    expect(h.success).toBe(false);
  });

  it('ANGGOTA tanpa departemen ditolak', () => {
    const h = SkemaUndang.safeParse({ ...UNDANGAN_SAH, roles: [{ role: 'ANGGOTA' }] });
    expect(h.success).toBe(false);
  });

  it('KETUA dengan departemen ditolak — peran lintas-himpunan', () => {
    const h = SkemaUndang.safeParse({
      ...UNDANGAN_SAH,
      roles: [{ role: 'KETUA', departemen_id: DEPT }],
    });
    expect(h.success).toBe(false);
  });

  // PRD F-1.2 Acceptance Criteria: satu user boleh punya peran ganda.
  it('peran ganda diterima', () => {
    const h = SkemaUndang.safeParse({
      ...UNDANGAN_SAH,
      roles: [
        { role: 'ANGGOTA', departemen_id: DEPT },
        { role: 'SEKUM' },
      ],
    });
    expect(h.success).toBe(true);
  });

  it('peran yang sama dua kali ditolak', () => {
    const h = SkemaUndang.safeParse({
      ...UNDANGAN_SAH,
      roles: [
        { role: 'KADEPT', departemen_id: DEPT },
        { role: 'KADEPT', departemen_id: DEPT },
      ],
    });
    expect(h.success).toBe(false);
  });

  it('peran sama di departemen berbeda diterima', () => {
    const h = SkemaUndang.safeParse({
      ...UNDANGAN_SAH,
      roles: [
        { role: 'ANGGOTA', departemen_id: DEPT },
        { role: 'ANGGOTA', departemen_id: '55555555-5555-4555-8555-555555555555' },
      ],
    });
    expect(h.success).toBe(true);
  });

  it('tanpa satu pun peran ditolak', () => {
    expect(SkemaUndang.safeParse({ ...UNDANGAN_SAH, roles: [] }).success).toBe(false);
  });

  it('NIM bukan angka ditolak', () => {
    expect(SkemaUndang.safeParse({ ...UNDANGAN_SAH, nim: '33372A0100' }).success).toBe(false);
  });
});

describe('SkemaAktivasi', () => {
  const dasar = { token: 'x'.repeat(43), password: 'Rahasia1', konfirmasi: 'Rahasia1' };

  it('menerima password yang cocok', () => {
    expect(SkemaAktivasi.safeParse(dasar).success).toBe(true);
  });

  it('konfirmasi berbeda ditolak, dan pesannya menunjuk field konfirmasi', () => {
    const h = SkemaAktivasi.safeParse({ ...dasar, konfirmasi: 'Rahasia2' });
    expect(h.success).toBe(false);
    if (h.success) return;
    expect(h.error.issues[0]!.path).toEqual(['konfirmasi']);
  });

  it('token terlalu pendek ditolak sebelum menyentuh database', () => {
    expect(SkemaAktivasi.safeParse({ ...dasar, token: 'pendek' }).success).toBe(false);
  });
});

describe('SkemaUbahPengguna', () => {
  it('perubahan kosong ditolak', () => {
    expect(SkemaUbahPengguna.safeParse({}).success).toBe(false);
  });

  it('hanya is_active diterima — menonaktifkan tanpa menyentuh yang lain', () => {
    expect(SkemaUbahPengguna.safeParse({ is_active: false }).success).toBe(true);
  });

  // Daftar peran kosong akan membuat penggunanya lenyap dari halaman Admin.
  it('daftar peran kosong ditolak', () => {
    expect(SkemaUbahPengguna.safeParse({ roles: [] }).success).toBe(false);
  });

  it('angkatan null diterima — itu "kosongkan", bukan "jangan sentuh"', () => {
    expect(SkemaUbahPengguna.safeParse({ angkatan: null }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// undang()
// ---------------------------------------------------------------------------

describe('undang', () => {
  it('menolak input tidak valid tanpa menyentuh database maupun Supabase', async () => {
    const jejak = stubAuth();
    const k = klienTiruan();
    const h = await undang(k.tx, konteks(), { ...UNDANGAN_SAH, nim: 'bukan-nim' }, 'https://app.test');

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_VALID');
    expect(k.panggilan).toHaveLength(0);
    expect(jejak).toHaveLength(0);
  });

  it('menolak bila belum ada periode aktif', async () => {
    stubAuth();
    const k = klienTiruan();
    const h = await undang(k.tx, konteks({ periodeId: '' }), UNDANGAN_SAH, 'https://app.test');

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_ADA_PERIODE');
  });

  // Pemeriksaan duplikat berjalan SEBELUM akun auth dibuat. Dibalik, setiap
  // undangan duplikat meninggalkan akun auth yatim yang harus dibersihkan tangan.
  it('email terdaftar ditolak tanpa membuat akun auth', async () => {
    const jejak = stubAuth();
    const k = klienTiruan([[{ email: 'nadia@untirta.ac.id', nim: '9999999999' }]]);
    const h = await undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test');

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('EMAIL_TERDAFTAR');
    expect(jejak).toHaveLength(0);
    expect(k.panggilan).toHaveLength(1); // hanya kueri pemeriksaan
  });

  it('NIM terdaftar dibedakan dari email terdaftar', async () => {
    stubAuth();
    const k = klienTiruan([[{ email: 'orang.lain@untirta.ac.id', nim: '3337220100' }]]);
    const h = await undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test');

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('NIM_TERDAFTAR');
  });

  it('undangan sah menghasilkan tautan dan menyimpan barisnya', async () => {
    stubAuth();
    const k = klienTiruan([[], [], [], [{ id: 'inv-1' }]]);
    const h = await undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test/');

    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.nilai.userId).toBe(ID_BARU);
    expect(h.nilai.tautan).toMatch(/^https:\/\/app\.test\/undangan\/[A-Za-z0-9_-]{43}$/);
  });

  // ==========================================================================
  // INVARIAN INTI BERKAS INI
  // ==========================================================================
  it('token mentah TIDAK PERNAH masuk parameter SQL; hash-nya yang masuk', async () => {
    stubAuth();
    const k = klienTiruan([[], [], [], [{ id: 'inv-1' }]]);
    const h = await undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test');

    expect(h.ok).toBe(true);
    if (!h.ok) return;

    const token = h.nilai.tautan.split('/').pop()!;
    const param = k.semuaParam().map(String);

    expect(param).not.toContain(token);
    expect(param).toContain(hashToken(token));
  });

  it('pengguna baru disimpan NONAKTIF sampai undangannya dipakai', async () => {
    stubAuth();
    const k = klienTiruan([[], [], [], [{ id: 'inv-1' }]]);
    await undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test');

    const insertUser = k.panggilan.find((p) => p.sql.includes('INSERT INTO app_user'));
    expect(insertUser).toBeDefined();
    expect(insertUser!.sql).toContain('false');
  });

  it('kedaluwarsa tujuh hari (PRD F-1.2)', async () => {
    stubAuth();
    const k = klienTiruan([[], [], [], [{ id: 'inv-1' }]]);
    const h = await undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test');

    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const selisihHari = (Date.parse(h.nilai.kedaluwarsa) - Date.now()) / 86_400_000;
    expect(selisihHari).toBeGreaterThan(6.9);
    expect(selisihHari).toBeLessThan(7.1);
  });

  it('satu baris user_role per peran', async () => {
    stubAuth();
    const k = klienTiruan([[], [], [], [], [{ id: 'inv-1' }]]);
    await undang(
      k.tx,
      konteks(),
      { ...UNDANGAN_SAH, roles: [{ role: 'ANGGOTA', departemen_id: DEPT }, { role: 'SEKUM' }] },
      'https://app.test',
    );

    expect(k.panggilan.filter((p) => p.sql.includes('INSERT INTO user_role'))).toHaveLength(2);
  });

  it('penyimpanan gagal memicu penghapusan akun auth', async () => {
    const jejak = stubAuth();
    const k = {
      panggilan: [] as Panggilan[],
      tx: {
        $queryRaw: () => Promise.resolve([]),
        $executeRaw: () => Promise.reject(new Error('constraint pecah')),
      } as unknown as Parameters<typeof undang>[0],
    };

    await expect(undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test')).rejects.toThrow(
      'constraint pecah',
    );
    expect(jejak.some((j) => j.method === 'DELETE')).toBe(true);
  });

  it('penghapusan yang ikut gagal dilaporkan sebagai AUTH_YATIM', async () => {
    stubAuth({ gagalHapus: true });
    const k = {
      tx: {
        $queryRaw: () => Promise.resolve([]),
        $executeRaw: () => Promise.reject(new Error('constraint pecah')),
      } as unknown as Parameters<typeof undang>[0],
    };

    const h = await undang(k.tx, konteks(), UNDANGAN_SAH, 'https://app.test');
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('AUTH_YATIM');
    // Admin harus tahu email mana yang harus dibersihkan tangan.
    expect(h.pesan).toContain('nadia@untirta.ac.id');
  });
});

// ---------------------------------------------------------------------------
// aktivasi()
// ---------------------------------------------------------------------------

describe('aktivasi', () => {
  const TOKEN = 'y'.repeat(43);

  it('mengklaim undangan dengan satu UPDATE bersyarat, bukan baca-lalu-tulis', async () => {
    stubAuth();
    const k = klienTiruan([[{ user_id: ID_BARU, email: 'nadia@untirta.ac.id' }], []]);
    const h = await aktivasi(k.tx, { token: TOKEN, password: 'Rahasia1', konfirmasi: 'Rahasia1' });

    expect(h.ok).toBe(true);

    // Inilah yang membuat undangan benar-benar sekali pakai: dua permintaan
    // bersamaan sama-sama lolos pemeriksaan, tetapi hanya satu memperoleh baris.
    const klaim = k.panggilan[0]!;
    expect(klaim.sql).toContain('UPDATE invitation');
    expect(klaim.sql).toContain('used_at IS NULL');
    expect(klaim.sql).toContain('expires_at > now()');
    expect(klaim.params).toContain(hashToken(TOKEN));
  });

  it('password disetel SESUDAH klaim berhasil', async () => {
    const jejak = stubAuth();
    const k = klienTiruan([[{ user_id: ID_BARU, email: 'n@u.test' }], []]);
    await aktivasi(k.tx, { token: TOKEN, password: 'Rahasia1', konfirmasi: 'Rahasia1' });

    // Urutan sebaliknya membuat permintaan yang KALAH tetap sempat mengganti
    // password milik pemenang.
    expect(jejak.filter((j) => j.method === 'PUT')).toHaveLength(1);
  });

  it('mengaktifkan app_user setelah password tersimpan', async () => {
    stubAuth();
    const k = klienTiruan([[{ user_id: ID_BARU, email: 'n@u.test' }], []]);
    await aktivasi(k.tx, { token: TOKEN, password: 'Rahasia1', konfirmasi: 'Rahasia1' });

    const update = k.panggilan.find((p) => p.sql.includes('UPDATE app_user'));
    expect(update).toBeDefined();
    expect(update!.sql).toContain('is_active = true');
  });

  it('password lemah ditolak tanpa menyentuh database', async () => {
    stubAuth();
    const k = klienTiruan();
    const h = await aktivasi(k.tx, { token: TOKEN, password: 'lemah', konfirmasi: 'lemah' });

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_VALID');
    expect(k.panggilan).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ubahPengguna()
// ---------------------------------------------------------------------------

describe('ubahPengguna', () => {
  const TERSIMPAN = {
    nama_lengkap: 'Nadia Putri',
    angkatan: 2022,
    no_hp: '08123456789',
    is_active: true,
  };

  it('mengganti nama tidak menghapus angkatan', async () => {
    const k = klienTiruan([[TERSIMPAN], []]);
    const h = await ubahPengguna(k.tx, konteks(), ID_BARU, { nama_lengkap: 'Nadia P.' });

    expect(h.ok).toBe(true);
    const update = k.panggilan.find((p) => p.sql.includes('UPDATE app_user'))!;
    // Inilah alasan gabung-lalu-tulis. COALESCE tidak dapat membedakan
    // "kosongkan" dari "jangan sentuh", dan diam-diam menghapus angkatan.
    expect(update.params).toContain(2022);
    expect(update.params).toContain('Nadia P.');
  });

  it('angkatan null benar-benar mengosongkan', async () => {
    const k = klienTiruan([[TERSIMPAN], []]);
    await ubahPengguna(k.tx, konteks(), ID_BARU, { angkatan: null });

    const update = k.panggilan.find((p) => p.sql.includes('UPDATE app_user'))!;
    expect(update.params).toContain(null);
    expect(update.params).not.toContain(2022);
  });

  it('menonaktifkan hanya mengubah is_active — tidak ada DELETE apa pun', async () => {
    const k = klienTiruan([[TERSIMPAN], []]);
    await ubahPengguna(k.tx, konteks(), ID_BARU, { is_active: false });

    // PRD F-1.2: proker, surat, dan nota yang pernah dibuatnya harus tetap
    // punya pemilik agar jejak audit utuh.
    expect(k.panggilan.some((p) => p.sql.includes('DELETE'))).toBe(false);
    expect(k.panggilan.find((p) => p.sql.includes('UPDATE app_user'))!.params).toContain(false);
  });

  it('mengganti peran menghapus lalu menulis ulang pada periode aktif', async () => {
    const k = klienTiruan([[TERSIMPAN], [], [], []]);
    await ubahPengguna(k.tx, konteks(), ID_BARU, {
      roles: [{ role: 'ANGGOTA', departemen_id: DEPT }, { role: 'BENDUM' }],
    });

    const hapus = k.panggilan.find((p) => p.sql.includes('DELETE FROM user_role'))!;
    expect(hapus.params).toContain(KONTEKS.periodeId);
    expect(k.panggilan.filter((p) => p.sql.includes('INSERT INTO user_role'))).toHaveLength(2);
  });

  it('pengguna yang tidak ada menghasilkan TIDAK_DITEMUKAN', async () => {
    const k = klienTiruan([[]]);
    const h = await ubahPengguna(k.tx, konteks(), ID_BARU, { nama_lengkap: 'X Y' });

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_DITEMUKAN');
  });
});
