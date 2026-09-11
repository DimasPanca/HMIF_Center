import { afterEach, describe, expect, it } from 'vitest';

import {
  formatRentangTanggal,
  formatTanggalPanjang,
  formatTanggalPendek,
  formatTanggalWaktu,
} from '@/lib/utils/format-tanggal';

const zonaWaktuAwal = process.env.TZ;

afterEach(() => {
  if (zonaWaktuAwal === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = zonaWaktuAwal;
  }
});

describe('format tanggal Indonesia', () => {
  it('memformat 06 Oktober 2025 dalam bentuk panjang dan pendek', () => {
    const tanggal = new Date('2025-10-05T17:00:00.000Z');

    expect(formatTanggalPanjang(tanggal)).toBe('Senin, 06 Oktober 2025');
    expect(formatTanggalPendek(tanggal)).toBe('06 Okt 2025');
  });

  it('memformat waktu audit dalam zona Asia/Jakarta', () => {
    expect(formatTanggalWaktu('2025-10-06T07:30:00Z')).toBe('06 Okt 2025, 14.30 WIB');
  });

  it('tidak mengulang bulan untuk rentang pada bulan yang sama', () => {
    expect(formatRentangTanggal('2025-08-19', '2025-08-21')).toBe('19 – 21 Agustus 2025');
  });

  it('menuliskan kedua bulan untuk rentang lintas bulan', () => {
    expect(formatRentangTanggal('2026-11-01', '2026-12-07')).toBe('1 Nov – 7 Des 2026');
  });

  it('menolak rentang dengan tanggal awal setelah tanggal akhir', () => {
    expect(() => formatRentangTanggal('2025-08-21', '2025-08-19')).toThrow(RangeError);
  });

  it('menolak tanggal kalender invalid tanpa menormalisasinya', () => {
    expect(() => formatTanggalPanjang('2025-02-30')).toThrow('Tanggal tidak valid.');
    expect(formatTanggalPanjang('2024-02-29')).toBe('Kamis, 29 Februari 2024');
  });

  it('menghasilkan nilai sama pada TZ UTC dan Asia/Jakarta', () => {
    const tanggal = new Date('2025-10-05T17:00:00.000Z');

    process.env.TZ = 'UTC';
    const hasilUtc = formatTanggalPanjang(tanggal);
    process.env.TZ = 'Asia/Jakarta';
    const hasilJakarta = formatTanggalPanjang(tanggal);

    expect(hasilUtc).toBe('Senin, 06 Oktober 2025');
    expect(hasilJakarta).toBe(hasilUtc);
  });
});
