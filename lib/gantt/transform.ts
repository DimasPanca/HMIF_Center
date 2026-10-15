import {
  buildColumns,
  getPxPerDay,
  toUtcDay,
  type GanttDateRange,
  type GanttScale,
} from '@/lib/gantt/geometry';
import type { GanttBarVM, GanttGroupVM, GanttTaskVM, GanttViewModel } from '@/lib/gantt/types';

type DateValue = Date | string;

type NumericValue =
  number | string | { toNumber(): number } | { toString(): string } | null | undefined;

type MasterGanttRow = {
  departemen_id: string | null;
  departemen_nama: string | null;
  departemen_warna: string | null;
  departemen_urutan?: number | null;
  proker_id: string | null;
  proker_nama: string | null;
  kategori?: string | null;
  status?: string | null;
  tanggal_mulai_persiapan: DateValue | null;
  tanggal_hari_h_mulai?: DateValue | null;
  tanggal_hari_h_selesai: DateValue | null;
  pj_nama?: string | null;
  progres?: NumericValue;
};

type GanttGroupRow = {
  id: string;
  nama: string;
  warna: string;
  pj_nama?: string | null;
  urutan?: number;
  collapsed?: boolean;
};

type AssigneeRow = {
  nama_lengkap?: string | null;
};

type GanttTaskRow = {
  id: string;
  group_id: string;
  nama: string;
  tanggal_mulai: DateValue;
  tanggal_selesai: DateValue;
  progres?: NumericValue;
  urutan?: number;
  assignee_name?: string | null;
  app_user?: AssigneeRow | null;
  gantt_group?: GanttGroupRow | null;
  proker_id?: string | null;
  departemen?: string | null;
  status?: string | null;
  parent_id?: string | null;
  depends_on?: readonly string[];
  is_milestone?: boolean;
};

type TransformGanttInput = {
  masterRows?: readonly MasterGanttRow[];
  taskRows?: readonly GanttTaskRow[];
  groupRows?: readonly GanttGroupRow[];
  scale: GanttScale;
  range?: GanttDateRange;
  today: Date;
};

type TransformGanttOptions = Omit<TransformGanttInput, 'masterRows' | 'taskRows'>;

type RankedTask = {
  order: number;
  task: GanttTaskVM;
};

type MutableGroup = {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  collapsed: boolean;
  order: number;
  tasks: Map<string, RankedTask>;
};

const DEFAULT_GANTT_COLOR = 'var(--neutral)';

