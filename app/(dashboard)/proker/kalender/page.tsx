import { CalendarDays } from 'lucide-react';

import { KalenderKetersediaan } from '@/components/proker/KalenderKetersediaan';

export default function KalenderProkerPage() {
  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <CalendarDays className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
              Program kerja
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold">Kalender ketersediaan</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Periksa jadwal yang sudah terkunci dan kegiatan rutin sebelum menentukan tanggal
              program kerja.
            </p>
          </div>
        </header>

        <KalenderKetersediaan sumber="/api/proker/kalender" />
      </div>
    </main>
  );
}
