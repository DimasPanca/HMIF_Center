import * as React from 'react';

import { Button } from '@/components/ui/button';
import { LabelKolomOtomatis } from '@/components/ui/table-label';
import { cn } from '@/lib/utils';

type SortDirection = 'ascending' | 'descending' | 'none';

type TableProps = Omit<React.ComponentProps<'table'>, 'children'> & {
  children: React.ReactNode;
  containerClassName?: string;
  /**
   * Di layar HP (< md) setiap baris menjadi kartu "label: nilai" sehingga
   * tidak ada gulir ke samping (ADR-037). Matikan hanya untuk tabel yang
   * memang harus tetap berbentuk grid.
   */
  kartuDiHp?: boolean;
  emptyState: React.ReactNode;
  loading?: boolean;
  loadingColumnCount?: number;
  loadingRowCount?: number;
  pagination?: React.ReactNode;
  rowCount: number;
  zebra?: boolean;
};

type StaticTableHeadProps = {
  onSort?: never;
  sortDirection?: never;
  sortLabel?: never;
};

type SortableTableHeadProps = {
  onSort: () => void;
  sortDirection?: SortDirection;
  sortLabel: string;
};

type TableHeadProps = Omit<React.ComponentProps<'th'>, 'aria-sort'> &
  (StaticTableHeadProps | SortableTableHeadProps) & {
    numeric?: boolean;
  };

type TableCellProps = React.ComponentProps<'td'> & {
  action?: boolean;
  numeric?: boolean;
};

type TableSkeletonProps = React.ComponentProps<'tbody'> & {
  columns?: number;
  rows?: number;
};

