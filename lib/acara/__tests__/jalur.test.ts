import { describe, expect, it } from 'vitest';

import { grupDari, tabDari } from '@/components/acara/TabNav';
import { hitungMundur, susunJalur, type FaktaJalur } from '@/lib/acara/jalur';

const dasar: FaktaJalur = {
  acaraId: 'a1',
  dibatalkan: false,
  tor: { terisi: 0, total: 14 },
  rab: { status: null },
  proposalTersimpan: false,
  hariH: { mulai: '2026-11-10', selesai: '2026-11-11' },
  nota: { menunggu: 0, terverifikasi: 0, ditolak: 0 },
  lpj: null,
};

const status = (f: FaktaJalur, hariIni = '2026-11-01') =>
  Object.fromEntries(susunJalur(f, hariIni).langkah.map((l) => [l.id, l.status]));

describe('hitungMundur', () => {
  it('H-n sebelum, Hari-H selama rentang, H+n sesudah', () => {
    expect(hitungMundur('2026-11-01', '2026-11-10', '2026-11-11')).toBe('H-9');
    expect(hitungMundur('2026-11-11', '2026-11-10', '2026-11-11')).toBe('Hari-H');
    expect(hitungMundur('2026-11-14', '2026-11-10', '2026-11-11')).toBe('H+3');
    expect(hitungMundur('2026-11-01', null, null)).toBeNull();
  });
});

describe('susunJalur (ADR-039)', () => {
  it('acara baru: TOR jadi langkah berikutnya, LPJ menunggu acara', () => {
    const j = susunJalur(dasar, '2026-11-01');
    expect(j.berikutnya).toBe('tor');
    expect(j.langkah.find((l) => l.id === 'lpj')?.keterangan).toBe('Setelah acara');
    expect(j.langkah.find((l) => l.id === 'hari_h')?.keterangan).toBe('H-9');
  });

  it('TOR lengkap + RAB disetujui → proposal berikutnya', () => {
    const f = { ...dasar, tor: { terisi: 14, total: 14 }, rab: { status: 'DISETUJUI' } };
    expect(status(f)).toMatchObject({ tor: 'SELESAI', rab: 'SELESAI', proposal: 'BELUM' });
    expect(susunJalur(f, '2026-11-01').berikutnya).toBe('proposal');
  });

  it('RAB yang tidak boleh dibaca ditandai terbatas dan dilewati sebagai langkah berikutnya', () => {
    const f = { ...dasar, tor: { terisi: 14, total: 14 }, rab: null, nota: null, lpj: 'TERBATAS' as const };
    expect(status(f)).toMatchObject({ rab: 'TERBATAS', nota: 'TERBATAS', lpj: 'TERBATAS' });
    expect(susunJalur(f, '2026-11-01').berikutnya).toBe('proposal');
  });

  it('sesudah acara: nota terverifikasi selesai, LPJ berikutnya', () => {
    const f: FaktaJalur = {
      ...dasar,
      tor: { terisi: 14, total: 14 },
      rab: { status: 'REALISASI' },
      proposalTersimpan: true,
      nota: { menunggu: 0, terverifikasi: 4, ditolak: 0 },
    };
    expect(status(f, '2026-11-20')).toMatchObject({ hari_h: 'SELESAI', nota: 'SELESAI', lpj: 'BELUM' });
    expect(susunJalur(f, '2026-11-20').berikutnya).toBe('lpj');
  });

  it('nota menunggu tetap berjalan walau acara lewat; acara batal tanpa langkah berikutnya', () => {
    expect(status({ ...dasar, nota: { menunggu: 2, terverifikasi: 1, ditolak: 0 } }, '2026-11-20').nota).toBe('BERJALAN');
    expect(susunJalur({ ...dasar, dibatalkan: true }, '2026-11-01').berikutnya).toBeNull();
  });
});

describe('tab ruang kerja acara', () => {
  it('slug fase membuka bagian pertamanya; slug lama tetap berlaku', () => {
    expect(tabDari('persiapan')).toBe('tor');
    expect(tabDari('pelaksanaan')).toBe('divisi');
    expect(tabDari('laporan')).toBe('nota');
    expect(tabDari('rab')).toBe('rab');
    expect(tabDari('ringkasan')).toBe('ringkasan');
    expect(tabDari('ngawur')).toBe('ringkasan');
    expect(tabDari(undefined)).toBe('ringkasan');
  });

  it('setiap bagian masuk tepat satu fase', () => {
    expect(grupDari('formulir').slug).toBe('pelaksanaan');
    expect(grupDari('lpj').slug).toBe('laporan');
    expect(grupDari('proposal').slug).toBe('persiapan');
    expect(grupDari('ringkasan').slug).toBe('ringkasan');
  });
});
