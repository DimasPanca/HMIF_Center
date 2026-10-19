'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, CheckSquare2 } from 'lucide-react';

import { KOLOM_KANBAN, type KartuKanban, type KolomKanban } from '@/components/kanban/types';
import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { useKonteksDeadline } from '@/components/shared/KonteksDeadline';
import { Avatar } from '@/components/ui/avatar';

const WARNA_PRIORITAS: Record<KartuKanban['prioritas'], string> = {
  RENDAH: 'var(--neutral)',
  SEDANG: 'var(--info)',
  TINGGI: 'var(--warning)',
  KRITIS: 'var(--danger)',
};

export function KanbanCard({
  kartu,
  bolehUbah,
  onOpen,
  onPindah,
}: {
  kartu: KartuKanban;
  bolehUbah: boolean;
  onOpen: () => void;
  /** Ada = tampilan tab HP: status diganti lewat pilihan, tanpa seret (ADR-037). */
  onPindah?: (kolom: KolomKanban) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useSortable({ id: kartu.id, disabled: !bolehUbah });
  const tenggat = useKonteksDeadline();

  return (
    <article
      ref={setNodeRef}
      data-testid={`kanban-card-${kartu.id}`}
      role="button"
      tabIndex={0}
      aria-label={`Buka detail kartu ${kartu.judul}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
      }}
      className={`cursor-pointer rounded-sm border border-default border-l-[3px] bg-panel p-3 shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] ${isDragging ? 'z-10 shadow-md' : ''}`}
      style={{
        borderLeftColor: WARNA_PRIORITAS[kartu.prioritas],
        transform: CSS.Transform.toString(transform),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`min-w-0 break-words font-semibold text-primary ${onPindah ? 'text-[15px]' : 'text-[13px]'}`}>{kartu.judul}</h3>
        {bolehUbah && !onPindah ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            data-testid={`kanban-drag-${kartu.id}`}
            aria-label={`Pindahkan kartu ${kartu.judul}`}
            className="flex size-[34px] shrink-0 items-center justify-center rounded-sm text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
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
          <DeadlineBadge
            deadline={kartu.deadline}
            ambang={tenggat.ambang}
            hariIni={tenggat.hariIni}
            selesai={kartu.kolom === 'DONE'}
          />
        ) : null}
        <span data-testid={`kanban-card-progress-${kartu.id}`} className="inline-flex items-center gap-1">
          <CheckSquare2 className="size-3.5" aria-hidden="true" />
          {kartu.checklist_selesai}/{kartu.checklist_total}
        </span>
      </div>
      <p className="mt-2 text-[10px] font-semibold tracking-wide text-secondary uppercase">
        Prioritas {kartu.prioritas.toLowerCase()}
      </p>
      {onPindah && bolehUbah ? (
        <label className="mt-3 flex items-center gap-2 text-[13px] text-secondary" onClick={(event) => event.stopPropagation()}>
          <span className="shrink-0">Status</span>
          <select
            data-testid={`kanban-pindah-${kartu.id}`}
            value={kartu.kolom}
            onChange={(event) => onPindah(event.target.value as KolomKanban)}
            onKeyDown={(event) => event.stopPropagation()}
            className="min-h-10 w-full min-w-0 rounded-md border border-default bg-panel px-2 text-[14px] text-primary"
          >
            {KOLOM_KANBAN.map((k) => (
              <option key={k.kode} value={k.kode}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  );
}
