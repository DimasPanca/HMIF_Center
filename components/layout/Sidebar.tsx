'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Archive,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  DatabaseBackup,
  FilePlus2,
  FileText,
  Files,
  FolderArchive,
  Gauge,
  History,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SquarePlus,
  Target,
  UserCog,
  Users,
  X,
  type LucideProps,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { Avatar } from '@/components/ui/avatar';
import type { RoleCode } from '@/lib/auth/permissions';
import {
  grupAktif,
  hrefAktif,
  susunMenu,
  type BadgeMenu,
  type FaktaMenu,
  type IkonMenu,
  type ModeMenu,
} from '@/lib/navigasi/menu';
import { cn } from '@/lib/utils';

const KUNCI_COLLAPSE = 'hmif-sidebar-collapsed';

export type { ModeMenu };

export interface PilihanPeriode {
  id: string;
  nama: string;
  status: 'AKTIF' | 'ARSIP' | 'PERSIAPAN';
}

export type JumlahApproval = Record<BadgeMenu, number>;

interface SidebarProps {
  children: ReactNode;
  email: string;
  fakta: FaktaMenu;
  jumlahApproval: JumlahApproval;
  nama: string;
  periode: PilihanPeriode[];
  periodeAktifId: string;
  roles: readonly RoleCode[];
}

/**
 * Ikon per butir. Susunan menu dan hak aksesnya diputuskan
 * `lib/navigasi/menu.ts` lewat `can()` (kontrak T-051, ADR-037); komponen
 * ini hanya merender.
 */
const IKON: Record<IkonMenu, ComponentType<LucideProps>> = {
  beranda: LayoutDashboard,
  proker: ListChecks,
  tambah: SquarePlus,
  kalender: CalendarDays,
  gantt: Gauge,
  approval: ClipboardCheck,
  acara: Target,
  surat: FileText,
  'buat-surat': FilePlus2,
  massal: Files,
  arsip: Archive,
  'sk-aktif': BadgeCheck,
  keuangan: CircleDollarSign,
  nota: ReceiptText,
  verifikasi: ShieldCheck,
  sekretariat: FolderArchive,
  notulensi: ScrollText,
  pengurus: Users,
  ruangan: Building2,
  departemen: Building2,
  kanban: KanbanSquare,
  kendala: ShieldAlert,
  admin: Settings,
  pengguna: UserCog,
  periode: CalendarDays,
  backup: DatabaseBackup,
  audit: History,
};

function BadgeAngka({ nilai, terang = false }: { nilai: number; terang?: boolean }) {
  if (nilai <= 0) return null;
  return (
    <span
      className={cn(
        'ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums',
        terang ? 'bg-[var(--primary-text)] text-[var(--primary)]' : 'bg-[var(--primary)] text-[var(--primary-text)]',
      )}
    >
      {nilai > 99 ? '99+' : nilai}
    </span>
  );
}

