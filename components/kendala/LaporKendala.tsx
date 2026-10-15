'use client';

/**
 * Form lapor kendala (T-082 #1). Skema sama dengan server (K-04).
 *
 * Test id: lapor-kendala, lapor-judul, lapor-deskripsi, lapor-prioritas,
 * lapor-assignee, lapor-proker, lapor-simpan, lapor-galat.
 */

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LABEL_PRIORITAS, PRIORITAS, SkemaKendalaBaru, type Prioritas } from '@/lib/kendala/skema';

import type { OrangMention } from './MentionInput';

export function LaporKendala({
  departemenId,
  orang,
  proker,
}: {
  departemenId: string;
  orang: OrangMention[];
  proker: { id: string; nama: string }[];
}) {
  const router = useRouter();
  const [buka, setBuka] = React.useState(false);
  const [judul, setJudul] = React.useState('');
  const [deskripsi, setDeskripsi] = React.useState('');
  const [prioritas, setPrioritas] = React.useState<Prioritas>('SEDANG');
  const [assignee, setAssignee] = React.useState('');
  const [prokerId, setProkerId] = React.useState('');
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const id = React.useId();

  function bersihkan() {
    setJudul('');
    setDeskripsi('');
    setPrioritas('SEDANG');
    setAssignee('');
    setProkerId('');
    setGalat(null);
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const p = SkemaKendalaBaru.safeParse({ judul, deskripsi, prioritas, assignee_id: assignee || null, proker_id: prokerId || null });
    if (!p.success) return setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch('/api/kendala', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...p.data, departemen_id: departemenId }),
      });
      const b = (await r.json().catch(() => null)) as { ok?: boolean; data?: { id: string }; error?: { message?: string } } | null;
      if (!r.ok || !b?.ok || !b.data) return setGalat(b?.error?.message ?? 'Kendala gagal disimpan.');
      setBuka(false);
      bersihkan();
      router.push(`/departemen/kendala/${b.data.id}`);
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  return (
    <>
      <Button onClick={() => setBuka(true)} data-testid="lapor-kendala">
        <Plus className="size-4" aria-hidden="true" />
        Lapor kendala
      </Button>
      <Dialog open={buka} onOpenChange={(b) => !proses && setBuka(b)}>
        <DialogContent className="max-w-lg">
          <form onSubmit={simpan} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Lapor kendala</DialogTitle>
              <DialogDescription>Kendala Kritis langsung tampil di dashboard Ketua, Wakil, dan BPH.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-judul`}>Judul</Label>
                <Input id={`${id}-judul`} value={judul} maxLength={200} onChange={(e) => setJudul(e.target.value)} data-testid="lapor-judul" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-deskripsi`}>Deskripsi</Label>
                <Textarea id={`${id}-deskripsi`} rows={4} value={deskripsi} maxLength={5000} onChange={(e) => setDeskripsi(e.target.value)} data-testid="lapor-deskripsi" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-prioritas`}>Prioritas</Label>
                  <Select id={`${id}-prioritas`} placeholder={null} value={prioritas} onChange={(e) => setPrioritas(e.target.value as Prioritas)} data-testid="lapor-prioritas">
                    {PRIORITAS.map((p) => (
                      <option key={p} value={p}>
                        {LABEL_PRIORITAS[p]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-assignee`}>Penanggung jawab</Label>
                  <Select id={`${id}-assignee`} placeholder={null} value={assignee} onChange={(e) => setAssignee(e.target.value)} data-testid="lapor-assignee">
                    <option value="">— Belum ditugaskan —</option>
                    {orang.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nama}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-proker`}>Proker terkait (opsional)</Label>
                <Select id={`${id}-proker`} placeholder={null} value={prokerId} onChange={(e) => setProkerId(e.target.value)} data-testid="lapor-proker">
                  <option value="">— Tidak terkait proker —</option>
                  {proker.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-xs text-tertiary">Lampiran dapat ditambahkan setelah kendala tersimpan.</p>
            </div>
            {galat ? (
              <p role="alert" data-testid="lapor-galat" className="text-[13px] text-danger">
                {galat}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={proses} onClick={() => setBuka(false)}>
                Batal
              </Button>
              <Button type="submit" loading={proses} data-testid="lapor-simpan">
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