type TablePaginationProps = Omit<React.ComponentProps<'nav'>, 'children'> & {
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
};

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} harus berupa bilangan bulat positif.`);
  }
}

const TableSkeleton = React.forwardRef<HTMLTableSectionElement, TableSkeletonProps>(
  function TableSkeleton({ className, columns = 1, rows = 5, ...props }, ref) {
    assertPositiveInteger(columns, 'Jumlah kolom skeleton');
    assertPositiveInteger(rows, 'Jumlah baris skeleton');

    return (
      <tbody
        ref={ref}
        data-slot="table-skeleton"
        aria-hidden="true"
        className={className}
        {...props}
      >
        {Array.from({ length: rows }, (_, rowIndex) => (
          <tr key={rowIndex} className="h-9 bg-panel">
            {Array.from({ length: columns }, (_, columnIndex) => (
              <td key={columnIndex} className="h-9 border-b border-subtle px-3 align-middle">
                <span className="block h-3 w-full rounded-xs bg-muted" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  },
);

const Table = React.forwardRef<HTMLTableElement, TableProps>(function Table(
  {
    'aria-busy': ariaBusy,
    className,
    containerClassName,
    emptyState,
    kartuDiHp = true,
    loading = false,
    loadingColumnCount = 1,
    loadingRowCount = 5,
    pagination,
    rowCount,
    zebra = false,
    children,
    ...props
  },
  ref,
) {
  if (!Number.isInteger(rowCount) || rowCount < 0) {
    throw new RangeError('rowCount tabel harus berupa bilangan bulat nonnegatif.');
  }

  if (!loading && rowCount === 0) {
    const resolvedEmptyState =
      React.Children.count(emptyState) > 0 ? emptyState : <p>Belum ada data.</p>;

    return (
      <div
        data-slot="table-empty"
        role="status"
        className={cn(
          'flex min-h-36 w-full items-center justify-center rounded-md border border-default bg-panel p-6 text-center text-secondary',
          containerClassName,
        )}
      >
        {resolvedEmptyState}
      </div>
    );
  }

  return (
    <div data-slot="table-root" data-kartu-hp={kartuDiHp ? '' : undefined} className="w-full">
      {kartuDiHp ? <LabelKolomOtomatis /> : null}
      <div
        data-slot="table-container"
        className={cn('relative w-full overflow-x-auto', containerClassName)}
      >
        <table
          ref={ref}
          data-slot="table"
          data-loading={loading ? 'true' : undefined}
          aria-busy={loading ? true : ariaBusy}
          className={cn(
            'w-full border-separate border-spacing-0 text-[13px] leading-5 text-primary',
            loading && '[&_[data-slot=table-body]]:hidden',
            zebra &&
              '[&_tbody>tr:nth-child(even):not([data-state=selected])]:bg-[var(--bg-subtle)]',
            className,
          )}
          {...props}
        >
          {children}
          {loading ? <TableSkeleton columns={loadingColumnCount} rows={loadingRowCount} /> : null}
        </table>
      </div>
      {pagination ? (
        <div data-slot="table-pagination-slot" className="mt-3">
          {pagination}
        </div>
      ) : null}
    </div>
  );
});

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'thead'>>(
  function TableHeader({ className, ...props }, ref) {
    return (
      <thead
        ref={ref}
        data-slot="table-header"
        className={cn(
          'sticky top-0 z-10 bg-subtle text-[12px] font-semibold text-secondary uppercase',
          '[&_tr]:border-b [&_tr]:border-subtle',
          className,
        )}
        {...props}
      />
    );
  },
);

const TableBody = React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'tbody'>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} data-slot="table-body" className={className} {...props} />;
  },
);

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'tfoot'>>(
  function TableFooter({ className, ...props }, ref) {
    return (
      <tfoot
        ref={ref}
        data-slot="table-footer"
        className={cn('bg-subtle font-medium text-primary', className)}
        {...props}
      />
    );
  },
);

const TableRow = React.forwardRef<HTMLTableRowElement, React.ComponentProps<'tr'>>(
  function TableRow({ className, ...props }, ref) {
    return (
      <tr
        ref={ref}
        data-slot="table-row"
        className={cn(
          'group/row h-9 bg-panel [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-transparent',
          'transition-[background-color,border-color] duration-fast ease-out motion-reduce:transition-none',
          'hover:bg-subtle data-[state=selected]:bg-[var(--primary-subtle)] data-[state=selected]:hover:bg-[var(--primary-subtle)] data-[state=selected]:[&>td:first-child]:border-l-[var(--primary)]',
          '[&>td]:border-b [&>td]:border-subtle',
          className,
        )}
        {...props}
      />
    );
  },
);

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  {
    className,
    numeric = false,
    onSort,
    sortDirection = onSort ? 'none' : undefined,
    sortLabel,
    children,
    ...props
  },
  ref,
) {
  const sortIcon = sortDirection === 'ascending' ? '↑' : sortDirection === 'descending' ? '↓' : '↕';

  return (
    <th
      ref={ref}
      data-slot="table-head"
      scope={props.scope ?? 'col'}
      aria-sort={onSort ? sortDirection : undefined}
      className={cn(
        'h-9 border-b border-subtle px-3 text-left align-middle whitespace-nowrap',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...props}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          aria-label={`Urutkan berdasarkan ${sortLabel}`}
          className={cn(
            'group/sort inline-flex h-[34px] max-w-full items-center gap-1 rounded-sm outline-none',
            'transition-colors duration-fast ease-out motion-reduce:transition-none',
            'hover:text-primary focus-visible:ring-3 focus-visible:ring-[var(--border-focus)]',
            numeric && 'ml-auto',
          )}
        >
          <span className="truncate">{children}</span>
          <span
            aria-hidden="true"
            className={cn(
              'shrink-0 text-[12px] transition-opacity duration-fast motion-reduce:transition-none',
              sortDirection === 'none'
                ? 'opacity-0 group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100'
                : 'opacity-100',
            )}
          >
            {sortIcon}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
});

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { className, action = false, numeric = false, ...props },
  ref,
) {
  return (
    <td
      ref={ref}
      data-slot="table-cell"
      data-action={action ? '' : undefined}
      className={cn(
        'h-9 px-3 align-middle',
        numeric && 'text-right tabular-nums',
        action &&
          'text-right [&>*]:opacity-0 [&>*]:transition-opacity [&>*]:duration-fast group-hover/row:[&>*]:opacity-100 group-focus-within/row:[&>*]:opacity-100 motion-reduce:[&>*]:transition-none',
        className,
      )}
      {...props}
    />
  );
});

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.ComponentProps<'caption'>>(
  function TableCaption({ className, ...props }, ref) {
    return (
      <caption
        ref={ref}
        data-slot="table-caption"
        className={cn('mt-3 text-left text-[12px] leading-4 text-secondary', className)}
        {...props}
      />
    );
  },
);

function TablePagination({
  className,
  onPageChange,
  page,
  pageCount,
  ...props
}: TablePaginationProps) {
  assertPositiveInteger(pageCount, 'Jumlah halaman');

  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new RangeError('Halaman aktif harus berada dalam rentang jumlah halaman.');
  }

  return (
    <nav
      aria-label="Paginasi tabel"
      className={cn('flex flex-wrap items-center justify-between gap-2', className)}
      {...props}
    >
      <span className="text-[12px] leading-4 text-secondary tabular-nums">
        Halaman {page} dari {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={page === 1}
          aria-label="Buka halaman sebelumnya"
          onClick={() => onPageChange(page - 1)}
        >
          Sebelumnya
        </Button>
        <Button
          variant="secondary"
          disabled={page === pageCount}
          aria-label="Buka halaman berikutnya"
          onClick={() => onPageChange(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </nav>
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSkeleton,
};
export type {
  SortDirection,
  TableCellProps,
  TableHeadProps,
  TablePaginationProps,
  TableProps,
  TableSkeletonProps,
};
