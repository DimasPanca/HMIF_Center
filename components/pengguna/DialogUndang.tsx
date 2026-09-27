'use client';

import { Check, Copy, KeyRound, Send } from 'lucide-react';
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
import { SkemaUndang } from '@/lib/auth/skema-pengguna';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

type Medan = 'nama_lengkap' | 'nim' | 'email' | 'angkatan' | 'no_hp';
const KOSONG: Record<Medan, string> = { nama_lengkap: '', nim: '', email: '', angkatan: '', no_hp: '' };

interface HasilUndangan {
  email: string;
  tautan: string;
  kedaluwarsa: string;
}

interface DialogUndangProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departemen: OpsiDepartemen[];
  onBerhasil: () => void;
}

export function DialogUndang({ open, onOpenChange, departemen, onBerhasil }: DialogUndangProps) {
  const [isian, setIsian] = useState(KOSONG);
  const [peran, setPeran] = useState<PeranDraf[]>([{ role: '', departemen_id: '' }]);
  const [galat, setGalat] = useState<Partial<Record<Medan, string>>>({});
  const [galatRole, setGalatRole] = useState<ReturnType<typeof galatPeran>>({ perBaris: {} });
  const [pesan, setPesan] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [hasil, setHasil] = useState<HasilUndangan | null>(null);
  const [tersalin, setTersalin] = useState(false);

  function reset() {
    setIsian(KOSONG);
    setPeran([{ role: '', departemen_id: '' }]);
    setGalat({});
    setGalatRole({ perBaris: {} });
    setPesan(null);
    setHasil(null);
    setTersalin(false);
  }

  function pasangIsu(isu: { path: string; pesan: string }[]) {
    const g: Partial<Record<Medan, string>> = {};
    for (const i of isu) {
      const k = i.path.split('.')[0] as Medan;
      if (k in KOSONG && !g[k]) g[k] = i.pesan;
    }
    setGalat(g);
    setGalatRole(galatPeran(isu));
  }

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPesan(null);
    const input = {
      nama_lengkap: isian.nama_lengkap,
      nim: isian.nim,
      email: isian.email,
      angkatan: isian.angkatan.trim() === '' ? undefined : Number(isian.angkatan),
      no_hp: isian.no_hp.trim() === '' ? undefined : isian.no_hp,
      roles: peranKeInput(peran),
    };
    const cek = SkemaUndang.safeParse(input);
    if (!cek.success) {
      pasangIsu(cek.error.issues.map((i) => ({ path: i.path.join('.'), pesan: i.message })));
      return;
    }
    pasangIsu([]);
    setMengirim(true);
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { tautan: string; kedaluwarsa: string };
        error?: { code?: string; message?: string; details?: { path: string; pesan: string }[] };
      } | null;
      if (!res.ok || !body?.ok || !body.data) {
        const pesanServer = body?.error?.message ?? 'Undangan gagal dibuat.';
        if (Array.isArray(body?.error?.details)) pasangIsu(body.error.details);
        // Kode yang menunjuk satu medan cukup tampil di medan itu.
        if (body?.error?.code === 'EMAIL_TERDAFTAR') setGalat({ email: pesanServer });
        else if (body?.error?.code === 'NIM_TERDAFTAR') setGalat({ nim: pesanServer });
        else setPesan(pesanServer);
        return;
      }
      setHasil({ email: cek.data.email, ...body.data });
      onBerhasil();
    } catch {
      setPesan('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
    } finally {
      setMengirim(false);
    }
  }

  async function salin() {
    if (!hasil) return;
    try {
      await navigator.clipboard.writeText(hasil.tautan);
      setTersalin(true);
    } catch {
      setPesan('Browser menolak akses clipboard. Pilih tautannya lalu salin manual.');
    }
  }

  const medan = (k: Medan) => ({
    value: isian[k],
    onChange: (e: { target: { value: string } }) => setIsian((s) => ({ ...s, [k]: e.target.value })),
    error: galat[k],
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(buka) => {
        if (mengirim) return;
        if (!buka) reset();
        onOpenChange(buka);
      }}
    >
      <DialogContent className="max-w-xl">
        {hasil ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Undangan dibuat</DialogTitle>
              <DialogDescription>
                Kirim tautan ini ke {hasil.email}. Email tidak dikirim otomatis.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="undang-tautan">Tautan aktivasi</Label>
              <div className="flex gap-2">
                <Input
                  id="undang-tautan"
                  data-testid="undang-tautan"
                  readOnly
                  value={hasil.tautan}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-[13px]"
                />
                <Button data-testid="undang-salin" variant="secondary" onClick={() => void salin()}>
                  {tersalin ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {tersalin ? 'Tersalin' : 'Salin'}
                </Button>
              </div>
              <p className="text-[12px] leading-4 text-secondary">
                Berlaku sampai {formatTanggalWaktu(hasil.kedaluwarsa)}, sekali pakai.
              </p>
            </div>
            <p className="flex items-start gap-2 rounded-sm border border-[var(--warning)] bg-[var(--warning-subtle)] p-3 text-[13px] leading-[18px]">
              <KeyRound className="mt-px size-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
              Tautan ini hanya ditampilkan sekali. Setelah dialog ditutup, tautan tidak dapat dilihat lagi.
            </p>
            {pesan ? <p role="alert" className="text-[13px] text-danger">{pesan}</p> : null}
            <DialogFooter>
              <Button variant="secondary" onClick={reset}>
                Undang orang lain
              </Button>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Selesai
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form data-testid="undang-form" className="grid gap-4" onSubmit={kirim} noValidate aria-busy={mengirim}>
            <DialogHeader>
              <DialogTitle>Undang pengurus</DialogTitle>
              <DialogDescription>
                Sistem membuat tautan aktivasi yang berlaku 7 hari untuk Anda salin dan kirim sendiri.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="undang-nama" required>Nama lengkap</Label>
                <Input id="undang-nama" autoComplete="off" maxLength={150} {...medan('nama_lengkap')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="undang-nim" required>NIM</Label>
                <Input id="undang-nim" inputMode="numeric" maxLength={12} {...medan('nim')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="undang-angkatan">Angkatan</Label>
                <Input id="undang-angkatan" type="number" min={2000} max={2100} {...medan('angkatan')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="undang-email" required>Email</Label>
                <Input id="undang-email" type="email" autoComplete="off" {...medan('email')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="undang-hp">Nomor HP</Label>
                <Input id="undang-hp" type="tel" maxLength={20} {...medan('no_hp')} />
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
              <Button
                variant="secondary"
                disabled={mengirim}
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Batal
              </Button>
              <Button type="submit" loading={mengirim}>
                <Send aria-hidden="true" />
                Buat undangan
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
