import { describe, expect, it } from 'vitest';

import { grupAktif, hrefAktif, susunMenu, type FaktaMenu } from '../menu';

const tanpa: FaktaMenu = { kodeDepartemen: [], panitia: false };

describe('hrefAktif — hanya satu butir yang menyala', () => {
  const menu = susunMenu(['KETUA'], tanpa);

  it('Kalender Ketersediaan tidak ikut menyalakan Daftar Proker (laporan pemilik)', () => {
    expect(hrefAktif('/proker/kalender', menu)).toBe('/proker/kalender');
  });
  it('detail proker menyalakan Daftar Proker', () => {
    expect(hrefAktif('/proker/0b6c1c2e-1111-4222-8333-444455556666', menu)).toBe('/proker');
  });
  it('detail surat menyalakan Arsip Surat', () => {
    expect(hrefAktif('/surat/abc', menu)).toBe('/surat');
  });
  it('halaman SK Aktif menyalakan butirnya sendiri, bukan Arsip', () => {
    expect(hrefAktif('/surat/keterangan-aktif', menu)).toBe('/surat/keterangan-aktif');
  });
  it('kanban berkode departemen setara tautan tanpa kode', () => {
    expect(hrefAktif('/departemen/EKS/kanban', menu)).toBe('/departemen/kanban');
  });
  it('beranda hanya pada "/"', () => {
    expect(hrefAktif('/', menu)).toBe('/');
    const beranda = menu.find((g) => g.slug === 'beranda')!;
    expect(grupAktif('/proker', beranda, hrefAktif('/proker', menu))).toBe(false);
  });
});

describe('susunMenu — per peran (ADR-037)', () => {
  const label = (roles: Parameters<typeof susunMenu>[0], fakta = tanpa) =>
    susunMenu(roles, fakta).flatMap((g) => [g.label, ...g.items.map((i) => `  ${i.label}`)]);

  it('tidak ada tautan pemilih acara (RAB/LPJ/TOR/Proposal/Divisi) untuk peran mana pun', () => {
    for (const r of ['ADMIN', 'KETUA', 'WAKIL', 'SEKUM', 'BENDUM', 'KADEPT', 'ANGGOTA', 'BPH'] as const) {
      const hrefs = susunMenu([r], tanpa).flatMap((g) => [g.href, ...g.items.map((i) => i.href)]);
      expect(hrefs.filter((h) => h.includes('buka=')), r).toEqual([]);
    }
  });
  it('Buat Surat hanya untuk Sekum (ADR-036)', () => {
    expect(label(['SEKUM'])).toContain('  Buat Surat');
    for (const r of ['KETUA', 'BENDUM', 'KADEPT', 'ANGGOTA'] as const) expect(label([r])).not.toContain('  Buat Surat');
  });
  it('Kadept satu departemen: tautan langsung ke kanban departemennya', () => {
    const dept = susunMenu(['KADEPT'], { kodeDepartemen: ['EKS'], panitia: false }).find((g) => g.slug === 'departemen')!;
    expect(dept.label).toBe('Departemen Saya');
    expect(dept.items.map((i) => i.href)).toEqual(['/departemen/EKS/kanban', '/departemen/EKS/kendala', '/departemen/EKS/gantt']);
  });
  it('Anggota panitia mendapat Upload Nota; yang bukan panitia tidak', () => {
    expect(label(['ANGGOTA'], { kodeDepartemen: ['KAD'], panitia: true })).toContain('  Upload Nota');
    expect(label(['ANGGOTA'], { kodeDepartemen: ['KAD'], panitia: false }).join()).not.toContain('Upload Nota');
  });
  it('grup satu butir menjadi satu tautan bernama butirnya', () => {
    const surat = susunMenu(['BENDUM'], tanpa).find((g) => g.slug === 'surat')!;
    expect(surat).toMatchObject({ label: 'Surat Keterangan Aktif', href: '/surat/keterangan-aktif', items: [] });
  });
  it('multi-peran mendapat gabungan menu tanpa duplikat', () => {
    const m = susunMenu(['KADEPT', 'BPH'], { kodeDepartemen: ['RND'], panitia: false });
    // Butir submenu (dan tautan tunggal) tidak boleh muncul dua kali di seluruh sidebar.
    const semua = m.flatMap((g) => (g.items.length ? g.items.map((i) => i.href) : [g.href]));
    expect(new Set(semua).size).toBe(semua.length);
    expect(m.map((g) => g.slug)).toEqual(expect.arrayContaining(['departemen', 'proker', 'admin']));
  });
});
