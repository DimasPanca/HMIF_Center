'use client';

import * as React from 'react';

type VirtualRowGeometry = {
  y: number;
  height: number;
};

type VirtualRange = {
  startIndex: number;
  endIndex: number;
};

type UseVirtualRowsOptions = {
  overscan?: number;
  estimatedViewportHeight?: number;
  contentOffsetTop?: number;
  stickyInsetTop?: number;
};

type VirtualRowsResult<Row> = VirtualRange & {
  rows: readonly Row[];
  totalCount: number;
};

const DEFAULT_OVERSCAN = 5;
const DEFAULT_VIEWPORT_HEIGHT = 520;
const useBrowserLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/** Indeks baris pertama yang sisi bawahnya melewati batas atas viewport. */
function firstRowAfterTop<Row extends VirtualRowGeometry>(
  rows: readonly Row[],
  viewportTop: number,
): number {
  let low = 0;
  let high = rows.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const row = rows[middle];

    if (row && row.y + row.height <= viewportTop) low = middle + 1;
    else high = middle;
  }

  return low;
}

/** Indeks eksklusif baris terakhir yang sisi atasnya masih di dalam viewport. */
function firstRowAfterBottom<Row extends VirtualRowGeometry>(
  rows: readonly Row[],
  viewportBottom: number,
): number {
  let low = 0;
  let high = rows.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const row = rows[middle];

    if (row && row.y < viewportBottom) low = middle + 1;
    else high = middle;
  }

  return low;
}

function calculateVirtualRange<Row extends VirtualRowGeometry>(
  rows: readonly Row[],
  scrollTop: number,
  viewportHeight: number,
  overscan = DEFAULT_OVERSCAN,
  contentOffsetTop = 0,
  stickyInsetTop = 0,
): VirtualRange {
  if (rows.length === 0) return { startIndex: 0, endIndex: 0 };

  const safeScrollTop = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  const safeContentOffset = nonNegativeInteger(contentOffsetTop, 0);
  const safeStickyInset = nonNegativeInteger(stickyInsetTop, 0);
  const safeViewportHeight = positiveOr(viewportHeight, DEFAULT_VIEWPORT_HEIGHT);
  const viewportTop = Math.max(0, safeScrollTop + safeStickyInset - safeContentOffset);
  const viewportBottom = Math.max(
    viewportTop,
    safeScrollTop + safeViewportHeight - safeContentOffset,
  );
  const buffer = nonNegativeInteger(overscan, DEFAULT_OVERSCAN);
  const firstVisible = firstRowAfterTop(rows, viewportTop);
  const afterLastVisible = firstRowAfterBottom(rows, viewportBottom);

  return {
    startIndex: Math.max(0, firstVisible - buffer),
    endIndex: Math.min(rows.length, Math.max(firstVisible, afterLastVisible) + buffer),
  };
}

/**
 * Mengembalikan hanya baris dalam viewport dengan buffer lima baris.
 *
 * Listener scroll dijadwalkan lewat animation frame dan state hanya berubah
 * ketika indeks awal/akhir berubah. Scroll beberapa piksel di baris yang sama
 * karena itu tidak memicu render React baru.
 */
function useVirtualRows<Row extends VirtualRowGeometry>(
  rows: readonly Row[],
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseVirtualRowsOptions = {},
): VirtualRowsResult<Row> {
  const overscan = nonNegativeInteger(options.overscan ?? DEFAULT_OVERSCAN, DEFAULT_OVERSCAN);
  const estimatedViewportHeight = positiveOr(
    options.estimatedViewportHeight ?? DEFAULT_VIEWPORT_HEIGHT,
    DEFAULT_VIEWPORT_HEIGHT,
  );
  const contentOffsetTop = nonNegativeInteger(options.contentOffsetTop ?? 0, 0);
  const stickyInsetTop = nonNegativeInteger(options.stickyInsetTop ?? 0, 0);
  const [range, setRange] = React.useState<VirtualRange>(() =>
    calculateVirtualRange(
      rows,
      0,
      estimatedViewportHeight,
      overscan,
      contentOffsetTop,
      stickyInsetTop,
    ),
  );

  useBrowserLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame: number | null = null;

    const measure = () => {
      frame = null;
      const next = calculateVirtualRange(
        rows,
        container.scrollTop,
        container.clientHeight || estimatedViewportHeight,
        overscan,
        contentOffsetTop,
        stickyInsetTop,
      );

      setRange((current) =>
        current.startIndex === next.startIndex && current.endIndex === next.endIndex
          ? current
          : next,
      );
    };

    const scheduleMeasure = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    container.addEventListener('scroll', scheduleMeasure, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(container);
    if (!resizeObserver) window.addEventListener('resize', scheduleMeasure);

    return () => {
      container.removeEventListener('scroll', scheduleMeasure);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', scheduleMeasure);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [containerRef, contentOffsetTop, estimatedViewportHeight, overscan, rows, stickyInsetTop]);

  const startIndex = Math.min(range.startIndex, rows.length);
  const endIndex = Math.max(startIndex, Math.min(range.endIndex, rows.length));
  const visibleRows = React.useMemo(
    () => rows.slice(startIndex, endIndex),
    [endIndex, rows, startIndex],
  );

  return {
    rows: visibleRows,
    startIndex,
    endIndex,
    totalCount: rows.length,
  };
}

export { calculateVirtualRange, useVirtualRows };
export type { UseVirtualRowsOptions, VirtualRange, VirtualRowGeometry, VirtualRowsResult };
