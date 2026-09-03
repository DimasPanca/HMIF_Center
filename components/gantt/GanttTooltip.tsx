import * as React from 'react';

import { formatRentangTanggal } from '@/lib/utils/format-tanggal';
import { cn } from '@/lib/utils';

type GanttDisplayItem = {
  id: string;
  label: string;
  departemen?: string;
  status?: string;
  start: Date;
  end: Date;
  hariHStart?: Date;
  hariHEnd?: Date;
  progress: number;
  assigneeName?: string;
  color: string;
};

type GanttTooltipProps = {
  item: GanttDisplayItem | null;
  open: boolean;
  x: number;
  y: number;
  className?: string;
};

const formatPersentase = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 1,
});

function nilaiAtauStrip(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || '—';
}

function formatStatus(status: string | undefined): string {
  const normalized = status?.trim();
  if (!normalized) return '—';
  if (!/^[A-Z0-9_]+$/.test(normalized)) return normalized;

  return normalized
    .toLocaleLowerCase('id-ID')
    .split('_')
    .map((word) => `${word.charAt(0).toLocaleUpperCase('id-ID')}${word.slice(1)}`)
    .join(' ');
}

function formatHariH(item: GanttDisplayItem): string {
  const start = item.hariHStart ?? item.hariHEnd;
  const end = item.hariHEnd ?? item.hariHStart;

  return start && end ? formatRentangTanggal(start, end) : '—';
}

function formatProgress(progress: number): string {
  const normalized = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
  return `${formatPersentase.format(normalized)}%`;
}

function GanttTooltip({ item, open, x, y, className }: GanttTooltipProps) {
  if (!open || !item) return null;

  return (
    <div
      data-slot="gantt-tooltip"
      data-testid="gantt-tooltip"
      role="tooltip"
      className={cn(
        'pointer-events-none fixed z-50 w-[min(18rem,calc(100vw-1rem))] translate-x-3 translate-y-3 rounded-sm border border-default bg-elevated p-2.5 text-primary shadow-md',
        className,
      )}
      style={{ left: x, top: y }}
    >
      <div
        data-gantt-tooltip-line="judul"
        data-testid="gantt-tooltip-baris"
        className="truncate text-[13px] leading-[18px] font-semibold"
      >
        {item.label}
      </div>
      <div
        data-gantt-tooltip-line="konteks"
        data-testid="gantt-tooltip-baris"
        className="truncate text-[11px] leading-[14px] text-tertiary"
      >
        {nilaiAtauStrip(item.departemen)} · {formatStatus(item.status)}
      </div>
      <div
        data-gantt-tooltip-line="persiapan"
        data-testid="gantt-tooltip-baris"
        className="mt-2 grid grid-cols-[4.75rem_1fr] gap-2 border-t border-subtle pt-2 text-[12px] leading-4"
      >
        <span className="text-secondary">Persiapan</span>
        <span>{formatRentangTanggal(item.start, item.end)}</span>
      </div>
      <div
        data-gantt-tooltip-line="hari-h"
        data-testid="gantt-tooltip-baris"
        className="mt-1 grid grid-cols-[4.75rem_1fr] gap-2 text-[12px] leading-4"
      >
        <span className="text-secondary">Hari-H</span>
        <span>{formatHariH(item)}</span>
      </div>
      <div
        data-gantt-tooltip-line="progres"
        data-testid="gantt-tooltip-baris"
        className="mt-1 grid grid-cols-[4.75rem_1fr] gap-2 text-[12px] leading-4"
      >
        <span className="text-secondary">Progres</span>
        <span className="tabular-nums">{formatProgress(item.progress)}</span>
      </div>
      <div
        data-gantt-tooltip-line="pj"
        data-testid="gantt-tooltip-baris"
        className="mt-1 grid grid-cols-[4.75rem_1fr] gap-2 text-[12px] leading-4"
      >
        <span className="text-secondary">PJ</span>
        <span className="truncate">{nilaiAtauStrip(item.assigneeName)}</span>
      </div>
    </div>
  );
}

export { GanttTooltip };
export type { GanttDisplayItem, GanttTooltipProps };
