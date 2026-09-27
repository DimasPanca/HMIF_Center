import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { FormAktivasi } from '@/components/pengguna/FormAktivasi';
import { buttonVariants } from '@/components/ui/button';
import { periksaUndangan } from '@/lib/auth/invitation';

export const dynamic = 'force-dynamic';

// Token ada di URL: jangan bocor lewat header Referer, jangan diindeks.
export const metadata: Metadata = {
  title: 'Aktivasi akun — HMIF Center',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

const JUDUL_GAGAL = {
  TOKEN_TIDAK_DIKENAL: 'Tautan tidak dikenali',
  TOKEN_KEDALUWARSA: 'Undangan kedaluwarsa',
  TOKEN_TERPAKAI: 'Undangan sudah digunakan',
} as const;

export default async function AktivasiPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hasil = await periksaUndangan(token);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-app px-4 py-10 text-primary">
      <div className="w-full max-w-[26rem]">
        <Image src="/logo-hmif.png" alt="Logo HMIF Fakultas Teknik UNTIRTA" width={56} height={56} priority />
        <p className="mt-6 text-[11px] leading-4 font-semibold tracking-[0.14em] text-secondary uppercase">
          HMIF Center
        </p>

        {hasil.ok ? (
          <>
            <h1 className="mt-2 text-[28px] leading-9 font-semibold tracking-[-0.02em]">Aktifkan akun Anda</h1>
            <p className="mt-2 mb-6 text-[14px] leading-5 text-secondary">
              Buat password untuk masuk ke HMIF Center. Tautan ini hanya dapat dipakai sekali.
            </p>
            <FormAktivasi
              token={token}
              email={hasil.nilai.email}
              namaLengkap={hasil.nilai.namaLengkap}
              roles={hasil.nilai.roles}
            />
          </>
        ) : (
          <div data-testid="aktivasi-pesan" role="alert" className="mt-2">
            <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">
              {hasil.kode in JUDUL_GAGAL
                ? JUDUL_GAGAL[hasil.kode as keyof typeof JUDUL_GAGAL]
                : 'Undangan tidak dapat dibuka'}
            </h1>
            <div className="mt-4 flex items-start gap-2 rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[14px] leading-5">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
              <p>{hasil.pesan}</p>
            </div>
            {hasil.kode === 'TOKEN_TERPAKAI' ? (
              <Link href="/login" className={buttonVariants({ className: 'mt-6 w-full' })}>
                Ke halaman login
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
