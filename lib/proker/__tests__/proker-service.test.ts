/**
 * Test service, skema, dan status proker.
 *
 * Tidak menyentuh database. Yang menyentuh database adalah T-066
 * (`scripts/stress-anti-bentrok.ts`) dan test SQL — dan pembagian itu
 * disengaja: yang dapat dibuktikan tanpa koneksi adalah bentuk data dan aturan
 * yang ditulis di dokumen, sedangkan anti-bentrok justru TIDAK dapat dibuktikan
 * di sini, karena penjaminnya EXCLUDE constraint dan bukan kode ini.
 *
 * Kueri diuji lewat klien tiruan yang merekam SQL beserta parameternya. Itu
 * cukup untuk tiga hal yang memang mudah rusak diam-diam: jumlah round-trip,
 * status yang dipaksakan service, dan urutan gabung-lalu-validasi pada PATCH.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-065 · PRD F-5.1, F-5.2 ·
 *         SYSTEM_DESIGN §6.6 · USER_FLOW §11.1
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SkemaProker, selisihHari } from '../schema';
import {
  KATEGORI,
  STATUS,
  TRANSISI,
  bolehTransisi,
  butuhApproval,
  konflikDitolak,
  mengunciKalender,
} from '../status';
import { buatProker, cekKonflik, kalenderTerkunci, ubahProker } from '../service';

const AKAR = path.resolve(import.meta.dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// Klien tiruan
// ---------------------------------------------------------------------------

interface Panggilan {
  sql: string;
  params: unknown[];
}

/**
 * Meniru `$queryRaw` dan `$executeRaw` Prisma, yang keduanya tagged template.
 *
 * SQL disatukan kembali dengan penanda `$n` supaya assertion dapat menyebut
 * potongan teks yang dicarinya tanpa bergantung pada spasi dan baris baru.
 */
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
    tx: {
      $queryRaw: rekam,
      $executeRaw: rekam,
    } as unknown as Parameters<typeof buatProker>[0],
  };
}

const KONTEKS = {
  sesi: {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'kadept@hmif.test',
    namaLengkap: 'Kadept Uji',
    isActive: true,
  },
  periodeId: '22222222-2222-4222-8222-222222222222',
  roles: ['KADEPT'] as const,
  departemenIds: ['33333333-3333-4333-8333-333333333333'],
};

const konteks = (ubah: Partial<typeof KONTEKS> = {}) =>
  ({ ...KONTEKS, ...ubah }) as unknown as Parameters<typeof buatProker>[1];

const DEPT = KONTEKS.departemenIds[0]!;

/** TERJADWAL yang sah: persiapan 1 Nov, hari-H 6-7 Des 2026 (contoh PRD F-5.2). */
const SYNCHRONIZE = {
  departemen_id: DEPT,
  nama: 'SYNCHRONIZE',
  kategori: 'TERJADWAL' as const,
  tanggal_mulai_persiapan: '2026-11-01',
  tanggal_hari_h_mulai: '2026-12-06',
  tanggal_hari_h_selesai: '2026-12-07',
};

// ---------------------------------------------------------------------------
// status.ts terhadap migrasi 002 dan USER_FLOW §11.1
// ---------------------------------------------------------------------------

describe('daftar status dan kategori sama dengan enum di migrasi 002', () => {
  const sql = fs.readFileSync(path.join(AKAR, 'supabase', 'migrations', '002_enums.sql'), 'utf8');

  const nilaiEnum = (nama: string): string[] => {
    const m = new RegExp(`CREATE TYPE ${nama} AS ENUM \\(([^)]*)\\)`, 'i').exec(sql);
    if (!m) throw new Error(`Enum ${nama} tidak ditemukan di 002_enums.sql`);
    return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
  };

  // Dua daftar yang ditulis terpisah akan berbeda suatu hari. Yang membuatnya
  // mahal: status yang ada di database tetapi tidak di TypeScript tidak pernah
  // menghasilkan error — ia hanya tidak pernah cocok dengan apa pun.
  it('proker_status', () => {
    expect([...STATUS].sort()).toEqual(nilaiEnum('proker_status').sort());
  });
  it('proker_kategori', () => {
    expect([...KATEGORI].sort()).toEqual(nilaiEnum('proker_kategori').sort());
  });
});

