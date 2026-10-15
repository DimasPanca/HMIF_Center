'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Archive,
  Banknote,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FilePlus2,
  FileText,
  FolderArchive,
  Gauge,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  MailCheck,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  Users,
  WalletCards,
  X,
  type LucideProps,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { Avatar } from '@/components/ui/avatar';
import { can, type Permission, type RoleCode } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

const KUNCI_COLLAPSE = 'hmif-sidebar-collapsed';

export type ModeMenu = 'penuh' | 'baca';

export interface PilihanPeriode {
  id: string;
  nama: string;
  status: 'AKTIF' | 'ARSIP' | 'PERSIAPAN';
}

export interface JumlahApproval {
  proker: number;
  surat: number;
}

interface Submenu {
  slug?: 'proker-approval' | 'surat-approval';
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
  tampil?: (roles: readonly RoleCode[]) => boolean;
  badge?: keyof JumlahApproval;
}

interface MenuUtama {
  slug:
    'beranda' | 'proker' | 'acara' | 'surat' | 'keuangan' | 'sekretariat' | 'departemen' | 'admin';
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
  mode: (roles: readonly RoleCode[]) => ModeMenu | null;
  submenu?: Submenu[];
}

interface SidebarProps {
  children: ReactNode;
  email: string;
  jumlahApproval: JumlahApproval;
  nama: string;
  periode: PilihanPeriode[];
  periodeAktifId: string;
  roles: readonly RoleCode[];
}

function punya(roles: readonly RoleCode[], permission: Permission): boolean {
  return can(roles, permission);
}

function akses(
  roles: readonly RoleCode[],
  baca: Permission,
  tulis: readonly Permission[],
): ModeMenu | null {
  if (tulis.some((permission) => punya(roles, permission))) return 'penuh';
  return punya(roles, baca) ? 'baca' : null;
}

/**
 * Definisi menu hanya memilih permission yang mewakili isi tiap kelompok.
 * Keputusan role tetap berada di `can()`; komponen tidak pernah membandingkan
 * kode role secara langsung (kontrak T-051 dan INV-02).
 */
const MENU: MenuUtama[] = [
  {
    slug: 'beranda',
    label: 'Beranda',
    href: '/',
    icon: LayoutDashboard,
    mode: () => 'penuh',
  },
  {
    slug: 'proker',
    label: 'Program Kerja',
    href: '/proker',
    icon: ListChecks,
    mode: (roles) => akses(roles, 'master_gantt.read', ['surat.create', 'kanban.create']),
    submenu: [
      { label: 'Daftar Proker', href: '/proker', icon: ListChecks },
      { label: 'Kalender Ketersediaan', href: '/proker/kalender', icon: CalendarDays },
      { label: 'Gantt Departemen', href: '/proker/gantt', icon: Gauge },
      {
        slug: 'proker-approval',
        label: 'Antrian Approval',
        href: '/proker/approval',
        icon: ClipboardCheck,
        tampil: (roles) => punya(roles, 'proker.approve'),
        badge: 'proker',
      },
    ],
  },
  {
    slug: 'acara',
    label: 'Acara Besar',
    href: '/acara',
    icon: Target,
    mode: (roles) => akses(roles, 'kepanitiaan.read', ['surat.create', 'kanban.create']),
    submenu: [
      { label: 'Daftar Acara', href: '/acara', icon: Target },
      { label: 'Ruang Kerja Divisi', href: '/acara/ruang-kerja', icon: Users },
      { label: 'TOR', href: '/acara/tor', icon: ScrollText },
      { label: 'Proposal', href: '/acara/proposal', icon: FileText },
    ],
  },
  {
    slug: 'surat',
    label: 'Persuratan',
    href: '/surat',
    icon: FileText,
    mode: (roles) => akses(roles, 'surat.read', ['surat.create']),
    submenu: [
      {
        label: 'Buat Surat',
        href: '/surat/baru',
        icon: FilePlus2,
        tampil: (roles) => punya(roles, 'surat.create'),
      },
      {
        slug: 'surat-approval',
        label: 'Antrian Approval',
        href: '/surat/approval',
        icon: MailCheck,
        tampil: (roles) => punya(roles, 'surat.approve'),
        badge: 'surat',
      },
      { label: 'Arsip Surat', href: '/surat', icon: Archive },
    ],
  },
  {
    slug: 'keuangan',
    label: 'Keuangan',
    href: '/keuangan',
    icon: CircleDollarSign,
    mode: (roles) => akses(roles, 'rab.read', ['rab.create', 'rab.update']),
    submenu: [
      { label: 'RAB', href: '/keuangan/rab', icon: WalletCards },
      {
        label: 'Upload Nota',
        href: '/keuangan/nota',
        icon: ReceiptText,
        tampil: (roles) => punya(roles, 'nota.create'),
      },
      {
        label: 'Verifikasi Nota',
        href: '/keuangan/verifikasi-nota',
        icon: ShieldCheck,
        tampil: (roles) => punya(roles, 'nota.verify'),
      },
      { label: 'LPJ', href: '/keuangan/lpj', icon: Banknote },
    ],
  },
  {
    slug: 'sekretariat',
    label: 'Kesekretariatan',
    href: '/sekretariat',
    icon: FolderArchive,
    mode: (roles) => akses(roles, 'notulensi.read', ['notulensi.delete']),
    submenu: [
      { label: 'Notulensi', href: '/sekretariat/notulensi', icon: ScrollText },
      { label: 'Data Pengurus', href: '/sekretariat/pengurus', icon: Users },
      {
        label: 'Peminjaman Ruangan',
        href: '/sekretariat/ruangan',
        icon: Building2,
        // Anggota tidak punya hak apa pun di modul ini (PRD §5.1); Kadept hanya C*.
        tampil: (roles) => punya(roles, 'ruangan.read') || punya(roles, 'ruangan.create'),
      },
      { label: 'Arsip Dokumen', href: '/sekretariat/arsip', icon: Archive },
    ],
  },
  {
    slug: 'departemen',
    label: 'Departemen',
    href: '/departemen',
    icon: Building2,
    mode: (roles) => akses(roles, 'kanban.read', ['kanban.create']),
    submenu: [
      { label: 'Kanban', href: '/departemen/kanban', icon: KanbanSquare },
      { label: 'Kendala', href: '/departemen/kendala', icon: ShieldCheck },
    ],
  },
  {
    slug: 'admin',
    label: 'Administrasi',
    href: '/admin',
    icon: Settings,
    mode: (roles) => akses(roles, 'backup.read', ['user.create']),
    submenu: [
      {
        label: 'Pengguna & Role',
        href: '/admin/pengguna',
        icon: Users,
        tampil: (roles) => punya(roles, 'user.create'),
      },
      {
        label: 'Periode Kepengurusan',
        href: '/admin/periode',
        icon: CalendarDays,
        tampil: (roles) => punya(roles, 'periode.create'),
      },
      {
        label: 'Konfigurasi Sistem',
        href: '/admin/konfigurasi',
        icon: Settings,
        tampil: (roles) => punya(roles, 'user.create'),
      },
      {
        label: 'Backup & Restore',
        href: '/admin/backup',
        icon: Archive,
        tampil: (roles) => punya(roles, 'backup.manage'),
      },
      {
        label: 'Audit Log',
        href: '/admin/audit',
        icon: ScrollText,
        tampil: (roles) => punya(roles, 'audit.read'),
      },
    ],
  },
];

