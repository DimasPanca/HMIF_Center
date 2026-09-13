import { WifiOff } from 'lucide-react';

interface KoneksiBannerProps {
  terputus: boolean;
}

export function KoneksiBanner({ terputus }: KoneksiBannerProps) {
  if (!terputus) return null;

  return (
    <div
      role="alert"
      data-testid="master-gantt-koneksi-banner"
      className="flex items-center gap-2 rounded-sm border border-[var(--warning)] bg-[var(--warning-subtle)] px-3 py-2 text-[12px] text-primary"
    >
      <WifiOff className="size-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
      <span>Pembaruan langsung terputus. Muat ulang untuk data terbaru.</span>
    </div>
  );
}
