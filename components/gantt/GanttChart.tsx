'use client';

import * as React from 'react';

import { Connectors, type GanttConnectorItem } from '@/components/gantt/Connectors';
import { GanttPanel } from '@/components/gantt/GanttPanel';
import { GanttTooltip, type GanttDisplayItem } from '@/components/gantt/GanttTooltip';
import { GridLines } from '@/components/gantt/GridLines';
import { GroupBar } from '@/components/gantt/GroupBar';
import { TaskBar } from '@/components/gantt/TaskBar';
import { TimelineHeader } from '@/components/gantt/TimelineHeader';
import { TodayLine } from '@/components/gantt/TodayLine';
import {
  GANTT_DIMENSIONS,
  barRect,
  dateSpanWidth,
  dateToX,
  toUtcDay,
  type GanttBarRect,
} from '@/lib/gantt/geometry';
import type { GanttGroupVM, GanttTaskVM, GanttViewModel } from '@/lib/gantt/types';
import { useVirtualRows } from '@/lib/gantt/use-virtual-rows';
import { cn } from '@/lib/utils';

type GanttChartProps = {
  model: GanttViewModel;
  className?: string;
  ariaLabel?: string;
  maxHeight?: number | string;
  onGroupToggle?: (groupId: string, collapsed: boolean) => void;
  onTaskSelect?: (task: GanttTaskVM) => void;
  highlightedTaskIds?: ReadonlySet<string>;
};

type GroupLayout = {
  kind: 'group';
  key: string;
  index: number;
  group: GanttGroupVM;
  y: number;
  height: number;
  rect?: GanttBarRect;
};

type TaskLayout = {
  kind: 'task';
  key: string;
  index: number;
  group: GanttGroupVM;
  task: GanttTaskVM;
  y: number;
  height: number;
  rect: GanttBarRect;
  hariHRect?: { x: number; width: number };
  connector?: GanttConnectorItem;
};

type LayoutRow = GroupLayout | TaskLayout;

type ChartLayout = {
  rows: LayoutRow[];
  height: number;
  width: number;
};

type TooltipState = {
  item: GanttDisplayItem;
  x: number;
  y: number;
};

const TOOLTIP_DELAY_MS = 400;
const PANEL_TRANSITION_MS = 180;
const GANTT_HEADER_HEIGHT = 50;
const VIRTUAL_ROW_BUFFER = 5;
const useBrowserLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function timelineWidth(model: GanttViewModel): number {
  const lastColumn = model.timeline.columns.at(-1);
  return Math.max(lastColumn ? lastColumn.x + lastColumn.width : 0, 1);
}

function buildLayout(
  model: GanttViewModel,
  collapsedGroups: ReadonlySet<string>,
  containerWidth: number,
): ChartLayout {
  const rows: LayoutRow[] = [];
  const geometryContext = {
    start: model.timeline.start,
    pxPerDay: model.timeline.pxPerDay,
  };
  let y = GANTT_DIMENSIONS.groupGap;

  for (const group of model.groups) {
    const summary = group.bars[0];
    const groupRect = summary
      ? barRect(
          {
            start: summary.start,
            end: summary.end,
            y,
            kind: 'group',
          },
          geometryContext,
        )
      : undefined;

    rows.push({
      kind: 'group',
      key: `group-${group.id}`,
      index: rows.length,
      group,
      y,
      height: GANTT_DIMENSIONS.groupRowHeight,
      rect: groupRect,
    });
    y += GANTT_DIMENSIONS.groupRowHeight;

    if (!collapsedGroups.has(group.id)) {
      for (const task of group.tasks) {
        const taskRect = barRect(
          {
            start: task.start,
            end: task.end,
            y,
            kind: 'task',
          },
          geometryContext,
        );

        rows.push({
          kind: 'task',
          key: `task-${task.id}`,
          index: rows.length,
          group,
          task,
          y,
          height: GANTT_DIMENSIONS.taskRowHeight,
          rect: taskRect,
          hariHRect: hariHRect(task, taskRect, model),
          connector: groupRect
            ? { id: `${group.id}-${task.id}`, parent: groupRect, child: taskRect }
            : undefined,
        });
        y += GANTT_DIMENSIONS.taskRowHeight;
      }
    }

    y += GANTT_DIMENSIONS.groupGap;
  }

  return {
    rows,
    height: Math.max(y, GANTT_DIMENSIONS.groupRowHeight + GANTT_DIMENSIONS.groupGap * 2),
    width: Math.max(timelineWidth(model), containerWidth, 1),
  };
}

function groupDisplayItem(group: GanttGroupVM, collapsed: boolean): GanttDisplayItem | null {
  const summary = group.bars[0];
  if (!summary) return null;

  return {
    id: summary.id,
    label: group.label,
    departemen: group.label,
    status: collapsed ? 'Dilipat' : 'Aktif',
    start: summary.start,
    end: summary.end,
    progress: summary.progress,
    assigneeName: group.sublabel,
    color: summary.color,
  };
}

