'use client';

import {
  CalendarDays,
  FilePlus2,
  FileText,
  HelpCircle,
  Home,
  ListChecks,
  Search,
  Target,
  UserRound,
  Users,
  type LucideProps,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { can, type Permission, type RoleCode } from '@/lib/auth/permissions';
import {
  bacaPintasan,
  DAFTAR_PINTASAN,
  JEDA_URUTAN_PINTASAN_MS,
  type AksiPintasan,
} from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

type BagianHasil = 'Aksi cepat' | 'Navigasi' | 'Hasil pencarian';
type JenisEntitas = 'proker' | 'surat' | 'acara' | 'pengurus';

interface HasilPalette {
  deskripsi?: string;
  href: string;
  icon: ComponentType<LucideProps>;
  id: string;
  kataKunci: string;
  label: string;
  pintasan?: readonly string[];
  bagian: BagianHasil;
}

interface PerintahDasar extends HasilPalette {
  izin?: readonly Permission[];
}

interface SumberPencarian {
  endpoint: string;
  izin: Permission;
  keHasil: (data: Record<string, unknown>) => HasilPalette | null;
}

interface CommandPaletteProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  roles: readonly RoleCode[];
}

const PERINTAH: readonly PerintahDasar[] = [
  {
    id: 'buat-proker',
    bagian: 'Aksi cepat',
    label: 'Buat Proker Baru',
    kataKunci: 'buat tambah program kerja proker baru',
    href: '/proker/baru',
    icon: FilePlus2,
    izin: ['proker.create'],
    pintasan: ['N'],
  },
  {
    id: 'buat-surat',
    bagian: 'Aksi cepat',
    label: 'Buat Surat',
    kataKunci: 'buat tambah surat baru persuratan',
    href: '/surat/baru',
    icon: FilePlus2,
    izin: ['surat.create'],
  },
  {
    id: 'beranda',
    bagian: 'Navigasi',
    label: 'Beranda',
    kataKunci: 'beranda home dashboard',
    href: '/',
    icon: Home,
    pintasan: ['G', 'H'],
  },
  {
    id: 'proker',
    bagian: 'Navigasi',
    label: 'Program Kerja',
    kataKunci: 'program kerja proker gantt kalender',
    href: '/proker',
    icon: ListChecks,
    izin: ['proker.read'],
    pintasan: ['G', 'P'],
  },
  {
    id: 'kalender-proker',
    bagian: 'Navigasi',
    label: 'Kalender Ketersediaan',
    kataKunci: 'program kerja proker kalender tanggal',
    href: '/proker/kalender',
    icon: CalendarDays,
    izin: ['proker.read'],
  },
  {
    id: 'approval-proker',
    bagian: 'Navigasi',
    label: 'Antrian Approval Proker',
    kataKunci: 'program kerja proker persetujuan approval',
    href: '/proker/approval',
    icon: ListChecks,
    izin: ['proker.approve'],
  },
  {
    id: 'surat',
    bagian: 'Navigasi',
    label: 'Persuratan',
    kataKunci: 'surat arsip persuratan',
    href: '/surat',
    icon: FileText,
    izin: ['surat.read', 'surat.create'],
    pintasan: ['G', 'S'],
  },
  {
    id: 'acara',
    bagian: 'Navigasi',
    label: 'Acara Besar',
    kataKunci: 'acara kepanitiaan divisi',
    href: '/acara',
    icon: Target,
    izin: ['kepanitiaan.read'],
  },
  {
    id: 'pengurus',
    bagian: 'Navigasi',
    label: 'Data Pengurus',
    kataKunci: 'orang anggota pengurus sekretariat',
    href: '/sekretariat/pengurus',
    icon: Users,
    izin: ['pengurus.read'],
  },
] as const;

function stringDari(data: Record<string, unknown>, ...kunci: string[]): string | null {
  for (const key of kunci) {
    const nilai = data[key];
    if (typeof nilai === 'string' && nilai.trim()) return nilai.trim();
  }
  return null;
}

function idDari(data: Record<string, unknown>): string | null {
  return stringDari(data, 'id', 'proker_id', 'kepanitiaan_id', 'user_id');
}

