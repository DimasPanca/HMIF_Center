import { ArrowUpRight, CircleAlert, Inbox } from 'lucide-react';
import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

import type { ItemDashboard, KartuDashboard, PanelDashboardKey } from './types';

export interface PanelPeranProps {
  kunci: readonly string[];
}

interface PanelDashboardProps {
  kartu: readonly KartuDashboard[];
  panel: PanelDashboardKey;
  judul: string;
}

const KETERANGAN_PANEL: Record<PanelDashboardKey, string> = {
  ketua: 'Keputusan strategis dan kondisi organisasi yang perlu perhatian.',
  sekum: 'Administrasi, surat-menyurat, dan dokumentasi organisasi.',
  bendum: 'Anggaran, bukti transaksi, dan pertanggungjawaban keuangan.',
  kadept: 'Program kerja, tugas, dan kendala di lingkup departemen Anda.',
  anggota: 'Tugas, tenggat, dan kendala yang berkaitan langsung dengan Anda.',
  bph: 'Ringkasan lintas departemen untuk koordinasi harian BPH.',
  admin: 'Kesehatan sistem, pengguna, backup, dan aktivitas terbaru.',
};

function formatNilai(item: ItemDashboard): string | null {
  if (item.nilai === undefined) return null;
  if (typeof item.nilai === 'string') return item.nilai;
  if (item.format === 'rupiah') return formatRupiah(item.nilai);
  if (item.format === 'persen') return `${item.nilai.toLocaleString('id-ID')}%`;
  return item.nilai.toLocaleString('id-ID');
}

function tonePrioritas(prioritas: string): BadgeTone {
  if (prioritas === 'KRITIS' || prioritas === 'TINGGI') return 'danger';
  if (prioritas === 'SEDANG') return 'warning';
  return 'neutral';
}

function labelKode(nilai: string): string {
  return nilai
    .toLocaleLowerCase('id-ID')
    .replaceAll('_', ' ')
    .replace(/^./, (huruf) => huruf.toLocaleUpperCase('id-ID'));
}

function IsiItem({ item }: { item: ItemDashboard }) {
  const nilai = formatNilai(item);

  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-[18px] font-medium text-primary">{item.label}</p>
        {item.keterangan ? (
          <p className="mt-0.5 truncate text-xs leading-4 text-secondary">{item.keterangan}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {item.status ? <Badge tone="info">{labelKode(item.status)}</Badge> : null}
          {item.prioritas ? (
            <Badge tone={tonePrioritas(item.prioritas)}>
              <CircleAlert data-slot="badge-icon" aria-hidden="true" />
              {labelKode(item.prioritas)}
            </Badge>
          ) : null}
          {item.tanggal ? (
            <span className="text-[11px] leading-4 text-tertiary">
              {formatTanggalPendek(item.tanggal)}
            </span>
          ) : null}
        </div>
      </div>
      {nilai ? (
        <span className="shrink-0 text-right text-sm font-semibold text-primary">{nilai}</span>
      ) : null}
      {item.href ? <ArrowUpRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
    </div>
  );
}

function DaftarItem({ data }: { data: readonly ItemDashboard[] }) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center">
        <Inbox className="size-5 text-tertiary" aria-hidden="true" />
        <p className="text-xs leading-4 text-secondary">Belum ada data untuk ditampilkan.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border-subtle)]">
      {data.slice(0, 8).map((item) => (
        <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
          {item.href ? (
            <Link
              href={item.href}
              className="block rounded-sm outline-none transition-colors duration-fast hover:bg-subtle focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
            >
              <IsiItem item={item} />
            </Link>
          ) : (
            <IsiItem item={item} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function PanelDashboard({ kartu, panel, judul }: PanelDashboardProps) {
  return (
    <section data-testid={`panel-${panel}`} aria-labelledby={`panel-${panel}-title`}>
      <div className="mb-3">
        <h2 id={`panel-${panel}-title`} className="text-lg font-semibold text-primary">
          {judul}
        </h2>
        <p className="mt-0.5 text-[13px] leading-[18px] text-secondary">
          {KETERANGAN_PANEL[panel]}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {kartu.map((item) => (
          <Card key={item.kunci} data-testid={`dashboard-card-${item.kunci}`}>
            <CardHeader className="flex min-h-10 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pb-3">
              <CardTitle>{item.judul}</CardTitle>
              {item.kunci === 'approval-antrian' && item.tersedia ? (
                <Badge data-testid="dashboard-approval-badge" tone="warning">
                  {item.data.length}
                </Badge>
              ) : null}
            </CardHeader>
            <CardContent className="pt-3">
              {item.tersedia ? (
                <DaftarItem data={item.data} />
              ) : (
                <p className="text-xs leading-4 text-secondary">{item.menunggu}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function PanelDashboardSkeleton({
  jumlahKartu,
  panel,
}: {
  jumlahKartu: number;
  panel: PanelDashboardKey;
}) {
  return (
    <section
      data-testid={`panel-${panel}-loading`}
      aria-label={`Memuat panel ${panel}`}
      aria-busy="true"
      className="space-y-3"
    >
      <Skeleton variant="text" rows={2} className="max-w-md" />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: jumlahKartu }, (_, index) => (
          <Skeleton key={index} variant="card" />
        ))}
      </div>
    </section>
  );
}
