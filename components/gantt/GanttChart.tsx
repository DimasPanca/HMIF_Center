'use client';

import * as React from 'react';

import { Connectors, type GanttConnectorItem } from '@/components/gantt/Connectors';
import { GanttDaftarHp } from '@/components/gantt/GanttDaftarHp';
import { GanttPanel } from '@/components/gantt/GanttPanel';
import { GanttTooltip, type GanttDisplayItem } from '@/components/gantt/GanttTooltip';
import { GridLines } from '@/components/gantt/GridLines';
import { GroupBar } from '@/components/gantt/GroupBar';
import { TaskBar, type DragTaskBar } from '@/components/gantt/TaskBar';
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
import { useTampilanHp } from '@/components/ui/use-layar-hp';
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
  /** Editor T-078: drag bar. Tanpa prop ini chart murni baca (Master Gantt). */
  drag?: Omit<DragTaskBar, 'pxPerDay'>;
  /** Bila diberikan, menggantikan panel detail saat task dipilih (editor). */
  onTaskActivate?: (task: GanttTaskVM) => void;
  /** Judul kolom label. */
  labelColumnTitle?: string;
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

/**
 * Aksi baris yang identitasnya tetap sepanjang umur chart. Baris di bawah
 * di-memo: saat jendela virtual bergeser (scroll vertikal), hanya baris yang
 * masuk/keluar yang dirender — bukan seluruh baris terlihat (T-114, scroll
 * 60 fps pada CPU 4×).
 */
type AksiBaris = {
  hoverMulai: (item: GanttDisplayItem, event: React.PointerEvent<SVGGElement>) => void;
  hoverGerak: (event: React.PointerEvent<SVGGElement>) => void;
  hoverSelesai: () => void;
  aktifkanGrup: (item: GanttDisplayItem) => void;
  aktifkanTask: (task: GanttTaskVM, item: GanttDisplayItem) => void;
  lipat: (group: GanttGroupVM) => void;
};

const BarisGrup = React.memo(function BarisGrup({
  row,
  collapsed,
  activeId,
  aksi,
}: {
  row: GroupLayout;
  collapsed: boolean;
  activeId: string | undefined;
  aksi: AksiBaris;
}) {
  const summary = row.group.bars[0];
  const item = groupDisplayItem(row.group, collapsed);
  if (!summary || !row.rect || !item) return null;

  return (
    <GroupBar
      group={row.group}
      bar={summary}
      rect={row.rect}
      active={activeId === item.id}
      onHoverStart={(event) => aksi.hoverMulai(item, event)}
      onHoverMove={aksi.hoverGerak}
      onHoverEnd={aksi.hoverSelesai}
      onActivate={() => aksi.aktifkanGrup(item)}
    />
  );
});

const BarisTask = React.memo(function BarisTask({
  row,
  active,
  highlighted,
  aksi,
  drag,
}: {
  row: TaskLayout;
  active: boolean;
  highlighted: boolean;
  aksi: AksiBaris;
  drag: DragTaskBar | undefined;
}) {
  const item = taskDisplayItem(row.task);

  return (
    <TaskBar
      task={row.task}
      rect={row.rect}
      hariHRect={row.hariHRect}
      active={active}
      highlighted={highlighted}
      onHoverStart={(event) => aksi.hoverMulai(item, event)}
      onHoverMove={aksi.hoverGerak}
      onHoverEnd={aksi.hoverSelesai}
      onActivate={() => aksi.aktifkanTask(row.task, item)}
      drag={drag}
    />
  );
});

