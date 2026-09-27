import type { RoleCode } from '@/lib/auth/permissions';

export const LABEL_PERAN: Record<RoleCode, string> = {
  ADMIN: 'Admin',
  KETUA: 'Ketua',
  WAKIL: 'Wakil Ketua',
  SEKUM: 'Sekretaris Umum',
  BENDUM: 'Bendahara Umum',
  KADEPT: 'Kepala Departemen',
  ANGGOTA: 'Anggota Departemen',
  BPH: 'BPH',
};

/** Peran yang wajib punya departemen (CHECK `role_dept_wajib` migrasi 003). */
export const PERAN_BERDEPARTEMEN: readonly RoleCode[] = ['KADEPT', 'ANGGOTA'];
