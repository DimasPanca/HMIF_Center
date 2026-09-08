'use client';

import { Menu, PanelLeft, Search, WifiOff } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { PeriodeSelector } from '@/components/layout/PeriodeSelector';
import type { PilihanPeriode } from '@/components/layout/Sidebar';
import { UserMenu } from '@/components/layout/UserMenu';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import type { RoleCode } from '@/lib/auth/permissions';

interface HeaderProps {
  email: string;
  nama: string;
  onBukaMenu: () => void;
  onLipatSidebar: () => void;
  periode: PilihanPeriode[];
  periodeAktifId: string;
  roles: readonly RoleCode[];
}

const NAMA_RUTE: Record<string, string> = {
  admin: 'Administrasi',
  acara: 'Acara Besar',
  departemen: 'Departemen',
  keuangan: 'Keuangan',
  proker: 'Program Kerja',
  sekretariat: 'Kesekretariatan',
  surat: 'Persuratan',
};

function judulRute(pathname: string): string {
  const awal = pathname.split('/').filter(Boolean)[0];
  return awal ? (NAMA_RUTE[awal] ?? 'HMIF Center') : 'Beranda';
}

export function Header({
  email,
  nama,
  onBukaMenu,
  onLipatSidebar,
  periode,
  periodeAktifId,
  roles,
}: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-default bg-panel px-3 sm:px-4">
      <button
        type="button"
        className="inline-flex size-[34px] items-center justify-center rounded-sm text-secondary transition-colors duration-fast hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden motion-reduce:transition-none"
        aria-label="Buka navigasi"
        onClick={onBukaMenu}
      >
        <Menu className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="hidden size-[34px] items-center justify-center rounded-sm text-secondary transition-colors duration-fast hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 md:inline-flex motion-reduce:transition-none"
        aria-label="Lipat atau perluas sidebar"
        onClick={onLipatSidebar}
      >
        <PanelLeft className="size-4" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-primary">{judulRute(pathname)}</p>
      </div>

      <button
        type="button"
        className="hidden h-[34px] min-w-44 items-center gap-2 rounded-sm border border-default bg-base px-3 text-[12px] text-tertiary transition-colors duration-fast hover:bg-subtle hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 lg:flex motion-reduce:transition-none"
        aria-label="Buka pencarian dan command palette"
        title="Pencarian akan dibangun pada T-052"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 text-left">Cari...</span>
        <kbd className="rounded-xs border border-default bg-subtle px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <PeriodeSelector periode={periode} periodeAktifId={periodeAktifId} />

      <span
        className="hidden h-[34px] items-center gap-1.5 rounded-sm px-2 text-[11px] text-secondary sm:inline-flex"
        title="Status koneksi realtime"
      >
        <WifiOff className="size-3.5 text-tertiary" aria-hidden="true" />
        <span className="hidden xl:inline">Menunggu realtime</span>
      </span>

      <ThemeToggle />
      <UserMenu email={email} nama={nama} roles={roles} />
    </header>
  );
}
