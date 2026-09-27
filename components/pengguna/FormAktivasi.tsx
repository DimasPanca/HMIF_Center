'use client';

import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { LABEL_PERAN } from '@/components/pengguna/peran';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RoleCode } from '@/lib/auth/permissions';
import { SkemaAktivasi } from '@/lib/auth/skema-pengguna';

interface FormAktivasiProps {
  token: string;
  email: string;
  namaLengkap: string;
  roles: RoleCode[];
}

type Galat = Partial<Record<'password' | 'konfirmasi', string>>;

export function FormAktivasi({ token, email, namaLengkap, roles }: FormAktivasiProps) {
  const [password, setPassword] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [galat, setGalat] = useState<Galat>({});
  const [pesan, setPesan] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [selesai, setSelesai] = useState(false);

  function petakan(isu: { path: string; pesan: string }[]): Galat {
    const hasil: Galat = {};
    for (const i of isu) {
      const kunci = i.path.split('.')[0];
      if ((kunci === 'password' || kunci === 'konfirmasi') && !hasil[kunci]) hasil[kunci] = i.pesan;
    }
    return hasil;
  }

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPesan(null);
    const cek = SkemaAktivasi.safeParse({ token, password, konfirmasi });
    if (!cek.success) {
      setGalat(petakan(cek.error.issues.map((i) => ({ path: i.path.join('.'), pesan: i.message }))));
      return;
    }
    setGalat({});
    setMengirim(true);
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cek.data),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string; details?: { path: string; pesan: string }[] };
      } | null;
      if (!res.ok || !body?.ok) {
        if (Array.isArray(body?.error?.details)) setGalat(petakan(body.error.details));
        setPesan(body?.error?.message ?? 'Aktivasi belum berhasil. Silakan coba lagi.');
        return;
      }
      setSelesai(true);
    } catch {
      setPesan('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
    } finally {
      setMengirim(false);
    }
  }

  const daftarPeran = roles.map((r) => LABEL_PERAN[r]).join(', ');

  if (selesai) {
    return (
      <div role="status" className="space-y-4">
        <div className="flex items-start gap-3 rounded-sm border border-[var(--success)] bg-[var(--success-subtle)] p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--success)]" aria-hidden="true" />
          <div className="text-[14px] leading-5">
            <p className="font-semibold text-primary">Selamat datang, {namaLengkap}. Akun Anda sudah aktif.</p>
            {daftarPeran ? <p className="mt-1 text-secondary">Peran Anda: {daftarPeran}.</p> : null}
          </div>
        </div>
        <Link href="/login" className={buttonVariants({ className: 'w-full' })}>
          Masuk sekarang
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <form data-testid="aktivasi-form" className="space-y-5" onSubmit={kirim} aria-busy={mengirim} noValidate>
      <dl className="grid gap-2 rounded-sm border border-default bg-subtle p-3 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-secondary">Nama</dt>
          <dd className="font-medium text-primary">{namaLengkap}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-secondary">Email</dt>
          <dd className="break-all text-primary">{email}</dd>
        </div>
        {daftarPeran ? (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-secondary">Peran</dt>
            <dd className="text-primary">{daftarPeran}</dd>
          </div>
        ) : null}
      </dl>

      {/* Membantu pengelola password menyimpan kredensial untuk email yang benar. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

      <div className="space-y-1.5">
        <Label htmlFor="aktivasi-password" required>
          Password baru
        </Label>
        <Input
          id="aktivasi-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={galat.password}
          helperText={galat.password ? undefined : 'Minimal 8 karakter, mengandung huruf dan angka.'}
          disabled={mengirim}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="aktivasi-konfirmasi" required>
          Ulangi password
        </Label>
        <Input
          id="aktivasi-konfirmasi"
          type="password"
          autoComplete="new-password"
          value={konfirmasi}
          onChange={(e) => setKonfirmasi(e.target.value)}
          error={galat.konfirmasi}
          disabled={mengirim}
        />
      </div>

      {pesan ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] leading-[18px] text-primary"
        >
          <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0 text-danger" />
          <p>{pesan}</p>
        </div>
      ) : null}

      <Button type="submit" className="w-full" loading={mengirim}>
        Aktifkan akun
      </Button>
    </form>
  );
}
