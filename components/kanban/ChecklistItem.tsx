'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, UserRound } from 'lucide-react';

import type { ItemChecklistKanban } from '@/components/kanban/types';
import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { useKonteksDeadline } from '@/components/shared/KonteksDeadline';
import { Checkbox } from '@/components/ui/checkbox';

export function ChecklistItem({
  item,
  bolehUbah,
  sedangMengubah,
  onToggle,
}: {
  item: ItemChecklistKanban;
  bolehUbah: boolean;
  sedangMengubah: boolean;
  onToggle: (item: ItemChecklistKanban) => void;
}) {
  const tenggat = useKonteksDeadline();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !bolehUbah });

  return (
    <li
      ref={setNodeRef}
      data-testid={`checklist-item-${item.id}`}
      className={`flex min-h-12 items-start gap-3 rounded-sm border border-default bg-panel p-3 ${isDragging ? 'z-10 shadow-md' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {bolehUbah ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          data-testid={`checklist-drag-${item.id}`}
          aria-label={`Ubah urutan ${item.teks}`}
          className="-m-2 flex size-[34px] shrink-0 items-center justify-center rounded-sm text-secondary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-[var(--border-focus)]"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center text-success" aria-hidden="true">
          {item.selesai ? <Check className="size-4" /> : null}
        </span>
      )}

      {bolehUbah ? (
        <Checkbox
          data-testid={`checklist-check-${item.id}`}
          aria-label={`Tandai ${item.teks} ${item.selesai ? 'belum selesai' : 'selesai'}`}
          checked={item.selesai}
          loading={sedangMengubah}
          onChange={() => onToggle(item)}
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <p
          data-testid={`checklist-teks-${item.id}`}
          className={`break-words text-[13px] text-primary ${item.selesai ? 'line-through opacity-70' : ''}`}
        >
          {item.teks}
        </p>
        {item.assignee_nama || item.deadline ? (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-secondary">
            {item.assignee_nama ? (
              <span data-testid={`checklist-assignee-${item.id}`} className="inline-flex items-center gap-1">
                <UserRound aria-hidden="true" className="size-3.5" />
                {item.assignee_nama}
              </span>
            ) : null}
            {item.deadline ? (
              <span data-testid={`checklist-deadline-${item.id}`}>
                <DeadlineBadge deadline={item.deadline} ambang={tenggat.ambang} hariIni={tenggat.hariIni} selesai={item.selesai} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
