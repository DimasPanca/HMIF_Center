/**
 * Test service periode.
 *
 * Tidak menyentuh database. Kueri diuji lewat klien tiruan yang merekam SQL
 * beserta parameternya — cukup untuk tiga hal yang mudah rusak diam-diam:
 * status yang dipaksakan service, aturan yang menolak sebelum menulis, dan
 * konfirmasi aktivasi yang dibandingkan dengan nama server, bukan nama klien.
 *
 * Aktivasi terhadap fungsi database sungguhan diuji lewat smoke di dalam
 * transaksi yang di-ROLLBACK saat pengembangan; di sini yang diuji jalur
 * keputusannya, bukan efek `aktifkan_periode`.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-050 · PRD F-2.1 · ADR-003
 */

import { describe, expect, it } from 'vitest';

import {
  SkemaBuatPeriode,
  SkemaUbahPeriode,
  STATUS_GAGAL,
  aktifkanPeriode,
  buatPeriode,
  hapusPeriode,
  ubahPeriode,
} from '../service';

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
    tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof buatPeriode>[0],
  };
}

const ID = '11111111-1111-4111-8111-111111111111';

const SAH = {
  nama: 'HMIF 3.0 2031/2032',
  tanggal_mulai: '2031-09-01',
  tanggal_selesai: '2032-08-31',
  nomor_surat_awal: 1,
};

// ---------------------------------------------------------------------------
// Skema
// ---------------------------------------------------------------------------

describe('SkemaBuatPeriode', () => {
  it('menerima periode yang lengkap', () => {
    expect(SkemaBuatPeriode.safeParse(SAH).success).toBe(true);
  });

  it('nomor_surat_awal default 1 bila tak diisi (ADR-003)', () => {
    const tanpa = { nama: SAH.nama, tanggal_mulai: SAH.tanggal_mulai, tanggal_selesai: SAH.tanggal_selesai };
    const h = SkemaBuatPeriode.safeParse(tanpa);
    expect(h.success).toBe(true);
    if (h.success) expect(h.data.nomor_surat_awal).toBe(1);
  });

  it('tanggal selesai sebelum mulai ditolak, pesan menunjuk field selesai', () => {
    const h = SkemaBuatPeriode.safeParse({ ...SAH, tanggal_selesai: '2030-01-01' });
    expect(h.success).toBe(false);
    if (h.success) return;
    expect(h.error.issues[0]!.path).toEqual(['tanggal_selesai']);
  });

  it('nomor_surat_awal nol ditolak', () => {
    expect(SkemaBuatPeriode.safeParse({ ...SAH, nomor_surat_awal: 0 }).success).toBe(false);
  });

  it('nama kosong ditolak', () => {
    expect(SkemaBuatPeriode.safeParse({ ...SAH, nama: '' }).success).toBe(false);
  });

  it('status dari input diabaikan — tidak ada di skema', () => {
    const h = SkemaBuatPeriode.safeParse({ ...SAH, status: 'AKTIF' });
    expect(h.success).toBe(true);
    if (h.success) expect('status' in h.data).toBe(false);
  });
});

