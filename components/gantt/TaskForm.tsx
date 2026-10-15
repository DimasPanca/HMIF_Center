'use client';

/**
 * Form task & grup editor Gantt (T-078 #2–#3). Skema sama dengan server
 * (K-04). Penyimpanan diserahkan ke pemanggil (`onSimpan`) supaya editor
 * yang sama dapat bekerja ke API sungguhan maupun mode lokal harness.
 *
 * Test id: task-form, task-form-{nama|grup|mulai|selesai|progres|milestone},
 * task-form-dep-{id}, task-form-simpan, task-form-hapus, task-form-galat,
 * grup-form, grup-form-{nama|warna|pj}, grup-form-simpan.
 */

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SkemaGrupBaru, SkemaTaskBaru } from '@/lib/gantt/skema';

export interface TaskIsian {
  id?: string;
  group_id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  progres: number;
  is_milestone: boolean;
  bergantung_pada: string[];
}

export interface GrupIsian {
  nama: string;
  warna: string;
  pj_nama: string | null;
}

type Simpan<T> = (isian: T) => Promise<string | null>;

export function TaskForm({
  open,
  onOpenChange,
  awal,
  grup,
  task,
  bolehUbah,
  bolehHapus,
  onSimpan,
  onHapus,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  awal: TaskIsian;
  grup: { id: string; nama: string }[];
  /** Calon pendahulu (seluruh task chart). */
  task: { id: string; nama: string }[];
  bolehUbah: boolean;
  bolehHapus: boolean;
  onSimpan: Simpan<TaskIsian>;
  onHapus: (id: string) => Promise<string | null>;
}) {
  const [v, setV] = React.useState<TaskIsian>(awal);
  const [progres, setProgres] = React.useState(String(awal.progres));
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [yakin, setYakin] = React.useState(false);
  const id = React.useId();

  React.useEffect(() => {
    if (open) {
      setV(awal);
      setProgres(String(awal.progres));
      setGalat(null);
      setYakin(false);
    }
  }, [open, awal]);

  const ubah = <K extends keyof TaskIsian>(k: K, x: TaskIsian[K]) => setV((s) => ({ ...s, [k]: x }));
  const calon = task.filter((t) => t.id !== v.id);

  async function jalankan(fn: () => Promise<string | null>) {
    setProses(true);
    setGalat(null);
    const g = await fn();
    setProses(false);
    if (g) return setGalat(g);
    onOpenChange(false);
  }

  function simpan(e: React.FormEvent) {
    e.preventDefault();
    const p = SkemaTaskBaru.safeParse({ ...v, progres: progres.trim() === '' ? 0 : Number(progres) });
    if (!p.success) return setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
    void jalankan(() => onSimpan({ ...p.data, id: v.id }));
  }

  const terkunci = !bolehUbah || proses;

  return (
    <Dialog open={open} onOpenChange={(b) => !proses && onOpenChange(b)}>
      <DialogContent className="max-w-lg" data-testid="task-form">
        <form onSubmit={simpan} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{v.id ? (bolehUbah ? 'Ubah task' : 'Detail task') : 'Tambah task'}</DialogTitle>
            <DialogDescription>Bar dapat juga digeser langsung di chart; tepi bar mengubah durasi.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-nama`}>Nama task</Label>
              <Input id={`${id}-nama`} value={v.nama} maxLength={200} disabled={terkunci} onChange={(e) => ubah('nama', e.target.value)} data-testid="task-form-nama" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-grup`}>Grup</Label>
              <Select id={`${id}-grup`} placeholder={null} value={v.group_id} disabled={terkunci} onChange={(e) => ubah('group_id', e.target.value)} data-testid="task-form-grup">
                {grup.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nama}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-mulai`}>Mulai</Label>
                <Input id={`${id}-mulai`} type="date" value={v.tanggal_mulai} disabled={terkunci} onChange={(e) => ubah('tanggal_mulai', e.target.value)} data-testid="task-form-mulai" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-selesai`}>Selesai</Label>
                <Input id={`${id}-selesai`} type="date" value={v.tanggal_selesai} disabled={terkunci} onChange={(e) => ubah('tanggal_selesai', e.target.value)} data-testid="task-form-selesai" />
              </div>
            </div>
            <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-progres`}>Progres (%)</Label>
                <Input id={`${id}-progres`} inputMode="numeric" value={progres} maxLength={3} disabled={terkunci} onChange={(e) => setProgres(e.target.value)} data-testid="task-form-progres" />
              </div>
              <label className="flex h-9 items-center gap-2 text-[13px]">
                <Checkbox checked={v.is_milestone} disabled={terkunci} onChange={(e) => ubah('is_milestone', e.target.checked)} data-testid="task-form-milestone" />
                Milestone (penanda satu titik)
              </label>
            </div>
            {calon.length ? (
              <fieldset className="grid gap-1.5">
                <legend className="mb-1 text-[13px] font-medium text-primary">Menunggu selesainya (Finish-to-Start, opsional)</legend>
                <div className="grid max-h-36 gap-1 overflow-y-auto rounded-sm border border-default p-2">
                  {calon.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-[13px]">
                      <Checkbox
                        checked={v.bergantung_pada.includes(t.id)}
                        disabled={terkunci}
                        data-testid={`task-form-dep-${t.id}`}
                        onChange={(e) =>
                          ubah('bergantung_pada', e.target.checked ? [...v.bergantung_pada, t.id] : v.bergantung_pada.filter((x) => x !== t.id))
                        }
                      />
                      <span className="truncate">{t.nama}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </div>
          {galat ? (
            <p role="alert" data-testid="task-form-galat" className="text-[13px] text-danger">
              {galat}
            </p>
          ) : null}
          <DialogFooter className="sm:justify-between">
            {v.id && bolehHapus ? (
              yakin ? (
                <Button type="button" variant="danger" disabled={proses} onClick={() => void jalankan(() => onHapus(v.id!))} data-testid="task-form-hapus">
                  Ya, hapus task
                </Button>
              ) : (
                <Button type="button" variant="ghost" disabled={proses} onClick={() => setYakin(true)}>
                  Hapus
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={proses} onClick={() => onOpenChange(false)}>
                {bolehUbah ? 'Batal' : 'Tutup'}
              </Button>
              {bolehUbah ? (
                <Button type="submit" loading={proses} data-testid="task-form-simpan">
                  Simpan
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WARNA_GRUP = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#475569'];

export function GrupForm({ open, onOpenChange, onSimpan }: { open: boolean; onOpenChange: (b: boolean) => void; onSimpan: Simpan<GrupIsian> }) {
  const [nama, setNama] = React.useState('');
  const [warna, setWarna] = React.useState(WARNA_GRUP[0]!);
  const [pj, setPj] = React.useState('');
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (open) {
      setNama('');
      setPj('');
      setGalat(null);
    }
  }, [open]);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const p = SkemaGrupBaru.safeParse({ nama, warna, pj_nama: pj.trim() || null });
    if (!p.success) return setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
    setProses(true);
    const g = await onSimpan(p.data);
    setProses(false);
    if (g) return setGalat(g);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(b) => !proses && onOpenChange(b)}>
      <DialogContent className="max-w-md" data-testid="grup-form">
        <form onSubmit={simpan} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Tambah grup</DialogTitle>
            <DialogDescription>Grup mengelompokkan task, mis. per divisi atau tahap acara.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-nama`}>Nama grup</Label>
            <Input id={`${id}-nama`} value={nama} maxLength={120} onChange={(e) => setNama(e.target.value)} data-testid="grup-form-nama" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-pj`}>Penanggung jawab (opsional)</Label>
            <Input id={`${id}-pj`} value={pj} maxLength={150} onChange={(e) => setPj(e.target.value)} data-testid="grup-form-pj" />
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-[13px] font-medium text-primary">Warna</legend>
            <div className="flex flex-wrap gap-2" data-testid="grup-form-warna">
              {WARNA_GRUP.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-label={`Warna ${w}`}
                  aria-pressed={warna === w}
                  onClick={() => setWarna(w)}
                  className={`size-7 rounded-full border-2 ${warna === w ? 'border-[var(--text-primary)]' : 'border-transparent'}`}
                  style={{ backgroundColor: w }}
                />
              ))}
            </div>
          </fieldset>
          {galat ? (
            <p role="alert" className="text-[13px] text-danger">
              {galat}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={proses} onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" loading={proses} data-testid="grup-form-simpan">
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