function hasilEntitas(
  jenis: JenisEntitas,
  icon: ComponentType<LucideProps>,
  data: Record<string, unknown>,
  labelKunci: string[],
  deskripsiKunci: string[],
  href: (id: string) => string,
): HasilPalette | null {
  const id = idDari(data);
  const label = stringDari(data, ...labelKunci);
  if (!id || !label) return null;
  const deskripsi = stringDari(data, ...deskripsiKunci) ?? undefined;

  return {
    id: `${jenis}-${id}`,
    bagian: 'Hasil pencarian',
    label,
    kataKunci: `${label} ${deskripsi ?? ''} ${jenis}`,
    deskripsi,
    href: href(id),
    icon,
  };
}

/**
 * Endpoint yang belum tersedia mengembalikan 404 dan sengaja diabaikan.
 * Palette langsung terhubung saat modul surat, acara, dan pengurus mendarat,
 * tanpa pernah meminta data yang tidak diizinkan role pengguna.
 */
const SUMBER_PENCARIAN: readonly SumberPencarian[] = [
  {
    endpoint: '/api/proker',
    izin: 'proker.read',
    keHasil: (data) =>
      hasilEntitas(
        'proker',
        ListChecks,
        data,
        ['nama'],
        ['nama_departemen', 'status'],
        (id) => `/proker/${id}`,
      ),
  },
  {
    endpoint: '/api/surat',
    izin: 'surat.read',
    keHasil: (data) =>
      hasilEntitas(
        'surat',
        FileText,
        data,
        ['perihal', 'nomor_surat', 'nomor'],
        ['nomor_surat', 'jenis', 'status'],
        (id) => `/surat/${id}`,
      ),
  },
  {
    endpoint: '/api/acara',
    izin: 'kepanitiaan.read',
    keHasil: (data) =>
      hasilEntitas(
        'acara',
        Target,
        data,
        ['nama', 'nama_acara', 'nama_proker'],
        ['nama_departemen', 'status'],
        (id) => `/acara/${id}`,
      ),
  },
  {
    endpoint: '/api/pengurus',
    izin: 'pengurus.read',
    keHasil: (data) =>
      hasilEntitas(
        'pengurus',
        UserRound,
        data,
        ['nama_lengkap', 'nama'],
        ['email', 'nama_departemen', 'role'],
        () => '/sekretariat/pengurus',
      ),
  },
] as const;

function punyaSalahSatu(roles: readonly RoleCode[], izin?: readonly Permission[]): boolean {
  return !izin || izin.some((permission) => can(roles, permission));
}

function daftarDariPayload(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  const kandidat = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : [];

  return kandidat.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
  );
}

function tujuanBuatBaru(pathname: string, roles: readonly RoleCode[]): string | null {
  if (pathname.startsWith('/proker') && can(roles, 'proker.create')) return '/proker/baru';
  if (pathname.startsWith('/surat') && can(roles, 'surat.create')) return '/surat/baru';
  if (pathname.startsWith('/keuangan') && can(roles, 'nota.create')) return '/keuangan/nota';
  return null;
}

