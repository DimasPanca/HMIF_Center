import type { RoleCode } from '@/lib/auth/permissions';

export type PanelDashboardKey =
  'ketua' | 'sekum' | 'bendum' | 'kadept' | 'anggota' | 'bph' | 'admin';

export type FormatNilaiDashboard = 'angka' | 'rupiah' | 'persen';

export interface ItemDashboard {
  id: string;
  label: string;
  keterangan?: string;
  status?: string;
  prioritas?: string;
  tanggal?: string;
  href?: string;
  nilai?: number | string;
  format?: FormatNilaiDashboard;
  /** Dua field ini adalah kontrak navigasi gate T-077. */
  jenis?: 'PROKER' | 'SURAT';
  entitas_id?: string;
}

export type KartuDashboard =
  | {
      kunci: string;
      panel: PanelDashboardKey;
      judul: string;
      tersedia: true;
      data: ItemDashboard[];
    }
  | {
      kunci: string;
      panel: PanelDashboardKey;
      judul: string;
      tersedia: false;
      menunggu: string;
    };

export interface DashboardData {
  peran: RoleCode[];
  lingkup: { departemenIds: string[]; userId: string };
  badgeApproval: number;
  kartu: Record<string, KartuDashboard>;
}

export const KUNCI_PANEL: Record<PanelDashboardKey, readonly string[]> = {
  ketua: ['approval-antrian', 'kendala-kritis', 'keuangan-ringkas', 'aktivitas-terbaru'],
  sekum: ['approval-antrian', 'surat-terbit-bulan', 'notulensi-terakhir', 'nomor-surat-terakhir'],
  bendum: ['rab-rekap', 'nota-verifikasi', 'sisa-anggaran', 'lpj-progres'],
  kadept: ['proker-departemen', 'kanban-ringkas', 'kendala-terbuka', 'deadline-terdekat'],
  anggota: ['tugas-saya', 'deadline-terdekat', 'kendala-saya'],
  bph: ['ringkasan-departemen', 'kendala-lintas', 'statistik-kepatuhan'],
  admin: ['sistem-kesehatan', 'statistik-user', 'backup-terakhir', 'audit-terbaru'],
};

const URUTAN_PANEL: readonly PanelDashboardKey[] = [
  'ketua',
  'sekum',
  'bendum',
  'kadept',
  'anggota',
  'bph',
  'admin',
];

export function panelUntukPeran(peran: readonly RoleCode[]): PanelDashboardKey[] {
  const hasil = new Set<PanelDashboardKey>();
  if (peran.includes('KETUA') || peran.includes('WAKIL')) hasil.add('ketua');
  if (peran.includes('SEKUM')) hasil.add('sekum');
  if (peran.includes('BENDUM')) hasil.add('bendum');
  if (peran.includes('KADEPT')) hasil.add('kadept');
  if (peran.includes('ANGGOTA')) hasil.add('anggota');
  if (peran.includes('BPH')) hasil.add('bph');
  if (peran.includes('ADMIN')) hasil.add('admin');
  return URUTAN_PANEL.filter((panel) => hasil.has(panel));
}

/** Membagi kartu multi-role ke panel pertama yang memilikinya. */
export function alokasiKartu(panel: readonly PanelDashboardKey[]) {
  const sudah = new Set<string>();
  return Object.fromEntries(
    panel.map((nama) => {
      const kunci = KUNCI_PANEL[nama].filter((item) => {
        if (sudah.has(item)) return false;
        sudah.add(item);
        return true;
      });
      return [nama, kunci];
    }),
  ) as Partial<Record<PanelDashboardKey, string[]>>;
}
