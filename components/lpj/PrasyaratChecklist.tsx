/**
 * Checklist prasyarat generate LPJ (T-105 kontrak 1): wajib vs opsional
 * dibedakan; generate ditolak server bila butir wajib belum terpenuhi.
 */

import { CheckCircle2, Circle, MinusCircle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type { ButirPrasyarat } from '@/lib/lpj/schema';
import { cn } from '@/lib/utils';

export function PrasyaratChecklist({ butir }: { butir: ButirPrasyarat[] }) {
  const siap = butir.every((b) => !b.wajib || b.terpenuhi);
  return (
    <Card className="space-y-2 p-4" data-testid="lpj-prasyarat" data-siap={siap ? '1' : '0'}>
      <h2 className="text-[15px] font-semibold">Prasyarat</h2>
      <ul className="grid gap-1.5 text-[13px]">
        {butir.map((b) => (
          <li
            key={b.id}
            className="flex items-start gap-2"
            data-testid={`lpj-prasyarat-${b.id}`}
            data-terpenuhi={b.terpenuhi ? '1' : '0'}
          >
            {b.terpenuhi ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            ) : b.wajib ? (
              <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : (
              <MinusCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-tertiary" />
            )}
            <span className="min-w-0">
              <span className={cn('font-medium', !b.terpenuhi && b.wajib && 'text-danger')}>
                {b.label}
              </span>
              {b.wajib ? null : <span className="ml-1 text-[11px] text-tertiary">(opsional)</span>}
              <span className="block text-[12px] text-secondary">{b.keterangan}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-secondary">
        {siap ? 'Semua prasyarat wajib terpenuhi.' : 'Lengkapi butir wajib sebelum membuat LPJ.'}
      </p>
    </Card>
  );
}
