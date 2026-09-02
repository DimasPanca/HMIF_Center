import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex h-[34px] shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border px-[14px] text-[14px] leading-5 font-medium tabular-nums outline-none transition-[background-color,border-color,color,box-shadow,filter,opacity] duration-fast ease-out focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] disabled:hover:bg-[var(--primary)] dark:text-inverse',
        secondary:
          'border-[var(--text-tertiary)] bg-panel text-primary hover:bg-subtle active:bg-muted disabled:hover:bg-panel',
        ghost:
          'border-transparent bg-transparent text-secondary hover:bg-subtle hover:text-primary active:bg-muted disabled:hover:bg-transparent disabled:hover:text-secondary',
        danger:
          'border-transparent bg-[var(--danger)] text-[var(--primary-text)] hover:brightness-[0.92] active:brightness-[0.86] disabled:hover:brightness-100 dark:text-inverse',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;

type ButtonProps = React.ComponentProps<'button'> & {
  loading?: boolean;
  variant?: ButtonVariant;
};

/**
 * Checklist komponen DESIGN_SYSTEM §15.3 (15 butir):
 * 1. [x] Seluruh warna menggunakan token semantik; tidak ada nilai hex langsung.
 * 2. [x] Token dan varian `dark` mendukung light serta dark mode.
 * 3. [x] Kontras AA dijaga; mode gelap primary/danger memakai `--text-inverse`.
 * 4. [x] Elemen `<button>` native dapat dioperasikan penuh dengan keyboard.
 * 5. [x] Focus-visible memakai border dan ring 3 px dari `--border-focus`.
 * 6. [x] State default, hover, active, focus, disabled, dan loading tersedia.
 * 7. [N/A] Tombol tidak menampilkan koleksi sehingga tidak memerlukan empty state.
 * 8. [N/A] Loading adalah state aksi singkat; skeleton data tidak relevan.
 * 9. [x] Transisi properti spesifik berdurasi 120 ms.
 * 10. [x] `prefers-reduced-motion` menonaktifkan transisi.
 * 11. [x] Tanpa lebar tetap sehingga tetap responsif sampai viewport 375 px.
 * 12. [x] Semantik native, disabled, dan `aria-busy` tersedia bagi screen reader.
 * 13. [x] Teks loading menggunakan Bahasa Indonesia: “Memproses…”.
 * 14. [x] Angka di dalam tombol menggunakan `tabular-nums`.
 * 15. [N/A] Tombol tidak memformat tanggal atau Rupiah.
 */
function Button({
  className,
  variant = 'primary',
  loading = false,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      data-slot="button"
      data-variant={variant}
      data-loading={loading ? '' : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, className }))}
    >
      {loading ? <span aria-live="polite">Memproses…</span> : children}
    </button>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
