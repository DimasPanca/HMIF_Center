'use client';

import * as React from 'react';

import type { GanttBarRect } from '@/lib/gantt/geometry';
import { pxKeHari, type ModeGeser } from '@/lib/gantt/geser';
import type { GanttTaskVM } from '@/lib/gantt/types';
import { cn } from '@/lib/utils';

/**
 * Drag editor (T-078 #2). `aktif=false` tetap merender pegangan dengan
 * `data-drag-aktif="false"` dan tanpa interaksi: pengguna tanpa izin tidak
 * pernah melihat bar bergeser lalu kembali sendiri.
 */
interface DragTaskBar {
  aktif: boolean;
  pxPerDay: number;
  onGeser: (taskId: string, mode: ModeGeser, hari: number) => void;
}

const LEBAR_TEPI = 6;

function terapkanGeser(rect: GanttBarRect, mode: ModeGeser, dx: number, pxPerDay: number): GanttBarRect {
  const minimal = Math.max(pxPerDay, 4);
  if (mode === 'pindah') return { ...rect, x: rect.x + dx };
  if (mode === 'awal') {
    const geser = Math.min(dx, rect.width - minimal);
    return { ...rect, x: rect.x + geser, width: rect.width - geser };
  }
  return { ...rect, width: Math.max(minimal, rect.width + dx) };
}

