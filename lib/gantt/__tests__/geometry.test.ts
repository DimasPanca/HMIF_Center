import type { app_user, gantt_group, gantt_task, v_master_gantt } from '@prisma/client';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  GANTT_DIMENSIONS,
  PX_PER_DAY,
  barRect,
  buildColumns,
  createGanttGeometry,
  dateSpanWidth,
  dateToX,
  xToDate,
  type GanttScale,
} from '@/lib/gantt/geometry';
import { transformGanttRows, type GanttTaskRow, type MasterGanttRow } from '@/lib/gantt/transform';

function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

describe('gantt geometry', () => {
  const start = utcDate('2026-11-01');
  const end = utcDate('2026-12-07');

  it.each([
    ['week', 6, 216, 222],
    ['month', 2, 72, 74],
    ['quarter', 0.8, 28.8, 29.6],
  ] satisfies Array<[GanttScale, number, number, number]>)(
    'menghitung 1 November–7 Desember pada skala %s',
    (scale, pxPerDay, expectedEndX, expectedWidth) => {
      const context = { start, scale };

      expect(PX_PER_DAY[scale]).toBe(pxPerDay);
      expect(dateToX(start, context)).toBe(0);
      expect(dateToX(end, context)).toBeCloseTo(expectedEndX, 8);
      expect(dateSpanWidth(start, end, scale)).toBeCloseTo(expectedWidth, 8);
      expect(xToDate(expectedEndX, context)).toEqual(end);
    },
  );

  it('mempertahankan bar satu hari dengan lebar minimum empat piksel', () => {
    expect(dateSpanWidth(start, start, 'week')).toBe(6);
    expect(dateSpanWidth(start, start, 'month')).toBe(4);
    expect(dateSpanWidth(start, start, 'quarter')).toBe(4);
  });

  it('menghitung rentang inklusif yang melintasi tahun', () => {
    const yearEnd = utcDate('2026-12-31');
    const yearStart = utcDate('2027-01-02');

    expect(dateToX(utcDate('2027-01-01'), yearEnd, 6)).toBe(6);
    expect(dateSpanWidth(yearEnd, yearStart, 6)).toBe(18);
    expect(xToDate(12, yearEnd, 6)).toEqual(yearStart);
  });

  it('memusatkan bar grup dan task di barisnya', () => {
    const context = { start, pxPerDay: 2 };

    expect(barRect({ start, end: start, y: 10, kind: 'group' }, context)).toEqual({
      x: 0,
      y: 19,
      width: 4,
      height: GANTT_DIMENSIONS.groupBarHeight,
    });
    expect(barRect({ start, end: utcDate('2026-11-02'), y: 50, kind: 'task' }, context)).toEqual({
      x: 0,
      y: 58,
      width: 4,
      height: GANTT_DIMENSIONS.taskBarHeight,
    });
  });

  it('membangun kolom yang berurutan dan tepat menutup rentang', () => {
    for (const scale of ['week', 'month', 'quarter'] as const) {
      const columns = buildColumns(scale, { start, end });
      const totalWidth = columns.reduce((total, column) => total + column.width, 0);

      expect(columns.length).toBeGreaterThan(0);
      expect(columns[0]?.x).toBe(0);
      expect(totalWidth).toBeCloseTo(37 * PX_PER_DAY[scale], 8);
      columns.slice(1).forEach((column, index) => {
        const previous = columns[index];
        expect(column.x).toBeCloseTo((previous?.x ?? 0) + (previous?.width ?? 0), 8);
      });
    }
  });

  it('menyediakan geometri terikat yang tetap murni', () => {
    const geometry = createGanttGeometry({ start, scale: 'week' });

    expect(geometry.dateToX(utcDate('2026-11-08'))).toBe(42);
    expect(geometry.xToDate(42)).toEqual(utcDate('2026-11-08'));
  });
});

