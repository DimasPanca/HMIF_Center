import * as React from 'react';

import { cn } from '@/lib/utils';

type LabelProps = React.ComponentProps<'label'> & {
  required?: boolean;
};

/**
 * Checklist komponen DESIGN_SYSTEM §15.3 (15 butir):
 * 1. [x] Warna teks dan indikator wajib memakai token semantik.
 * 2. [x] Token `--text-primary` dan `--danger` mendukung light/dark mode.
 * 3. [x] Teks utama dan indikator wajib memenuhi kontras WCAG AA.
 * 4. [x] Label native dengan `htmlFor` meneruskan aktivasi ke kontrol terkait.
 * 5. [N/A] Label bukan target fokus; focus ring berada pada kontrol terkait.
 * 6. [N/A] Label bukan kontrol interaktif dan tidak memiliki state aksi/loading.
 * 7. [N/A] Label tidak menampilkan koleksi sehingga tidak memiliki empty state.
 * 8. [N/A] Label tidak memuat data sehingga tidak memerlukan skeleton loader.
 * 9. [N/A] Label tidak memiliki animasi atau transisi.
 * 10. [N/A] Tidak ada gerakan yang perlu dikurangi.
 * 11. [x] Layout inline dan dapat membungkus pada viewport 375 px.
 * 12. [x] `htmlFor`, indikator visual, dan teks “wajib” tersembunyi melengkapi aksesibilitas.
 * 13. [x] Teks aksesibel bawaan menggunakan Bahasa Indonesia.
 * 14. [x] Angka di dalam label menggunakan `tabular-nums`.
 * 15. [N/A] Label tidak memformat tanggal atau Rupiah.
 */
function Label({ className, required = false, children, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        'inline-flex flex-wrap items-center gap-1 text-[13px] leading-[18px] font-medium text-primary tabular-nums peer-disabled:cursor-not-allowed peer-disabled:text-disabled peer-disabled:opacity-70',
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="text-[var(--danger)]">
            *
          </span>
          <span className="sr-only"> (wajib)</span>
        </>
      ) : null}
    </label>
  );
}

export { Label };
export type { LabelProps };
