'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ClipboardCheck, LayoutTemplate, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ChecklistItem } from '@/components/kanban/ChecklistItem';
import { TemplateChecklistDialog } from '@/components/kanban/TemplateChecklistDialog';
import type { ItemChecklistKanban, KartuKanban } from '@/components/kanban/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface ResponsApi<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

function hitungSelesai(items: ItemChecklistKanban[]) {
  return items.filter((item) => item.selesai).length;
}

export function ChecklistPanel({
  kartu,
  bolehUbah,
  pengurus,
  onClose,
  onProgressChange,
}: {
  kartu: KartuKanban;
  bolehUbah: boolean;
  pengurus: { id: string; nama: string }[];
  onClose: () => void;
  onProgressChange: (selesai: number, total: number) => void;
}) {
  const [items, setItems] = useState<ItemChecklistKanban[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [pesan, setPesan] = useState<string | null>(null);
  const [teks, setTeks] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [menambah, setMenambah] = useState(false);
  const [sedangMengubah, setSedangMengubah] = useState<string | null>(null);
  const [modeTemplate, setModeTemplate] = useState<'simpan' | 'terapkan' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function pasangItems(berikut: ItemChecklistKanban[]) {
    setItems(berikut);
    onProgressChange(hitungSelesai(berikut), berikut.length);
  }

  useEffect(() => {
    let aktif = true;
    void fetch(`/api/kanban/${kartu.id}/checklist`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as ResponsApi<ItemChecklistKanban[]>;
        if (!response.ok || !body.ok || !body.data) {
          throw new Error(body.error?.message ?? 'Checklist belum dapat dimuat.');
        }
        if (aktif) {
          setItems(body.data);
          onProgressChange(hitungSelesai(body.data), body.data.length);
        }
      })
      .catch((error: unknown) => {
        if (aktif) setPesan(error instanceof Error ? error.message : 'Checklist belum dapat dimuat.');
      })
      .finally(() => {
        if (aktif) setMemuat(false);
      });
    return () => {
      aktif = false;
    };
  }, [kartu.id, onProgressChange]);

  const selesai = useMemo(() => hitungSelesai(items), [items]);
  const persen = items.length === 0 ? 0 : Math.round((selesai / items.length) * 100);

  async function toggle(item: ItemChecklistKanban) {
    const sebelumnya = items;
    const optimistik = items.map((entry) =>
      entry.id === item.id ? { ...entry, selesai: !entry.selesai } : entry,
    );
    setPesan(null);
    setSedangMengubah(item.id);
    pasangItems(optimistik);
    try {
      const response = await fetch(`/api/kanban/${kartu.id}/checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selesai: !item.selesai }),
      });
      const body = (await response.json()) as ResponsApi<ItemChecklistKanban>;
      if (!response.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? 'Checklist gagal diperbarui.');
      }
      pasangItems(optimistik.map((entry) => entry.id === item.id ? body.data! : entry));
    } catch (error) {
      pasangItems(sebelumnya);
      setPesan(error instanceof Error ? error.message : 'Checklist gagal diperbarui.');
    } finally {
      setSedangMengubah(null);
    }
  }

  async function tambah(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPesan(null);
    setMenambah(true);
    try {
      const response = await fetch(`/api/kanban/${kartu.id}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teks,
          assignee_id: assigneeId || null,
          deadline: deadline || null,
        }),
      });
      const body = (await response.json()) as ResponsApi<ItemChecklistKanban>;
      if (!response.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? 'Item checklist gagal ditambahkan.');
      }
      pasangItems([...items, body.data]);
      setTeks('');
      setAssigneeId('');
      setDeadline('');
    } catch (error) {
      setPesan(error instanceof Error ? error.message : 'Item checklist gagal ditambahkan.');
    } finally {
      setMenambah(false);
    }
  }

  async function selesaiDrag(event: DragEndEvent) {
    if (!bolehUbah || !event.over || event.active.id === event.over.id) return;
    const lama = items.findIndex((item) => item.id === event.active.id);
    const baru = items.findIndex((item) => item.id === event.over?.id);
    if (lama < 0 || baru < 0) return;

    const sebelumnya = items;
    const berikut = arrayMove(items, lama, baru).map((item, urutan) => ({ ...item, urutan }));
    pasangItems(berikut);
    setPesan(null);
    try {
      const response = await fetch(`/api/kanban/${kartu.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urutan: berikut.map((item) => item.id) }),
      });
      const body = (await response.json()) as ResponsApi<ItemChecklistKanban[]>;
      if (!response.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? 'Urutan checklist gagal disimpan.');
      }
      pasangItems(body.data);
    } catch (error) {
      pasangItems(sebelumnya);
      setPesan(error instanceof Error ? error.message : 'Urutan checklist gagal disimpan.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-testid="checklist-panel" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kartu.judul}</DialogTitle>
          <DialogDescription>{kartu.proker_nama ?? 'Tugas departemen'} · Checklist kartu</DialogDescription>
        </DialogHeader>

        <section aria-label="Progres checklist" className="space-y-2 rounded-sm border border-default bg-subtle p-3">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="inline-flex items-center gap-2 font-medium text-primary">
              <ClipboardCheck aria-hidden="true" className="size-4" />
              Progres checklist
            </span>
            <span data-testid="checklist-progress" className="font-semibold tabular-nums text-primary">
              {selesai}/{items.length}
            </span>
          </div>
          <div
            data-testid="checklist-progress-bar"
            role="progressbar"
            aria-label="Progres checklist"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={persen}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-fast motion-reduce:transition-none" style={{ width: `${persen}%` }} />
          </div>
        </section>

        {pesan ? <p role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[12px] text-danger">{pesan}</p> : null}
        {memuat ? <p role="status" className="text-[13px] text-secondary">Memuat checklist…</p> : null}

        {!memuat ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void selesaiDrag(event)}>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {items.map((item) => (
                  <ChecklistItem
                    key={item.id}
                    item={item}
                    bolehUbah={bolehUbah}
                    sedangMengubah={sedangMengubah === item.id}
                    onToggle={(entry) => void toggle(entry)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : null}

        {!memuat && items.length === 0 ? (
          <p className="rounded-sm border border-dashed border-default p-4 text-center text-[13px] text-secondary">
            Checklist masih kosong.
          </p>
        ) : null}

        {bolehUbah ? (
          <form onSubmit={(event) => void tambah(event)} className="space-y-3 border-t border-default pt-4">
            <div className="space-y-1">
              <Label htmlFor="checklist-tambah-teks">Item baru</Label>
              <Input
                id="checklist-tambah-teks"
                data-testid="checklist-tambah-teks"
                value={teks}
                maxLength={500}
                required
                onChange={(event) => setTeks(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="checklist-tambah-assignee">Penanggung jawab (opsional)</Label>
                <Select id="checklist-tambah-assignee" value={assigneeId} placeholder={null} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Belum ditugaskan</option>
                  {pengurus.map((orang) => <option key={orang.id} value={orang.id}>{orang.nama}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="checklist-tambah-deadline">Deadline (opsional)</Label>
                <Input id="checklist-tambah-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" data-testid="checklist-template-simpan" disabled={items.length === 0} onClick={() => setModeTemplate('simpan')}>
                  <LayoutTemplate aria-hidden="true" />Simpan sebagai template
                </Button>
                <Button type="button" variant="secondary" data-testid="checklist-template-dialog" onClick={() => setModeTemplate('terapkan')}>
                  Gunakan template
                </Button>
              </div>
              <Button type="submit" data-testid="checklist-tambah-submit" loading={menambah}>
                <Plus aria-hidden="true" />Tambah item
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>

      {modeTemplate ? (
        <TemplateChecklistDialog
          cardId={kartu.id}
          mode={modeTemplate}
          onClose={() => setModeTemplate(null)}
          onApplied={pasangItems}
        />
      ) : null}
    </Dialog>
  );
}
