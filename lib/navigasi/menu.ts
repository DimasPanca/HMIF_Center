/**
 * Susunan menu sidebar per peran (ADR-037).
 *
 * Setiap peran hanya melihat menu yang ia kerjakan, diurutkan menurut
 * pekerjaannya sehari-hari. Menu yang sudah menjadi TAB di halaman acara
 * (RAB, LPJ, TOR, Proposal, Ruang Kerja Divisi, Nota per acara) tidak diulang
 * di sidebar. Modul murni: tidak membaca DB dan tidak bergantung pada React,
 * sehingga dapat diuji langsung dan dipakai harness `/qa/sidebar`.
 *
 * Hak akses tetap diputuskan `can()` (T-051 "Jangan"): setiap butir punya
 * `syarat`, dan butir tanpa hak tidak pernah muncul walau ada di daftar
 * peran. Pengguna multi-peran mendapat gabungan menunya.
 */

import { can, type Permission, type RoleCode } from '@/lib/auth/permissions';

export type SlugMenu = 'beranda' | 'proker' | 'acara' | 'surat' | 'keuangan' | 'sekretariat' | 'departemen' | 'admin';
export type ModeMenu = 'penuh' | 'baca';
export type BadgeMenu = 'proker' | 'surat' | 'nota';
export type IkonMenu =
  | 'beranda' | 'proker' | 'tambah' | 'kalender' | 'gantt' | 'approval' | 'acara' | 'surat' | 'buat-surat' | 'massal'
  | 'arsip' | 'sk-aktif' | 'keuangan' | 'nota' | 'verifikasi' | 'sekretariat' | 'notulensi' | 'pengurus' | 'ruangan'
  | 'departemen' | 'kanban' | 'kendala' | 'admin' | 'pengguna' | 'periode' | 'backup' | 'audit';

export interface ItemMenu {
  label: string;
  href: string;
  ikon: IkonMenu;
  badge?: BadgeMenu;
  /** `data-testid="sidebar-sub-<testid>"` — dipakai gate e2e. */
  testid?: 'proker-approval' | 'surat-approval';
}

export interface GrupMenu {
  slug: SlugMenu;
  label: string;
  href: string;
  ikon: IkonMenu;
  mode: ModeMenu;
  /** Kosong = grup ditampilkan sebagai satu tautan. */
  items: ItemMenu[];
}

export interface FaktaMenu {
  /** Kode departemen pengguna di periode aktif (Kadept/Anggota). */
  kodeDepartemen: readonly string[];
  /** Pengguna duduk di kepanitiaan acara periode aktif (Anggota: boleh unggah nota). */
  panitia: boolean;
}

type Butir = ItemMenu & { syarat?: Permission | readonly Permission[] };
interface RencanaGrup {
  slug: SlugMenu;
  label: string;
  href: string;
  ikon: IkonMenu;
  items: Butir[];
}

const boleh = (roles: readonly RoleCode[], syarat?: Permission | readonly Permission[]) =>
  !syarat || (typeof syarat === 'string' ? can(roles, syarat) : syarat.some((p) => can(roles, p)));

function akses(roles: readonly RoleCode[], baca: Permission, tulis: readonly Permission[]): ModeMenu | null {
  if (tulis.some((p) => can(roles, p))) return 'penuh';
  return can(roles, baca) ? 'baca' : null;
}

/** Mode tiap grup — sama untuk semua peran; ditentukan matriks permission. */
const MODE: Record<SlugMenu, (roles: readonly RoleCode[]) => ModeMenu | null> = {
  beranda: () => 'penuh',
  proker: (r) => akses(r, 'proker.read', ['proker.create', 'proker.approve']),
  acara: (r) => akses(r, 'kepanitiaan.read', ['kepanitiaan.update', 'rab.update', 'nota.create', 'nota.verify']),
  surat: (r) => akses(r, 'surat.read', ['surat.create', 'surat.approve', 'surat.ajukan_aktif']),
  keuangan: (r) => akses(r, 'nota.read', ['nota.verify', 'nota.create']),
  sekretariat: (r) => akses(r, 'notulensi.read', ['notulensi.create', 'pengurus.create', 'ruangan.create']),
  departemen: (r) => akses(r, 'kanban.read', ['kanban.create', 'kendala.create']),
  admin: (r) => akses(r, 'audit.read', ['user.create', 'backup.manage']),
};