function aktif(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function BadgeAngka({ nilai }: { nilai: number }) {
  if (nilai <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[11px] leading-5 font-semibold text-[var(--primary-text)] tabular-nums">
      {nilai > 99 ? '99+' : nilai}
    </span>
  );
}

export function Sidebar({
  children,
  email,
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

  const daftar = useMemo(
    () =>
      MENU.map((item) => ({ ...item, modeAktif: item.mode(roles) })).filter(
        (item): item is MenuUtama & { modeAktif: ModeMenu } => item.modeAktif !== null,
      ),
    [roles],
  );

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
          {daftar.map((item) => {
            const Icon = item.icon;
            const itemAktif = aktif(pathname, item.href);
            const submenu = item.submenu?.filter((sub) => !sub.tampil || sub.tampil(roles)) ?? [];

            return (
              <li key={item.slug}>
                <Link
                  href={item.href}
                  data-testid={`sidebar-menu-${item.slug}`}
                  data-mode={item.modeAktif}
                  title={!tampilkanLabel ? item.label : undefined}
                  className={cn(
                    'relative flex h-[34px] items-center gap-2 rounded-sm px-3 text-[13px] font-medium transition-colors duration-fast motion-reduce:transition-none',
                    itemAktif
                      ? 'bg-[var(--primary-subtle)] text-[var(--primary)] before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--primary)]'
                      : 'text-secondary hover:bg-muted hover:text-primary',
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  {tampilkanLabel ? (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.modeAktif === 'baca' ? (
                        <span className="ml-auto text-[10px] font-medium text-tertiary">Baca</span>
                      ) : null}
                    </>
                  ) : null}
                </Link>

                {tampilkanLabel && submenu.length > 0 ? (
                  <ul className="mt-1 ml-5 space-y-0.5 border-l border-default pl-2">
                    {submenu.map((sub) => {
                      const SubIcon = sub.icon;
                      const mode: ModeMenu = 'penuh';
                      return (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            data-testid={sub.slug ? `sidebar-sub-${sub.slug}` : undefined}
                            data-mode={sub.slug ? mode : undefined}
                            className={cn(
                              'flex min-h-[30px] items-center gap-2 rounded-sm px-2 py-1 text-[12px] text-secondary transition-colors duration-fast hover:bg-muted hover:text-primary motion-reduce:transition-none',
                              aktif(pathname, sub.href) && 'bg-muted text-primary',
                            )}
                          >
                            <SubIcon
                              className="size-3.5 shrink-0"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <span className="truncate">{sub.label}</span>
                            {sub.badge ? <BadgeAngka nilai={jumlahApproval[sub.badge]} /> : null}
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