function parseDateValue(value: DateValue, field: string): Date {
  const parsed =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00.000Z`)
        : new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new RangeError(`${field} memuat tanggal yang tidak valid.`);
  }

  return toUtcDay(parsed);
}

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeColor(value: string | null | undefined): string {
  return normalizeText(value) ?? DEFAULT_GANTT_COLOR;
}

function normalizeProgress(value: NumericValue): number {
  let numeric: number;

  if (typeof value === 'number') {
    numeric = value;
  } else if (typeof value === 'string') {
    numeric = Number(value);
  } else if (value && 'toNumber' in value && typeof value.toNumber === 'function') {
    numeric = value.toNumber();
  } else if (value) {
    numeric = Number(value.toString());
  } else {
    numeric = 0;
  }

  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareTasks(a: RankedTask, b: RankedTask): number {
  return (
    a.order - b.order ||
    a.task.start.getTime() - b.task.start.getTime() ||
    a.task.end.getTime() - b.task.end.getTime() ||
    compareText(a.task.label, b.task.label) ||
    compareText(a.task.id, b.task.id)
  );
}

function createMutableGroup(row: GanttGroupRow): MutableGroup {
  return {
    id: row.id,
    label: normalizeText(row.nama) ?? row.id,
    sublabel: normalizeText(row.pj_nama),
    color: normalizeColor(row.warna),
    collapsed: row.collapsed ?? false,
    order: row.urutan ?? 0,
    tasks: new Map(),
  };
}

function ensureGroup(groups: Map<string, MutableGroup>, row: GanttGroupRow): MutableGroup {
  const existing = groups.get(row.id);
  if (existing) return existing;

  const group = createMutableGroup(row);
  groups.set(row.id, group);
  return group;
}

function addMasterRows(groups: Map<string, MutableGroup>, rows: readonly MasterGanttRow[]): void {
  for (const row of rows) {
    if (
      !row.departemen_id ||
      !row.proker_id ||
      !normalizeText(row.proker_nama) ||
      !row.tanggal_mulai_persiapan ||
      !row.tanggal_hari_h_selesai
    ) {
      continue;
    }

    const group = ensureGroup(groups, {
      id: row.departemen_id,
      nama: normalizeText(row.departemen_nama) ?? row.departemen_id,
      warna: normalizeColor(row.departemen_warna),
      urutan: row.departemen_urutan ?? 0,
      collapsed: false,
    });
    const start = parseDateValue(row.tanggal_mulai_persiapan, 'tanggal_mulai_persiapan');
    const end = parseDateValue(row.tanggal_hari_h_selesai, 'tanggal_hari_h_selesai');

    if (end.getTime() < start.getTime()) {
      throw new RangeError(`Rentang proker ${row.proker_id} tidak valid.`);
    }

    const task: GanttTaskVM = {
      id: row.proker_id,
      label: normalizeText(row.proker_nama) ?? row.proker_id,
      start,
      end,
      progress: normalizeProgress(row.progres),
      color: group.color,
      assigneeName: normalizeText(row.pj_nama),
      meta: {
        prokerId: row.proker_id,
        departemen: normalizeText(row.departemen_nama),
        status: normalizeText(row.status),
      },
    };

    if (row.tanggal_hari_h_mulai) {
      task.hariHStart = parseDateValue(row.tanggal_hari_h_mulai, 'tanggal_hari_h_mulai');
    }
    if (row.tanggal_hari_h_selesai) {
      task.hariHEnd = parseDateValue(row.tanggal_hari_h_selesai, 'tanggal_hari_h_selesai');
    }

    group.tasks.set(task.id, { order: 0, task });
  }
}

function addCustomTaskRows(
  groups: Map<string, MutableGroup>,
  rows: readonly GanttTaskRow[],
  groupRows: readonly GanttGroupRow[],
): void {
  const groupLookup = new Map(groupRows.map((group) => [group.id, group]));

  for (const row of rows) {
    const groupSource = row.gantt_group ??
      groupLookup.get(row.group_id) ?? {
        id: row.group_id,
        nama: row.group_id,
        warna: DEFAULT_GANTT_COLOR,
      };
    const group = ensureGroup(groups, groupSource);
    const start = parseDateValue(row.tanggal_mulai, 'tanggal_mulai');
    const end = parseDateValue(row.tanggal_selesai, 'tanggal_selesai');

    if (end.getTime() < start.getTime()) {
      throw new RangeError(`Rentang task ${row.id} tidak valid.`);
    }

    group.tasks.set(row.id, {
      order: row.urutan ?? 0,
      task: {
        id: row.id,
        label: normalizeText(row.nama) ?? row.id,
        start,
        end,
        progress: normalizeProgress(row.progres),
        color: group.color,
        assigneeName: normalizeText(row.assignee_name ?? row.app_user?.nama_lengkap),
        parentId: normalizeText(row.parent_id),
        ...(row.depends_on?.length ? { dependsOn: [...row.depends_on] } : {}),
        ...(row.is_milestone ? { isMilestone: true } : {}),
        meta: {
          prokerId: normalizeText(row.proker_id),
          departemen: normalizeText(row.departemen),
          status: normalizeText(row.status),
        },
      },
    });
  }
}

function summarizeGroup(group: MutableGroup, tasks: GanttTaskVM[]): GanttBarVM[] {
  if (tasks.length === 0) return [];

  const start = new Date(Math.min(...tasks.map((task) => task.start.getTime())));
  const end = new Date(Math.max(...tasks.map((task) => task.end.getTime())));
  const progress = Math.round(
    tasks.reduce((total, task) => total + task.progress, 0) / tasks.length,
  );

  return [{ id: `${group.id}-summary`, start, end, progress, color: group.color }];
}

function finalizeGroups(groups: Map<string, MutableGroup>): GanttGroupVM[] {
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || compareText(a.label, b.label) || compareText(a.id, b.id))
    .map((group) => {
      const tasks = [...group.tasks.values()].sort(compareTasks).map(({ task }) => task);

      return {
        id: group.id,
        label: group.label,
        sublabel: group.sublabel,
        color: group.color,
        collapsed: group.collapsed,
        bars: summarizeGroup(group, tasks),
        tasks,
      };
    });
}

function resolveRange(
  explicitRange: GanttDateRange | undefined,
  groups: readonly GanttGroupVM[],
  today: Date,
): GanttDateRange {
  if (explicitRange) {
    const start = toUtcDay(explicitRange.start);
    const end = toUtcDay(explicitRange.end);
    if (end.getTime() < start.getTime()) {
      throw new RangeError('Akhir timeline tidak boleh mendahului awal timeline.');
    }
    return { start, end };
  }

  const tasks = groups.flatMap((group) => group.tasks);
  if (tasks.length === 0) return { start: today, end: today };

  return {
    start: new Date(Math.min(...tasks.map((task) => task.start.getTime()))),
    end: new Date(Math.max(...tasks.map((task) => task.end.getTime()))),
  };
}

function transformGanttRows({
  masterRows = [],
  taskRows = [],
  groupRows = [],
  scale,
  range,
  today,
}: TransformGanttInput): GanttViewModel {
  const normalizedToday = toUtcDay(today);
  const groups = new Map<string, MutableGroup>();

  for (const groupRow of groupRows) ensureGroup(groups, groupRow);
  addMasterRows(groups, masterRows);
  addCustomTaskRows(groups, taskRows, groupRows);

  const finalizedGroups = finalizeGroups(groups);
  const timelineRange = resolveRange(range, finalizedGroups, normalizedToday);

  return {
    groups: finalizedGroups,
    timeline: {
      start: timelineRange.start,
      end: timelineRange.end,
      scale,
      columns: buildColumns(scale, timelineRange),
      pxPerDay: getPxPerDay(scale),
    },
    today: normalizedToday,
  };
}

function transformToGanttViewModel(
  masterRows: readonly MasterGanttRow[],
  taskRows: readonly GanttTaskRow[],
  options: TransformGanttOptions,
): GanttViewModel {
  return transformGanttRows({ ...options, masterRows, taskRows });
}

export { DEFAULT_GANTT_COLOR, transformGanttRows, transformToGanttViewModel };
export type {
  DateValue,
  GanttGroupRow,
  GanttTaskRow,
  MasterGanttRow,
  NumericValue,
  TransformGanttInput,
  TransformGanttOptions,
};