function rencana(peran: RoleCode, fakta: FaktaMenu): RencanaGrup[] {
  const kode = fakta.kodeDepartemen.length === 1 ? fakta.kodeDepartemen[0]! : null;
  const dept = (bagian: 'kanban' | 'kendala' | 'gantt') => (kode ? `/departemen/${encodeURIComponent(kode)}/${bagian}` : `/departemen/${bagian === 'gantt' ? 'kanban' : bagian}`);

  const beranda: RencanaGrup = { slug: 'beranda', label: 'Beranda', href: '/', ikon: 'beranda', items: [] };
  const acara: RencanaGrup = { slug: 'acara', label: 'Acara Besar', href: '/acara', ikon: 'acara', items: [] };
  const I = {
    daftarProker: { label: 'Daftar Proker', href: '/proker', ikon: 'proker', syarat: 'proker.read' },
    buatProker: { label: 'Buat Proker', href: '/proker/baru', ikon: 'tambah', syarat: 'proker.create' },
    kalender: { label: 'Kalender Ketersediaan', href: '/proker/kalender', ikon: 'kalender', syarat: 'proker.read' },
    gantt: { label: 'Gantt Departemen', href: '/proker/gantt', ikon: 'gantt', syarat: 'master_gantt.read' },
    approvalProker: { label: 'Antrian Approval', href: '/proker/approval', ikon: 'approval', badge: 'proker', testid: 'proker-approval', syarat: 'proker.approve' },
    buatSurat: { label: 'Buat Surat', href: '/surat/baru', ikon: 'buat-surat', syarat: 'surat.create' },
    massal: { label: 'Surat Aktif Massal', href: '/surat/massal', ikon: 'massal', syarat: 'surat.create' },
    approvalSurat: { label: 'Antrian Approval', href: '/surat/approval', ikon: 'approval', badge: 'surat', testid: 'surat-approval', syarat: 'surat.approve' },
    arsip: { label: 'Arsip Surat', href: '/surat', ikon: 'arsip', syarat: 'surat.read' },
    skAktif: { label: 'Surat Keterangan Aktif', href: '/surat/keterangan-aktif', ikon: 'sk-aktif', syarat: 'surat.ajukan_aktif' },
    verifikasi: { label: 'Verifikasi Nota', href: '/keuangan/nota/verifikasi', ikon: 'verifikasi', badge: 'nota', syarat: 'nota.verify' },
    semuaNota: { label: 'Semua Nota', href: '/keuangan/nota/semua', ikon: 'nota', syarat: 'nota.verify' },
    uploadNota: { label: 'Upload Nota', href: '/keuangan/nota', ikon: 'nota', syarat: 'nota.create' },
    notulensi: { label: 'Notulensi', href: '/sekretariat/notulensi', ikon: 'notulensi', syarat: 'notulensi.read' },
    pengurus: { label: 'Data Pengurus', href: '/sekretariat/pengurus', ikon: 'pengurus', syarat: 'pengurus.read' },
    ruangan: { label: 'Peminjaman Ruangan', href: '/sekretariat/ruangan', ikon: 'ruangan', syarat: ['ruangan.read', 'ruangan.create'] },
    kanban: { label: 'Kanban', href: dept('kanban'), ikon: 'kanban', syarat: 'kanban.read' },
    kendala: { label: 'Kendala', href: dept('kendala'), ikon: 'kendala', syarat: 'kendala.read' },
    ganttDept: { label: 'Gantt Departemen', href: kode ? dept('gantt') : '/proker/gantt', ikon: 'gantt', syarat: 'gantt.read' },
    pengguna: { label: 'Pengguna & Peran', href: '/admin/pengguna', ikon: 'pengguna', syarat: 'user.create' },
    periode: { label: 'Periode Kepengurusan', href: '/admin/periode', ikon: 'periode', syarat: 'periode.create' },
    backup: { label: 'Backup & Restore', href: '/admin/backup', ikon: 'backup', syarat: 'backup.manage' },
    audit: { label: 'Audit Log', href: '/admin/audit', ikon: 'audit', syarat: 'audit.read' },
  } satisfies Record<string, Butir>;

  const proker = (items: Butir[]): RencanaGrup => ({ slug: 'proker', label: 'Program Kerja', href: '/proker', ikon: 'proker', items });
  const surat = (items: Butir[]): RencanaGrup => ({ slug: 'surat', label: 'Persuratan', href: '/surat', ikon: 'surat', items });
  const sekretariat = (items: Butir[]): RencanaGrup => ({ slug: 'sekretariat', label: 'Kesekretariatan', href: '/sekretariat/notulensi', ikon: 'sekretariat', items });

  switch (peran) {
    case 'KETUA':
    case 'WAKIL':
      return [
        beranda,
        proker([I.daftarProker, I.kalender, I.gantt, I.approvalProker]),
        acara,
        surat([I.approvalSurat, I.arsip, I.skAktif]),
        { slug: 'departemen', label: 'Departemen', href: '/departemen/kanban', ikon: 'departemen', items: [I.kanban, I.kendala] },
        sekretariat([I.notulensi]),
      ];
    case 'SEKUM':
      return [
        beranda,
        surat([I.buatSurat, I.massal, I.approvalSurat, I.arsip]),
        sekretariat([I.notulensi, I.pengurus, I.ruangan]),
        proker([I.daftarProker, I.kalender]),
        acara,
      ];
    case 'BENDUM':
      return [
        beranda,
        { slug: 'keuangan', label: 'Keuangan', href: '/keuangan/nota/verifikasi', ikon: 'keuangan', items: [I.verifikasi, I.semuaNota] },
        acara,
        surat([I.skAktif]),
      ];
    case 'KADEPT':
      return [
        beranda,
        { slug: 'departemen', label: 'Departemen Saya', href: dept('kanban'), ikon: 'departemen', items: [I.kanban, I.kendala, I.ganttDept] },
        proker([I.daftarProker, I.buatProker, I.kalender]),
        acara,
        sekretariat([I.notulensi, I.ruangan]),
        surat([I.skAktif]),
      ];
    case 'ANGGOTA':
      return [
        beranda,
        { slug: 'departemen', label: 'Departemen Saya', href: dept('kanban'), ikon: 'departemen', items: [{ ...I.kanban, label: 'Tugas Saya' }, I.kendala] },
        { ...acara, label: 'Acara Saya', items: fakta.panitia ? [{ label: 'Acara Saya', href: '/acara', ikon: 'acara' }, I.uploadNota] : [] },
        surat([I.skAktif]),
      ];
    case 'BPH':
      return [beranda, proker([I.daftarProker, I.gantt]), acara, surat([I.arsip]), { slug: 'admin', label: 'Audit Log', href: '/admin/audit', ikon: 'audit', items: [I.audit] }];
    case 'ADMIN':
      return [beranda, { slug: 'admin', label: 'Administrasi', href: '/admin/pengguna', ikon: 'admin', items: [I.pengguna, I.periode, I.backup, I.audit] }];
  }
}

