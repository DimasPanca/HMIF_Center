'use client';

/**
 * Ringkasan RAB per divisi (kolom H:J template asli, PRD F-9.3) dan footer
 * sticky total anggaran (T-087 kontrak 6). Dihitung dari state grid — tidak
 * ada pemanggilan server, jadi berubah seketika saat sel diubah.
 *
 * Test id: rab-ringkasan, rab-ringkasan-divisi (data-divisi-id),
 * rab-total-acara, rab-dana-tak-terduga.
 */

import type { DivisiRab } from '@/lib/rab/item';
import { jumlahkanDivisi } from '@/lib/rab/item';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export function RabSummary({ divisi }: { divisi: DivisiRab[] }) {
  return (
    <section aria-label="Ringkasan RAB per divisi" data-testid="rab-ringkasan" className="rounded-sm border border-default bg-panel">
      <h3 className="border-b border-default px-3 py-2 text-[13px] font-semibold">Ringkasan per divisi</h3>
      <ol className="divide-y divide-[var(--border-default)]">
        {divisi.map((d, i) => (
          <li key={d.id} data-testid="rab-ringkasan-divisi" data-divisi-id={d.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
            <span className="w-6 text-tertiary tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">Divisi {d.nama}</span>
            <span className="font-medium tabular-nums">{formatRupiah(jumlahkanDivisi(d))}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RabFooter({ total, danaTakTerduga }: { total: number; danaTakTerduga: number }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-default bg-panel/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:mx-0 sm:rounded-sm sm:border">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[13px] font-semibold tracking-wide uppercase">Total anggaran</span>
        <span data-testid="rab-total-acara" className="text-xl font-semibold tabular-nums">
          {formatRupiah(total)}
        </span>
      </div>
      {danaTakTerduga ? (
        <p data-testid="rab-dana-tak-terduga" className="mt-0.5 text-right text-[12px] text-secondary tabular-nums">
          Dana tak terduga {formatRupiah(danaTakTerduga)} dicatat terpisah
        </p>
      ) : null}
    </div>
  );
}
