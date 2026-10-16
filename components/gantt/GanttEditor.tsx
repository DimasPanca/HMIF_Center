'use client';

/**
 * Editor Gantt empat level (T-078): Departemen, Proker, Ketua Pelaksana,
 * Divisi — semuanya memakai `GanttChart` yang SAMA dengan Master Gantt
 * (kontrak #1, klausa "Jangan"); yang berbeda hanya data & hak.
 *
 * - Drag bar menggeser tanggal (snap hari), tepi bar mengubah durasi —
 *   optimistis, dikembalikan bila server menolak.
 * - Drag & tombol tulis mati bila `hak.tulis`/`hak.tambah` palsu; server
 *   tetap menegakkan hak yang sama (INV-01/02).
 * - Kanal `gantt:{chart_id}`: perubahan task/grup oleh orang lain memicu
 *   pemuatan ulang data chart (kontrak #5).
 * - `chartId = null` → mode lokal (harness e2e): mutasi hanya di memori.
 *
 * Test id: gantt-editor-root (data-editor-level, data-editor-izin),
 * gantt-task-tambah, gantt-grup-tambah, gantt-editor-galat.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { FolderPlus, Plus } from 'lucide-react';
import * as React from 'react';

import { GanttChart } from '@/components/gantt/GanttChart';
import { GanttExport } from '@/components/gantt/GanttExport';
import { ScaleSwitcher } from '@/components/gantt/ScaleSwitcher';
import { GrupForm, TaskForm, type GrupIsian, type TaskIsian } from '@/components/gantt/TaskForm';
import { Button } from '@/components/ui/button';
import { LABEL_LEVEL, SKALA_KE_GEOMETRI, dariHari, hasilGeser, keHari, type Dependensi, type Level, type ModeGeser, type Skala } from '@/lib/gantt/skema';
import type { DataChart, TaskData } from '@/lib/gantt/service';
import { transformGanttRows } from '@/lib/gantt/transform';
import { kanalGantt } from '@/lib/realtime/channels';

const HARI_INI = () => new Date().toISOString().slice(0, 10);

type Respons<T> = { ok: true; data: T } | { ok: false; error?: { message?: string } };

async function panggil<T>(url: string, init?: RequestInit): Promise<{ data?: T; galat?: string }> {
  try {
    const r = await fetch(url, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined });
    const b = (await r.json().catch(() => null)) as Respons<T> | null;
    if (!r.ok || !b?.ok) return { galat: (b && !b.ok && b.error?.message) || 'Permintaan gagal.' };
    return { data: b.data };
  } catch {
    return { galat: 'Tidak dapat menghubungi server. Coba lagi.' };
  }
}

function pendahulu(deps: Dependensi[], taskId: string): string[] {
  return deps.filter((d) => d.ke === taskId).map((d) => d.dari);
}

export function GanttEditor({
  awal,
  chartId,
  hariIni,
  supabaseUrl = null,
  supabaseKey = null,
}: {
  awal: DataChart;
  chartId: string | null;
  /** `YYYY-MM-DD`; tetap pada harness supaya gambar deterministik. */
  hariIni?: string;
  supabaseUrl?: string | null;
  supabaseKey?: string | null;
}) {
  const [data, setData] = React.useState(awal);
  const [skala, setSkala] = React.useState<Skala>('minggu');
  const [form, setForm] = React.useState<TaskIsian | null>(null);
  const [grupBuka, setGrupBuka] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const { hak } = data;
  const level: Level = data.chart.level;
  const today = hariIni ?? HARI_INI();

  const muatUlang = React.useCallback(async () => {
    if (!chartId) return;
    const r = await panggil<DataChart>(`/api/gantt/${chartId}`);
    if (r.data) setData(r.data);
  }, [chartId]);

  // Realtime: perubahan task/grup chart ini oleh siapa pun → muat ulang.
  React.useEffect(() => {
    if (!chartId || !supabaseUrl || !supabaseKey) return;
    const klien = createBrowserClient(supabaseUrl, supabaseKey);
    let dibuang = false;
    let channel: RealtimeChannel | null = null;
    let tunda: ReturnType<typeof setTimeout> | null = null;
    const segarkan = () => {
      if (tunda) clearTimeout(tunda);
      tunda = setTimeout(() => void muatUlang(), 300);
    };
    void (async () => {
      const { data: s } = await klien.auth.getSession();
      if (dibuang) return;
      void klien.realtime.setAuth(s.session?.access_token ?? null);
      channel = klien
        .channel(kanalGantt(chartId))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gantt_task', filter: `chart_id=eq.${chartId}` }, segarkan)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gantt_group', filter: `chart_id=eq.${chartId}` }, segarkan)
        .subscribe();
    })();
    const { data: l } = klien.auth.onAuthStateChange((_e, sesi) => void klien.realtime.setAuth(sesi?.access_token ?? null));
    return () => {
      dibuang = true;
      if (tunda) clearTimeout(tunda);
      l.subscription.unsubscribe();
      if (channel) void klien.removeChannel(channel);
    };
  }, [chartId, supabaseUrl, supabaseKey, muatUlang]);

  const model = React.useMemo(() => {
    const semua = data.task.flatMap((t) => [keHari(t.tanggal_mulai), keHari(t.tanggal_selesai)]);
    const h = keHari(today);
    const awalHari = semua.length ? Math.min(...semua, h) - 7 : h - 7;
    const akhirHari = semua.length ? Math.max(...semua, h) + 21 : h + 60;
    return transformGanttRows({
      groupRows: data.grup,
      taskRows: data.task.map((t) => ({ ...t, depends_on: pendahulu(data.dependensi, t.id) })),
      scale: SKALA_KE_GEOMETRI[skala],
      range: { start: new Date(`${dariHari(awalHari)}T00:00:00.000Z`), end: new Date(`${dariHari(akhirHari)}T00:00:00.000Z`) },
      today: new Date(`${today}T00:00:00.000Z`),
    });
  }, [data, skala, today]);

  const geser = React.useCallback(
    async (taskId: string, mode: ModeGeser, hari: number) => {
      const t = data.task.find((x) => x.id === taskId);
      if (!t || !hak.tulis) return;
      const baru = hasilGeser(t.tanggal_mulai, t.tanggal_selesai, mode, hari);
      if (baru.mulai === t.tanggal_mulai && baru.selesai === t.tanggal_selesai) return;
      const sebelum = data.task;
      setData((d) => ({ ...d, task: d.task.map((x) => (x.id === taskId ? { ...x, tanggal_mulai: baru.mulai, tanggal_selesai: baru.selesai } : x)) }));
      setGalat(null);
      if (!chartId) return;
      const r = await panggil(`/api/gantt/task/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ tanggal_mulai: baru.mulai, tanggal_selesai: baru.selesai }),
      });
      if (r.galat) {
        setData((d) => ({ ...d, task: sebelum }));
        setGalat(r.galat);
      }
    },
    [chartId, data.task, hak.tulis],
  );

  async function simpanTask(isian: TaskIsian): Promise<string | null> {
    const { id, ...isi } = isian;
    if (!chartId) {
      const tid = id ?? crypto.randomUUID();
      const baris: TaskData = { id: tid, ...isi, urutan: data.task.length, assignee_name: null };
      setData((d) => ({
        ...d,
        task: id ? d.task.map((x) => (x.id === id ? { ...x, ...baris, urutan: x.urutan } : x)) : [...d.task, baris],
        dependensi: [...d.dependensi.filter((x) => x.ke !== tid), ...isi.bergantung_pada.map((dari) => ({ dari, ke: tid }))],
      }));
      return null;
    }
    const r = id
      ? await panggil(`/api/gantt/task/${id}`, { method: 'PATCH', body: JSON.stringify(isi) })
      : await panggil(`/api/gantt/${chartId}`, { method: 'POST', body: JSON.stringify({ jenis: 'task', data: isi }) });
    if (r.galat) return r.galat;
    await muatUlang();
    return null;
  }

  async function hapusTask(id: string): Promise<string | null> {
    if (!chartId) {
      setData((d) => ({ ...d, task: d.task.filter((x) => x.id !== id), dependensi: d.dependensi.filter((x) => x.dari !== id && x.ke !== id) }));
      return null;
    }
    const r = await panggil(`/api/gantt/task/${id}`, { method: 'DELETE' });
    if (r.galat) return r.galat;
    await muatUlang();
    return null;
  }

  async function simpanGrup(isian: GrupIsian): Promise<string | null> {
    if (!chartId) {
      setData((d) => ({ ...d, grup: [...d.grup, { id: crypto.randomUUID(), ...isian, urutan: d.grup.length, collapsed: false }] }));
      return null;
    }
    const r = await panggil(`/api/gantt/${chartId}`, { method: 'POST', body: JSON.stringify({ jenis: 'grup', data: isian }) });
    if (r.galat) return r.galat;
    await muatUlang();
    return null;
  }

  function bukaTask(id: string) {
    const t = data.task.find((x) => x.id === id);
    if (!t) return;
    setForm({
      id: t.id,
      group_id: t.group_id,
      nama: t.nama,
      tanggal_mulai: t.tanggal_mulai,
      tanggal_selesai: t.tanggal_selesai,
      progres: t.progres,
      is_milestone: t.is_milestone,
      bergantung_pada: pendahulu(data.dependensi, t.id),
    });
  }

  function taskBaru() {
    const g = data.grup[0];
    if (!g) return;
    setForm({ group_id: g.id, nama: '', tanggal_mulai: today, tanggal_selesai: dariHari(keHari(today) + 6), progres: 0, is_milestone: false, bergantung_pada: [] });
  }

  return (
    <div
      ref={rootRef}
      className="grid gap-3"
      data-testid="gantt-editor-root"
      data-editor-level={level}
      data-editor-izin={hak.tulis ? 'tulis' : 'baca'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm bg-subtle px-2 py-1 text-xs font-medium text-secondary">Level {LABEL_LEVEL[level]}</span>
          <ScaleSwitcher nilai={skala} onChange={setSkala} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hak.tambah ? (
            <Button type="button" variant="secondary" onClick={() => setGrupBuka(true)} data-testid="gantt-grup-tambah">
              <FolderPlus className="size-4" aria-hidden="true" />
              Tambah grup
            </Button>
          ) : null}
          {/* Izin baca: tombol tidak dirender sama sekali, bukan disabled (INV-30, T-085). */}
          {hak.tambah ? (
            <Button
              type="button"
              onClick={taskBaru}
              disabled={data.grup.length === 0}
              title={data.grup.length === 0 ? 'Tambahkan grup terlebih dahulu.' : undefined}
              data-testid="gantt-task-tambah"
            >
              <Plus className="size-4" aria-hidden="true" />
              Tambah task
            </Button>
          ) : null}
          <GanttExport model={model} judul={data.chart.judul} svgRef={() => rootRef.current?.querySelector<SVGSVGElement>('[data-testid="gantt-svg"]') ?? null} />
        </div>
      </div>

      {galat ? (
        <p role="alert" data-testid="gantt-editor-galat" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] px-3 py-2 text-[13px] text-primary">
          {galat}
        </p>
      ) : null}
      {data.chart.arsip ? <p className="text-xs text-tertiary">Chart periode lain — hanya dapat dibaca.</p> : null}
      {hak.tambah && data.grup.length === 0 ? (
        <p className="text-[13px] text-secondary">Chart ini masih kosong. Mulai dengan menambah grup, lalu task di dalamnya.</p>
      ) : null}

      <GanttChart
        model={model}
        ariaLabel={`Gantt ${data.chart.judul}`}
        labelColumnTitle="Task"
        maxHeight={640}
        drag={{ aktif: hak.tulis, onGeser: (id, mode, hari) => void geser(id, mode, hari) }}
        onTaskActivate={(t) => bukaTask(t.id)}
      />

      {form ? (
        <TaskForm
          open
          onOpenChange={(b) => !b && setForm(null)}
          awal={form}
          grup={data.grup.map((g) => ({ id: g.id, nama: g.nama }))}
          task={data.task.map((t) => ({ id: t.id, nama: t.nama }))}
          bolehUbah={form.id ? hak.tulis : hak.tambah}
          bolehHapus={hak.hapus}
          onSimpan={simpanTask}
          onHapus={hapusTask}
        />
      ) : null}
      <GrupForm open={grupBuka} onOpenChange={setGrupBuka} onSimpan={simpanGrup} />
    </div>
  );
}
