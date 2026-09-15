'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, CalendarDays, CheckSquare2 } from 'lucide-react';

import type { KartuKanban } from '@/components/kanban/types';
import { formatTanggalPendek, tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';
import { Avatar } from '@/components/ui/avatar';

const WARNA_PRIORITAS: Record<KartuKanban['prioritas'], string> = {
  RENDAH: 'var(--neutral)',
  SEDANG: 'var(--info)',
  TINGGI: 'var(--warning)',
  KRITIS: 'var(--danger)',
};

export function KanbanCard({ kartu, bolehUbah }: { kartu: KartuKanban; bolehUbah: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useSortable({ id: kartu.id, disabled: !bolehUbah });
  const lewat = kartu.deadline !== null && kartu.deadline < tanggalHariIniJakarta();

  return (
    <article
      ref={setNodeRef}
      data-testid={`kanban-card-${kartu.id}`}
      className={`rounded-sm border border-default border-l-[3px] bg-panel p-3 shadow-sm ${isDragging ? 'z-10 shadow-md' : ''}`}
      style={{
        borderLeftColor: WARNA_PRIORITAS[kartu.prioritas],
        transform: CSS.Transform.toString(transform),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-[13px] font-semibold text-primary">{kartu.judul}</h3>
        {bolehUbah ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            data-testid={`kanban-drag-${kartu.id}`}
            aria-label={`Pindahkan kartu ${kartu.judul}`}
            className="flex size-[34px] shrink-0 items-center justify-center rounded-sm text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-secondary">{kartu.proker_nama ?? 'Tugas departemen'}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-secondary">
        <span className="inline-flex items-center gap-1" title={kartu.assignee_nama ?? 'Belum ditugaskan'}>
          <Avatar name={kartu.assignee_nama ?? 'Belum ditugaskan'} size="sm" />
          <span className="max-w-24 truncate">{kartu.assignee_nama ?? 'Belum ada PIC'}</span>
        </span>
        {kartu.deadline ? (
          <span className={`inline-flex items-center gap-1 ${lewat ? 'font-semibold text-danger' : ''}`}>
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {lewat ? 'Terlambat · ' : ''}{formatTanggalPendek(kartu.deadline)}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <CheckSquare2 className="size-3.5" aria-hidden="true" />
          {kartu.checklist_selesai}/{kartu.checklist_total}
        </span>
      </div>
      <p className="mt-2 text-[10px] font-semibold tracking-wide text-secondary uppercase">
        Prioritas {kartu.prioritas.toLowerCase()}
      </p>
    </article>
  );
}