describe('transisi status mengikuti USER_FLOW 11.1', () => {
  const sah: [string, string][] = [
    ['DRAFT', 'DRAFT'],
    ['DRAFT', 'MENUNGGU_APPROVAL'],
    ['MENUNGGU_APPROVAL', 'DISETUJUI'],
    ['MENUNGGU_APPROVAL', 'DITOLAK'],
    ['MENUNGGU_APPROVAL', 'PERLU_REVISI'],
    ['MENUNGGU_APPROVAL_REVISI', 'DISETUJUI'],
    ['DISETUJUI', 'BERJALAN'],
    ['DISETUJUI', 'MENUNGGU_APPROVAL_REVISI'],
    ['DISETUJUI', 'DIBATALKAN'],
    ['BERJALAN', 'SELESAI'],
    ['BERJALAN', 'DIBATALKAN'],
    ['DITOLAK', 'DRAFT'],
    ['PERLU_REVISI', 'MENUNGGU_APPROVAL'],
  ];

  for (const [dari, ke] of sah) {
    it(`${dari} -> ${ke}`, () => {
      expect(bolehTransisi(dari as never, ke as never)).toBe(true);
    });
  }

  it('tidak ada transisi lain', () => {
    const jumlah = Object.values(TRANSISI).reduce((n, x) => n + x.length, 0);
    expect(jumlah).toBe(sah.length);
  });

  it('SELESAI dan DIBATALKAN adalah keadaan akhir', () => {
    expect(TRANSISI.SELESAI).toEqual([]);
    expect(TRANSISI.DIBATALKAN).toEqual([]);
  });

  it('DRAFT tidak dapat melompat langsung ke DISETUJUI', () => {
    expect(bolehTransisi('DRAFT', 'DISETUJUI')).toBe(false);
  });
});

describe('matriks konflik SYSTEM_DESIGN 6.6 — hanya satu sel yang ditolak', () => {
  for (const baru of KATEGORI) {
    for (const existing of KATEGORI) {
      const harus = baru === 'TERJADWAL' && existing === 'TERJADWAL';
      it(`${baru} baru vs ${existing} existing -> ${harus ? 'ditolak' : 'diizinkan'}`, () => {
        expect(konflikDitolak(baru, existing)).toBe(harus);
      });
    }
  }
});

describe('sifat per kategori (PRD F-5.1)', () => {
  it('hanya TERJADWAL yang mengunci kalender', () => {
    expect(KATEGORI.filter(mengunciKalender)).toEqual(['TERJADWAL']);
  });
  it('hanya BERKALA yang tidak perlu approval', () => {
    expect(KATEGORI.filter((k) => !butuhApproval(k))).toEqual(['BERKALA']);
  });
});

// ---------------------------------------------------------------------------
// schema.ts
// ---------------------------------------------------------------------------

describe('selisihHari bebas zona waktu', () => {
  it('1 Nov ke 6 Des 2026 adalah 35 hari', () => {
    expect(selisihHari('2026-11-01', '2026-12-06')).toBe(35);
  });
  // Zona waktu Indonesia berpindah offset lewat DST di belahan lain, dan
  // aritmetika Date lokal ikut bergeser. Melewati batas tahun adalah kasus yang
  // paling sering menyingkapnya.
  it('melewati pergantian tahun', () => {
    expect(selisihHari('2026-12-20', '2027-01-10')).toBe(21);
  });
  it('arah mundur bernilai negatif', () => {
    expect(selisihHari('2026-12-06', '2026-11-01')).toBe(-35);
  });
});

