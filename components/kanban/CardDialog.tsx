'use client';

import { useState, type FormEvent } from 'react';

import { SkemaBuatKartu } from '@/components/kanban/schema';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
export function CardDialog({
  departemenId,
  daftarProker,
  pengurus,
  onClose,
  onSaved,
}: {
  departemenId: string;
  daftarProker: { id: string; nama: string }[];
  pengurus: { id: string; nama: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [judul, setJudul] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [prioritas, setPrioritas] = useState<'RENDAH' | 'SEDANG' | 'TINGGI' | 'KRITIS'>('SEDANG');
  const [prokerId, setProkerId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  async function simpan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = SkemaBuatKartu.safeParse({
      departemen_id: departemenId,
      proker_id: prokerId || null,
      judul,
      deskripsi: deskripsi || null,
      prioritas,
      assignee_id: assigneeId || null,
      deadline: deadline || null,
    });
    if (!input.success) {
      setPesan('Lengkapi judul dan periksa kembali data kartu.');
      return;
    }
    setMenyimpan(true);
    try {
      const response = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data),
      });
      const body = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Kartu gagal dibuat.');
      onSaved();
    } catch (error) {
      setPesan(error instanceof Error ? error.message : 'Kartu gagal dibuat.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="space-y-4">
        <DialogTitle className="text-lg font-semibold text-primary">Tambah kartu</DialogTitle>
        <form onSubmit={(event) => void simpan(event)} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="kartu-judul">Judul</Label><Input id="kartu-judul" value={judul} onChange={(event) => setJudul(event.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor="kartu-deskripsi">Deskripsi</Label><Input id="kartu-deskripsi" value={deskripsi} onChange={(event) => setDeskripsi(event.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="kartu-prioritas">Prioritas</Label><Select id="kartu-prioritas" value={prioritas} placeholder={null} onChange={(event) => setPrioritas(event.target.value as typeof prioritas)}>{['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS'].map((nilai) => <option key={nilai} value={nilai}>{nilai}</option>)}</Select></div>
            <div className="space-y-1"><Label htmlFor="kartu-deadline">Deadline</Label><Input id="kartu-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="kartu-proker">Proker</Label><Select id="kartu-proker" value={prokerId} placeholder={null} onChange={(event) => setProkerId(event.target.value)}><option value="">Tanpa proker</option>{daftarProker.map(({ id, nama }) => <option key={id} value={id}>{nama}</option>)}</Select></div>
          <div className="space-y-1"><Label htmlFor="kartu-pic">Penanggung jawab</Label><Select id="kartu-pic" value={assigneeId} placeholder={null} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Belum ditugaskan</option>{pengurus.map(({ id, nama }) => <option key={id} value={id}>{nama}</option>)}</Select></div>
          {pesan ? <p role="alert" className="text-[12px] text-danger">{pesan}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" disabled={menyimpan}>{menyimpan ? 'Menyimpan…' : 'Simpan kartu'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
