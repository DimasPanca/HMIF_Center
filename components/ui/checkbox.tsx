import * as React from 'react';

import { cn } from '@/lib/utils';

type CheckboxProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  loading?: boolean;
  loadingText?: string;
};

function mergeDescriptionIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.trim().split(/\s+/) ?? []);

  return ids.length > 0 ? [...new Set(ids)].join(' ') : undefined;
}

/**
 * Checklist DESIGN_SYSTEM §15.3:
 * 1. Lulus — seluruh warna, ukuran, radius, bayangan, dan durasi memakai token semantik.
 * 2. Lulus — token yang dipakai memiliki nilai untuk mode light dan dark.
 * 3. Lulus — border memakai --text-tertiary (>= 3:1) dan tanda centang memakai --text-inverse.
 * 4. Lulus — input checkbox native dapat dioperasikan penuh dengan keyboard.
 * 5. Lulus — focus-visible memakai border dan ring 3 px dari --border-focus.
 * 6. Lulus — tersedia state default, hover, active, focus, disabled, dan loading.
 * 7. N/A — komponen ini tidak menampilkan koleksi.
 * 8. N/A — checkbox bukan konten asinkron; state loading diumumkan tanpa spinner.
 * 9. Lulus — transisi state dibatasi --duration-fast (120 ms).
 * 10. Lulus — motion-reduce menonaktifkan transisi.
 * 11. Lulus — kontrol 16 px tidak meluap pada viewport 375 px dan dapat dibungkus label responsif.
 * 12. Lulus — semantik input native dipertahankan; label eksternal/aria-label tetap didukung.
 * 13. Lulus — teks loading bawaan berbahasa Indonesia.
 * 14. N/A — komponen tidak menampilkan angka.
 * 15. N/A — komponen tidak memformat tanggal atau Rupiah.
 */
function Checkbox({
  'aria-describedby': ariaDescribedBy,
  className,
  disabled,
  loading = false,
  loadingText = 'Memproses…',
  ...props
}: CheckboxProps) {
  const generatedId = React.useId();
  const loadingId = loading ? `${generatedId}-loading` : undefined;

  return (
    <span className="relative inline-flex size-4 shrink-0 align-middle">
      <input
        type="checkbox"
        data-slot="checkbox"
        data-loading={loading ? '' : undefined}
        aria-busy={loading || undefined}
        aria-describedby={mergeDescriptionIds(ariaDescribedBy, loadingId)}
        className={cn(
          'peer size-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-[var(--text-tertiary)] bg-[var(--bg-panel)] outline-none transition-[border-color,background-color,box-shadow] duration-fast ease-out',
          'hover:border-[var(--border-focus)] active:border-[var(--primary-active)] checked:border-[var(--primary)] checked:bg-[var(--primary)]',
          'focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)]',
          'disabled:cursor-not-allowed disabled:bg-[var(--bg-muted)] disabled:opacity-50 disabled:hover:border-[var(--text-tertiary)] aria-invalid:border-[var(--danger)] motion-reduce:transition-none',
          className,
        )}
        disabled={disabled || loading}
        {...props}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute inset-0 size-4 text-[var(--text-inverse)] opacity-0 transition-opacity duration-[var(--duration-fast)] peer-checked:opacity-100 peer-disabled:opacity-50 motion-reduce:transition-none"
      >
        <path d="m3.5 8 3 3 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      {loading ? (
        <span id={loadingId} role="status" className="sr-only">
          {loadingText}
        </span>
      ) : null}
    </span>
  );
}

export { Checkbox, type CheckboxProps };
