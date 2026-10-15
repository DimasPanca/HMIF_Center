/**
 * Gate T-083 — tingkat deadline pada batas persis & terbaca tanpa warna.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { AMBANG_BAWAAN, infoDeadline, nomorHari, normalkanAmbang, sisaHari, teksSisa, tingkatDeadline } from '@/lib/deadline';

const HARI_INI = '2026-10-15';
const geser = (n: number) => new Date(Date.UTC(2026, 9, 15 + n)).toISOString().slice(0, 10);

describe('nomorHari — aritmetika kalender bilangan bulat', () => {
  it('sama dengan hari UTC untuk rentang luas, termasuk kabisat & pergantian abad', () => {
    for (const t of ['1970-01-01', '2000-02-29', '2024-02-29', '2026-12-31', '2027-01-01', '2100-03-01', '1999-12-31']) {
      expect(nomorHari(t)).toBe(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 86_400_000);
    }
  });

  it('jam pada nilai ISO diabaikan: deadline adalah tanggal', () => {
    expect(sisaHari('2026-10-16T23:59:59+07:00', HARI_INI)).toBe(1);
    expect(sisaHari('2026-10-15T00:00:01Z', HARI_INI)).toBe(0);
  });
});

describe('empat tingkat pada batas persis (ambang 7 & 3)', () => {
  const kasus: [number, string, string][] = [
    [8, 'NORMAL', '8 hari lagi'],
    [7, 'PERINGATAN', '7 hari lagi'], // hari ke-7
    [4, 'PERINGATAN', '4 hari lagi'],
    [3, 'KRITIS', '3 hari lagi'], // hari ke-3
    [1, 'KRITIS', 'Besok'],
    [0, 'KRITIS', 'Hari ini'], // hari-H masih belum terlambat
    [-1, 'TERLAMBAT', 'Terlambat 1 hari'], // H+1
    [-12, 'TERLAMBAT', 'Terlambat 12 hari'],
  ];
  for (const [n, tingkat, teks] of kasus) {
    it(`${n} hari → ${tingkat} "${teks}"`, () => {
      expect(infoDeadline(geser(n), HARI_INI)).toEqual({ tingkat, sisa: n, teks });
    });
  }

  it('melintasi akhir bulan & tahun tetap per hari kalender', () => {
    expect(infoDeadline('2027-01-01', '2026-12-31').teks).toBe('Besok');
    expect(infoDeadline('2026-02-28', '2026-03-01').tingkat).toBe('TERLAMBAT');
  });
});

describe('ambang dari app_config', () => {
  it('ambang kustom dipakai', () => {
    const a = { peringatan: 14, kritis: 5 };
    expect(tingkatDeadline(14, a)).toBe('PERINGATAN');
    expect(tingkatDeadline(15, a)).toBe('NORMAL');
    expect(tingkatDeadline(5, a)).toBe('KRITIS');
    expect(tingkatDeadline(6, a)).toBe('PERINGATAN');
  });

  it('nilai rusak jatuh ke bawaan; kritis selalu < peringatan', () => {
    expect(normalkanAmbang('7', '3')).toEqual({ peringatan: 7, kritis: 3 });
    expect(normalkanAmbang(null, undefined)).toEqual(AMBANG_BAWAAN);
    expect(normalkanAmbang(2, 5)).toEqual({ peringatan: 2, kritis: 1 });
    expect(normalkanAmbang(-1, 'x')).toEqual(AMBANG_BAWAAN);
  });

  it('teks sisa', () => {
    expect(teksSisa(2)).toBe('2 hari lagi');
  });
});

describe('DeadlineBadge — terbaca tanpa warna (K-15)', () => {
  const render = (n: number, selesai = false) =>
    renderToStaticMarkup(React.createElement(DeadlineBadge, { deadline: geser(n), hariIni: HARI_INI, selesai }));
  /** Markup tanpa atribut kelas/gaya: yang tersisa adalah yang terlihat dalam grayscale. */
  const tanpaWarna = (html: string) => html.replace(/\s(class|style)="[^"]*"/g, '');
  const ikon = (html: string) => /lucide-([a-z-]+)/.exec(html)?.[1];

  it('setiap tingkat punya ikon dan teks berbeda', () => {
    const hasil = [10, 5, 2, -2].map((n) => render(n));
    const ikonnya = hasil.map(ikon);
    expect(new Set(ikonnya).size).toBe(4);
    const teks = hasil.map((h) => tanpaWarna(h).replace(/<[^>]+>/g, ''));
    expect(teks[1]).toContain('5 hari lagi');
    expect(teks[2]).toContain('2 hari lagi');
    expect(teks[3]).toContain('terlambat 2 hari');
    // Pembaca layar juga mendapat nama tingkatnya.
    expect(teks.map((t) => /, (Normal|Peringatan|Kritis|Terlambat)/.exec(t)?.[1])).toEqual(['Normal', 'Peringatan', 'Kritis', 'Terlambat']);
  });

  it('data-tingkat untuk gaya & test; pekerjaan selesai tidak lagi mendesak', () => {
    expect(render(-3)).toContain('data-tingkat="TERLAMBAT"');
    expect(render(-3, true)).toContain('data-tingkat="NORMAL"');
  });
});
