import * as React from 'react';

import type { GanttBarRect } from '@/lib/gantt/geometry';

type GanttConnectorItem = {
  id: string;
  parent: GanttBarRect;
  child: GanttBarRect;
};

type ConnectorsProps = {
  items: readonly GanttConnectorItem[];
  className?: string;
};

function connectorPath(parent: GanttBarRect, child: GanttBarRect): string {
  const startX = parent.x + parent.width;
  const startY = parent.y + parent.height / 2;
  const endX = child.x;
  const endY = child.y + child.height / 2;
  const elbowX = startX + (endX - startX) / 2;

  return `M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}`;
}

function Connectors({ items, className }: ConnectorsProps): React.ReactElement {
  return (
    <g data-slot="gantt-connectors" className={className} aria-hidden="true" pointerEvents="none">
      {items.map((item) => (
        <path
          key={item.id}
          data-slot="gantt-connector"
          data-connector-id={item.id}
          d={connectorPath(item.parent, item.child)}
          fill="none"
          stroke="var(--gantt-connector)"
          strokeWidth={1}
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

export { Connectors };
export type { ConnectorsProps, GanttConnectorItem };
