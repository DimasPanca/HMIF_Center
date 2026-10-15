/**
 * Test cron harian (murni, klien tiruan — tanpa database).
 *
 * Yang dijaga: orkestrator memanggil kedua langkah lifecycle DAN mencatat audit
 * CRON, serta otorisasi menolak tanpa rahasia yang benar. Transisi status nyata
 * (SELESAI/BERJALAN + pelepasan kunci) milik fungsi SQL lepas_kunci_selesai()
 * dan dibuktikan smoke DB.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-079 · ADR-009
 */

import { afterEach, describe, expect, it } from 'vitest';

import { lepasKunciSelesai } from '../lepas-kunci';
import { cekDeadline } from '../cek-deadline';
import { jalankanCronHarian, cronTerotorisasi } from '../harian';

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
    tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof jalankanCronHarian>[0],
  };
}

const adaSql = (p: Panggilan[], s: string) => p.some((x) => x.sql.includes(s));

describe('lepasKunciSelesai', () => {
  it('memanggil fungsi SQL lepas_kunci_selesai dan mengembalikan hitungannya', async () => {
    const { tx, panggilan } = klienTiruan([[{ hasil: { jadi_selesai: 2, kunci_dilepas: 2, jadi_berjalan: 1 } }]]);
    const r = await lepasKunciSelesai(tx);
    expect(adaSql(panggilan, 'lepas_kunci_selesai()')).toBe(true);
    expect(r).toEqual({ jadi_selesai: 2, kunci_dilepas: 2, jadi_berjalan: 1 });
  });
});

describe('cekDeadline', () => {
  it('meringkas urgensi dari kanban_card memakai ambang app_config', async () => {
    const { tx, panggilan } = klienTiruan([[{ mendekati: 3, kritis: 1, terlambat: 2 }], []]);
    const r = await cekDeadline(tx);
    expect(adaSql(panggilan, 'kanban_card')).toBe(true);
    expect(adaSql(panggilan, 'deadline_warning_hari')).toBe(true);
    // Batas hari Jakarta, bukan CURRENT_DATE server UTC (T-083 #4).
    expect(adaSql(panggilan, 'hari_ini_jakarta()')).toBe(true);
    expect(adaSql(panggilan, 'CURRENT_DATE')).toBe(false);
    // Agregat dashboard disegarkan (T-083 #5).
    expect(panggilan.some((p) => p.sql.includes('INSERT INTO deadline_ringkasan') && p.sql.includes('ON CONFLICT'))).toBe(true);
    expect(r).toEqual({ mendekati: 3, kritis: 1, terlambat: 2 });
  });
});

describe('jalankanCronHarian', () => {
  it('menjalankan kedua langkah lalu mencatat audit CRON', async () => {
    const { tx, panggilan } = klienTiruan([
      [{ hasil: { jadi_selesai: 1, kunci_dilepas: 1, jadi_berjalan: 0 } }], // lepasKunciSelesai
      [{ mendekati: 0, kritis: 0, terlambat: 0 }], // cekDeadline
      [], // segarkan deadline_ringkasan
      [{ tanggal: '2026-09-11', tanggal_1: false }], // meta
      [], // INSERT audit_log
    ]);
    const r = await jalankanCronHarian(tx);

    expect(adaSql(panggilan, 'lepas_kunci_selesai()')).toBe(true);
    expect(adaSql(panggilan, 'kanban_card')).toBe(true);
    // Audit CRON dengan ringkasan ('CRON' adalah literal di SQL, bukan param).
    expect(panggilan.some((p) => p.sql.includes('INSERT INTO audit_log') && p.sql.includes("'CRON'"))).toBe(true);
    expect(r.tanggal).toBe('2026-09-11');
    expect(r.tanggal_1).toBe(false);
    expect(r.lepas.jadi_selesai).toBe(1);
    expect(r.deadline.terlambat).toBe(0);
  });
});

describe('cronTerotorisasi', () => {
  const asli = process.env.CRON_SECRET;
  afterEach(() => {
    if (asli === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = asli;
  });

  it('menolak bila CRON_SECRET tidak diset (fail-closed)', () => {
    delete process.env.CRON_SECRET;
    expect(cronTerotorisasi('Bearer apa pun')).toBe(false);
  });

  it('menerima header Bearer yang cocok', () => {
    process.env.CRON_SECRET = 'rahasia-uji';
    expect(cronTerotorisasi('Bearer rahasia-uji')).toBe(true);
  });

  it('menolak header yang salah atau tak ada', () => {
    process.env.CRON_SECRET = 'rahasia-uji';
    expect(cronTerotorisasi('Bearer salah')).toBe(false);
    expect(cronTerotorisasi(null)).toBe(false);
    expect(cronTerotorisasi('rahasia-uji')).toBe(false); // tanpa prefiks Bearer
  });
});