function taskDisplayItem(task: GanttTaskVM): GanttDisplayItem {
  return {
    id: task.id,
    label: task.label,
    departemen: task.meta.departemen,
    status: task.meta.status,
    start: task.start,
    end: task.end,
    hariHStart: task.hariHStart,
    hariHEnd: task.hariHEnd,
    progress: task.progress,
    assigneeName: task.assigneeName,
    color: task.color,
  };
}

function hariHRect(
  task: GanttTaskVM,
  taskRect: GanttBarRect,
  model: GanttViewModel,
): { x: number; width: number } | undefined {
  const start = task.hariHStart ?? task.hariHEnd;
  const end = task.hariHEnd ?? task.hariHStart;
  if (!start || !end) return undefined;

  const context = { start: model.timeline.start, pxPerDay: model.timeline.pxPerDay };
  const markerX = dateToX(start, context);
  const markerEnd = markerX + dateSpanWidth(start, end, context);
  const clippedX = Math.max(taskRect.x, markerX);
  const clippedEnd = Math.min(taskRect.x + taskRect.width, markerEnd);

  return clippedEnd > clippedX ? { x: clippedX, width: clippedEnd - clippedX } : undefined;
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState(0);

  useBrowserLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const next = Math.max(0, Math.ceil(element.clientWidth));
      setWidth((current) => (current === next ? current : next));
    };

    measure();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizeObserver?.observe(element);
    if (!resizeObserver) window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', measure);
    };
  }, [ref]);

  return width;
}

