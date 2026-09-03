import * as React from 'react';

import type { TimelineVM } from '@/lib/gantt/types';

type GridLinesProps = {
  columns: TimelineVM['columns'];
  width: number;
  height: number;
  rowLines?: readonly number[];
  className?: string;
};

function GridLines({
  columns,
  width,
  height,
  rowLines = [],
  className,
}: GridLinesProps): React.ReactElement {
  return (
    <g data-slot="gantt-grid-lines" className={className} aria-hidden="true" pointerEvents="none">
      <rect
        data-slot="gantt-grid-background"
        width={width}
        height={height}
        fill="var(--gantt-bg)"
      />

      {columns.map((column, index) => {
        const isMonthBoundary = index === 0 || columns[index - 1]?.label !== column.label;

        return (
          <line
            key={`${column.x}-${index}`}
            data-slot="gantt-grid-column"
            data-boundary={isMonthBoundary ? 'month' : 'column'}
            x1={column.x}
            x2={column.x}
            y1={0}
            y2={height}
            stroke={isMonthBoundary ? 'var(--gantt-grid-month)' : 'var(--gantt-grid-line)'}
            strokeWidth={isMonthBoundary ? 1 : 0.5}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      <line
        data-slot="gantt-grid-column-end"
        x1={width}
        x2={width}
        y1={0}
        y2={height}
        stroke="var(--gantt-grid-month)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {rowLines.map((y, index) => (
        <line
          key={`${y}-${index}`}
          data-slot="gantt-grid-row"
          x1={0}
          x2={width}
          y1={y}
          y2={y}
          stroke="var(--gantt-grid-line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

export { GridLines };
export type { GridLinesProps };
