'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CardDialog } from '@/components/kanban/CardDialog';
import { KanbanKolom } from '@/components/kanban/KanbanKolom';
import { KOLOM_KANBAN, type KartuKanban, type KolomKanban } from '@/components/kanban/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ToastProvider, useToast } from '@/components/ui/toast';

interface ResponsKanban {
  ok: boolean;
  data?: KartuKanban[];
  error?: { message?: string };
}

interface BoardProps {
  departemenId: string;
  bolehUbah: boolean;
  daftarProker: { id: string; nama: string }[];
  pengurus: { id: string; nama: string }[];
}

function Board({ departemenId, bolehUbah, daftarProker, pengurus }: BoardProps) {
  const toast = useToast();
  const [kartu, setKartu] = useState<KartuKanban[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [pesan, setPesan] = useState<string | null>(null);
  const [dialogTerbuka, setDialogTerbuka] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterProker, setFilterProker] = useState('');
  const [filterPrioritas, setFilterPrioritas] = useState('');
  const [filterDeadline, setFilterDeadline] = useState('');

  const muat = useCallback(async () => {
    const response = await fetch(`/api/kanban?departemen_id=${encodeURIComponent(departemenId)}`, {
      cache: 'no-store',
    });
    const body = (await response.json()) as ResponsKanban;
    if (!response.ok || !body.ok || !Array.isArray(body.data)) {
      throw new Error(body.error?.message ?? 'Kanban belum dapat dimuat.');
    }
    setKartu(body.data);
  }, [departemenId]);

  useEffect(() => {
    let aktif = true;
    void muat()
      .catch((error: unknown) => {
        if (aktif) setPesan(error instanceof Error ? error.message : 'Kanban belum dapat dimuat.');
      })
      .finally(() => {
        if (aktif) setMemuat(false);
      });
    return () => {
      aktif = false;
    };
  }, [muat]);

  const tersaring = useMemo(
    () =>
      kartu.filter(
        (item) =>
          (!filterAssignee || item.assignee_id === filterAssignee) &&
          (!filterProker || item.proker_id === filterProker) &&
          (!filterPrioritas || item.prioritas === filterPrioritas) &&
          (!filterDeadline || (item.deadline !== null && item.deadline <= filterDeadline)),
      ),
    [filterAssignee, filterProker, filterPrioritas, filterDeadline, kartu],
  );
  const assignee = useMemo(
    () => [...new Map(kartu.filter((item) => item.assignee_id).map((item) => [item.assignee_id!, item.assignee_nama])).entries()],
    [kartu],
  );
  const proker = useMemo(
    () => [...new Map(kartu.filter((item) => item.proker_id).map((item) => [item.proker_id!, item.proker_nama])).entries()],
    [kartu],
  );

  const koordinatKeyboard = useCallback<KeyboardCoordinateGetter>(
    (event, context) => {
      if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
        const sumber = kartu.find((item) => item.id === String(context.active));
        if (sumber) {
          const indeks = KOLOM_KANBAN.findIndex((item) => item.kode === sumber.kolom);
          const berikut = KOLOM_KANBAN[indeks + (event.code === 'ArrowRight' ? 1 : -1)];
          const tujuan = context.context.droppableContainers.get(`kolom-${berikut?.kode}`);
          const rect = tujuan?.rect.current;
          if (rect) return { x: rect.left + rect.width / 2, y: rect.top + Math.min(90, rect.height / 2) };
        }
      }
      return sortableKeyboardCoordinates(event, context);
    },
    [kartu],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: koordinatKeyboard }),
  );

  async function geser(id: string, kolomBaru: KolomKanban) {
    const sebelumnya = kartu.find((item) => item.id === id);
    if (!sebelumnya || sebelumnya.kolom === kolomBaru) return;
    const urutan = kartu.filter((item) => item.kolom === kolomBaru).length;
    setKartu((daftar) => daftar.map((item) => item.id === id ? { ...item, kolom: kolomBaru, urutan } : item));
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-testid="kanban-drag-${id}"]`)?.focus();
    });
    try {
      const response = await fetch(`/api/kanban/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kolom: kolomBaru, urutan }),
      });
      const body = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Pemindahan kartu ditolak.');
    } catch (error) {
      const alasan = error instanceof Error ? error.message : 'Pemindahan kartu ditolak.';
      setKartu((daftar) => daftar.map((item) => item.id === id ? sebelumnya : item));
      toast.error({ description: alasan, suggestion: 'Periksa izin atau coba lagi.' });
    } finally {
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(`[data-testid="kanban-drag-${id}"]`)?.focus();
      });
    }
  }

  function selesaiDrag(event: DragEndEvent) {
    if (!bolehUbah || !event.over) return;
    const id = String(event.active.id);
    const targetId = String(event.over.id);
    const target = targetId.startsWith('kolom-')
      ? targetId.slice('kolom-'.length)
      : kartu.find((item) => item.id === targetId)?.kolom;
    if (!KOLOM_KANBAN.some((item) => item.kode === target)) return;
    void geser(id, target as KolomKanban);
  }

  return (
    <main data-testid="kanban-board" className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Departemen</p><h1 className="text-2xl font-semibold text-primary">Kanban pekerjaan</h1></div>
        {bolehUbah ? <Button onClick={() => setDialogTerbuka(true)}><Plus aria-hidden="true" />Tambah kartu</Button> : <p className="text-[12px] text-secondary">Akses baca saja</p>}
      </div>
      <div className="grid gap-2 rounded-md border border-default bg-panel p-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="kanban-filter-assignee">Penanggung jawab</Label><Select id="kanban-filter-assignee" value={filterAssignee} placeholder={null} onChange={(event) => setFilterAssignee(event.target.value)}><option value="">Semua pengurus</option>{assignee.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="kanban-filter-proker">Proker</Label><Select id="kanban-filter-proker" value={filterProker} placeholder={null} onChange={(event) => setFilterProker(event.target.value)}><option value="">Semua proker</option>{proker.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="kanban-filter-prioritas">Prioritas</Label><Select id="kanban-filter-prioritas" value={filterPrioritas} placeholder={null} onChange={(event) => setFilterPrioritas(event.target.value)}><option value="">Semua prioritas</option>{['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS'].map((nilai) => <option key={nilai} value={nilai}>{nilai}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="kanban-filter-deadline">Deadline</Label><Input id="kanban-filter-deadline" type="date" value={filterDeadline} onChange={(event) => setFilterDeadline(event.target.value)} /></div>
      </div>
      {pesan ? <div role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] text-danger">{pesan}<Button type="button" variant="ghost" onClick={() => { setPesan(null); void muat().catch(() => setPesan('Kanban belum dapat dimuat.')); }}><RotateCcw aria-hidden="true" />Coba lagi</Button></div> : null}
      {memuat ? <p role="status" className="text-[13px] text-secondary">Memuat kartu…</p> : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={selesaiDrag}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KOLOM_KANBAN.map(({ kode, label }) => (
            <KanbanKolom key={kode} kode={kode} label={label} kartu={tersaring.filter((item) => item.kolom === kode)} bolehUbah={bolehUbah} />
          ))}
        </div>
      </DndContext>
      {dialogTerbuka ? <CardDialog departemenId={departemenId} daftarProker={daftarProker} pengurus={pengurus} onClose={() => setDialogTerbuka(false)} onSaved={() => { setDialogTerbuka(false); void muat(); }} /> : null}
    </main>
  );
}

export function KanbanBoard(props: BoardProps) {
  return <ToastProvider><Board {...props} /></ToastProvider>;
}
