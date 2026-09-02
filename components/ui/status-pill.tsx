import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BadgeCheck,
  Ban,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock3,
  FilePenLine,
  ListTodo,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Send,
  Upload,
  WalletCards,
  Wrench,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_VALUES = [
  'AKTIF',
  'ARSIP',
  'PERSIAPAN',
  'DRAFT',
  'MENUNGGU_APPROVAL',
  'MENUNGGU_APPROVAL_REVISI',
  'DISETUJUI',
  'BERJALAN',
  'SELESAI',
  'DITOLAK',
  'PERLU_REVISI',
  'DIBATALKAN',
  'TERBIT',
  'DIAJUKAN',
  'REALISASI',
  'DIUNGGAH',
  'MENUNGGU_VERIFIKASI',
  'TERVERIFIKASI',
  'PERLU_PERBAIKAN',
  'DISETUJUI_BENDUM',
  'FINAL',
  'TERBUKA',
  'SEDANG_DITANGANI',
  'SUKSES',
  'GAGAL',
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
] as const;

type DomainStatus = (typeof STATUS_VALUES)[number];

type StatusDefinition = Readonly<{
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
}>;

const STATUS_CONFIG = {
  AKTIF: { label: 'Aktif', tone: 'success', icon: CircleCheck },
  ARSIP: { label: 'Arsip', tone: 'neutral', icon: Archive },
  PERSIAPAN: { label: 'Persiapan', tone: 'info', icon: Clock3 },
  DRAFT: { label: 'Draf', tone: 'neutral', icon: FilePenLine },
  MENUNGGU_APPROVAL: { label: 'Menunggu Persetujuan', tone: 'warning', icon: Clock3 },
  MENUNGGU_APPROVAL_REVISI: {
    label: 'Menunggu Persetujuan Revisi',
    tone: 'warning',
    icon: RefreshCw,
  },
  DISETUJUI: { label: 'Disetujui', tone: 'success', icon: CircleCheck },
  BERJALAN: { label: 'Berjalan', tone: 'info', icon: PlayCircle },
  SELESAI: { label: 'Selesai', tone: 'neutral', icon: CircleCheck },
  DITOLAK: { label: 'Ditolak', tone: 'danger', icon: CircleX },
  PERLU_REVISI: { label: 'Perlu Revisi', tone: 'warning', icon: RotateCcw },
  DIBATALKAN: { label: 'Dibatalkan', tone: 'danger', icon: Ban },
  TERBIT: { label: 'Terbit', tone: 'primary', icon: Send },
  DIAJUKAN: { label: 'Diajukan', tone: 'info', icon: Send },
  REALISASI: { label: 'Realisasi', tone: 'info', icon: WalletCards },
  DIUNGGAH: { label: 'Diunggah', tone: 'info', icon: Upload },
  MENUNGGU_VERIFIKASI: { label: 'Menunggu Verifikasi', tone: 'warning', icon: Clock3 },
  TERVERIFIKASI: { label: 'Terverifikasi', tone: 'success', icon: BadgeCheck },
  PERLU_PERBAIKAN: { label: 'Perlu Perbaikan', tone: 'warning', icon: Wrench },
  DISETUJUI_BENDUM: { label: 'Disetujui Bendum', tone: 'success', icon: BadgeCheck },
  FINAL: { label: 'Final', tone: 'primary', icon: LockKeyhole },
  TERBUKA: { label: 'Terbuka', tone: 'warning', icon: CircleDot },
  SEDANG_DITANGANI: { label: 'Sedang Ditangani', tone: 'info', icon: Wrench },
  SUKSES: { label: 'Sukses', tone: 'success', icon: CircleCheck },
  GAGAL: { label: 'Gagal', tone: 'danger', icon: CircleX },
  TODO: { label: 'Belum Dikerjakan', tone: 'neutral', icon: ListTodo },
  IN_PROGRESS: { label: 'Sedang Dikerjakan', tone: 'info', icon: PlayCircle },
  REVIEW: { label: 'Dalam Tinjauan', tone: 'warning', icon: ScanSearch },
  DONE: { label: 'Selesai', tone: 'success', icon: CircleCheck },
} satisfies Record<DomainStatus, StatusDefinition>;

type StatusPillProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'tone'> & {
  status: DomainStatus;
};

function StatusPill({ status, className, ...props }: StatusPillProps) {
  const { label, tone, icon: Icon } = STATUS_CONFIG[status];

  return (
    <Badge
      {...props}
      data-slot="status-pill"
      data-status={status}
      tone={tone}
      className={cn('min-w-0', className)}
    >
      <Icon data-slot="badge-icon" aria-hidden="true" focusable="false" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

export { STATUS_CONFIG, STATUS_VALUES, StatusPill };
export type { DomainStatus, StatusDefinition, StatusPillProps };