describe('SkemaUbahPeriode', () => {
  it('perubahan kosong ditolak', () => {
    expect(SkemaUbahPeriode.safeParse({}).success).toBe(false);
  });
  it('hanya nama diterima', () => {
    expect(SkemaUbahPeriode.safeParse({ nama: 'Baru Sekali' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STATUS_GAGAL — semantik HTTP
// ---------------------------------------------------------------------------

describe('STATUS_GAGAL', () => {
  it('validasi 422, tidak ditemukan 404, keadaan 409', () => {
    expect(STATUS_GAGAL.VALIDASI_GAGAL).toBe(422);
    expect(STATUS_GAGAL.TIDAK_DITEMUKAN).toBe(404);
    expect(STATUS_GAGAL.PERIODE_ARSIP).toBe(409);
    expect(STATUS_GAGAL.PUNYA_SURAT_TERBIT).toBe(409);
    expect(STATUS_GAGAL.BUKAN_PERSIAPAN).toBe(409);
  });

  it('setiap kode punya status', () => {
    for (const k of Object.keys(STATUS_GAGAL)) {
      expect(STATUS_GAGAL[k as keyof typeof STATUS_GAGAL]).toBeGreaterThanOrEqual(400);
    }
  });
});

// ---------------------------------------------------------------------------
// buatPeriode
// ---------------------------------------------------------------------------

describe('buatPeriode', () => {
  it('menolak input invalid tanpa menyentuh database', async () => {
    const k = klienTiruan();
    const h = await buatPeriode(k.tx, { ...SAH, tanggal_selesai: '2030-01-01' });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('VALIDASI_GAGAL');
    expect(k.panggilan).toHaveLength(0);
  });

  it('memaksa status PERSIAPAN walau input meminta AKTIF', async () => {
    const k = klienTiruan([[{ id: ID }]]);
    const h = await buatPeriode(k.tx, { ...SAH, status: 'AKTIF' });
    expect(h.ok).toBe(true);
    // Periode yang lahir AKTIF melewati aktifkan_periode dan surat_counter-nya
    // tak pernah dibuat — surat pertamanya gagal memperoleh nomor kemudian.
    expect(k.panggilan[0]!.sql).toContain("'PERSIAPAN'");
    expect(k.panggilan[0]!.params).not.toContain('AKTIF');
  });

  it('tanggal dikirim sebagai string, tidak pernah Date', async () => {
    const k = klienTiruan([[{ id: ID }]]);
    await buatPeriode(k.tx, SAH);
    expect(k.panggilan[0]!.params.some((p) => p instanceof Date)).toBe(false);
    expect(k.panggilan[0]!.params).toContain('2031-09-01');
  });

  // ADR-024 / ADR-050 §3: carry-forward ADMIN. Tanpa ini periode baru tidak
  // punya ADMIN dan aktivasinya akan mengunci pengelola.
  it('menyalin peran ADMIN dari periode aktif ke periode baru', async () => {
    const k = klienTiruan([[{ id: ID }], []]);
    await buatPeriode(k.tx, SAH);
    const copy = k.panggilan.find((p) => p.sql.includes('INSERT INTO user_role'));
    expect(copy).toBeDefined();
    expect(copy!.sql).toContain("role = 'ADMIN'");
    expect(copy!.sql).toContain("p.status = 'AKTIF'");
    // Disalin ke periode BARU, bukan periode lain.
    expect(copy!.params).toContain(ID);
  });
});

// ---------------------------------------------------------------------------
// ubahPeriode
// ---------------------------------------------------------------------------

const TERSIMPAN = {
  id: ID,
  nama: 'HMIF 3.0 2031/2032',
  status: 'PERSIAPAN',
  tanggal_mulai: '2031-09-01',
  tanggal_selesai: '2032-08-31',
  nomor_surat_awal: 1,
  ada_surat_terbit: false,
};

describe('ubahPeriode', () => {
  it('mengganti nama tidak menghapus tanggal', async () => {
    const k = klienTiruan([[TERSIMPAN], []]);
    const h = await ubahPeriode(k.tx, ID, { nama: 'Nama Baru' });
    expect(h.ok).toBe(true);
    const update = k.panggilan.find((p) => p.sql.includes('UPDATE periode'))!;
    expect(update.params).toContain('2031-09-01');
    expect(update.params).toContain('Nama Baru');
  });

  it('periode ARSIP ditolak, tidak ada UPDATE', async () => {
    const k = klienTiruan([[{ ...TERSIMPAN, status: 'ARSIP' }]]);
    const h = await ubahPeriode(k.tx, ID, { nama: 'Coba Ubah' });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('PERIODE_ARSIP');
    expect(k.panggilan.some((p) => p.sql.includes('UPDATE periode'))).toBe(false);
  });

  it('perubahan yang membuat tanggal terbalik ditolak sebelum UPDATE', async () => {
    const k = klienTiruan([[TERSIMPAN]]);
    // Hanya mengirim tanggal_mulai yang melewati tanggal_selesai tersimpan.
    const h = await ubahPeriode(k.tx, ID, { tanggal_mulai: '2033-01-01' });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('VALIDASI_GAGAL');
    // Inilah gunanya gabung-lalu-validasi: CHECK periode_tanggal_valid tidak
    // pernah menjadi jalan penolakan berbahasa Postgres.
    expect(k.panggilan.some((p) => p.sql.includes('UPDATE periode'))).toBe(false);
  });

  it('periode tak ada -> TIDAK_DITEMUKAN', async () => {
    const k = klienTiruan([[]]);
    const h = await ubahPeriode(k.tx, ID, { nama: 'X Y Z' });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_DITEMUKAN');
  });
});

// ---------------------------------------------------------------------------
// hapusPeriode
// ---------------------------------------------------------------------------

describe('hapusPeriode', () => {
  it('periode dengan surat terbit ditolak, tidak ada DELETE', async () => {
    const k = klienTiruan([[{ ...TERSIMPAN, ada_surat_terbit: true }]]);
    const h = await hapusPeriode(k.tx, ID);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('PUNYA_SURAT_TERBIT');
    expect(k.panggilan.some((p) => p.sql.includes('DELETE'))).toBe(false);
  });

  it('periode tanpa surat terbit dihapus', async () => {
    const k = klienTiruan([[TERSIMPAN], []]);
    const h = await hapusPeriode(k.tx, ID);
    expect(h.ok).toBe(true);
    expect(k.panggilan.some((p) => p.sql.includes('DELETE FROM periode'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// aktifkanPeriode
// ---------------------------------------------------------------------------

describe('aktifkanPeriode', () => {
  it('mengunci baris dengan FOR UPDATE sebelum memutuskan', async () => {
    const k = klienTiruan([
      [{ nama: 'Periode X', status: 'PERSIAPAN' }],
      [{ ada: true }],
      [{ aktifkan_periode: { periode_lama: null, nomor_pertama: 1 } }],
    ]);
    await aktifkanPeriode(k.tx, ID, 'Periode X');
    expect(k.panggilan[0]!.sql).toContain('FOR UPDATE');
  });

  // ADR-050 §3: periode tanpa ADMIN tidak boleh diaktifkan (lockout).
  it('menolak periode tanpa ADMIN, tidak memanggil aktifkan_periode', async () => {
    const k = klienTiruan([
      [{ nama: 'Periode X', status: 'PERSIAPAN' }],
      [{ ada: false }],
    ]);
    const h = await aktifkanPeriode(k.tx, ID, 'Periode X');
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TANPA_ADMIN');
    expect(k.panggilan.some((p) => p.sql.includes('aktifkan_periode'))).toBe(false);
  });

  it('memeriksa ADMIN target lewat user_role periode itu', async () => {
    const k = klienTiruan([
      [{ nama: 'Periode X', status: 'PERSIAPAN' }],
      [{ ada: false }],
    ]);
    await aktifkanPeriode(k.tx, ID, 'Periode X');
    const cek = k.panggilan.find((p) => p.sql.includes('user_role'));
    expect(cek!.sql).toContain("role = 'ADMIN'");
    expect(cek!.params).toContain(ID);
  });

  it('menolak konfirmasi yang tidak cocok, tidak memanggil aktifkan_periode', async () => {
    const k = klienTiruan([[{ nama: 'Periode X', status: 'PERSIAPAN' }]]);
    const h = await aktifkanPeriode(k.tx, ID, 'Periode Y');
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('KONFIRMASI_TIDAK_COCOK');
    expect(k.panggilan.some((p) => p.sql.includes('aktifkan_periode'))).toBe(false);
  });

  // Nama dibaca dari SERVER, bukan dari klien. Klien yang keliru soal nama tidak
  // boleh dapat mengaktifkan hanya karena mengulang tebakannya sendiri.
  it('membandingkan konfirmasi dengan nama server, bukan tebakan klien', async () => {
    const k = klienTiruan([[{ nama: 'Nama Kanonis', status: 'PERSIAPAN' }]]);
    // Klien mengirim nama yang IA kira benar, tetapi server menyimpan nama lain.
    const h = await aktifkanPeriode(k.tx, ID, 'Nama Yang Dikira Klien');
    expect(h.ok).toBe(false);
  });

  it('menolak periode non-PERSIAPAN', async () => {
    const k = klienTiruan([[{ nama: 'Periode X', status: 'AKTIF' }]]);
    const h = await aktifkanPeriode(k.tx, ID, 'Periode X');
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('BUKAN_PERSIAPAN');
    expect(k.panggilan.some((p) => p.sql.includes('aktifkan_periode'))).toBe(false);
  });

  it('periode tak ada -> TIDAK_DITEMUKAN', async () => {
    const k = klienTiruan([[]]);
    const h = await aktifkanPeriode(k.tx, ID, 'apa pun');
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_DITEMUKAN');
  });

  it('sukses memanggil aktifkan_periode dan meneruskan hasilnya', async () => {
    const k = klienTiruan([
      [{ nama: 'Periode X', status: 'PERSIAPAN' }],
      [{ ada: true }],
      [{ aktifkan_periode: { periode_lama: 'lama-1', nomor_pertama: 1 } }],
    ]);
    const h = await aktifkanPeriode(k.tx, ID, 'Periode X');
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.nilai.periodeLama).toBe('lama-1');
    expect(h.nilai.nomorPertama).toBe(1);
  });
});
