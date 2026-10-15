/**
 * Indikator deadline (T-083, DESIGN_SYSTEM §12.5) — dipakai ulang di Kanban,
 * checklist, panel Gantt, dan dashboard.
 *
 * Setiap tingkat punya TEKS dan IKON sendiri, bukan hanya warna (K-15):
 * dalam grayscale atau bagi pengguna buta warna, "Terlambat 2 hari" dengan
 * ikon oktagon tetap terbedakan dari "5 hari lagi" dengan ikon segitiga.
 *
 * Komponen murni (server maupun klien). `hariIni` & `ambang` sebaiknya
 * diteruskan dari server (lib/deadline-config.ts) supaya server dan klien
 * memakai tanggal yang sama; tanpanya dipakai tanggal Jakarta saat render.
 */

import { CalendarDays, OctagonAlert, Siren, TriangleAlert, type LucideIcon } from 'lucide-react';

import { AMBANG_BAWAAN, LABEL_TINGKAT, infoDeadline, type AmbangDeadline, type TingkatDeadline } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import { formatTanggalPendek, tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

const GAYA: Record<TingkatDeadline, { ikon: LucideIcon; kelas: string }> = {
  NORMAL: { ikon: CalendarDays, kelas: 'text-tertiary' },
  PERINGATAN: { ikon: TriangleAlert, kelas: 'text-[var(--warning)]' },
  KRITIS: { ikon: Siren, kelas: 'rounded-xs bg-[var(--danger-subtle)] px-1 text-[var(--danger)]' },
  TERLAMBAT: { ikon: OctagonAlert, kelas: 'font-bold text-[var(--danger)]' },
};

export function DeadlineBadge({
  deadline,
  hariIni,
  ambang = AMBANG_BAWAAN,
  selesai = false,
  className,
}: {
  /** `YYYY-MM-DD` (atau ISO; hanya bagian tanggal yang dipakai). */
  deadline: string;
  hariIni?: string;
  ambang?: AmbangDeadline;
  /** Pekerjaan yang sudah selesai tidak lagi "mendesak". */
  selesai?: boolean;
  className?: string;
}) {
  const tanggal = deadline.slice(0, 10);
  const info = infoDeadline(tanggal, hariIni ?? tanggalHariIniJakarta(), ambang);
  const tingkat: TingkatDeadline = selesai ? 'NORMAL' : info.tingkat;
  const { ikon: Ikon, kelas } = GAYA[tingkat];
  const label = formatTanggalPendek(tanggal);
  const keterangan = selesai ? null : info.teks;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[11px] leading-4 whitespace-nowrap', kelas, className)}
      data-slot="deadline-badge"
      data-tingkat={tingkat}
      title={`Deadline ${label}${keterangan ? ` — ${keterangan}` : ''} (${LABEL_TINGKAT[tingkat]})`}
    >
      <Ikon className="size-3 shrink-0" aria-hidden="true" />
      <span>
        {label}
        {keterangan && tingkat !== 'NORMAL' ? ` (${keterangan.toLocaleLowerCase('id-ID')})` : ''}
      </span>
      <span className="sr-only">{`, ${LABEL_TINGKAT[tingkat]}${keterangan ? `, ${keterangan}` : ''}`}</span>
    </span>
  );
}