describe('TERJADWAL — durasi persiapan 15-45 hari (ADR-008)', () => {
  const dengan = (persiapan: string) =>
    SkemaProker.safeParse({ ...SYNCHRONIZE, tanggal_mulai_persiapan: persiapan });

  // Hari-H mulai 6 Des 2026. Batasnya diuji tepat di angkanya, bukan di
  // sekitarnya: CHECK `durasi_persiapan_15_45` memakai BETWEEN yang inklusif,
  // dan skema yang memakai perbandingan eksklusif akan menolak dua tanggal yang
  // sebenarnya sah — tanpa satu pun test menangkapnya bila hanya 14 dan 46 diuji.
  it('14 hari ditolak', () => expect(dengan('2026-11-22').success).toBe(false));
  it('15 hari diterima', () => expect(dengan('2026-11-21').success).toBe(true));
  it('45 hari diterima', () => expect(dengan('2026-10-22').success).toBe(true));
  it('46 hari ditolak', () => expect(dengan('2026-10-21').success).toBe(false));

  it('pesan penolakan menyebut durasi sebenarnya', () => {
    const h = dengan('2026-11-22');
    expect(h.success).toBe(false);
    if (h.success) return;
    expect(h.error.issues[0]!.message).toContain('14 hari');
  });

  it('ketiga tanggal wajib', () => {
    const { tanggal_hari_h_selesai: _buang, ...tanpa } = SYNCHRONIZE;
    expect(SkemaProker.safeParse(tanpa).success).toBe(false);
  });

  it('hari-H selesai sebelum hari-H mulai ditolak', () => {
    const h = SkemaProker.safeParse({ ...SYNCHRONIZE, tanggal_hari_h_selesai: '2026-12-05' });
    expect(h.success).toBe(false);
  });

  it('tanggal yang tidak ada pada kalender ditolak', () => {
    const h = SkemaProker.safeParse({ ...SYNCHRONIZE, tanggal_hari_h_mulai: '2026-02-31' });
    expect(h.success).toBe(false);
  });
});

describe('BERKALA — pola ulang wajib, tanggal tunggal tidak', () => {
  const rutin = {
    departemen_id: DEPT,
    nama: 'Latihan Rutin',
    kategori: 'BERKALA' as const,
    pola_ulang: {
      frekuensi: 'MINGGUAN' as const,
      hari: ['SABTU' as const],
      mulai: '2026-09-01',
      selesai: '2027-06-30',
    },
  };

  // Contoh proker C pada PRD F-5.2: setiap Sabtu, termasuk 20 Nov yang berada
  // di dalam rentang terkunci SYNCHRONIZE. Diterima tanpa peringatan (R4).
  it('tersimpan tanpa tanggal tunggal sama sekali', () => {
    expect(SkemaProker.safeParse(rutin).success).toBe(true);
  });

  it('tanpa pola_ulang ditolak', () => {
    const { pola_ulang: _buang, ...tanpa } = rutin;
    expect(SkemaProker.safeParse(tanpa).success).toBe(false);
  });

  it('pola_ulang tanpa satu pun hari ditolak', () => {
    const h = SkemaProker.safeParse({ ...rutin, pola_ulang: { ...rutin.pola_ulang, hari: [] } });
    expect(h.success).toBe(false);
  });

  it('rentang pengulangan terbalik ditolak', () => {
    const h = SkemaProker.safeParse({
      ...rutin,
      pola_ulang: { ...rutin.pola_ulang, mulai: '2027-06-30', selesai: '2026-09-01' },
    });
    expect(h.success).toBe(false);
  });

  // Aturan 15-45 hari milik TERJADWAL saja. Bila skemanya bocor ke BERKALA,
  // proker rutin dengan tanggal persiapan berdekatan akan ditolak tanpa alasan
  // yang dapat dijelaskan kepada pengguna.
  it('aturan 15-45 hari tidak berlaku', () => {
    const h = SkemaProker.safeParse({
      ...rutin,
      tanggal_mulai_persiapan: '2026-09-01',
      tanggal_hari_h_mulai: '2026-09-02',
      tanggal_hari_h_selesai: '2026-09-02',
    });
    expect(h.success).toBe(true);
  });
});