describe('gantt transform', () => {
  it('menerima bentuk row Prisma tanpa adapter lintas lane', () => {
    type JoinedGanttTask = gantt_task & {
      app_user: app_user | null;
      gantt_group: gantt_group;
    };

    expectTypeOf<v_master_gantt>().toMatchTypeOf<MasterGanttRow>();
    expectTypeOf<JoinedGanttTask>().toMatchTypeOf<GanttTaskRow>();
  });

  it('mengubah view master, mengurutkan task, dan meringkas rentang grup', () => {
    const today = utcDate('2026-11-15');
    const viewModel = transformGanttRows({
      today,
      scale: 'week',
      masterRows: [
        {
          departemen_id: 'dept-1',
          departemen_nama: 'Kaderisasi',
          departemen_warna: 'var(--dept-kaderisasi)',
          departemen_urutan: 2,
          proker_id: 'proker-2',
          proker_nama: 'Latihan Kepemimpinan',
          status: 'DISETUJUI',
          tanggal_mulai_persiapan: '2026-11-10',
          tanggal_hari_h_mulai: '2026-12-05',
          tanggal_hari_h_selesai: '2026-12-07',
          pj_nama: 'Sari',
          progres: { toNumber: () => 40 },
        },
        {
          departemen_id: 'dept-1',
          departemen_nama: 'Kaderisasi',
          departemen_warna: 'var(--dept-kaderisasi)',
          departemen_urutan: 2,
          proker_id: 'proker-1',
          proker_nama: 'Mentoring',
          status: 'BERJALAN',
          tanggal_mulai_persiapan: '2026-11-01',
          tanggal_hari_h_mulai: '2026-11-19',
          tanggal_hari_h_selesai: '2026-11-20',
          pj_nama: 'Budi',
          progres: '60',
        },
      ],
    });

    expect(viewModel.today).toEqual(today);
    expect(viewModel.groups).toHaveLength(1);
    expect(viewModel.groups[0]?.tasks.map((task) => task.id)).toEqual(['proker-1', 'proker-2']);
    expect(viewModel.groups[0]?.tasks[1]?.hariHStart).toEqual(utcDate('2026-12-05'));
    expect(viewModel.groups[0]?.bars).toEqual([
      {
        id: 'dept-1-summary',
        start: utcDate('2026-11-01'),
        end: utcDate('2026-12-07'),
        progress: 50,
        color: 'var(--dept-kaderisasi)',
      },
    ]);
    expect(viewModel.timeline.start).toEqual(utcDate('2026-11-01'));
    expect(viewModel.timeline.end).toEqual(utcDate('2026-12-07'));
  });

  it('menggabungkan gantt_task dengan metadata grup dan assignee', () => {
    const viewModel = transformGanttRows({
      today: utcDate('2026-11-15'),
      scale: 'month',
      groupRows: [
        {
          id: 'group-1',
          nama: 'Persiapan',
          warna: 'var(--primary)',
          pj_nama: 'Koordinator',
          urutan: 1,
          collapsed: true,
        },
      ],
      taskRows: [
        {
          id: 'task-1',
          group_id: 'group-1',
          nama: 'Susun materi',
          tanggal_mulai: utcDate('2026-11-03'),
          tanggal_selesai: utcDate('2026-11-05'),
          progres: 25,
          urutan: 3,
          app_user: { nama_lengkap: 'Nadia' },
          parent_id: 'task-induk',
        },
      ],
    });

    expect(viewModel.groups[0]).toMatchObject({
      id: 'group-1',
      label: 'Persiapan',
      sublabel: 'Koordinator',
      collapsed: true,
    });
    expect(viewModel.groups[0]?.tasks[0]).toMatchObject({
      id: 'task-1',
      assigneeName: 'Nadia',
      parentId: 'task-induk',
      progress: 25,
    });
    expect(viewModel.groups[0]?.bars[0]).toMatchObject({
      start: utcDate('2026-11-03'),
      end: utcDate('2026-11-05'),
    });
  });

  it('memakai parameter hari ini sebagai rentang kosong tanpa membaca waktu sistem', () => {
    const today = utcDate('2027-01-02');
    const viewModel = transformGanttRows({ today, scale: 'quarter' });

    expect(viewModel.groups).toEqual([]);
    expect(viewModel.timeline.start).toEqual(today);
    expect(viewModel.timeline.end).toEqual(today);
  });
});
