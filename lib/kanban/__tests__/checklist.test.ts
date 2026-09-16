/**
 * Unit checklist (murni, klien tiruan — tanpa database).
 *
 * Yang dijaga: skema validasi (K-04), pemetaan kode→HTTP, dan LINGKUP yang
 * diturunkan dari kartu induk (bukan role global). Perilaku SQL/RLS nyata
 * dibuktikan supabase/tests/026_checklist.sql dan e2e/checklist.spec.ts.
 *
 * Sumber: docs/ai/tasks/P4-kanban.md T-081 · docs/ai/CHECKLIST_CONTRACT.md
 */

import { describe, expect, it } from 'vitest';

import type { Konteks } from '@/lib/auth/guard';
import {
  SkemaTambahItem,
  SkemaUbahItem,
  SkemaUrutkan,
  STATUS_GAGAL_CHECKLIST,
  tambahChecklist,
  ubahChecklist,
  type GagalChecklist,
} from '../checklist';

type Baris = { sql: string; params: unknown[] };

function klienTiruan(hasil: unknown[][] = []) {
  const panggilan: Baris[] = [];
  let ke = 0;
  const rekam = (strings: TemplateStringsArray, ...params: unknown[]) => {
    panggilan.push({
      sql: strings.raw.join('?').replace(/\s+/g, ' ').trim(),
      params,
    });
    return Promise.resolve(hasil[ke++] ?? []);
  };
  return {
    panggilan,
    tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof tambahChecklist>[0],
  };
}

const UUID = '11111111-1111-4111-8111-111111111111';
const konteks = (over: Partial<Konteks> = {}): Konteks =>
  ({
    sesi: { userId: 'user-1' },
    periodeId: 'periode-1',
    roles: ['ANGGOTA'],
    departemenIds: ['dept-a'],
    ...over,
  }) as unknown as Konteks;

const kartuDept = {
  card_departemen: 'dept-a',
  card_divisi: null,
  proker_periode: null,
  proker_departemen: null,
};

describe('skema checklist', () => {
  it('SkemaTambahItem menolak teks kosong, menerima assignee/deadline opsional', () => {
    expect(SkemaTambahItem.safeParse({ teks: '   ' }).success).toBe(false);
    expect(SkemaTambahItem.safeParse({ teks: 'Cetak spanduk' }).success).toBe(true);
    expect(
      SkemaTambahItem.safeParse({ teks: 'x', assignee_id: UUID, deadline: '2026-10-01' }).success,
    ).toBe(true);
    expect(SkemaTambahItem.safeParse({ teks: 'x', deadline: '01-10-2026' }).success).toBe(false);
  });

  it('SkemaUbahItem wajib memuat minimal satu field; selesai:false sah', () => {
    expect(SkemaUbahItem.safeParse({}).success).toBe(false);
    expect(SkemaUbahItem.safeParse({ selesai: false }).success).toBe(true);
    expect(SkemaUbahItem.safeParse({ assignee_id: null }).success).toBe(true);
  });

  it('SkemaUrutkan menuntut minimal satu UUID', () => {
    expect(SkemaUrutkan.safeParse({ urutan: [] }).success).toBe(false);
    expect(SkemaUrutkan.safeParse({ urutan: [UUID] }).success).toBe(true);
  });
});

describe('pemetaan kode gagal', () => {
  it('kode → status HTTP', () => {
    expect(STATUS_GAGAL_CHECKLIST).toEqual({
      TIDAK_DITEMUKAN: 404,
      TIDAK_BERWENANG: 403,
      TIDAK_VALID: 422,
    });
  });
});

