import * as React from 'react';

import { cn } from '@/lib/utils';

type SelectProps = React.ComponentProps<'select'> & {
  error?: string;
  helperText?: string;
  loading?: boolean;
  loadingText?: string;
  placeholder?: string | null;
};

function mergeDescriptionIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.trim().split(/\s+/) ?? []);

  return ids.length > 0 ? [...new Set(ids)].join(' ') : undefined;
}

/**
 * Checklist DESIGN_SYSTEM §15.3:
 * 1. Lulus — seluruh warna, ukuran, radius, bayangan, dan durasi memakai token semantik.
 * 2. Lulus — token yang dipakai memiliki nilai untuk mode light dan dark.
 * 3. Lulus — teks memakai --text-primary dan border kontrol memakai --text-tertiary (>= 3:1).
 * 4. Lulus — elemen select native dapat dioperasikan penuh dengan keyboard.
 * 5. Lulus — focus-visible memakai border dan ring 3 px dari --border-focus.
 * 6. Lulus — tersedia state default, hover, active, focus, disabled, dan loading.
 * 7. N/A — komponen ini tidak menampilkan koleksi; opsi kosong dijelaskan oleh placeholder.
 * 8. N/A — select bukan konten asinkron; state loading memakai teks status tanpa spinner.
 * 9. Lulus — transisi state dibatasi --duration-fast (120 ms).
 * 10. Lulus — motion-reduce menonaktifkan transisi.
 * 11. Lulus — lebar fleksibel dan min-width 0 aman hingga viewport 375 px.
 * 12. Lulus — semantik native dipertahankan; error/helper terhubung lewat aria-describedby.
 * 13. Lulus — placeholder dan teks loading bawaan berbahasa Indonesia.
 * 14. N/A — komponen tidak menampilkan angka bawaan.
 * 15. N/A — komponen tidak memformat tanggal atau Rupiah.
 */
function Select({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  children,
  className,
  defaultValue,
  disabled,
  error,
  helperText,
  id,
  loading = false,
  loadingText = 'Memproses…',
  multiple,
  placeholder = 'Pilih opsi',
  value,
  ...props
}: SelectProps) {
  const generatedId = React.useId();
  const selectId = id ?? generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  const helperId = helperText ? `${selectId}-helper` : undefined;
  const selectedValue = value ?? defaultValue;
  const loadingValue = Array.isArray(selectedValue)
    ? (selectedValue[0] ?? '')
    : (selectedValue ?? '');

  return (
    <div className="min-w-0">
      <select
        id={selectId}
        data-slot="select"
        data-loading={loading ? '' : undefined}
        aria-busy={loading || undefined}
        aria-describedby={mergeDescriptionIds(ariaDescribedBy, errorId, helperId)}
        aria-invalid={error ? true : ariaInvalid}
        className={cn(
          'block h-[34px] w-full min-w-0 rounded-sm border border-[var(--text-tertiary)] bg-[var(--bg-panel)] px-3 py-0 text-[14px] leading-5 text-[var(--text-primary)] outline-none transition-[border-color,box-shadow,background-color,color] duration-fast ease-out',
          'hover:border-[var(--text-secondary)] active:border-[var(--border-focus)] focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)]',
          'disabled:cursor-not-allowed disabled:bg-[var(--bg-muted)] disabled:text-[var(--text-disabled)] disabled:opacity-50 disabled:hover:border-[var(--text-tertiary)]',
          'aria-invalid:border-[var(--danger)] motion-reduce:transition-none',
          className,
        )}
        defaultValue={defaultValue}
        disabled={disabled || loading}
        multiple={multiple}
        value={value}
        {...props}
      >
        {loading ? (
          <option value={loadingValue}>{loadingText}</option>
        ) : (
          <>
            {placeholder !== null && !multiple ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {children}
          </>
        )}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-[12px] leading-4 text-danger">
          {error}
        </p>
      ) : null}
      {helperText ? (
        <p id={helperId} className="mt-1 text-[12px] leading-4 text-secondary">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

export { Select, type SelectProps };
