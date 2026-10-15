import * as React from 'react';

import type { GanttDisplayItem } from '@/components/gantt/GanttTooltip';
import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { formatRentangTanggal } from '@/lib/utils/format-tanggal';
import { cn } from '@/lib/utils';

type GanttPanelProps = {
  item: GanttDisplayItem | null;
  open: boolean;
  onClose: () => void;
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-subtle py-3 last:border-b-0">
      <dt className="text-[12px] leading-4 font-medium text-secondary">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-[18px] text-primary">{value}</dd>
    </div>
  );
}

function GanttPanel({ item, open, onClose, className }: GanttPanelProps) {
  if (!item) return null;

  return (
    <aside
      data-slot="gantt-panel"
      data-testid="gantt-panel"
      data-state={open ? 'open' : 'closed'}
      role="dialog"
      aria-modal="false"
      aria-hidden={!open}
      aria-labelledby={`gantt-panel-title-${item.id}`}
      className={cn(
        'fixed inset-y-0 right-0 z-40 w-[min(24rem,calc(100vw-1rem))] border-l border-default bg-elevated text-primary shadow-lg transition-transform duration-normal ease-out motion-reduce:transition-none',
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        className,
      )}
    >
      <header className="flex min-h-14 items-start justify-between gap-3 border-b border-default px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] leading-[14px] font-medium tracking-wide text-tertiary uppercase">
            Detail Gantt
          </p>
          <h2
            id={`gantt-panel-title-${item.id}`}
            className="mt-0.5 truncate text-[16px] leading-6 font-semibold"
          >
            {item.label}
          </h2>
        </div>
        <button
          type="button"
          data-slot="gantt-panel-close"
          aria-label="Tutup panel detail Gantt"
          tabIndex={open ? 0 : -1}
          onClick={onClose}
          className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-sm text-[22px] leading-none text-secondary outline-none transition-[background-color,color,box-shadow] duration-fast ease-out hover:bg-subtle hover:text-primary focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] motion-reduce:transition-none"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto px-4 py-2">
        <dl>
          <DetailRow label="Departemen" value={nilaiAtauStrip(item.departemen)} />
          <DetailRow label="Status" value={formatStatus(item.status)} />
          <DetailRow label="Persiapan" value={formatRentangTanggal(item.start, item.end)} />
          <DetailRow label="Hari-H" value={formatHariH(item)} />
          <DetailRow
            label="Tenggat"
            value={<DeadlineBadge deadline={item.end.toISOString()} selesai={item.progress >= 100} className="text-[13px]" />}
          />
          <DetailRow
            label="Progres"
            value={<span className="tabular-nums">{formatProgress(item.progress)}</span>}
          />
          <DetailRow label="Penanggung jawab" value={nilaiAtauStrip(item.assigneeName)} />
        </dl>
      </div>
    </aside>
  );
}

export { GanttPanel };
export type { GanttPanelProps };
