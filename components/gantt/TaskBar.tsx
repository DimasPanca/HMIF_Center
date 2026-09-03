'use client';

import * as React from 'react';

import type { GanttBarRect } from '@/lib/gantt/geometry';
import type { GanttTaskVM } from '@/lib/gantt/types';
import { cn } from '@/lib/utils';

interface TaskBarProps {
  task: GanttTaskVM;
  rect: GanttBarRect;
  hariHRect?: { x: number; width: number };
  active?: boolean;
  onHoverStart?: (event: React.PointerEvent<SVGGElement>) => void;
  onHoverMove?: (event: React.PointerEvent<SVGGElement>) => void;
  onHoverEnd?: () => void;
  onActivate?: () => void;
  className?: string;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

function TaskBar({
  task,
  rect,
  hariHRect,
  active = false,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  onActivate,
  className,
}: TaskBarProps) {
  const generatedId = React.useId().replace(/:/g, '');
  const clipId = `gantt-task-bar-clip-${generatedId}`;
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

  return (
    <g
      aria-label={title}
      aria-pressed={active}
      className={cn('hmif-gantt-bar', className)}
      data-active={active ? 'true' : 'false'}
      data-slot="gantt-task-bar"
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onPointerMove={onHoverMove}
      role="button"
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
    </g>
  );
}

export { TaskBar };
export type { TaskBarProps };
