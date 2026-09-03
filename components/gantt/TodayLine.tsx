import * as React from 'react';

type TodayLineProps = {
  x: number;
  dayWidth: number;
  height: number;
  label?: string;
  className?: string;
};

function TodayLine({
  x,
  dayWidth,
  height,
  label = 'Hari ini',
  className,
}: TodayLineProps): React.ReactElement {
  const lineX = x + dayWidth / 2;

  return (
    <g
      data-slot="gantt-today-line"
      data-testid="gantt-today-line"
      className={className}
      pointerEvents="none"
    >
      <rect
        data-slot="gantt-today-highlight"
        x={x}
        y={0}
        width={dayWidth}
        height={height}
        fill="var(--gantt-today-bg)"
      />
      <line
        data-slot="gantt-today-marker"
        x1={lineX}
        x2={lineX}
        y1={0}
        y2={height}
        stroke="var(--gantt-today-line)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text
        data-slot="gantt-today-label"
        x={lineX}
        y={13}
        fill="var(--gantt-today-line)"
        fontFamily="var(--font-sans)"
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

export { TodayLine };
export type { TodayLineProps };
