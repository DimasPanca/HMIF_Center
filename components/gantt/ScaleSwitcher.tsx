'use client';

/**
 * Pemilih skala timeline (PRD F-6.3): minggu / bulan / kuartal.
 * Test id: gantt-scale-switcher, gantt-scale-{skala}.
 */

import { LABEL_SKALA, SKALA, type Skala } from '@/lib/gantt/skema';
import { cn } from '@/lib/utils';

export function ScaleSwitcher({ nilai, onChange }: { nilai: Skala; onChange: (s: Skala) => void }) {
  return (
    <div role="group" aria-label="Skala timeline" data-testid="gantt-scale-switcher" className="inline-flex overflow-hidden rounded-sm border border-default bg-panel">
      {SKALA.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={nilai === s}
          data-testid={`gantt-scale-${s}`}
          onClick={() => onChange(s)}
          className={cn(
            'px-3 py-1.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
            nilai === s ? 'bg-[var(--primary)] text-[var(--primary-text)]' : 'text-secondary hover:bg-subtle',
          )}
        >
          {LABEL_SKALA[s]}
        </button>
      ))}
    </div>
  );
}