/** Urutan prioritas saat menggabungkan peran: susunan peran paling "berat" dipakai lebih dulu. */
const PRIORITAS: readonly RoleCode[] = ['ADMIN', 'KETUA', 'WAKIL', 'SEKUM', 'BENDUM', 'KADEPT', 'ANGGOTA', 'BPH'];

export function susunMenu(roles: readonly RoleCode[], fakta: FaktaMenu): GrupMenu[] {
  const peta = new Map<SlugMenu, RencanaGrup>();
  for (const peran of PRIORITAS.filter((p) => roles.includes(p))) {
    for (const g of rencana(peran, fakta)) {
      const ada = peta.get(g.slug);
      if (!ada) {
        peta.set(g.slug, { ...g, items: [...g.items] });
        continue;
      }
      for (const it of g.items) if (!ada.items.some((x) => x.href === it.href)) ada.items.push(it);
    }
  }
  const hasil: GrupMenu[] = [];
  for (const g of peta.values()) {
    const mode = MODE[g.slug](roles);
    if (!mode) continue;
    const items: ItemMenu[] = g.items
      .filter((it) => boleh(roles, it.syarat))
      .map((it) => ({ label: it.label, href: it.href, ikon: it.ikon, badge: it.badge, testid: it.testid }));
    // Grup yang semua butirnya gugur karena hak tidak ditampilkan (kecuali grup tautan tunggal).
    if (g.items.length > 0 && items.length === 0) continue;
    // Satu butir saja: tampil sebagai satu tautan dengan nama butirnya, tanpa submenu.
    if (items.length === 1) {
      const [satu] = items;
      hasil.push({ slug: g.slug, label: satu!.label, href: satu!.href, ikon: satu!.ikon, mode, items: [] });
      continue;
    }
    hasil.push({ slug: g.slug, label: g.label, href: g.href, ikon: g.ikon, mode, items });
  }
  return hasil;
}

