import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SkemaAlasan, TRANSISI, bolehTransisi, type StatusSurat } from '@/lib/surat/status';

const SEMUA: StatusSurat[] = ['DRAFT', 'MENUNGGU_APPROVAL', 'DISETUJUI', 'TERBIT', 'DITOLAK', 'DIBATALKAN'];

describe('state machine surat — persis USER_FLOW §11.2', () => {
  it('hanya enam transisi yang sah', () => {
    const sah = SEMUA.flatMap((dari) => SEMUA.filter((ke) => bolehTransisi(dari, ke)).map((ke) => `${dari}→${ke}`));
    expect(sah.sort()).toEqual(
      [
        'DRAFT→MENUNGGU_APPROVAL',
        'MENUNGGU_APPROVAL→DISETUJUI',
        'MENUNGGU_APPROVAL→DITOLAK',
        'DITOLAK→DRAFT',
        'DISETUJUI→TERBIT',
        'TERBIT→DIBATALKAN',
      ].sort(),
    );
  });

  it.each([
    ['DRAFT', 'DISETUJUI', 'draft tidak dapat langsung disetujui (INV-14)'],
    ['MENUNGGU_APPROVAL', 'DIBATALKAN', 'yang menunggu ditolak, bukan dibatalkan'],
    ['DIBATALKAN', 'DRAFT', 'nomor surat dibatalkan tidak didaur ulang (INV-16)'],
    ['TERBIT', 'DRAFT', 'surat terbit tidak dapat diedit'],
    ['DISETUJUI', 'DITOLAK', 'yang sudah bernomor tidak dapat ditolak'],
  ] as [StatusSurat, StatusSurat, string][])('%s → %s ditolak: %s', (dari, ke) => {
    expect(bolehTransisi(dari, ke)).toBe(false);
  });

  it('status tak dikenal tidak punya transisi', () => {
    expect(bolehTransisi('ARSIP', 'DRAFT')).toBe(false);
  });

  it('setiap status enum database tercakup', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/002_enums.sql'), 'utf8');
    const blok = sql.slice(sql.indexOf('surat_status'));
    const enumDb = [...blok.slice(0, blok.indexOf(');')).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
    expect(Object.keys(TRANSISI).sort()).toEqual(enumDb);
  });
});

describe('alasan penolakan dan pembatalan', () => {
  it.each([undefined, '', '   ', '.', 'ok'])('ditolak: %j', (alasan) => {
    expect(SkemaAlasan.safeParse({ alasan }).success).toBe(false);
  });

  it('pesan galat berbahasa Indonesia', () => {
    expect(SkemaAlasan.safeParse({ alasan: '' }).error?.issues[0]?.message).toBe('Alasan wajib diisi, minimal 5 karakter.');
  });

  it('alasan sungguhan diterima dan di-trim', () => {
    const r = SkemaAlasan.safeParse({ alasan: '  Tujuan surat salah  ' });
    expect(r.success && r.data.alasan).toBe('Tujuan surat salah');
  });
});
