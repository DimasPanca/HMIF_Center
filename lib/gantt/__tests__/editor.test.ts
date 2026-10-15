import { describe, expect, it } from 'vitest';

import { svgEkspor } from '@/lib/gantt/export-svg';
import {
  SkemaTaskBaru,
  SkemaUbahTask,
  geserTanggal,
  hasilGeser,
  membentukSiklus,
  pxKeHari,
  tanggalSah,
} from '@/lib/gantt/skema';
import { transformGanttRows } from '@/lib/gantt/transform';

const G = '11111111-1111-4111-8111-111111111111';

describe('tanggal & drag', () => {
  it('menggeser tanggal kalender melewati batas bulan/tahun tanpa geser zona', () => {
    expect(geserTanggal('2026-12-30', 3)).toBe('2027-01-02');
    expect(geserTanggal('2026-03-01', -1)).toBe('2026-02-28');
    expect(geserTanggal('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('snap piksel ke hari utuh', () => {
    expect(pxKeHari(17, 6)).toBe(3);
    expect(pxKeHari(2, 6)).toBe(0);
    expect(pxKeHari(-10, 6)).toBe(-2);
    expect(Object.is(pxKeHari(-1, 6), -0)).toBe(false);
    expect(pxKeHari(10, 0)).toBe(0);
  });

  it('pindah menggeser dua ujung; tepi mengubah durasi dan tak pernah terbalik', () => {
    expect(hasilGeser('2026-11-01', '2026-11-03', 'pindah', 2)).toEqual({ mulai: '2026-11-03', selesai: '2026-11-05' });
    expect(hasilGeser('2026-11-01', '2026-11-03', 'akhir', 4)).toEqual({ mulai: '2026-11-01', selesai: '2026-11-07' });
    expect(hasilGeser('2026-11-01', '2026-11-03', 'akhir', -9)).toEqual({ mulai: '2026-11-01', selesai: '2026-11-01' });
    expect(hasilGeser('2026-11-01', '2026-11-03', 'awal', 9)).toEqual({ mulai: '2026-11-03', selesai: '2026-11-03' });
    expect(hasilGeser('2026-11-01', '2026-11-03', 'awal', -2)).toEqual({ mulai: '2026-10-30', selesai: '2026-11-03' });
  });

  it('tanggalSah menolak tanggal kalender mustahil', () => {
    expect(tanggalSah('2026-02-30')).toBe(false);
    expect(tanggalSah('2026-2-3')).toBe(false);
    expect(tanggalSah('2026-02-28')).toBe(true);
  });
});

describe('skema task', () => {
  it('selesai tidak boleh mendahului mulai; progres 0–100', () => {
    const dasar = { group_id: G, nama: 'Rapat', tanggal_mulai: '2026-11-02', tanggal_selesai: '2026-11-01' };
    expect(SkemaTaskBaru.safeParse(dasar).success).toBe(false);
    expect(SkemaTaskBaru.safeParse({ ...dasar, tanggal_selesai: '2026-11-02' }).success).toBe(true);
    expect(SkemaTaskBaru.safeParse({ ...dasar, tanggal_selesai: '2026-11-02', progres: 101 }).success).toBe(false);
  });

  it('ubah kosong ditolak', () => {
    expect(SkemaUbahTask.safeParse({}).success).toBe(false);
    expect(SkemaUbahTask.safeParse({ progres: 40 }).success).toBe(true);
  });
});

describe('siklus dependensi', () => {
  const deps = [
    { dari: 'a', ke: 'b' },
    { dari: 'b', ke: 'c' },
  ];
  it('menolak siklus langsung maupun panjang', () => {
    expect(membentukSiklus(deps, 'a', ['b'])).toBe(true);
    expect(membentukSiklus(deps, 'a', ['c'])).toBe(true);
  });
  it('menerima rantai sah dan penggantian pendahulu lama', () => {
    expect(membentukSiklus(deps, 'd', ['c'])).toBe(false);
    // b semula menunggu a; mengganti pendahulu b menjadi d tidak membentuk siklus.
    expect(membentukSiklus(deps, 'b', ['d'])).toBe(false);
  });
});

describe('svgEkspor', () => {
  const model = transformGanttRows({
    groupRows: [{ id: G, nama: 'Persiapan & <Acara>', warna: '#2563EB' }],
    taskRows: [
      { id: 't1', group_id: G, nama: 'Rapat', tanggal_mulai: '2026-11-01', tanggal_selesai: '2026-11-03', progres: 50 },
      { id: 't2', group_id: G, nama: 'Hari H', tanggal_mulai: '2026-11-05', tanggal_selesai: '2026-11-05', depends_on: ['t1'], is_milestone: true },
    ],
    scale: 'week',
    range: { start: new Date('2026-10-25T00:00:00Z'), end: new Date('2026-11-30T00:00:00Z') },
    today: new Date('2026-11-02T00:00:00Z'),
  });

  it('memuat label, bar, konektor, dan meng-escape teks', () => {
    const { svg, lebar } = svgEkspor(model, { judul: 'Gantt "Uji"', lebarLabel: 200 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('Persiapan &amp; &lt;Acara&gt;');
    expect(svg).toContain('Gantt &quot;Uji&quot;');
    expect(svg).toContain('fill="#2563EB"');
    expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ L/); // milestone/arrow
    expect(svg).not.toContain('var(--');
    expect(lebar).toBeGreaterThan(200);
  });

  it('warna variabel CSS yang tak terjemahkan jatuh ke abu-abu, bukan var()', () => {
    const m = transformGanttRows({
      groupRows: [{ id: G, nama: 'X', warna: 'var(--dept-x)' }],
      taskRows: [{ id: 't', group_id: G, nama: 'T', tanggal_mulai: '2026-11-01', tanggal_selesai: '2026-11-02' }],
      scale: 'month',
      today: new Date('2026-11-01T00:00:00Z'),
    });
    expect(svgEkspor(m).svg).toContain('#64748B');
    expect(svgEkspor(m, { warna: () => '#DC2626' }).svg).toContain('#DC2626');
  });

  it('lebar timeline minimal dihormati', () => {
    expect(svgEkspor(model, { lebarLabel: 100, lebarTimelineMin: 3000 }).lebar).toBe(3100);
  });
});
