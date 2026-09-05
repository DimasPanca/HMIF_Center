import { CalendarCheck2, LockKeyhole, Repeat2 } from 'lucide-react';

const itemLegenda = [
  {
    label: 'Terkunci',
    keterangan: 'Tanggal telah dipakai proker lain',
    Icon: LockKeyhole,
    className:
      'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_16%,var(--bg-panel))] text-[var(--primary)]',
  },
  {
    label: 'Berkala',
    keterangan: 'Kegiatan rutin, tidak memblokir',
    Icon: Repeat2,
    className: 'border-dashed border-[var(--info)] bg-[var(--info-subtle)] text-[var(--info)]',
  },
  {
    label: 'Tersedia',
    keterangan: 'Dapat dipilih untuk proker',
    Icon: CalendarCheck2,
    className: 'border-[var(--border-default)] bg-panel text-secondary',
  },
] as const;

export function LegendaKalender() {
  return (
    <div
      data-testid="kalender-legenda"
      className="grid gap-2 rounded-sm border border-subtle bg-subtle p-3 sm:grid-cols-3"
      aria-label="Legenda keadaan tanggal"
    >
      {itemLegenda.map(({ label, keterangan, Icon, className }) => (
        <div key={label} className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex size-[34px] shrink-0 items-center justify-center rounded-sm border ${className}`}
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-primary">{label}</span>
            <span className="block text-[11px] leading-4 text-tertiary">{keterangan}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