export function CommandPalette({ onOpenChange, open, roles }: CommandPaletteProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<'cari' | 'pintasan'>('cari');
  const [query, setQuery] = useState('');
  const [hasilJarakJauh, setHasilJarakJauh] = useState<HasilPalette[]>([]);
  const [sedangMencari, setSedangMencari] = useState(false);
  const [indeksAktif, setIndeksAktif] = useState(0);
  const menungguGRef = useRef(false);
  const timerGRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const perintahDiizinkan = useMemo(
    () => PERINTAH.filter((item) => punyaSalahSatu(roles, item.izin)),
    [roles],
  );
  const queryBersih = query.trim().toLocaleLowerCase('id-ID');
  const hasil = useMemo(() => {
    const lokal = queryBersih
      ? perintahDiizinkan.filter((item) =>
          `${item.label} ${item.kataKunci}`.toLocaleLowerCase('id-ID').includes(queryBersih),
        )
      : perintahDiizinkan;
    return [...lokal, ...hasilJarakJauh].slice(0, 30);
  }, [hasilJarakJauh, perintahDiizinkan, queryBersih]);

  const navigasi = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  useEffect(() => {
    if (!open || queryBersih.length < 2) {
      setHasilJarakJauh([]);
      setSedangMencari(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSedangMencari(true);
      const sumber = SUMBER_PENCARIAN.filter((item) => can(roles, item.izin));
      const semua = await Promise.all(
        sumber.map(async (item) => {
          try {
            const url = new URL(item.endpoint, window.location.origin);
            url.searchParams.set('q', queryBersih);
            const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) return [];
            const payload: unknown = await response.json();
            return daftarDariPayload(payload)
              .map(item.keHasil)
              .filter((hasilItem): hasilItem is HasilPalette => hasilItem !== null)
              .slice(0, 8);
          } catch {
            return [];
          }
        }),
      );

      if (!controller.signal.aborted) {
        setHasilJarakJauh(semua.flat());
        setSedangMencari(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, queryBersih, roles]);

  useEffect(() => setIndeksAktif(0), [mode, queryBersih, hasilJarakJauh]);

  useEffect(() => {
    if (!open) {
      setMode('cari');
      setQuery('');
      setHasilJarakJauh([]);
    }
  }, [open]);

  useEffect(() => {
    function jalankanAksi(aksi: AksiPintasan): boolean {
      switch (aksi) {
        case 'BUKA_PALET':
          setMode('cari');
          onOpenChange(true);
          return true;
        case 'BUKA_DAFTAR':
          setMode('pintasan');
          onOpenChange(true);
          return true;
        case 'TUTUP':
          if (!open) return false;
          onOpenChange(false);
          return true;
        case 'KE_BERANDA':
          navigasi('/');
          return true;
        case 'KE_PROKER':
          if (!can(roles, 'proker.read')) return false;
          navigasi('/proker');
          return true;
        case 'KE_SURAT':
          if (!can(roles, 'surat.read') && !can(roles, 'surat.create')) return false;
          navigasi('/surat');
          return true;
        case 'BUAT_BARU': {
          const tujuan = tujuanBuatBaru(pathname, roles);
          if (!tujuan) return false;
          navigasi(tujuan);
          return true;
        }
        case 'TUNGGU_G':
          return true;
      }
    }

    function tanganiPintasan(event: KeyboardEvent) {
      const dibaca = bacaPintasan(event, menungguGRef.current);
      menungguGRef.current = dibaca.menungguG;

      if (timerGRef.current) clearTimeout(timerGRef.current);
      if (dibaca.menungguG) {
        timerGRef.current = setTimeout(() => {
          menungguGRef.current = false;
        }, JEDA_URUTAN_PINTASAN_MS);
      }

      if (dibaca.aksi && jalankanAksi(dibaca.aksi)) event.preventDefault();
    }

    window.addEventListener('keydown', tanganiPintasan);
    return () => {
      window.removeEventListener('keydown', tanganiPintasan);
      if (timerGRef.current) clearTimeout(timerGRef.current);
    };
  }, [navigasi, onOpenChange, open, pathname, roles]);

  function tanganiKeyboardHasil(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndeksAktif((nilai) => (hasil.length === 0 ? 0 : (nilai + 1) % hasil.length));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndeksAktif((nilai) =>
        hasil.length === 0 ? 0 : (nilai - 1 + hasil.length) % hasil.length,
      );
    }
    if (event.key === 'Enter' && hasil[indeksAktif]) {
      event.preventDefault();
      navigasi(hasil[indeksAktif].href);
    }
  }

  const bagian = ['Aksi cepat', 'Navigasi', 'Hasil pencarian'] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="command-palette"
        overlayClassName="bg-[var(--brand-dark)]/40 backdrop-blur-[4px] backdrop-brightness-100"
        showCloseButton={false}
        className="top-[15dvh] max-h-[70dvh] max-w-[560px] -translate-y-0 gap-0 overflow-hidden p-0 data-[state=open]:zoom-in-[.98]"
      >
        <DialogTitle className="sr-only">
          {mode === 'cari' ? 'Pencarian dan command palette' : 'Daftar pintasan keyboard'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {mode === 'cari'
            ? 'Cari menu dan data yang dapat Anda akses.'
            : 'Daftar pintasan keyboard HMIF Center.'}
        </DialogDescription>

        {mode === 'pintasan' ? (
          <div data-testid="shortcut-list" className="min-h-0 overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-2">
              <HelpCircle className="size-4 text-secondary" aria-hidden="true" />
              <h2 className="text-[14px] font-semibold text-primary">Pintasan keyboard</h2>
            </div>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {DAFTAR_PINTASAN.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-[42px] items-center justify-between gap-4 py-2"
                >
                  <span className="text-[13px] text-secondary">{item.label}</span>
                  <span className="flex shrink-0 gap-1" aria-label={item.tombol.join(' lalu ')}>
                    {item.tombol.map((tombol) => (
                      <kbd
                        key={tombol}
                        className="min-w-6 rounded-xs border border-default bg-subtle px-1.5 py-0.5 text-center font-mono text-[10px] text-secondary"
                      >
                        {tombol}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-tertiary">Tekan Esc untuk menutup.</p>
          </div>
        ) : (
          <>
            <div className="flex h-[46px] items-center gap-2 border-b border-default px-3">
              <Search className="size-4 text-secondary" aria-hidden="true" />
              <input
                autoFocus
                data-testid="command-search"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="command-result-list"
                aria-expanded="true"
                aria-activedescendant={
                  hasil[indeksAktif] ? `command-option-${hasil[indeksAktif].id}` : undefined
                }
                className="h-[34px] min-w-0 flex-1 bg-transparent text-[14px] text-primary outline-none placeholder:text-tertiary"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={tanganiKeyboardHasil}
                placeholder="Cari proker, surat, acara, pengurus..."
                value={query}
              />
              <kbd className="rounded-xs border border-default bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                Esc
              </kbd>
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {sedangMencari
                ? 'Sedang mencari.'
                : `${hasil.length} hasil tersedia${queryBersih ? ` untuk ${query.trim()}` : ''}.`}
            </p>

            <div
              id="command-result-list"
              data-testid="command-result-list"
              role="listbox"
              aria-label="Hasil command palette"
              className="min-h-0 overflow-y-auto p-2"
            >
              {hasil.length === 0 && !sedangMencari ? (
                <div className="px-3 py-8 text-center">
                  <Search className="mx-auto mb-2 size-5 text-tertiary" aria-hidden="true" />
                  <p className="text-[13px] font-medium text-primary">Tidak ada hasil</p>
                  <p className="mt-1 text-[12px] text-secondary">Coba nama atau kata kunci lain.</p>
                </div>
              ) : null}

              {bagian.map((namaBagian) => {
                const itemBagian = hasil.filter((item) => item.bagian === namaBagian);
                if (itemBagian.length === 0) return null;
                return (
                  <section key={namaBagian} aria-labelledby={`command-section-${namaBagian}`}>
                    <h3
                      id={`command-section-${namaBagian}`}
                      className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-tertiary uppercase"
                    >
                      {namaBagian}
                    </h3>
                    {itemBagian.map((item) => {
                      const index = hasil.indexOf(item);
                      const Icon = item.icon;
                      const aktif = index === indeksAktif;
                      return (
                        <button
                          key={item.id}
                          id={`command-option-${item.id}`}
                          type="button"
                          role="option"
                          aria-selected={aktif}
                          data-testid={`command-result-${item.id}`}
                          className={cn(
                            'flex min-h-[42px] w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors duration-fast motion-reduce:transition-none',
                            aktif ? 'bg-[var(--primary-subtle)]' : 'hover:bg-subtle',
                          )}
                          onClick={() => navigasi(item.href)}
                          onMouseEnter={() => setIndeksAktif(index)}
                        >
                          <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-sm bg-subtle text-secondary">
                            <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-primary">
                              {item.label}
                            </span>
                            {item.deskripsi ? (
                              <span className="block truncate text-[11px] text-secondary">
                                {item.deskripsi}
                              </span>
                            ) : null}
                          </span>
                          {item.pintasan ? (
                            <span className="flex shrink-0 gap-1" aria-hidden="true">
                              {item.pintasan.map((tombol) => (
                                <kbd
                                  key={tombol}
                                  className="min-w-5 rounded-xs border border-default bg-panel px-1 py-0.5 text-center font-mono text-[10px] text-tertiary"
                                >
                                  {tombol}
                                </kbd>
                              ))}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </section>
                );
              })}
            </div>

            <div className="flex min-h-[34px] items-center justify-between gap-3 border-t border-default bg-subtle px-3 text-[10px] text-tertiary">
              <span>↑↓ pilih · Enter buka</span>
              <button
                type="button"
                className="rounded-sm px-1.5 py-1 hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2"
                onClick={() => setMode('pintasan')}
              >
                ? Daftar pintasan
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
