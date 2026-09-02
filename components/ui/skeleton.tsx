import * as React from 'react';

import { cn } from '@/lib/utils';

type SkeletonVariant = 'text' | 'avatar' | 'card' | 'table' | 'chart';

type SkeletonProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  variant: SkeletonVariant;
  rows?: number;
  loadingLabel?: string;
};

const lineWidths = ['w-full', 'w-5/6', 'w-2/3'] as const;
const chartHeights = ['h-12', 'h-20', 'h-16', 'h-28', 'h-24', 'h-14', 'h-32'] as const;

function Bone({ className }: { className: string }) {
  return <span className={cn('block rounded-sm bg-muted', className)} />;
}

function TextSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid w-full gap-2.5">
      {Array.from({ length: rows }, (_, index) => (
        <Bone key={index} className={cn('h-3', lineWidths[index % lineWidths.length])} />
      ))}
    </div>
  );
}

function AvatarSkeleton() {
  return (
    <div className="flex w-full items-center gap-3">
      <Bone className="size-10 shrink-0 rounded-full" />
      <div className="grid min-w-0 flex-1 gap-2">
        <Bone className="h-3 w-2/5 min-w-24" />
        <Bone className="h-3 w-3/5 min-w-32" />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="w-full rounded-sm border border-subtle bg-panel p-4">
      <AvatarSkeleton />
      <div className="mt-4 grid gap-2.5">
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-5/6" />
        <Bone className="h-3 w-2/3" />
      </div>
      <div className="mt-4 flex gap-2 border-t border-subtle pt-4">
        <Bone className="h-[34px] w-24" />
        <Bone className="h-[34px] w-20" />
      </div>
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="w-full overflow-hidden rounded-sm border border-subtle bg-panel">
      <div className="grid h-9 grid-cols-[minmax(7rem,2fr)_minmax(5rem,1fr)_minmax(4rem,0.75fr)] items-center gap-4 bg-subtle px-3">
        <Bone className="h-3 w-24" />
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-14" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid h-9 grid-cols-[minmax(7rem,2fr)_minmax(5rem,1fr)_minmax(4rem,0.75fr)] items-center gap-4 border-t border-subtle px-3"
        >
          <Bone className={cn('h-3', index % 2 === 0 ? 'w-4/5' : 'w-3/5')} />
          <Bone className="h-3 w-2/3" />
          <Bone className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="w-full rounded-sm border border-subtle bg-panel p-4">
      <div className="mb-4 grid gap-2">
        <Bone className="h-3 w-32" />
        <Bone className="h-3 w-20" />
      </div>
      <div className="flex h-36 items-end gap-2 border-b border-l border-subtle px-2">
        {chartHeights.map((height, index) => (
          <Bone key={index} className={cn('min-w-3 flex-1 rounded-b-none', height)} />
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-4">
        <Bone className="h-3 w-14" />
        <Bone className="h-3 w-14" />
      </div>
    </div>
  );
}

function Skeleton({
  variant,
  rows = 4,
  loadingLabel = 'Memuat data…',
  className,
  ...props
}: SkeletonProps) {
  const safeRows = Math.min(Math.max(Math.trunc(rows), 1), 10);

  let content: React.ReactNode;

  switch (variant) {
    case 'avatar':
      content = <AvatarSkeleton />;
      break;
    case 'card':
      content = <CardSkeleton />;
      break;
    case 'table':
      content = <TableSkeleton rows={safeRows} />;
      break;
    case 'chart':
      content = <ChartSkeleton />;
      break;
    case 'text':
      content = <TextSkeleton rows={safeRows} />;
      break;
  }

  return (
    <div
      {...props}
      data-slot="skeleton"
      data-variant={variant}
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn('w-full', className)}
    >
      <span className="sr-only">{loadingLabel}</span>
      {/* Bentuk statis menghindari animasi loop yang dilarang K-13. */}
      <div aria-hidden="true">{content}</div>
    </div>
  );
}

export { Skeleton };
export type { SkeletonProps, SkeletonVariant };