function GanttChart({
  model,
  className,
  ariaLabel = 'Timeline program kerja HMIF',
  maxHeight = 520,
  onGroupToggle,
  onTaskSelect,
  highlightedTaskIds,
}: GanttChartProps) {
  const rootRef = React.useRef<HTMLElement>(null);
  const verticalScrollRef = React.useRef<HTMLDivElement>(null);
  const timelineViewportRef = React.useRef<HTMLDivElement>(null);
  const horizontalScrollRef = React.useRef<HTMLDivElement>(null);
  const tooltipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelFrameRef = React.useRef<number | null>(null);
  const pointerPositionRef = React.useRef({ x: 0, y: 0 });
  const [collapsedGroups, setCollapsedGroups] = React.useState<ReadonlySet<string>>(
    () => new Set(model.groups.filter((group) => group.collapsed).map((group) => group.id)),
  );
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);
  const [selectedItem, setSelectedItem] = React.useState<GanttDisplayItem | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const containerWidth = useElementWidth(timelineViewportRef);
  const layout = React.useMemo(
    () => buildLayout(model, collapsedGroups, containerWidth),
    [collapsedGroups, containerWidth, model],
  );
  const estimatedViewportHeight = typeof maxHeight === 'number' ? Math.max(1, maxHeight) : 520;
  const virtualRows = useVirtualRows(layout.rows, verticalScrollRef, {
    overscan: VIRTUAL_ROW_BUFFER,
    estimatedViewportHeight,
    contentOffsetTop: GANTT_HEADER_HEIGHT,
    stickyInsetTop: GANTT_HEADER_HEIGHT,
  });
  const visibleConnectors = React.useMemo(
    () =>
      virtualRows.rows.flatMap((row) =>
        row.kind === 'task' && row.connector ? [row.connector] : [],
      ),
    [virtualRows.rows],
  );
  const visibleRowLines = React.useMemo(
    () => virtualRows.rows.map((row) => row.y + row.height),
    [virtualRows.rows],
  );
  const width = layout.width;
  const todayX = React.useMemo(() => {
    const today = toUtcDay(model.today);
    const timelineStart = toUtcDay(model.timeline.start);
    const timelineEnd = toUtcDay(model.timeline.end);
    const isTodayVisible = today >= timelineStart && today <= timelineEnd;

    return isTodayVisible
      ? dateToX(today, { start: timelineStart, pxPerDay: model.timeline.pxPerDay })
      : null;
  }, [model.timeline.end, model.timeline.pxPerDay, model.timeline.start, model.today]);

  const setRootRef = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (node) node.setAttribute('data-testid', 'gantt-root');
  }, []);

  const clearTooltipTimer = React.useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  const clearPanelTimers = React.useCallback(() => {
    if (panelTimerRef.current) {
      clearTimeout(panelTimerRef.current);
      panelTimerRef.current = null;
    }
    if (panelFrameRef.current !== null) {
      cancelAnimationFrame(panelFrameRef.current);
      panelFrameRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      clearTooltipTimer();
      clearPanelTimers();
    },
    [clearPanelTimers, clearTooltipTimer],
  );

  const scheduleTooltip = React.useCallback(
    (item: GanttDisplayItem, event: React.PointerEvent<SVGGElement>) => {
      clearTooltipTimer();
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      tooltipTimerRef.current = setTimeout(() => {
        const { x, y } = pointerPositionRef.current;
        const maxX = typeof window === 'undefined' ? x + 12 : Math.max(12, window.innerWidth - 304);
        const maxY =
          typeof window === 'undefined' ? y + 12 : Math.max(12, window.innerHeight - 216);

        setTooltip({
          item,
          x: Math.min(x + 12, maxX),
          y: Math.min(y + 12, maxY),
        });
        tooltipTimerRef.current = null;
      }, TOOLTIP_DELAY_MS);
    },
    [clearTooltipTimer],
  );

  const moveTooltipAnchor = React.useCallback((event: React.PointerEvent<SVGGElement>) => {
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const hideTooltip = React.useCallback(() => {
    clearTooltipTimer();
    setTooltip(null);
  }, [clearTooltipTimer]);

  const activateItem = React.useCallback(
    (item: GanttDisplayItem) => {
      hideTooltip();
      clearPanelTimers();
      setSelectedItem(item);

      if (panelOpen) return;
      setPanelOpen(false);
      panelFrameRef.current = requestAnimationFrame(() => {
        setPanelOpen(true);
        panelFrameRef.current = null;
      });
    },
    [clearPanelTimers, hideTooltip, panelOpen],
  );

  const closePanel = React.useCallback(() => {
    clearPanelTimers();
    setPanelOpen(false);
    panelTimerRef.current = setTimeout(() => {
      setSelectedItem(null);
      panelTimerRef.current = null;
    }, PANEL_TRANSITION_MS);
  }, [clearPanelTimers]);

  React.useEffect(() => {
    if (!panelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePanel, panelOpen]);

  const toggleGroup = React.useCallback(
    (group: GanttGroupVM) => {
      const next = new Set(collapsedGroups);
      const collapsed = !next.has(group.id);

      if (collapsed) next.add(group.id);
      else next.delete(group.id);
      setCollapsedGroups(next);
      onGroupToggle?.(group.id, collapsed);
    },
    [collapsedGroups, onGroupToggle],
  );

  const handleHorizontalScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = event.currentTarget.scrollLeft;
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty('--gantt-scroll-x', `${-scrollLeft}px`);
    root.dataset.scrollX = String(scrollLeft);
  }, []);

  const handleWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    if (!horizontalDelta || !horizontalScrollRef.current) return;

    horizontalScrollRef.current.scrollLeft += horizontalDelta;
    event.preventDefault();
  }, []);

  return (
    <section
      ref={setRootRef}
      data-slot="gantt-chart"
      data-scroll-x="0"
      data-rendered-row-count={virtualRows.rows.length}
      data-total-row-count={virtualRows.totalCount}
      data-virtual-buffer={VIRTUAL_ROW_BUFFER}
      className={cn(
        'hmif-gantt relative isolate w-full overflow-hidden rounded-sm border border-default bg-panel text-primary shadow-sm',
        className,
      )}
      aria-label={ariaLabel}
    >
      <div
        ref={verticalScrollRef}
        data-slot="gantt-vertical-scroll"
        data-testid="gantt-vertical-scroll"
        className="overflow-y-auto overscroll-contain"
        style={{ maxHeight }}
        onWheel={handleWheel}
      >
        <div className="hmif-gantt-grid">
          <div
            data-slot="gantt-label-header"
            className="sticky top-0 left-0 z-40 flex h-[50px] items-center border-r border-b border-default bg-[var(--gantt-header-bg)] px-3 text-[12px] font-semibold tracking-wide text-secondary uppercase"
          >
            Program kerja
          </div>
          <div
            data-slot="gantt-header-viewport"
            className="sticky top-0 z-30 h-[50px] overflow-hidden border-b border-default bg-[var(--gantt-header-bg)]"
          >
            <TimelineHeader timeline={model.timeline} width={width} className="hmif-gantt-track" />
          </div>

          <div
            data-slot="gantt-label-column"
            data-testid="gantt-label-column"
            className="hmif-gantt-body sticky left-0 z-20 overflow-hidden border-r border-default bg-panel"
            style={{ height: layout.height }}
          >
            {virtualRows.rows.map((row) => {
              if (row.kind === 'group') {
                const { key, group, y, height, index } = row;
                const collapsed = collapsedGroups.has(group.id);

                return (
                  <button
                    key={key}
                    type="button"
                    data-slot="gantt-group-toggle"
                    data-testid={`gantt-group-toggle-${group.id}`}
                    data-gantt-row-index={index}
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? 'Bentangkan' : 'Lipat'} grup ${group.label}`}
                    className="hmif-gantt-group-toggle absolute left-0 flex w-full items-center gap-2 overflow-hidden border-b border-subtle bg-panel px-2 text-left text-[13px] font-semibold text-primary outline-none hover:bg-subtle focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--border-focus)] motion-reduce:transition-none"
                    style={{ top: y, height }}
                    onClick={() => toggleGroup(group)}
                  >
                    <span aria-hidden="true" className="inline-block w-3 shrink-0 text-center">
                      {collapsed ? '▸' : '▾'}
                    </span>
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="truncate">{group.label}</span>
                    {collapsed && group.tasks.length > 0 ? (
                      <span className="ml-auto shrink-0 text-[11px] font-normal text-tertiary tabular-nums">
                        {group.tasks.length}
                      </span>
                    ) : null}
                  </button>
                );
              }

              const { key, task, y, height, index } = row;
              return (
                <div
                  key={key}
                  data-slot="gantt-task-label"
                  data-gantt-row-index={index}
                  className="absolute left-0 flex w-full items-center overflow-hidden border-b border-subtle bg-panel pr-2 pl-8 text-[12px] text-secondary"
                  style={{ top: y, height }}
                  title={task.label}
                >
                  <span className="truncate">{task.label}</span>
                </div>
              );
            })}

            {model.groups.length === 0 ? (
              <p className="px-3 py-4 text-[12px] leading-4 text-secondary">
                Belum ada program kerja pada rentang ini.
              </p>
            ) : null}
          </div>

          <div
            ref={timelineViewportRef}
            data-slot="gantt-timeline-viewport"
            data-testid="gantt-timeline-viewport"
            className="hmif-gantt-body relative overflow-hidden bg-[var(--gantt-bg)]"
            style={{ height: layout.height }}
          >
            <svg
              data-slot="gantt-svg"
              data-testid="gantt-svg"
              role="group"
              aria-label={ariaLabel}
              width={width}
              height={layout.height}
              className="hmif-gantt-track absolute top-0 left-0 block max-w-none overflow-visible"
              shapeRendering="geometricPrecision"
            >
              <GridLines
                columns={model.timeline.columns}
                width={width}
                height={layout.height}
                rowLines={visibleRowLines}
              />
              <Connectors items={visibleConnectors} />

              {virtualRows.rows.map((row) => {
                if (row.kind === 'group') {
                  const { key, group, rect } = row;
                  const summary = group.bars[0];
                  const item = groupDisplayItem(group, collapsedGroups.has(group.id));
                  if (!summary || !rect || !item) return null;

                  return (
                    <GroupBar
                      key={key}
                      group={group}
                      bar={summary}
                      rect={rect}
                      active={selectedItem?.id === item.id}
                      onHoverStart={(event) => scheduleTooltip(item, event)}
                      onHoverMove={moveTooltipAnchor}
                      onHoverEnd={hideTooltip}
                      onActivate={() => activateItem(item)}
                    />
                  );
                }

                const { key, task, rect } = row;
                const item = taskDisplayItem(task);
                return (
                  <TaskBar
                    key={key}
                    task={task}
                    rect={rect}
                    hariHRect={row.hariHRect}
                    active={selectedItem?.id === task.id}
                    highlighted={highlightedTaskIds?.has(task.id)}
                    onHoverStart={(event) => scheduleTooltip(item, event)}
                    onHoverMove={moveTooltipAnchor}
                    onHoverEnd={hideTooltip}
                    onActivate={() => {
                      activateItem(item);
                      onTaskSelect?.(task);
                    }}
                  />
                );
              })}

              {todayX === null ? null : (
                <TodayLine
                  x={todayX}
                  dayWidth={Math.max(model.timeline.pxPerDay, 1)}
                  height={layout.height}
                />
              )}
            </svg>
          </div>
        </div>
      </div>

      <div className="hmif-gantt-grid border-t border-default bg-subtle">
        <div aria-hidden="true" className="border-r border-default" />
        <div
          ref={horizontalScrollRef}
          data-slot="gantt-horizontal-scroll"
          data-testid="gantt-scroll"
          role="region"
          aria-label="Gulir timeline secara horizontal"
          tabIndex={0}
          className="h-3 overflow-x-auto overflow-y-hidden outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--border-focus)]"
          onScroll={handleHorizontalScroll}
        >
          <div aria-hidden="true" style={{ width, height: 1 }} />
        </div>
      </div>

      <GanttTooltip
        item={tooltip?.item ?? null}
        open={tooltip !== null}
        x={tooltip?.x ?? 0}
        y={tooltip?.y ?? 0}
      />
      <GanttPanel item={selectedItem} open={panelOpen} onClose={closePanel} />
    </section>
  );
}

export { GanttChart };
export type { GanttChartProps };
