'use client';

import { Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
  EditorPeran,
  galatPeran,
  peranKeInput,
  type OpsiDepartemen,
  type PeranDraf,
} from '@/components/pengguna/EditorPeran';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RingkasPengguna } from '@/lib/auth/invitation';
import { SkemaUbahPengguna } from '@/lib/auth/skema-pengguna';

interface DialogUbahPenggunaProps {
  pengguna: RingkasPengguna;
  departemen: OpsiDepartemen[];
  onTutup: () => void;
  onBerhasil: (pesan: string) => void;
}

const kunciPeran = (daftar: { role: string; departemen_id?: string | null }[]) =>
  daftar.map((r) => `${r.role}:${r.departemen_id ?? ''}`).sort().join('|');

export function DialogUbahPengguna({ pengguna, departemen, onTutup, onBerhasil }: DialogUbahPenggunaProps) {
  const [nama, setNama] = useState(pengguna.nama_lengkap);
  const [angkatan, setAngkatan] = useState(pengguna.angkatan?.toString() ?? '');
  const [peran, setPeran] = useState<PeranDraf[]>(
    pengguna.roles.map((r) => ({ role: r.role, departemen_id: r.departemen_id ?? '' })),
  );
  const [galat, setGalat] = useState<{ nama_lengkap?: string; angkatan?: string }>({});
  const [galatRole, setGalatRole] = useState<ReturnType<typeof galatPeran>>({ perBaris: {} });
  const [pesan, setPesan] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);

  function pasangIsu(isu: { path: string; pesan: string }[]) {
    const g: typeof galat = {};
    for (const i of isu) {
      const k = i.path.split('.')[0];
      if ((k === 'nama_lengkap' || k === 'angkatan') && !g[k]) g[k] = i.pesan;
    }
    setGalat(g);
    setGalatRole(galatPeran(isu));
  }

  async function simpan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPesan(null);

    // Kirim hanya medan yang berubah: `angkatan` tak dikirim = dipertahankan, null = dikosongkan.
    const perubahan: Record<string, unknown> = {};
    if (nama.trim() !== pengguna.nama_lengkap) perubahan.nama_lengkap = nama;
    const angkatanBaru = angkatan.trim() === '' ? null : Number(angkatan);
    if (angkatanBaru !== pengguna.angkatan) perubahan.angkatan = angkatanBaru;
    const rolesBaru = peranKeInput(peran);
    if (kunciPeran(rolesBaru) !== kunciPeran(pengguna.roles) || rolesBaru.length !== peran.length) {
      perubahan.roles = rolesBaru;
    }
    if (Object.keys(perubahan).length === 0) {
      onTutup();
      return;
    }

    const cek = SkemaUbahPengguna.safeParse(perubahan);
    if (!cek.success) {
      pasangIsu(cek.error.issues.map((i) => ({ path: i.path.join('.'), pesan: i.message })));
      return;
    }
    pasangIsu([]);

    setMengirim(true);
    try {
      const res = await fetch(`/api/users/${pengguna.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perubahan),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string; details?: { path: string; pesan: string }[] };
      } | null;
      if (!res.ok || !body?.ok) {
        if (Array.isArray(body?.error?.details)) pasangIsu(body.error.details);
        setPesan(body?.error?.message ?? 'Perubahan gagal disimpan.');
        return;
      }
      onBerhasil(`Data ${nama.trim()} tersimpan.`);
    } catch {
      setPesan('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
    } finally {
      setMengirim(false);
    }
  }

  return (
    <Dialog open onOpenChange={(buka) => !buka && !mengirim && onTutup()}>
      <DialogContent className="max-w-xl">
        <form className="grid gap-4" onSubmit={simpan} noValidate aria-busy={mengirim}>
          <DialogHeader>
            <DialogTitle>Ubah pengguna</DialogTitle>
            <DialogDescription>
              {pengguna.email} · NIM {pengguna.nim}. Mengubah peran mengganti seluruh peran pada periode aktif.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="ubah-nama" required>Nama lengkap</Label>
              <Input id="ubah-nama" value={nama} maxLength={150} onChange={(e) => setNama(e.target.value)} error={galat.nama_lengkap} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ubah-angkatan">Angkatan</Label>
              <Input
                id="ubah-angkatan"
                type="number"
                min={2000}
                max={2100}
                value={angkatan}
                onChange={(e) => setAngkatan(e.target.value)}
                error={galat.angkatan}
              />
            </div>
          </div>
          <EditorPeran
            nilai={peran}
            onUbah={setPeran}
            departemen={departemen}
            galatPerBaris={galatRole.perBaris}
            galatUmum={galatRole.umum}
            disabled={mengirim}
          />
          {pesan ? (
            <p role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px]">
              {pesan}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={mengirim} onClick={onTutup}>
              Batal
            </Button>
            <Button type="submit" loading={mengirim}>
              <Save aria-hidden="true" />
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