describe('lingkup diturunkan dari kartu induk', () => {
  it('ANGGOTA departemennya boleh menambah (ada baris user_role cocok)', async () => {
    const { tx, panggilan } = klienTiruan([
      [kartuDept], // lookup kartu
      [{ id: 'role-1' }], // user_role cocok
      [{ id: 'item-1' }], // INSERT RETURNING id
      [{ id: 'item-1', card_id: UUID, teks: 'x', selesai: false, assignee_id: null, assignee_nama: null, deadline: null, urutan: 0 }],
    ]);
    const hasil = await tambahChecklist(tx, konteks(), UUID, { teks: 'Cetak spanduk' });
    expect(hasil.ok).toBe(true);
    expect(panggilan.some((p) => p.sql.includes('INSERT INTO checklist_item'))).toBe(true);
  });

  it('ANGGOTA departemen lain ditolak (tak ada baris user_role)', async () => {
    const { tx } = klienTiruan([[{ ...kartuDept, card_departemen: 'dept-b' }], []]);
    const hasil = await tambahChecklist(tx, konteks(), UUID, { teks: 'x' });
    expect(hasil.ok).toBe(false);
    expect((hasil as GagalChecklist).kode).toBe('TIDAK_BERWENANG');
  });

  it('konteks bertentangan (periode proker ≠ aktif) ditolak sebelum cek role', async () => {
    const { tx, panggilan } = klienTiruan([
      [{ card_departemen: 'dept-a', card_divisi: null, proker_periode: 'periode-lama', proker_departemen: 'dept-a' }],
    ]);
    const hasil = await tambahChecklist(tx, konteks(), UUID, { teks: 'x' });
    expect(hasil.ok).toBe(false);
    expect((hasil as GagalChecklist).kode).toBe('TIDAK_BERWENANG');
    expect(panggilan.some((p) => p.sql.includes('user_role'))).toBe(false);
  });

  it('kartu divisi (bukan departemen) ditolak jalur ini', async () => {
    const { tx } = klienTiruan([
      [{ card_departemen: null, card_divisi: 'div-1', proker_periode: null, proker_departemen: null }],
    ]);
    const hasil = await tambahChecklist(tx, konteks(), UUID, { teks: 'x' });
    expect(hasil.ok).toBe(false);
    expect((hasil as GagalChecklist).kode).toBe('TIDAK_BERWENANG');
  });

  it('ADMIN melewati cek user_role', async () => {
    const { tx, panggilan } = klienTiruan([
      [kartuDept],
      [{ id: 'item-1' }],
      [{ id: 'item-1', card_id: UUID, teks: 'x', selesai: false, assignee_id: null, assignee_nama: null, deadline: null, urutan: 0 }],
    ]);
    const hasil = await tambahChecklist(tx, konteks({ roles: ['ADMIN'] as Konteks['roles'] }), UUID, {
      teks: 'x',
    });
    expect(hasil.ok).toBe(true);
    expect(panggilan.some((p) => p.sql.includes('user_role'))).toBe(false);
  });

  it('kartu tak ditemukan → TIDAK_DITEMUKAN', async () => {
    const { tx } = klienTiruan([[]]);
    const hasil = await tambahChecklist(tx, konteks(), UUID, { teks: 'x' });
    expect((hasil as GagalChecklist).kode).toBe('TIDAK_DITEMUKAN');
  });

  it('ubah item tidak ada → TIDAK_DITEMUKAN', async () => {
    const { tx } = klienTiruan([[]]);
    const hasil = await ubahChecklist(tx, konteks(), UUID, { selesai: true });
    expect((hasil as GagalChecklist).kode).toBe('TIDAK_DITEMUKAN');
  });

  it('ubah dengan body kosong → TIDAK_VALID (setelah lolos lingkup)', async () => {
    const { tx } = klienTiruan([
      [{ card_id: UUID, teks: 'x', selesai: false, assignee_id: null, deadline: null }], // item
      [kartuDept], // lookup kartu (bolehTulisKartu)
      [{ id: 'role-1' }], // user_role cocok
    ]);
    const hasil = await ubahChecklist(tx, konteks(), UUID, {});
    expect((hasil as GagalChecklist).kode).toBe('TIDAK_VALID');
  });
});