describe('RESPONSIF — hari-H wajib, persiapan tidak', () => {
  const aksi = {
    departemen_id: DEPT,
    nama: 'Aksi Solidaritas',
    kategori: 'RESPONSIF' as const,
    tanggal_hari_h_mulai: '2026-11-22',
    tanggal_hari_h_selesai: '2026-11-22',
  };

  it('tanpa tanggal persiapan diterima', () => {
    expect(SkemaProker.safeParse(aksi).success).toBe(true);
  });

  it('tanpa hari-H ditolak', () => {
    const { tanggal_hari_h_mulai: _buang, ...tanpa } = aksi;
    expect(SkemaProker.safeParse(tanpa).success).toBe(false);
  });

  // Kategori ini lahir justru dari ketiadaan waktu persiapan; memberlakukan
  // 15-45 hari padanya membuatnya mustahil dipakai.
  it('persiapan 3 hari diterima', () => {
    const h = SkemaProker.safeParse({ ...aksi, tanggal_mulai_persiapan: '2026-11-19' });
    expect(h.success).toBe(true);
  });

  it('persiapan setelah hari-H ditolak', () => {
    const h = SkemaProker.safeParse({ ...aksi, tanggal_mulai_persiapan: '2026-11-25' });
    expect(h.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// service.ts
// ---------------------------------------------------------------------------

describe('cekKonflik memanggil fungsi database, bukan menyalin logikanya', () => {
  it('memanggil cek_konflik_proker dengan empat parameter', async () => {
    const k = klienTiruan([[]]);
    await cekKonflik(
      KONTEKS.periodeId,
      { mulai: '2026-11-01', selesai: '2026-12-07' },
      k.tx as never,
    );

    expect(k.panggilan).toHaveLength(1);
    expect(k.panggilan[0]!.sql).toContain('cek_konflik_proker');
    expect(k.panggilan[0]!.params).toEqual([
      KONTEKS.periodeId,
      '2026-11-01',
      '2026-12-07',
      null, // exclude_id kosong dikirim sebagai NULL, bukan dihilangkan
    ]);
  });

  it('exclude_id diteruskan apa adanya', async () => {
    const k = klienTiruan([[]]);
    await cekKonflik(
      KONTEKS.periodeId,
      { mulai: '2026-11-01', selesai: '2026-12-07', exclude_id: SYNCHRONIZE.departemen_id },
      k.tx as never,
    );
    expect(k.panggilan[0]!.params[3]).toBe(SYNCHRONIZE.departemen_id);
  });

  // Rentang disimpan '[)', jadi hari terakhir yang benar-benar terkunci adalah
  // upper - 1. Bila service membacanya mentah, kalender akan menandai satu hari
  // lebih banyak daripada yang sungguh terkunci (INV-11).
  it('mengembalikan hari terakhir yang inklusif', async () => {
    const k = klienTiruan([
      [
        {
          proker_id: 'p1',
          nama_proker: 'SYNCHRONIZE',
          nama_departemen: 'Kaderisasi',
          mulai: '2026-11-01',
          selesai: '2026-12-07',
        },
      ],
    ]);
    const hasil = await cekKonflik(
      KONTEKS.periodeId,
      { mulai: '2026-11-20', selesai: '2026-11-21' },
      k.tx as never,
    );
    expect(hasil[0]!.selesai).toBe('2026-12-07');
    expect(hasil[0]!.nama_departemen).toBe('Kaderisasi');
  });
});

describe('kalenderTerkunci', () => {
  it('satu round-trip, bukan dua', async () => {
    const k = klienTiruan([[]]);
    await kalenderTerkunci(KONTEKS.periodeId, k.tx as never);
    expect(k.panggilan).toHaveLength(1);
  });

  // Draft dan yang dibatalkan tidak boleh tampil terkunci (INV-10). Kunci milik
  // proker yang dibatalkan baru hilang saat cron berikutnya berjalan, jadi
  // filter status inilah yang menutup jeda itu.
  it('membatasi pada status yang sungguh mengunci', async () => {
    const k = klienTiruan([[]]);
    await kalenderTerkunci(KONTEKS.periodeId, k.tx as never);
    expect(k.panggilan[0]!.params).toContainEqual(['DISETUJUI', 'BERJALAN']);
  });

  it('membaca rentang dari proker_lock, bukan dari kolom tanggal proker', async () => {
    const k = klienTiruan([[]]);
    await kalenderTerkunci(KONTEKS.periodeId, k.tx as never);
    expect(k.panggilan[0]!.sql).toContain('lower(pl.rentang)');
    expect(k.panggilan[0]!.sql).toContain('upper(pl.rentang) - 1');
  });
});

describe('buatProker', () => {
  it('menolak input yang tidak valid tanpa menyentuh database', async () => {
    const k = klienTiruan();
    const h = await buatProker(k.tx, konteks(), {
      ...SYNCHRONIZE,
      tanggal_mulai_persiapan: '2026-11-22',
    });

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_VALID');
    expect(h.isu?.[0]!.path).toBe('tanggal_mulai_persiapan');
    expect(k.panggilan).toHaveLength(0);
  });

  // Status tidak pernah diterima dari pemanggil. Proker yang lahir langsung
  // DISETUJUI tidak akan punya baris proker_lock, sehingga ia memakai tanggal
  // yang tidak dikunci siapa pun dan kalender tidak menyadarinya.
  it('memaksa status DRAFT walau badan request meminta DISETUJUI', async () => {
    const k = klienTiruan([[{ id: 'baru' }]]);
    const h = await buatProker(k.tx, konteks(), { ...SYNCHRONIZE, status: 'DISETUJUI' });

    expect(h.ok).toBe(true);
    expect(k.panggilan[0]!.sql).toContain("'DRAFT'");
    expect(k.panggilan[0]!.params).not.toContain('DISETUJUI');
  });

  it('memakai periode dari konteks, bukan dari badan request', async () => {
    const k = klienTiruan([[{ id: 'baru' }]]);
    await buatProker(k.tx, konteks(), { ...SYNCHRONIZE, periode_id: 'periode-palsu' });
    expect(k.panggilan[0]!.params[0]).toBe(KONTEKS.periodeId);
    expect(k.panggilan[0]!.params).not.toContain('periode-palsu');
  });

  // Tanda `*` PRD §5.1: Kadept hanya berhak atas departemennya sendiri.
  it('menolak departemen di luar lingkup Kadept', async () => {
    const k = klienTiruan();
    const h = await buatProker(k.tx, konteks(), {
      ...SYNCHRONIZE,
      departemen_id: '44444444-4444-4444-8444-444444444444',
    });

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('DI_LUAR_LINGKUP');
    expect(k.panggilan).toHaveLength(0);
  });

  it('Ketua tidak berlingkup dan boleh departemen mana pun', async () => {
    const k = klienTiruan([[{ id: 'baru' }]]);
    const h = await buatProker(k.tx, konteks({ roles: ['KETUA'] as never, departemenIds: [] }), {
      ...SYNCHRONIZE,
      departemen_id: '44444444-4444-4444-8444-444444444444',
    });
    expect(h.ok).toBe(true);
  });

  it('menolak bila belum ada periode aktif', async () => {
    const k = klienTiruan();
    const h = await buatProker(k.tx, konteks({ periodeId: '' }), SYNCHRONIZE);
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_ADA_PERIODE_AKTIF');
  });

  it('tanggal dikirim sebagai string, tidak pernah sebagai Date', async () => {
    const k = klienTiruan([[{ id: 'baru' }]]);
    await buatProker(k.tx, konteks(), SYNCHRONIZE);
    expect(k.panggilan[0]!.params.some((p) => p instanceof Date)).toBe(false);
    expect(k.panggilan[0]!.params).toContain('2026-11-01');
  });
});

describe('ubahProker menggabung dengan baris tersimpan sebelum memvalidasi', () => {
  const tersimpan = {
    id: 'p1',
    periode_id: KONTEKS.periodeId,
    departemen_id: DEPT,
    nama_departemen: 'Kaderisasi',
    nama: 'SYNCHRONIZE',
    kategori: 'TERJADWAL',
    status: 'DRAFT',
    deskripsi: null,
    tujuan: null,
    sasaran: null,
    estimasi_peserta: null,
    penanggung_jawab: null,
    nama_penanggung_jawab: null,
    tanggal_mulai_persiapan: '2026-11-01',
    tanggal_hari_h_mulai: '2026-12-06',
    tanggal_hari_h_selesai: '2026-12-07',
    pola_ulang: null,
    estimasi_anggaran: null,
    sumber_dana: [],
    diajukan_at: null,
    disetujui_oleh: null,
    disetujui_at: null,
    alasan_penolakan: null,
    dibuat_oleh: KONTEKS.sesi.userId,
    terkunci: false,
  };

  it('perubahan deskripsi saja tetap lolos aturan tanggal', async () => {
    const k = klienTiruan([[tersimpan], []]);
    const h = await ubahProker(k.tx, konteks(), 'p1', { deskripsi: 'Diperbarui' });
    expect(h.ok).toBe(true);
    expect(k.panggilan[1]!.sql).toContain('UPDATE proker');
  });

  // Inilah alasan gabung-lalu-validasi. PATCH ini hanya mengirim satu tanggal;
  // memvalidasi badan request apa adanya tidak punya pembanding untuk aturan
  // 15-45 hari, sehingga perubahannya lolos ke CHECK constraint dan pulang
  // sebagai error 500 alih-alih pesan form.
  it('memindahkan hari-H ke 10 hari setelah persiapan tersimpan ditolak', async () => {
    const k = klienTiruan([[tersimpan]]);
    const h = await ubahProker(k.tx, konteks(), 'p1', {
      tanggal_hari_h_mulai: '2026-11-11',
      tanggal_hari_h_selesai: '2026-11-11',
    });

    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_VALID');
    expect(k.panggilan).toHaveLength(1); // hanya SELECT; tidak ada UPDATE
  });

  it('proker yang tidak ada menghasilkan TIDAK_DITEMUKAN', async () => {
    const k = klienTiruan([[]]);
    const h = await ubahProker(k.tx, konteks(), 'p1', { deskripsi: 'x' });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('TIDAK_DITEMUKAN');
  });

  it('menolak proker milik departemen lain', async () => {
    const k = klienTiruan([[{ ...tersimpan, departemen_id: '44444444-4444-4444-8444-444444444444' }]]);
    const h = await ubahProker(k.tx, konteks(), 'p1', { deskripsi: 'x' });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('DI_LUAR_LINGKUP');
  });

  it('memindahkan proker ke departemen lain ditolak untuk Kadept', async () => {
    const k = klienTiruan([[tersimpan]]);
    const h = await ubahProker(k.tx, konteks(), 'p1', {
      departemen_id: '44444444-4444-4444-8444-444444444444',
    });
    expect(h.ok).toBe(false);
    if (h.ok) return;
    expect(h.kode).toBe('DI_LUAR_LINGKUP');
  });

  it('status tidak ikut diubah — itu wilayah approval dan T-071', async () => {
    const k = klienTiruan([[tersimpan], []]);
    await ubahProker(k.tx, konteks(), 'p1', { deskripsi: 'x' });
    expect(k.panggilan[1]!.sql).not.toContain('status');
  });
});