const LabelBaris = React.memo(function LabelBaris({
  row,
  collapsed,
  aksi,
}: {
  row: LayoutRow;
  collapsed: boolean;
  aksi: AksiBaris;
}) {
  if (row.kind === 'group') {
    const { group, y, height, index } = row;

    return (
      <button
        type="button"
        data-slot="gantt-group-toggle"
        data-testid={`gantt-group-toggle-${group.id}`}
        data-gantt-row-index={index}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Bentangkan' : 'Lipat'} grup ${group.label}`}
        className="hmif-gantt-group-toggle absolute left-0 flex w-full items-center gap-2 overflow-hidden border-b border-subtle bg-panel px-2 text-left text-[13px] font-semibold text-primary outline-none hover:bg-subtle focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--border-focus)] motion-reduce:transition-none"
        style={{ top: y, height }}
        onClick={() => aksi.lipat(group)}
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

  const { task, y, height, index } = row;
  return (
    <div
      data-slot="gantt-task-label"
      data-gantt-row-index={index}
      className="absolute left-0 flex w-full items-center overflow-hidden border-b border-subtle bg-panel pr-2 pl-8 text-[12px] text-secondary"
      style={{ top: y, height }}
      title={task.label}
    >
      <span className="truncate">{task.label}</span>
    </div>
  );
});

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

function GanttChartGrafik({
  model,
  className,
  ariaLabel = 'Timeline program kerja HMIF',
  maxHeight = 520,
  onGroupToggle,
  onTaskSelect,
  highlightedTaskIds,
  drag,
  onTaskActivate,
  labelColumnTitle = 'Program kerja',
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
  // Konektor Finish-to-Start (T-078 #3): pendahulu → task, untuk task yang
  // tampil. Pendahulu di luar jendela virtual tetap punya rect di layout.
  const dependencyConnectors = React.useMemo(() => {
    const rectById = new Map<string, GanttBarRect>();
    for (const row of layout.rows) if (row.kind === 'task') rectById.set(row.task.id, row.rect);
    return virtualRows.rows.flatMap((row) => {
      if (row.kind !== 'task' || !row.task.dependsOn?.length) return [];
      return row.task.dependsOn.flatMap((fromId) => {
        const from = rectById.get(fromId);
        return from ? [{ id: `dep-${fromId}-${row.task.id}`, from, to: row.rect }] : [];
      });
    });
  }, [layout.rows, virtualRows.rows]);
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

  // Aksi baris lewat ref: identitas `aksi` tetap walau callback di atas (atau
  // milik induk) berganti, supaya memo baris tidak pernah dibatalkannya.
  const aksiTerbaru = React.useRef({
    activateItem,
    hideTooltip,
    moveTooltipAnchor,
    onTaskActivate,
    onTaskSelect,
    scheduleTooltip,
    toggleGroup,
  });
  useBrowserLayoutEffect(() => {
    aksiTerbaru.current = {
      activateItem,
      hideTooltip,
      moveTooltipAnchor,
      onTaskActivate,
      onTaskSelect,
      scheduleTooltip,
      toggleGroup,
    };
  });
  const aksi = React.useMemo<AksiBaris>(
    () => ({
      hoverMulai: (item, event) => aksiTerbaru.current.scheduleTooltip(item, event),
      hoverGerak: (event) => aksiTerbaru.current.moveTooltipAnchor(event),
      hoverSelesai: () => aksiTerbaru.current.hideTooltip(),
      aktifkanGrup: (item) => aksiTerbaru.current.activateItem(item),
      aktifkanTask: (task, item) => {
        const a = aksiTerbaru.current;
        if (a.onTaskActivate) {
          a.hideTooltip();
          a.onTaskActivate(task);
          return;
        }
        a.activateItem(item);
        a.onTaskSelect?.(task);
      },
      lipat: (group) => aksiTerbaru.current.toggleGroup(group),
    }),
    [],
  );
  const pxPerDay = model.timeline.pxPerDay;
  const dragBar = React.useMemo(() => (drag ? { ...drag, pxPerDay } : undefined), [drag, pxPerDay]);

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
            {labelColumnTitle}
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
            {virtualRows.rows.map((row) => (
              <LabelBaris
                key={row.key}
                row={row}
                collapsed={row.kind === 'group' && collapsedGroups.has(row.group.id)}
                aksi={aksi}
              />
            ))}

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
              {dependencyConnectors.length ? (
                <g data-slot="gantt-dependencies" aria-hidden="true" pointerEvents="none">
                  {dependencyConnectors.map(({ id, from, to }) => {
                    const startX = from.x + from.width;
                    const startY = from.y + from.height / 2;
                    const endX = to.x;
                    const endY = to.y + to.height / 2;
                    const elbowX = Math.max(startX + 6, Math.min(endX - 6, startX + 12));
                    return (
                      <g key={id} data-slot="gantt-dependency" data-testid={id}>
                        <path
                          d={`M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX - 4}`}
                          fill="none"
                          stroke="var(--text-secondary)"
                          strokeWidth={1.2}
                        />
                        <path d={`M ${endX - 4} ${endY - 3.5} L ${endX} ${endY} L ${endX - 4} ${endY + 3.5} Z`} fill="var(--text-secondary)" />
                      </g>
                    );
                  })}
                </g>
              ) : null}

              {virtualRows.rows.map((row) =>
                row.kind === 'group' ? (
                  <BarisGrup
                    key={row.key}
                    row={row}
                    collapsed={collapsedGroups.has(row.group.id)}
                    activeId={selectedItem?.id}
                    aksi={aksi}
                  />
                ) : (
                  <BarisTask
                    key={row.key}
                    row={row}
                    active={selectedItem?.id === row.task.id}
                    highlighted={highlightedTaskIds?.has(row.task.id) ?? false}
                    aksi={aksi}
                    drag={dragBar}
                  />
                ),
              )}

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

/**
 * Di HP (ADR-037) bawaannya daftar tugas vertikal tanpa gulir ke samping;
 * pengguna dapat beralih ke grafik dan pilihannya diingat. Layar lebar: grafik.
 */
function GanttChart(props: GanttChartProps) {
  const [tampilan, setTampilan, layarHp] = useTampilanHp('hmif-gantt-tampilan', 'daftar', 'grafik');
  if (!layarHp) return <GanttChartGrafik {...props} />;
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Tampilan timeline" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {(['daftar', 'grafik'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={tampilan === v}
            data-testid={`gantt-tampilan-${v}`}
            onClick={() => setTampilan(v)}
            className={cn(
              'min-h-9 rounded-sm text-[13.5px] font-medium',
              tampilan === v ? 'bg-panel text-primary shadow-sm' : 'text-secondary',
            )}
          >
            {v === 'daftar' ? 'Daftar' : 'Grafik'}
          </button>
        ))}
      </div>
      {tampilan === 'daftar' ? <GanttDaftarHp model={props.model} onTaskActivate={props.onTaskActivate} /> : <GanttChartGrafik {...props} />}
    </div>
  );
}

export { GanttChart };
export type { GanttChartProps };
