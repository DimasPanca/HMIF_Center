'use client';

/**
 * Tambah / ubah / hapus satu pengurus (T-107). Validasi klien memakai
 * `SkemaPengurus` yang sama dengan server (K-04).
 *
 * Test id: form-pengurus-{nama_lengkap|nim|jabatan|departemen|angkatan|aktif},
 * form-pengurus-simpan, form-pengurus-hapus, form-pengurus-galat.
 */

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SkemaPengurus, type DepartemenPilihan } from '@/lib/pengurus/skema';

export interface PengurusForm {
  id?: string;
  nama_lengkap: string;
  nim: string;
  jabatan: string;
  departemen_id: string | null;
  angkatan: number | null;
  is_aktif: boolean;
}

const KOSONG: PengurusForm = { nama_lengkap: '', nim: '', jabatan: '', departemen_id: null, angkatan: null, is_aktif: true };

export function FormPengurusDialog({
  open,
  onOpenChange,
  awal,
  departemen,
  bolehHapus,
  onSelesai,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  awal: PengurusForm | null;
  departemen: DepartemenPilihan[];
  bolehHapus: boolean;
  onSelesai: () => void;
}) {
  const [nilai, setNilai] = React.useState<PengurusForm>(awal ?? KOSONG);
  const [angkatan, setAngkatan] = React.useState(awal?.angkatan ? String(awal.angkatan) : '');
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [yakinHapus, setYakinHapus] = React.useState(false);
  const id = React.useId();

  React.useEffect(() => {
    if (open) {
      setNilai(awal ?? KOSONG);
      setAngkatan(awal?.angkatan ? String(awal.angkatan) : '');
      setGalat(null);
      setYakinHapus(false);
    }
  }, [open, awal]);

  const ubah = <K extends keyof PengurusForm>(k: K, v: PengurusForm[K]) => setNilai((n) => ({ ...n, [k]: v }));

  async function panggil(url: string, method: string, body?: unknown) {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok) {
        setGalat(isi?.error?.message ?? 'Gagal menyimpan.');
        return;
      }
      onSelesai();
      onOpenChange(false);
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  function simpan(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...nilai, angkatan: angkatan.trim() ? Number(angkatan) : null };
    const p = SkemaPengurus.safeParse(data);
    if (!p.success) {
      setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
      return;
    }
    void panggil(awal?.id ? `/api/pengurus/${awal.id}` : '/api/pengurus', awal?.id ? 'PATCH' : 'POST', p.data);
  }

  return (
    <Dialog open={open} onOpenChange={(b) => !proses && onOpenChange(b)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={simpan} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{awal?.id ? 'Ubah pengurus' : 'Tambah pengurus'}</DialogTitle>
            <DialogDescription>Data ini dipakai untuk Surat Keterangan Aktif. Tidak membuat akun pengguna.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-nama`}>Nama lengkap</Label>
              <Input id={`${id}-nama`} value={nilai.nama_lengkap} onChange={(e) => ubah('nama_lengkap', e.target.value)} maxLength={150} data-testid="form-pengurus-nama_lengkap" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-nim`}>NIM</Label>
                <Input id={`${id}-nim`} inputMode="numeric" value={nilai.nim} onChange={(e) => ubah('nim', e.target.value)} maxLength={20} data-testid="form-pengurus-nim" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-angkatan`}>Angkatan</Label>
                <Input id={`${id}-angkatan`} inputMode="numeric" value={angkatan} onChange={(e) => setAngkatan(e.target.value)} maxLength={4} placeholder="2022" data-testid="form-pengurus-angkatan" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-jabatan`}>Jabatan</Label>
              <Input
                id={`${id}-jabatan`}
                value={nilai.jabatan}
                onChange={(e) => ubah('jabatan', e.target.value)}
                maxLength={150}
                placeholder="Contoh: Staff Departemen Kaderisasi"
                data-testid="form-pengurus-jabatan"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-dept`}>Departemen</Label>
              <Select
                id={`${id}-dept`}
                placeholder={null}
                value={nilai.departemen_id ?? ''}
                onChange={(e) => ubah('departemen_id', e.target.value || null)}
                data-testid="form-pengurus-departemen"
              >
                <option value="">— Tanpa departemen (BPH/inti) —</option>
                {departemen.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nama}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={nilai.is_aktif} onChange={(e) => ubah('is_aktif', e.target.checked)} data-testid="form-pengurus-aktif" />
              Masih aktif sebagai pengurus
            </label>
          </div>

          {galat ? (
            <p role="alert" data-testid="form-pengurus-galat" className="text-[13px] text-danger">
              {galat}
            </p>
          ) : null}

          <DialogFooter className="sm:justify-between">
            {awal?.id && bolehHapus ? (
              yakinHapus ? (
                <Button type="button" variant="danger" disabled={proses} onClick={() => void panggil(`/api/pengurus/${awal.id}`, 'DELETE')} data-testid="form-pengurus-hapus">
                  Ya, hapus {nilai.nama_lengkap}
                </Button>
              ) : (
                <Button type="button" variant="ghost" disabled={proses} onClick={() => setYakinHapus(true)}>
                  Hapus
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={proses} onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="submit" loading={proses} data-testid="form-pengurus-simpan">
                Simpan
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
