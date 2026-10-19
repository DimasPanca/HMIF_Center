import * as React from 'react';

import type { TimelineVM } from '@/lib/gantt/types';
import { cn } from '@/lib/utils';

type TimelineHeaderProps = {
  timeline: TimelineVM;
  width: number;
  className?: string;
};

type HeaderGroup = {
  key: string;
  label: string;
  x: number;
  width: number;
};

function groupConsecutiveLabels(columns: TimelineVM['columns']): HeaderGroup[] {
  return columns.reduce<HeaderGroup[]>((groups, column, index) => {
    const previous = groups.at(-1);

    if (previous?.label === column.label) {
      previous.width += column.width;
      return groups;
    }

    groups.push({
      key: `${column.label}-${column.x}-${index}`,
      label: column.label,
      x: column.x,
      width: column.width,
    });

    return groups;
  }, []);
}

// Memo: props tetap selama scroll vertikal, padahal header memuat satu sel per kolom.
const TimelineHeader = React.memo(function TimelineHeader({
  timeline,
  width,
  className,
}: TimelineHeaderProps): React.ReactElement {
  const labelGroups = groupConsecutiveLabels(timeline.columns);

  return (
    <div
      data-slot="gantt-timeline-header"
      role="rowgroup"
      aria-label="Rentang waktu Gantt"
      className={cn(
        'relative h-[50px] shrink-0 overflow-hidden border-b border-default bg-[var(--gantt-header-bg)] text-secondary',
        className,
      )}
      style={{ width }}
    >
      <div data-slot="gantt-timeline-header-labels" role="row" className="relative h-7">
        {labelGroups.map((group) => (
          <div
            key={group.key}
            role="columnheader"
            className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-default px-2 text-[12px] leading-4 font-semibold whitespace-nowrap"
            style={{ left: group.x, width: group.width }}
            title={group.label}
          >
            <span className="truncate">{group.label}</span>
          </div>
        ))}
      </div>

      <div
        data-slot="gantt-timeline-header-sublabels"
        role="row"
        className="relative h-[22px] border-t border-subtle bg-[var(--gantt-header-bg)] text-tertiary"
      >
        {timeline.columns.map((column, index) => (
          <div
            key={`${column.x}-${column.width}-${index}`}
            role="columnheader"
            className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-subtle px-1 text-[11px] leading-none whitespace-nowrap tabular-nums"
            style={{ left: column.x, width: column.width }}
            title={column.sublabel}
          >
            <span className="truncate">{column.sublabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export { TimelineHeader };
export type { TimelineHeaderProps };
