'use client';

import * as React from 'react';

import type { GanttBarRect } from '@/lib/gantt/geometry';
import type { GanttBarVM, GanttGroupVM } from '@/lib/gantt/types';
import { cn } from '@/lib/utils';

interface GroupBarProps {
  group: GanttGroupVM;
  bar: GanttBarVM;
  rect: GanttBarRect;
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

function GroupBar({
  group,
  bar,
  rect,
  active = false,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  onActivate,
  className,
}: GroupBarProps) {
  const generatedId = React.useId().replace(/:/g, '');
  const clipId = `gantt-group-bar-clip-${generatedId}`;
  const radius = rect.height / 2;
  const progress = clampProgress(bar.progress);
  const progressWidth = rect.width * (progress / 100);
  const title = group.sublabel
    ? `${group.label}, PJ ${group.sublabel}, progres ${progress} persen`
    : `${group.label}, progres ${progress} persen`;

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
      data-slot="gantt-group-bar"
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

      {group.sublabel ? (
        <text
          data-slot="gantt-assignee-label"
          fill="var(--text-tertiary)"
          fontSize={11}
          fontWeight={500}
          pointerEvents="none"
          x={rect.x}
          y={rect.y - 6}
        >
          {group.sublabel}
        </text>
      ) : null}

      <rect
        {...rect}
        className="hmif-gantt-bar-body"
        data-layer="body"
        data-testid={`gantt-bar-${group.id}`}
        fill={bar.color}
        opacity="var(--gantt-bar-opacity)"
        rx={radius}
      />
      <rect
        clipPath={`url(#${clipId})`}
        data-layer="progress"
        fill={bar.color}
        height={rect.height}
        opacity="var(--gantt-progress-opacity)"
        width={progressWidth}
        x={rect.x}
        y={rect.y}
      />

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

export { GroupBar };
export type { GroupBarProps };
