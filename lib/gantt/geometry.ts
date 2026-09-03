import type { TimelineVM } from '@/lib/gantt/types';

const DAY_IN_MS = 86_400_000;
const MIN_BAR_WIDTH = 4;

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const PX_PER_DAY = {
  week: 6,
  month: 2,
  quarter: 0.8,
} as const satisfies Record<GanttScale, number>;

const GANTT_DIMENSIONS = {
  groupRowHeight: 32,
  taskRowHeight: 26,
  groupBarHeight: 14,
  taskBarHeight: 10,
  groupGap: 8,
  minBarWidth: MIN_BAR_WIDTH,
} as const;

type GanttScale = TimelineVM['scale'];

type GanttDateRange = {
  start: Date;
  end: Date;
};

type GeometryContext = Pick<TimelineVM, 'start' | 'pxPerDay'> | { start: Date; scale: GanttScale };

type ScaleOrPixels = GanttScale | number | Pick<TimelineVM, 'pxPerDay'>;

type GanttGeometryRow = {
  start: Date;
  end: Date;
  y: number;
  kind: 'group' | 'task';
};

type GanttBarRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function assertDate(value: Date, label: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new RangeError(`${label} harus berupa Date yang valid.`);
  }
}

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} harus berupa angka positif.`);
  }
}

/** Menormalkan tanggal kalender ke tengah malam UTC tanpa memutasi input. */
function toUtcDay(value: Date): Date {
  assertDate(value, 'Tanggal');

  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function epochDay(value: Date): number {
  return toUtcDay(value).getTime() / DAY_IN_MS;
}

function addUtcDays(value: Date, amount: number): Date {
  return new Date(toUtcDay(value).getTime() + amount * DAY_IN_MS);
}

function earlierDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function getPxPerDay(value: ScaleOrPixels): number {
  if (typeof value === 'string') return PX_PER_DAY[value];

  const pixels = typeof value === 'number' ? value : value.pxPerDay;
  assertPositiveNumber(pixels, 'Lebar per hari');
  return pixels;
}

function resolveContext(
  contextOrStart: GeometryContext | Date,
  explicitPxPerDay?: number,
): Pick<TimelineVM, 'start' | 'pxPerDay'> {
  if (contextOrStart instanceof Date) {
    if (explicitPxPerDay === undefined) {
      throw new TypeError('Lebar per hari wajib diberikan bersama tanggal awal.');
    }

    return { start: toUtcDay(contextOrStart), pxPerDay: getPxPerDay(explicitPxPerDay) };
  }

  const pxPerDay =
    'pxPerDay' in contextOrStart ? getPxPerDay(contextOrStart) : getPxPerDay(contextOrStart.scale);

  return { start: toUtcDay(contextOrStart.start), pxPerDay };
}

function dateToX(date: Date, context: GeometryContext): number;
function dateToX(date: Date, timelineStart: Date, pxPerDay: number): number;
function dateToX(
  date: Date,
  contextOrStart: GeometryContext | Date,
  explicitPxPerDay?: number,
): number {
  const context = resolveContext(contextOrStart, explicitPxPerDay);

  return (epochDay(date) - epochDay(context.start)) * context.pxPerDay;
}

function xToDate(x: number, context: GeometryContext): Date;
function xToDate(x: number, timelineStart: Date, pxPerDay: number): Date;
function xToDate(
  x: number,
  contextOrStart: GeometryContext | Date,
  explicitPxPerDay?: number,
): Date {
  if (!Number.isFinite(x)) throw new RangeError('Koordinat x harus berupa angka yang valid.');

  const context = resolveContext(contextOrStart, explicitPxPerDay);
  const dayOffset = Math.round(x / context.pxPerDay);

  return addUtcDays(context.start, dayOffset);
}

function dateSpanWidth(start: Date, end: Date, scaleOrPixels: ScaleOrPixels): number {
  const startDay = epochDay(start);
  const endDay = epochDay(end);

  if (endDay < startDay) {
    throw new RangeError('Tanggal selesai tidak boleh mendahului tanggal mulai.');
  }

  return Math.max((endDay - startDay + 1) * getPxPerDay(scaleOrPixels), MIN_BAR_WIDTH);
}

function barRect(row: GanttGeometryRow, context: GeometryContext): GanttBarRect;
function barRect(row: GanttGeometryRow, timelineStart: Date, pxPerDay: number): GanttBarRect;
function barRect(
  row: GanttGeometryRow,
  contextOrStart: GeometryContext | Date,
  explicitPxPerDay?: number,
): GanttBarRect {
  if (!Number.isFinite(row.y)) throw new RangeError('Posisi y bar harus valid.');

  const context = resolveContext(contextOrStart, explicitPxPerDay);
  const isGroup = row.kind === 'group';
  const rowHeight = isGroup ? GANTT_DIMENSIONS.groupRowHeight : GANTT_DIMENSIONS.taskRowHeight;
  const height = isGroup ? GANTT_DIMENSIONS.groupBarHeight : GANTT_DIMENSIONS.taskBarHeight;

  return {
    x: dateToX(row.start, context),
    y: row.y + (rowHeight - height) / 2,
    width: dateSpanWidth(row.start, row.end, context),
    height,
  };
}

function endOfUtcMonth(value: Date): Date {
  const date = toUtcDay(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function endOfUtcQuarter(value: Date): Date {
  const date = toUtcDay(value);
  const quarterEndMonth = Math.floor(date.getUTCMonth() / 3) * 3 + 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterEndMonth, 0));
}

function buildColumns(scale: GanttScale, range: GanttDateRange): TimelineVM['columns'] {
  const start = toUtcDay(range.start);
  const end = toUtcDay(range.end);

  if (end.getTime() < start.getTime()) {
    throw new RangeError('Akhir timeline tidak boleh mendahului awal timeline.');
  }

  const pxPerDay = getPxPerDay(scale);
  const context = { start, pxPerDay };
  const columns: TimelineVM['columns'] = [];
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    let columnEnd: Date;
    let label: string;
    let sublabel: string;

    if (scale === 'week') {
      columnEnd = earlierDate(addUtcDays(cursor, 6), endOfUtcMonth(cursor));
      label = MONTH_NAMES[cursor.getUTCMonth()] ?? 'Bulan';
      sublabel = `W${Math.floor((cursor.getUTCDate() - 1) / 7) + 1}`;
    } else if (scale === 'month') {
      columnEnd = endOfUtcMonth(cursor);
      label = MONTH_NAMES[cursor.getUTCMonth()] ?? 'Bulan';
      sublabel = String(cursor.getUTCFullYear());
    } else {
      columnEnd = endOfUtcQuarter(cursor);
      label = `Kuartal ${Math.floor(cursor.getUTCMonth() / 3) + 1}`;
      sublabel = String(cursor.getUTCFullYear());
    }

    columnEnd = earlierDate(columnEnd, end);
    columns.push({
      label,
      sublabel,
      x: dateToX(cursor, context),
      width: (epochDay(columnEnd) - epochDay(cursor) + 1) * pxPerDay,
    });
    cursor = addUtcDays(columnEnd, 1);
  }

  return columns;
}

function createGanttGeometry(context: GeometryContext) {
  const resolved = resolveContext(context);

  return {
    dateToX: (date: Date) => dateToX(date, resolved),
    xToDate: (x: number) => xToDate(x, resolved),
    dateSpanWidth: (start: Date, end: Date) => dateSpanWidth(start, end, resolved),
    barRect: (row: GanttGeometryRow) => barRect(row, resolved),
  };
}

export {
  GANTT_DIMENSIONS,
  PX_PER_DAY,
  barRect,
  buildColumns,
  createGanttGeometry,
  dateSpanWidth,
  dateToX,
  getPxPerDay,
  toUtcDay,
  xToDate,
};
export type {
  GanttBarRect,
  GanttDateRange,
  GanttGeometryRow,
  GanttScale,
  GeometryContext,
  ScaleOrPixels,
};
