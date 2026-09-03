import { LogOut } from 'lucide-react';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { logout, sesiSaatIni } from '@/lib/auth/session';

async function keluar() {
  'use server';

  await logout();
  redirect('/login');
}

/** Placeholder shell sampai beranda sebenarnya dibangun pada T-075/T-077. */
export default async function Beranda() {
  const sesi = await sesiSaatIni();

  if (!sesi?.isActive) {
    await logout();
    redirect('/login');
  }

  return (
    <main data-testid="app-shell" className="min-h-dvh bg-app text-primary">
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-default bg-panel px-4 sm:px-6">
        <div>
          <p className="text-[14px] leading-5 font-semibold">HMIF Center</p>
          <p className="text-[11px] leading-4 text-tertiary">{sesi.namaLengkap}</p>
        </div>
        <form action={keluar}>
          <Button type="submit" variant="ghost" data-testid="logout-submit">
            <LogOut aria-hidden="true" />
            Keluar
          </Button>
        </form>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="rounded-sm border border-default bg-panel p-6 shadow-sm">
          <p className="text-[11px] leading-4 font-semibold tracking-wide text-tertiary uppercase">
            Beranda
          </p>
          <h1 className="mt-2 text-xl font-semibold">Selamat datang di HMIF Center</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-5 text-secondary">
            Sistem E-Administrasi Himpunan Mahasiswa Informatika FT UNTIRTA. Modul beranda lengkap
            akan tersedia setelah integrasi Master Gantt dan dashboard kontekstual.
          </p>
        </div>
      </section>
    </main>
  );
}