export function Sidebar({
  children,
  email,
  fakta,
  jumlahApproval,
  nama,
  periode,
  periodeAktifId,
  roles,
}: SidebarProps) {
  const pathname = usePathname();
  const [dilipat, setDilipat] = useState(false);
  const [mobileTerbuka, setMobileTerbuka] = useState(false);
  const tampilkanLabel = !dilipat || mobileTerbuka;

  useEffect(() => {
    try {
      setDilipat(window.localStorage.getItem(KUNCI_COLLAPSE) === 'true');
    } catch {
      // Penyimpanan dapat ditolak oleh peramban; sidebar tetap dapat dipakai.
    }
  }, []);

  useEffect(() => setMobileTerbuka(false), [pathname]);

  const daftar = useMemo(() => susunMenu(roles, fakta), [roles, fakta]);
  const aktifHref = hrefAktif(pathname, daftar);

  function ubahLipatan() {
    setDilipat((nilai) => {
      const berikutnya = !nilai;
      try {
        window.localStorage.setItem(KUNCI_COLLAPSE, String(berikutnya));
      } catch {
        // State sesi tetap bekerja walau localStorage tidak tersedia.
      }
      return berikutnya;
    });
  }

  const aside = (
    <aside
      data-testid="sidebar-root"
      data-collapsed={dilipat ? 'true' : 'false'}
      className={cn(
        'flex h-dvh shrink-0 flex-col border-r border-default bg-subtle transition-[width,transform] duration-normal motion-reduce:transition-none',
        'fixed inset-y-0 left-0 z-50 md:sticky md:top-0 md:z-20',
        dilipat ? 'w-60 md:w-14' : 'w-60',
        mobileTerbuka ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
      aria-label="Navigasi utama"
    >
      <div className="flex h-[52px] items-center gap-2 border-b border-default px-3">
        <Image src="/logo-hmif.png" alt="Logo HMIF" width={28} height={28} priority />
        {tampilkanLabel ? (
          <span className="truncate text-[14px] font-semibold">HMIF Center</span>
        ) : null}
        <button
          type="button"
          className="ml-auto inline-flex size-[34px] items-center justify-center rounded-sm text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
          aria-label="Tutup navigasi"
          onClick={() => setMobileTerbuka(false)}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Menu aplikasi">
        <ul className="space-y-1">
          {daftar.map((grup) => {
            const Icon = IKON[grup.ikon];
            const grupNyala = grupAktif(pathname, grup, aktifHref);
            const tunggal = grup.items.length === 0;
            // Tautan tunggal menyala penuh bila ialah halaman yang dibuka; grup
            // bersubmenu hanya diberi aksen tipis — yang menyala penuh butirnya.
            const nyalaPenuh = tunggal && grupNyala;

            return (
              <li key={grup.slug}>
                <Link
                  href={grup.href}
                  data-testid={`sidebar-menu-${grup.slug}`}
                  data-mode={grup.mode}
                  aria-current={nyalaPenuh ? 'page' : undefined}
                  title={!tampilkanLabel ? grup.label : undefined}
                  className={cn(
                    'relative flex min-h-10 items-center gap-2.5 rounded-md px-3 text-[14px] font-medium transition-colors duration-fast md:min-h-[34px] md:text-[13px] motion-reduce:transition-none',
                    nyalaPenuh
                      ? 'bg-[var(--primary)] text-[var(--primary-text)]'
                      : grupNyala
                        ? 'text-[var(--primary)] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--primary)] hover:bg-muted'
                        : 'text-secondary hover:bg-muted hover:text-primary',
                  )}
                >
                  <Icon className="size-[18px] shrink-0 md:size-4" strokeWidth={1.75} aria-hidden="true" />
                  {tampilkanLabel ? (
                    <>
                      <span className="truncate">{grup.label}</span>
                      {grup.mode === 'baca' ? (
                        <span
                          className={cn(
                            'ml-auto rounded-full px-1.5 text-[10px] font-medium',
                            nyalaPenuh ? 'bg-white/20 text-[var(--primary-text)]' : 'bg-muted text-tertiary',
                          )}
                        >
                          Lihat saja
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </Link>

                {tampilkanLabel && !tunggal ? (
                  <ul className="mt-0.5 mb-1 ml-[22px] space-y-0.5 border-l border-default pl-2">
                    {grup.items.map((sub) => {
                      const SubIcon = IKON[sub.ikon];
                      const nyala = sub.href === aktifHref;
                      return (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            data-testid={sub.testid ? `sidebar-sub-${sub.testid}` : undefined}
                            data-mode={sub.testid ? 'penuh' : undefined}
                            aria-current={nyala ? 'page' : undefined}
                            className={cn(
                              'flex min-h-10 items-center gap-2 rounded-md px-2.5 py-1 text-[14px] transition-colors duration-fast md:min-h-[30px] md:text-[12.5px] motion-reduce:transition-none',
                              nyala
                                ? 'bg-[var(--primary)] font-medium text-[var(--primary-text)]'
                                : 'text-secondary hover:bg-muted hover:text-primary',
                            )}
                          >
                            <SubIcon className="size-4 shrink-0 md:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                            <span className="truncate">{sub.label}</span>
                            {sub.badge ? <BadgeAngka nilai={jumlahApproval[sub.badge]} terang={nyala} /> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-default p-2">
        <div
          className={cn(
            'flex items-center gap-2 rounded-sm px-2 py-2',
            !tampilkanLabel && 'justify-center px-0',
          )}
        >
          <Avatar name={nama} size="sm" />
          {tampilkanLabel ? (
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-primary">{nama}</p>
              <p className="truncate text-[10px] text-tertiary">
                {roles.join(' · ') || 'Tanpa role'}
              </p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="mt-1 hidden h-[34px] w-full items-center justify-center gap-2 rounded-sm text-[12px] text-secondary transition-colors duration-fast hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 md:flex motion-reduce:transition-none"
          aria-label={dilipat ? 'Perluas sidebar' : 'Lipat sidebar'}
          onClick={ubahLipatan}
        >
          {dilipat ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          {!dilipat ? <span>Lipat sidebar</span> : null}
        </button>
      </div>
    </aside>
  );

  return (
    <div data-testid="app-shell" className="flex min-h-dvh bg-base text-primary">
      {mobileTerbuka ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[var(--brand-dark)]/50 md:hidden"
          aria-label="Tutup navigasi"
          onClick={() => setMobileTerbuka(false)}
        />
      ) : null}
      {aside}

      <div className="min-w-0 flex-1">
        <Header
          email={email}
          nama={nama}
          onBukaMenu={() => setMobileTerbuka(true)}
          onLipatSidebar={ubahLipatan}
          periode={periode}
          periodeAktifId={periodeAktifId}
          roles={roles}
        />
        <div className="min-h-[calc(100dvh-52px)]">{children}</div>
      </div>
    </div>
  );
}
