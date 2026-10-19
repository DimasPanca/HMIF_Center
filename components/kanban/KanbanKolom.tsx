'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { KanbanCard } from '@/components/kanban/KanbanCard';
import type { KartuKanban, KolomKanban } from '@/components/kanban/types';

export function KanbanKolom({
  kode,
  label,
  kartu,
  bolehUbah,
  onOpenCard,
  penuh = false,
  onPindah,
}: {
  kode: KolomKanban;
  label: string;
  kartu: KartuKanban[];
  bolehUbah: boolean;
  onOpenCard: (kartu: KartuKanban) => void;
  /** Tampilan tab HP (ADR-037): satu kolom selebar layar. */
  penuh?: boolean;
  /** Tampilan tab HP: kartu dipindah lewat pilihan status, bukan seret. */
  onPindah?: (id: string, kolom: KolomKanban) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `kolom-${kode}` });
  return (
    <section
      ref={setNodeRef}
      data-testid={`kanban-column-${kode}`}
      className={`min-h-64 ${penuh ? 'w-full min-w-0' : 'min-w-[280px] flex-1'} rounded-sm border p-2 ${isOver ? 'border-[var(--border-focus)] bg-[var(--primary-subtle)]' : 'border-default bg-subtle'}`}
      aria-label={`Kolom ${label}`}
    >
      <h2 className="flex items-center justify-between px-1 py-2 text-[13px] font-semibold text-primary">
        <span>{label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-secondary">
          {kartu.length}
        </span>
      </h2>
      <SortableContext items={kartu.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {kartu.map((item) => (
          <KanbanCard
            key={item.id}
            kartu={item}
            bolehUbah={bolehUbah}
            onOpen={() => onOpenCard(item)}
            onPindah={onPindah ? (kolom) => onPindah(item.id, kolom) : undefined}
          />
          ))}
          {kartu.length === 0 ? (
            <p className="px-2 py-4 text-center text-[12px] text-secondary">Belum ada kartu</p>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}
