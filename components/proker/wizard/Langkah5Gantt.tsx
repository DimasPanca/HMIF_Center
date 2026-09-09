'use client';

import { useState } from 'react';
import { CalendarRange, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  validasiLangkah,
  type DraftGantt,
  type DraftGanttGroup,
  type DraftGanttTask,
  type WizardDraft,
} from '@/lib/proker/wizard-state';

import type { OpsiPilihan, PatchWizard } from './types';

interface Langkah5GanttProps {
  draft: WizardDraft;
  pengurus: OpsiPilihan[];
  onUbah: (patch: PatchWizard) => void;
}

const FASE_AWAL: DraftGanttGroup[] = [
  { nama: 'Persiapan', tasks: [] },
  { nama: 'Pelaksanaan', tasks: [] },
  { nama: 'Evaluasi', tasks: [] },
];

export function Langkah5Gantt({ draft, onUbah, pengurus }: Langkah5GanttProps) {
  const gantt = draft.gantt ?? {};
  const groups = gantt.groups?.length ? gantt.groups : FASE_AWAL;
  const [faseAktif, setFaseAktif] = useState(0);
  const hasilValidasi = validasiLangkah(draft, 5);

  function ubahGantt(patch: Partial<DraftGantt>) {
    onUbah({ gantt: { ...gantt, ...patch } });
  }

  function ubahGroup(indeks: number, patch: Partial<DraftGanttGroup>) {
    ubahGantt({
      groups: groups.map((item, posisi) => (posisi === indeks ? { ...item, ...patch } : item)),
    });
  }

  function ubahTask(indeksGroup: number, indeksTask: number, patch: Partial<DraftGanttTask>) {
    const group = groups[indeksGroup]!;
    ubahGroup(indeksGroup, {
      tasks: (group.tasks ?? []).map((task, posisi) =>
        posisi === indeksTask ? { ...task, ...patch } : task,
      ),
    });
  }

  function tambahTask() {
    const indeks = Math.min(faseAktif, groups.length - 1);
    const group = groups[indeks]!;
    ubahGroup(indeks, { tasks: [...(group.tasks ?? []), { progres: 0 }] });
  }

  function hapusTask(indeksGroup: number, indeksTask: number) {
    const group = groups[indeksGroup]!;
    ubahGroup(indeksGroup, {
      tasks: (group.tasks ?? []).filter((_, posisi) => posisi !== indeksTask),
    });
  }

  const jumlahTask = groups.reduce((jumlah, group) => jumlah + (group.tasks?.length ?? 0), 0);

  return (
    <section aria-labelledby="judul-langkah-5" className="space-y-6">
      <header>
        <h2 id="judul-langkah-5" className="text-lg font-semibold text-primary">
          Rencana Gantt proker
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">
          Susun minimal satu task ke fase Persiapan, Pelaksanaan, atau Evaluasi.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-judul-gantt">Judul Gantt</Label>
          <Input
            id="wizard-judul-gantt"
            maxLength={200}
            placeholder={`Timeline ${draft.nama || 'program kerja'}`}
            value={gantt.judul ?? ''}
            onChange={(event) => ubahGantt({ judul: event.target.value, groups })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-fase-task">Tambahkan ke fase</Label>
          <Select
            id="wizard-fase-task"
            value={String(faseAktif)}
            placeholder={null}
            onChange={(event) => setFaseAktif(Number(event.target.value))}
          >
            {groups.map((group, indeks) => (
              <option key={`${group.nama}-${indeks}`} value={indeks}>
                {group.nama}
              </option>
            ))}
          </Select>
        </div>
        <Button data-testid="wizard-gantt-task-tambah" onClick={tambahTask}>
          <Plus aria-hidden="true" />
          Tambah task
        </Button>
      </div>

      <p className="text-[12px] font-medium text-secondary tabular-nums">
        {jumlahTask} task dalam {groups.length} fase
      </p>

      <div className="space-y-4">
        {groups.map((group, indeksGroup) => (
          <article key={`${group.nama}-${indeksGroup}`} className="rounded-sm border border-default bg-panel">
            <header className="flex items-center gap-2 border-b border-subtle bg-subtle px-4 py-3">
              <CalendarRange className="size-4 text-tertiary" aria-hidden="true" />
              <h3 className="text-[14px] font-semibold text-primary">{group.nama}</h3>
              <span className="ml-auto text-[12px] text-secondary tabular-nums">
                {group.tasks?.length ?? 0} task
              </span>
            </header>

            {!group.tasks?.length ? (
              <p className="p-4 text-[12px] text-secondary">Belum ada task pada fase ini.</p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {group.tasks.map((task, indeksTask) => (
                  <div key={indeksTask} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[12px] font-semibold text-secondary tabular-nums">
                        Task {indeksTask + 1}
                      </p>
                      <Button
                        variant="ghost"
                        className="text-danger"
                        aria-label={`Hapus task ${task.nama || indeksTask + 1}`}
                        onClick={() => hapusTask(indeksGroup, indeksTask)}
                      >
                        <Trash2 aria-hidden="true" />
                        Hapus
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-1.5 md:col-span-3">
                        <Label htmlFor={`wizard-task-nama-${indeksGroup}-${indeksTask}`} required>
                          Nama task
                        </Label>
                        <Input
                          id={`wizard-task-nama-${indeksGroup}-${indeksTask}`}
                          data-testid="wizard-field-task-nama"
                          maxLength={200}
                          placeholder="Contoh: Rapat teknis"
                          value={task.nama ?? ''}
                          onChange={(event) =>
                            ubahTask(indeksGroup, indeksTask, { nama: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`wizard-task-mulai-${indeksGroup}-${indeksTask}`} required>
                          Mulai
                        </Label>
                        <Input
                          id={`wizard-task-mulai-${indeksGroup}-${indeksTask}`}
                          data-testid="wizard-field-task-mulai"
                          type="date"
                          value={task.tanggal_mulai ?? ''}
                          onChange={(event) =>
                            ubahTask(indeksGroup, indeksTask, {
                              tanggal_mulai: event.target.value || undefined,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`wizard-task-selesai-${indeksGroup}-${indeksTask}`} required>
                          Selesai
                        </Label>
                        <Input
                          id={`wizard-task-selesai-${indeksGroup}-${indeksTask}`}
                          data-testid="wizard-field-task-selesai"
                          type="date"
                          value={task.tanggal_selesai ?? ''}
                          onChange={(event) =>
                            ubahTask(indeksGroup, indeksTask, {
                              tanggal_selesai: event.target.value || undefined,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`wizard-task-pj-${indeksGroup}-${indeksTask}`}>
                          Penanggung jawab
                        </Label>
                        <Select
                          id={`wizard-task-pj-${indeksGroup}-${indeksTask}`}
                          value={task.assignee_id ?? ''}
                          placeholder="Belum ditentukan"
                          onChange={(event) =>
                            ubahTask(indeksGroup, indeksTask, {
                              assignee_id: event.target.value || undefined,
                            })
                          }
                        >
                          {pengurus.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nama}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <label className="inline-flex min-h-[34px] items-center gap-2 text-[13px] text-secondary">
                      <Checkbox
                        checked={task.is_milestone ?? false}
                        onChange={(event) =>
                          ubahTask(indeksGroup, indeksTask, {
                            is_milestone: event.target.checked,
                          })
                        }
                      />
                      Tandai sebagai milestone
                    </label>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {!hasilValidasi.ok ? (
        <div role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3">
          <p className="text-[13px] font-semibold text-danger">Lengkapi rencana Gantt:</p>
          <ul className="mt-1 list-disc pl-5 text-[12px] leading-5 text-danger">
            {hasilValidasi.isu.map((isu, indeks) => (
              <li key={`${isu.path}-${indeks}`}>{isu.pesan}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
