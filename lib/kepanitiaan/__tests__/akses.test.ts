import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: {} }));

import { putusanPanitiaDivisi, putusanTulisDivisi, type FaktaDivisi, type Pelaku } from '@/lib/kepanitiaan/akses';

const AKTIF = 'periode-aktif';
const divisi: FaktaDivisi = {
  periodeId: AKTIF,
  ketuaPelaksanaId: 'ketuplak',
  koordinatorId: 'koor-pdd',
  anggotaIds: ['anggota-pdd'],
};
const orang = (userId: string, ...roles: Pelaku['roles'][number][]): Pelaku => ({ userId, roles, periodeId: AKTIF });

describe('bisaTulisDivisi — PRD F-8.3, cermin tulis_divisi() migrasi 039', () => {
  it('koordinator, anggota, dan Ketua Pelaksana menulis divisi itu', () => {
    expect(putusanTulisDivisi(orang('koor-pdd', 'ANGGOTA'), divisi)).toBe(true);
    expect(putusanTulisDivisi(orang('anggota-pdd', 'ANGGOTA'), divisi)).toBe(true);
    expect(putusanTulisDivisi(orang('ketuplak', 'ANGGOTA'), divisi)).toBe(true);
  });

  it('panitia divisi LAIN dalam acara yang sama tidak menulis (INV-30)', () => {
    expect(putusanTulisDivisi(orang('anggota-konsumsi', 'ANGGOTA'), divisi)).toBe(false);
    // Kadept/Ketua Himpunan bukan jalur tulis divisi untuk RAB/job desk/nota.
    expect(putusanTulisDivisi(orang('kadept', 'KADEPT'), divisi)).toBe(false);
    expect(putusanTulisDivisi(orang('ketua', 'KETUA'), divisi)).toBe(false);
  });

  it('Admin dan Bendum menulis seluruh divisi; Bendum tidak lewat jalur panitia', () => {
    expect(putusanTulisDivisi(orang('admin', 'ADMIN'), divisi)).toBe(true);
    expect(putusanTulisDivisi(orang('bendum', 'BENDUM'), divisi)).toBe(true);
    expect(putusanPanitiaDivisi(orang('bendum', 'BENDUM'), divisi)).toBe(false);
  });

  it('BPH yang tercatat panitia tetap tidak menulis; ANGGOTA+BPH menulis sebagai ANGGOTA (INV-03)', () => {
    expect(putusanTulisDivisi(orang('anggota-pdd', 'BPH'), divisi)).toBe(false);
    expect(putusanTulisDivisi(orang('anggota-pdd', 'ANGGOTA', 'BPH'), divisi)).toBe(true);
  });

  it('acara periode lain adalah arsip — baca saja (INV-08)', () => {
    expect(putusanTulisDivisi(orang('koor-pdd', 'ANGGOTA'), { ...divisi, periodeId: 'periode-lalu' })).toBe(false);
  });
});
