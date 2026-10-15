/**
 * Kartu divisi (T-084): nama, koordinator, jumlah anggota, total RAB divisi,
 * progres Kanban divisi — empat metrik USER_FLOW §6.2.
 *
 * RAB `null` berarti pengguna tidak berhak membaca anggaran acara ini; kartu
 * menulis "Terbatas", bukan "Rp0".
 *
 * Test id: divisi-card, divisi-card-{koordinator|anggota|rab|progres}, divisi-card-buka.
 */

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { KartuDivisi, Progres } from '@/lib/acara/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export function BilahProgres({ progres, label }: { progres: Progres; label: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-secondary">{label}</span>
        <span className="font-medium tabular-nums">
          {progres.persen === null ? 'Belum ada kartu' : `${progres.persen}% · ${progres.selesai}/${progres.total} kartu`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progres.persen ?? 0}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${progres.persen ?? 0}%` }} />
      </div>
    </div>
  );
}

export function DivisiCard({ acaraId, divisi }: { acaraId: string; divisi: KartuDivisi }) {
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="divisi-card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: divisi.warna ?? 'var(--neutral)' }} />
          {divisi.nama}
        </h3>
        {divisi.peran_saya ? <Badge tone="info">{divisi.peran_saya === 'KOORDINATOR' ? 'Koordinator Anda' : 'Divisi Anda'}</Badge> : null}
      </div>
      <dl className="grid gap-1 text-[13px]">
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">Koordinator</dt>
          <dd data-testid="divisi-card-koordinator" className="truncate">
            {divisi.koordinator ?? 'Belum ditetapkan'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">Anggota</dt>
          <dd data-testid="divisi-card-anggota" className="tabular-nums">
            {divisi.jumlah_anggota} orang
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">RAB divisi</dt>
          <dd data-testid="divisi-card-rab" className="tabular-nums">
            {divisi.total_rab === null ? 'Terbatas' : formatRupiah(divisi.total_rab)}
          </dd>
        </div>
      </dl>
      <div data-testid="divisi-card-progres">
        <BilahProgres progres={divisi.progres} label="Progres Kanban" />
      </div>
      <Link
        href={`/acara/${acaraId}/divisi/${divisi.id}`}
        className={buttonVariants({ variant: 'secondary', className: 'mt-auto' })}
        data-testid="divisi-card-buka"
      >
        Buka ruang kerja
      </Link>
    </Card>
  );
}
