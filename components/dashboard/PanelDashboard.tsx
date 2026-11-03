import { ArrowUpRight, Circle, CircleCheck, CircleDashed, CircleDot, Inbox, OctagonAlert, SignalHigh } from 'lucide-react';
import Link from 'next/link';

import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AmbangDeadline } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

import type { ItemDashboard, KartuDashboard, PanelDashboardKey } from './types';

export interface PanelPeranProps {
  kunci: readonly string[];
}

/** Ambang & "hari ini" deadline dari server (lib/deadline-config.ts). */
export interface TenggatDashboard {
  ambang: AmbangDeadline;
  hariIni: string;
}

interface PanelDashboardProps {
  kartu: readonly KartuDashboard[];
  panel: PanelDashboardKey;
  judul: string;
  tenggat?: TenggatDashboard;
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

function labelKode(nilai: string): string {
  return nilai
    .toLocaleLowerCase('id-ID')
    .replaceAll('_', ' ')
    .replace(/^./, (huruf) => huruf.toLocaleUpperCase('id-ID'));
}

/**
 * ADR-060 — baris gaya Linear: status kartu Kanban sebagai ikon kecil di kiri, prioritas hanya
 * bila Tinggi/Kritis, tenggat di kanan. Status lain (proker, surat, kendala) tetap teks kecil.
 */
const STATUS_KANBAN: Record<string, { ikon: typeof Circle; label: string; kelas: string }> = {
  TODO: { ikon: Circle, label: 'Belum mulai', kelas: 'text-tertiary' },
  IN_PROGRESS: { ikon: CircleDot, label: 'Dikerjakan', kelas: 'text-[var(--warning)]' },
  REVIEW: { ikon: CircleDashed, label: 'Ditinjau', kelas: 'text-[var(--info)]' },
  DONE: { ikon: CircleCheck, label: 'Selesai', kelas: 'text-[var(--success)]' },
};

function IsiItem({ item, tenggat }: { item: ItemDashboard; tenggat?: TenggatDashboard }) {
  const nilai = formatNilai(item);
  const kanban = item.status ? STATUS_KANBAN[item.status] : undefined;
  const IkonStatus = kanban?.ikon;

  return (
    <div className="flex min-w-0 items-start gap-2.5 px-1 py-0.5">
      {IkonStatus ? (
        <IkonStatus className={cn('mt-0.5 size-4 shrink-0', kanban.kelas)} strokeWidth={2} aria-label={kanban.label} role="img" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-5 font-medium text-primary">{item.label}</p>
        {item.keterangan ? <p className="mt-0.5 truncate text-[12px] leading-4 text-secondary">{item.keterangan}</p> : null}
        {(item.status && !kanban) || item.prioritas === 'KRITIS' || item.prioritas === 'TINGGI' || item.tanggal || item.deadline ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4 text-secondary">
            {/* HP: tenggat turun ke baris keterangan supaya judul tidak terpotong. */}
            {item.deadline ? (
              <span className="sm:hidden">
                <DeadlineBadge deadline={item.deadline} ambang={tenggat?.ambang} hariIni={tenggat?.hariIni} />
              </span>
            ) : null}
            {item.status && !kanban ? <span>{labelKode(item.status)}</span> : null}
            {item.prioritas === 'KRITIS' ? (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--danger)]">
                <OctagonAlert className="size-3.5" aria-hidden="true" /> Kritis
              </span>
            ) : item.prioritas === 'TINGGI' ? (
              <span className="inline-flex items-center gap-1">
                <SignalHigh className="size-3.5" aria-hidden="true" /> Prioritas tinggi
              </span>
            ) : null}
            {item.tanggal && !item.deadline ? <span className="text-tertiary">{formatTanggalPendek(item.tanggal)}</span> : null}
          </div>
        ) : null}
      </div>
      {item.deadline ? (
        <span className="hidden shrink-0 sm:block">
          <DeadlineBadge deadline={item.deadline} ambang={tenggat?.ambang} hariIni={tenggat?.hariIni} />
        </span>
      ) : null}
      {nilai ? <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-primary">{nilai}</span> : null}
      {item.href ? <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" /> : null}
    </div>
  );
}

function DaftarItem({ data, tenggat }: { data: readonly ItemDashboard[]; tenggat?: TenggatDashboard }) {
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
        <li key={item.id} className="py-2 first:pt-0 last:pb-0">
          {item.href ? (
            <Link
              href={item.href}
              className="block rounded-sm outline-none transition-colors duration-fast hover:bg-subtle focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
            >
              <IsiItem item={item} tenggat={tenggat} />
            </Link>
          ) : (
            <IsiItem item={item} tenggat={tenggat} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function PanelDashboard({ kartu, panel, judul, tenggat }: PanelDashboardProps) {
  // ADR-039: kartu yang kosong tidak memakan satu kotak penuh — diringkas menjadi satu
  // baris "tidak ada yang perlu ditindak" sehingga kartu berisi naik ke atas.
  // Kartu yang seluruh isinya sudah tampil di kartu sebelumnya (mis. "Deadline terdekat"
  // Anggota = subset "Tugas saya") tidak diulang — data sama dua kali membingungkan.
  const sudahTampil = new Set<string>();
  const unik = kartu.filter((k) => {
    if (!k.tersedia || k.data.length === 0) return true;
    const adaBaru = k.data.some((d) => !sudahTampil.has(d.id));
    for (const d of k.data) sudahTampil.add(d.id);
    return adaBaru;
  });
  const terisi = unik.filter((k) => !k.tersedia || k.data.length > 0);
  const kosong = unik.filter((k) => k.tersedia && k.data.length === 0);
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

      {terisi.length ? (
        <div
          className={cn(
            'grid gap-3',
            // Jumlah kolom mengikuti jumlah kartu berisi — tidak ada separuh layar yang kosong.
            terisi.length === 2 && 'md:grid-cols-2',
            terisi.length === 3 && 'md:grid-cols-2 xl:grid-cols-3',
            terisi.length >= 4 && 'md:grid-cols-2 2xl:grid-cols-4',
          )}
        >
          {terisi.map((item) => (
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
                  <DaftarItem data={item.data} tenggat={tenggat} />
                ) : (
                  <p className="text-xs leading-4 text-secondary">{item.menunggu}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {kosong.length ? (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-dashed border-default px-3 py-2.5 text-[13px] text-secondary',
            terisi.length > 0 && 'mt-3',
          )}
        >
          <Inbox className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
          <span>{terisi.length ? 'Tidak ada yang perlu ditindak di' : 'Semua beres - tidak ada yang perlu ditindak di'}</span>
          {kosong.map((item) => (
            <span key={item.kunci} data-testid={`dashboard-card-${item.kunci}`} className="rounded-full bg-subtle px-2 py-0.5 text-[12px] text-primary">
              {item.judul}
            </span>
          ))}
        </div>
      ) : null}
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
