import * as React from 'react';

import { cn } from '@/lib/utils';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  helperText?: string;
  loading?: boolean;
};

function mergeDescriptionIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.trim().split(/\s+/) ?? []);

  return ids.length > 0 ? [...new Set(ids)].join(' ') : undefined;
}

/*
 * Checklist Komponen DESIGN_SYSTEM §15.3:
 * 1. Lulus — semua warna memakai token semantik tanpa nilai hex langsung.
 * 2. Lulus — token yang sama memiliki nilai light dan dark mode.
 * 3. Lulus — teks dan batas kontrol memakai token dengan kontras WCAG AA.
 * 4. Lulus — elemen input native dapat dioperasikan dengan keyboard.
 * 5. Lulus — focus-visible menampilkan border dan ring --border-focus.
 * 6. Lulus — default, hover, active, focus, disabled, error, dan loading tercakup.
 * 7. N/A — Input tidak menampilkan koleksi sehingga tidak memerlukan empty state.
 * 8. N/A — Input tidak memuat konten; loading memakai disabled dan aria-busy.
 * 9. Lulus — hanya properti visual terkait yang bertransisi selama 120 ms.
 * 10. Lulus — prefers-reduced-motion menonaktifkan transisi.
 * 11. Lulus — lebar fleksibel dan min-width nol aman hingga 375 px.
 * 12. Lulus — native semantics, aria-invalid, aria-busy, dan deskripsi terhubung.
 * 13. N/A — tidak ada teks default; pesan berbahasa Indonesia diberikan pemanggil.
 * 14. Lulus — angka menggunakan tabular-nums.
 * 15. N/A — Input tidak memformat tanggal/Rupiah; pemanggil wajib memakai utilitas lokal.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    className,
    error,
    helperText,
    loading = false,
    disabled,
    'aria-busy': ariaBusy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const inputId = id ?? `input-${generatedId}`;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;
  const hasError = Boolean(error);
  const hasHelper = Boolean(helperText);

  return (
    <>
      <input
        ref={ref}
        id={inputId}
        data-slot="input"
        className={cn(
          'h-[34px] w-full min-w-0 rounded-sm border border-[var(--text-tertiary)] bg-[var(--bg-panel)] px-3 py-1 text-[14px] leading-5 text-[var(--text-primary)] tabular-nums outline-none',
          'placeholder:text-[var(--text-secondary)] hover:border-[var(--text-secondary)] active:border-[var(--border-focus)]',
          'focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)]',
          'aria-[invalid=true]:border-[var(--danger)] focus-visible:aria-[invalid=true]:border-[var(--danger)]',
          'disabled:cursor-not-allowed disabled:bg-[var(--bg-muted)] disabled:text-[var(--text-secondary)] disabled:hover:border-[var(--text-tertiary)]',
          'transition-[border-color,box-shadow,background-color] duration-fast ease-out motion-reduce:transition-none',
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading ? true : ariaBusy}
        aria-invalid={hasError ? true : ariaInvalid}
        aria-describedby={mergeDescriptionIds(
          ariaDescribedBy,
          hasError ? errorId : undefined,
          hasHelper ? helperId : undefined,
        )}
        {...props}
      />
      {hasError ? (
        <p id={errorId} role="alert" className="mt-1 text-[12px] leading-4 text-danger">
          {error}
        </p>
      ) : null}
      {hasHelper ? (
        <p id={helperId} className="mt-1 text-[12px] leading-4 text-secondary">
          {helperText}
        </p>
      ) : null}
    </>
  );
});

export { Input, type InputProps };
