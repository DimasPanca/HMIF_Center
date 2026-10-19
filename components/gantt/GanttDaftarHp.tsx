'use client';

import Link from 'next/link';
import { ChevronDown, Diamond } from 'lucide-react';
import * as React from 'react';

import type { GanttTaskVM, GanttViewModel } from '@/lib/gantt/types';
import { cn } from '@/lib/utils';

/**
 * Gantt versi HP (ADR-037): grup → kartu tugas tersusun vertikal. Setiap kartu
 * memuat tanggal, progres, dan bilah mini yang memetakan posisi tugas dalam
 * rentang seluruh timeline — selebar layar, tanpa gulir ke samping, huruf
 * ukuran normal. Ketuk kartu: editor membuka formulir tugas (`onTaskActivate`),
 * selain itu kartu membuka detail di tempat.
 */

const HARI = 86_400_000;
const fmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTahun = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function rentang(a: Date, b: Date): string {
  return a.getTime() === b.getTime() ? fmtTahun.format(a) : `${fmt.format(a)} – ${fmtTahun.format(b)}`;
}

function keadaan(t: GanttTaskVM, hariIni: Date): { label: string; nada: 'selesai' | 'terlambat' | 'jalan' | 'nanti' } {
  if (t.progress >= 100) return { label: 'Selesai', nada: 'selesai' };
  if (t.end.getTime() < hariIni.getTime()) return { label: 'Terlambat', nada: 'terlambat' };
  if (t.start.getTime() <= hariIni.getTime()) return { label: 'Berjalan', nada: 'jalan' };
  return { label: 'Belum mulai', nada: 'nanti' };
}

const NADA: Record<ReturnType<typeof keadaan>['nada'], string> = {
  selesai: 'bg-[var(--success-subtle)] text-[var(--success)]',
  terlambat: 'bg-[var(--danger-subtle)] text-[var(--danger)]',
  jalan: 'bg-[var(--primary-subtle)] text-[var(--primary)]',
  nanti: 'bg-muted text-secondary',
};

function BilahPosisi({ awal, akhir, mulai, selesai, warna, hariIni }: { awal: number; akhir: number; mulai: Date; selesai: Date; warna: string; hariIni: Date }) {
  const total = Math.max(akhir - awal, HARI);
  const kiri = Math.min(Math.max(((mulai.getTime() - awal) / total) * 100, 0), 100);
  const lebar = Math.max(((selesai.getTime() + HARI - mulai.getTime()) / total) * 100, 1.5);
  const tanda = ((hariIni.getTime() - awal) / total) * 100;
  return (
    <span className="relative block h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span className="absolute inset-y-0 rounded-full" style={{ left: `${kiri}%`, width: `${Math.min(lebar, 100 - kiri)}%`, background: warna }} />
      {tanda >= 0 && tanda <= 100 ? <span className="absolute inset-y-[-2px] w-0.5 bg-[var(--primary)]" style={{ left: `${tanda}%` }} /> : null}
    </span>
  );
}

export function GanttDaftarHp({
  model,
  onTaskActivate,
  labelHariIni = 'Hari ini',
}: {
  model: GanttViewModel;
  onTaskActivate?: (task: GanttTaskVM) => void;
  labelHariIni?: string;
}) {
  const awal = model.timeline.start.getTime();
  const akhir = model.timeline.end.getTime();
  const [tertutup, setTertutup] = React.useState<ReadonlySet<string>>(() => new Set(model.groups.filter((g) => g.collapsed).map((g) => g.id)));
  const [terbuka, setTerbuka] = React.useState<string | null>(null);

  if (model.groups.length === 0) {
    return (
      <p data-testid="gantt-daftar-hp" data-kosong="" className="rounded-md border border-dashed border-default px-3 py-6 text-center text-[14px] text-tertiary">
        Belum ada tugas di timeline ini.
      </p>
    );
  }

  return (
    <div data-testid="gantt-daftar-hp" className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-secondary">
        <span>
          Rentang {fmtTahun.format(model.timeline.start)} – {fmtTahun.format(model.timeline.end)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-[var(--primary)]" aria-hidden="true" /> {labelHariIni}
        </span>
      </p>
      {model.groups.map((g) => {
        const tutup = tertutup.has(g.id);
        const ringkas = g.bars[0];
        return (
          <section key={g.id} className="overflow-hidden rounded-md border border-default bg-panel" aria-label={g.label}>
            <button
              type="button"
              aria-expanded={!tutup}
              onClick={() =>
                setTertutup((s) => {
                  const n = new Set(s);
                  if (n.has(g.id)) n.delete(g.id);
                  else n.add(g.id);
                  return n;
                })
              }
              className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              <span className="size-3 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold break-words">{g.label}</span>
                <span className="block text-[12.5px] text-secondary">
                  {g.tasks.length} tugas{ringkas ? ` · ${rentang(ringkas.start, ringkas.end)}` : ''}
                  {g.sublabel ? ` · ${g.sublabel}` : ''}
                </span>
              </span>
              <ChevronDown className={cn('size-5 shrink-0 text-tertiary transition-transform', tutup && '-rotate-90')} aria-hidden="true" />
            </button>
            {!tutup ? (
              <ul className="divide-y divide-[var(--border-subtle)] border-t border-subtle">
                {g.tasks.map((t) => {
                  const k = keadaan(t, model.today);
                  const detail = terbuka === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        data-testid={`gantt-hp-task-${t.id}`}
                        aria-expanded={onTaskActivate ? undefined : detail}
                        onClick={() => (onTaskActivate ? onTaskActivate(t) : setTerbuka((x) => (x === t.id ? null : t.id)))}
                        className="block w-full px-3 py-3 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 text-[14.5px] font-medium break-words">
                            {t.isMilestone ? <Diamond className="mr-1 inline size-3.5 align-[-2px]" aria-label="Milestone" /> : null}
                            {t.label}
                          </span>
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium', NADA[k.nada])}>{k.label}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] text-secondary">
                          <span>{rentang(t.start, t.end)}</span>
                          {t.assigneeName ? <span className="break-words">· {t.assigneeName}</span> : null}
                        </span>
                        <span className="mt-2 flex items-center gap-2">
                          <BilahPosisi awal={awal} akhir={akhir} mulai={t.start} selesai={t.end} warna={t.color || g.color} hariIni={model.today} />
                          <span className="w-10 shrink-0 text-right text-[12.5px] font-medium tabular-nums">{Math.round(t.progress)}%</span>
                        </span>
                      </button>
                      {detail && (t.hariHStart || t.meta.prokerId) ? (
                        <div className="space-y-1 px-3 pb-3 text-[12.5px] text-secondary">
                          {t.hariHStart ? <p>Hari-H: {rentang(t.hariHStart, t.hariHEnd ?? t.hariHStart)}</p> : null}
                          {t.meta.prokerId ? (
                            <Link href={`/proker/${t.meta.prokerId}`} className="inline-flex min-h-9 items-center text-[13px] font-medium text-[var(--primary)] underline-offset-2 hover:underline">
                              Buka detail program kerja →
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