interface TaskBarProps {
  task: GanttTaskVM;
  rect: GanttBarRect;
  hariHRect?: { x: number; width: number };
  active?: boolean;
  highlighted?: boolean;
  onHoverStart?: (event: React.PointerEvent<SVGGElement>) => void;
  onHoverMove?: (event: React.PointerEvent<SVGGElement>) => void;
  onHoverEnd?: () => void;
  onActivate?: () => void;
  drag?: DragTaskBar;
  className?: string;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

function TaskBar({
  task,
  rect: rectAsli,
  hariHRect,
  active = false,
  highlighted = false,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  onActivate,
  drag,
  className,
}: TaskBarProps) {
  const generatedId = React.useId().replace(/:/g, '');
  const clipId = `gantt-task-bar-clip-${generatedId}`;
  const [geser, setGeser] = React.useState<{ mode: ModeGeser; x0: number; dx: number } | null>(null);
  const bergerak = React.useRef(false);
  const aktif = drag?.aktif === true;
  const pxPerDay = drag?.pxPerDay ?? 1;
  const rect = geser ? terapkanGeser(rectAsli, geser.mode, geser.dx, pxPerDay) : rectAsli;
  const radius = rect.height / 2;
  const progress = clampProgress(task.progress);
  const progressWidth = rect.width * (progress / 100);
  const status = task.meta.status ? `, status ${task.meta.status}` : '';
  const title = `${task.label}${status}, progres ${progress} persen`;

  function handleKeyDown(event: React.KeyboardEvent<SVGGElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    onActivate?.();
  }

  function mulaiGeser(mode: ModeGeser) {
    return (event: React.PointerEvent<SVGRectElement>) => {
      if (!aktif || event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      bergerak.current = false;
      setGeser({ mode, x0: event.clientX, dx: 0 });
    };
  }

  function saatGeser(event: React.PointerEvent<SVGRectElement>) {
    if (!geser) return;
    const mentah = event.clientX - geser.x0;
    if (Math.abs(mentah) > 3) bergerak.current = true;
    // Pratinjau langsung ter-snap ke hari: yang terlihat = yang tersimpan.
    const dx = pxKeHari(mentah, pxPerDay) * pxPerDay;
    if (dx !== geser.dx) setGeser({ ...geser, dx });
  }

  function akhiriGeser(event: React.PointerEvent<SVGRectElement>) {
    if (!geser) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const hari = pxKeHari(event.clientX - geser.x0, pxPerDay);
    const mode = geser.mode;
    setGeser(null);
    if (hari !== 0 && drag) drag.onGeser(task.id, mode, hari);
  }

  function geserKeyboard(event: React.KeyboardEvent<SVGRectElement>) {
    if (!aktif || !drag || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    event.stopPropagation();
    drag.onGeser(task.id, event.shiftKey ? 'akhir' : 'pindah', event.key === 'ArrowLeft' ? -1 : 1);
  }

  return (
    <g
      aria-label={title}
      aria-pressed={active}
      className={cn('hmif-gantt-bar', className)}
      data-active={active ? 'true' : 'false'}
      data-highlighted={highlighted ? 'true' : 'false'}
      data-slot="gantt-task-bar"
      data-dragging={geser ? 'true' : undefined}
      onClick={() => {
        if (bergerak.current) {
          bergerak.current = false;
          return;
        }
        onActivate?.();
      }}
      onKeyDown={handleKeyDown}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onPointerMove={onHoverMove}
      role="button"
      style={highlighted ? { filter: 'drop-shadow(0 0 5px var(--warning))' } : undefined}
      tabIndex={0}
    >
      <title>{title}</title>
      <defs>
        <clipPath id={clipId}>
          <rect {...rect} rx={radius} />
        </clipPath>
      </defs>

      <rect
        {...rect}
        className="hmif-gantt-bar-body"
        data-layer="body"
        data-testid={`gantt-bar-${task.id}`}
        fill={task.color}
        opacity="var(--gantt-bar-opacity)"
        rx={radius}
      />
      <rect
        clipPath={`url(#${clipId})`}
        data-layer="progress"
        fill={task.color}
        height={rect.height}
        opacity="var(--gantt-progress-opacity)"
        width={progressWidth}
        x={rect.x}
        y={rect.y}
      />

      {hariHRect ? (
        <rect
          data-layer="hari-h"
          data-testid={`gantt-harih-${task.id}`}
          fill="var(--gantt-hari-h)"
          height={rect.height}
          pointerEvents="none"
          rx={radius}
          stroke="var(--gantt-hari-h-ring)"
          strokeWidth={1}
          width={hariHRect.width}
          x={hariHRect.x}
          y={rect.y}
        />
      ) : null}

      <rect
        {...rect}
        className="hmif-gantt-bar-focus"
        data-layer="interaction-outline"
        fill="none"
        pointerEvents="none"
        rx={radius}
        stroke="transparent"
        strokeWidth={0}
      />

      {drag ? (
        <>
          <rect
            {...rect}
            aria-label={aktif ? `Geser ${task.label} (panah kiri/kanan; Shift mengubah durasi)` : undefined}
            data-drag-aktif={aktif ? 'true' : 'false'}
            data-slot="gantt-drag"
            data-testid={`gantt-drag-${task.id}`}
            fill="transparent"
            onKeyDown={geserKeyboard}
            onLostPointerCapture={() => setGeser(null)}
            onPointerDown={mulaiGeser('pindah')}
            onPointerMove={saatGeser}
            onPointerUp={akhiriGeser}
            pointerEvents={aktif ? 'all' : 'none'}
            role={aktif ? 'slider' : undefined}
            aria-valuetext={aktif ? `${task.start.toISOString().slice(0, 10)} sampai ${task.end.toISOString().slice(0, 10)}` : undefined}
            style={{ cursor: aktif ? (geser ? 'grabbing' : 'grab') : 'default', touchAction: aktif ? 'none' : undefined }}
            tabIndex={aktif ? 0 : -1}
          />
          {/* Bar sempit: pegangan tepi akan menutupi seluruh bar dan merebut
              drag pindah — durasinya diubah lewat form atau Shift+panah. */}
          {aktif && rect.width >= LEBAR_TEPI * 4
            ? (['awal', 'akhir'] as const).map((mode) => (
                <rect
                  key={mode}
                  data-slot="gantt-resize"
                  data-testid={`gantt-resize-${mode}-${task.id}`}
                  fill="transparent"
                  height={rect.height + 6}
                  onPointerDown={mulaiGeser(mode)}
                  onPointerMove={saatGeser}
                  onPointerUp={akhiriGeser}
                  style={{ cursor: 'ew-resize', touchAction: 'none' }}
                  width={LEBAR_TEPI}
                  x={mode === 'awal' ? rect.x : rect.x + rect.width - LEBAR_TEPI}
                  y={rect.y - 3}
                />
              ))
            : null}
        </>
      ) : null}
    </g>
  );
}

export { TaskBar };
export type { DragTaskBar, TaskBarProps };