// ---------------------------------------------------------------------------
// Penanda aktif
// ---------------------------------------------------------------------------

const AWALAN_GRUP: Record<SlugMenu, readonly string[]> = {
  beranda: [],
  proker: ['/proker'],
  acara: ['/acara'],
  surat: ['/surat'],
  keuangan: ['/keuangan'],
  sekretariat: ['/sekretariat'],
  departemen: ['/departemen'],
  admin: ['/admin'],
};

const jalur = (href: string) => href.split('?')[0]!;
const cocok = (pathname: string, awalan: string) => pathname === awalan || pathname.startsWith(`${awalan}/`);

/** `/departemen/EKS/kanban` setara `/departemen/kanban` untuk menu tanpa kode departemen. */
function bentukSetara(pathname: string): string[] {
  const m = /^\/departemen\/[^/]+\/(kanban|kendala|gantt)(\/.*)?$/.exec(pathname);
  return m ? [pathname, `/departemen/${m[1]}${m[2] ?? ''}`] : [pathname];
}

/**
 * Href SATU butir yang aktif: yang jalurnya paling panjang dan cocok. Dengan
 * begitu `/proker/kalender` hanya menyalakan "Kalender Ketersediaan", bukan
 * juga "Daftar Proker" (`/proker`).
 */
export function hrefAktif(pathname: string, menu: readonly GrupMenu[]): string | null {
  let terbaik: string | null = null;
  let panjang = -1;
  for (const p of bentukSetara(pathname)) {
    for (const g of menu) {
      for (const h of [g.href, ...g.items.map((i) => i.href)]) {
        const j = jalur(h);
        const kena = j === '/' ? p === '/' : cocok(p, j);
        if (kena && j.length > panjang) {
          terbaik = h;
          panjang = j.length;
        }
      }
    }
  }
  return terbaik;
}

/** Grup aktif: memuat butir aktif, atau jalurnya berada di bawah awalan grup. */
export function grupAktif(pathname: string, grup: GrupMenu, aktif: string | null): boolean {
  if (grup.slug === 'beranda') return pathname === '/';
  if (aktif && (grup.href === aktif || grup.items.some((i) => i.href === aktif))) return true;
  return AWALAN_GRUP[grup.slug].some((a) => cocok(pathname, a));
}
