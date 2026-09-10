/**
 * Test edit proker terkunci & tolak revisi (murni, klien tiruan — tanpa DB).
 *
 * Yang dijaga (mudah rusak diam-diam, tak terlihat dari UI):
 *   - MINOR tidak menyentuh proker_lock dan tidak memindah status.
 *   - MAYOR meng-snapshot ke proker_revisi, memindah ke MENUNGGU_APPROVAL_REVISI,
 *     dan TIDAK menyentuh proker_lock (kunci lama dipertahankan, INV-13).
 *   - tolakRevisi memulihkan dari snapshot ke DISETUJUI lalu menghapus snapshot.
 * Perilaku SQL nyata + koreografi kunci diuji gate integrasi (gate-first).
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-071 · USER_FLOW §4.4 · INV-13
 */

import { describe, expect, it } from 'vitest';

import { editProkerTerkunci } from '../edit-terkunci';
import { tolakRevisi } from '../approval';

interface Panggilan {
  sql: string;
  params: unknown[];
}

function klienTiruan(hasil: unknown[][] = []) {
  const panggilan: Panggilan[] = [];
  let ke = 0;
  const rekam = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.raw
      .map((s, i) => s + (i < params.length ? `$${i + 1}` : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    panggilan.push({ sql, params });
    return Promise.resolve(hasil[ke++] ?? []);
  };
  return {
    panggilan,
    tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof editProkerTerkunci>[0],
  };
}

const DEPT = '33333333-3333-4333-8333-333333333333';
const KONTEKS = {
  sesi: { userId: '11111111-1111-4111-8111-111111111111', email: 'k@hmif.test', namaLengkap: 'K', isActive: true },
  periodeId: '22222222-2222-4222-8222-222222222222',
  roles: ['KADEPT'] as const,
  departemenIds: [DEPT],
};
const konteks = () => KONTEKS as unknown as Parameters<typeof editProkerTerkunci>[1];

/** Baris proker DISETUJUI TERJADWAL yang valid (untuk validasi ubahProker). */
const PROKER = (o: Record<string, unknown> = {}) => [
  {
    id: 'p1',
    periode_id: KONTEKS.periodeId,
    nama: 'SYNCHRONIZE',
    kategori: 'TERJADWAL',
    status: 'DISETUJUI',
    departemen_id: DEPT,
    nama_departemen: 'X',
    deskripsi: 'lama',
    tujuan: null,
    sasaran: null,
    estimasi_peserta: null,
    penanggung_jawab: null,
    nama_penanggung_jawab: null,
    tanggal_mulai_persiapan: '2026-11-01',
    tanggal_hari_h_mulai: '2026-12-06',
    tanggal_hari_h_selesai: '2026-12-07',
    pola_ulang: null,
    estimasi_anggaran: null,
    sumber_dana: [],
    diajukan_at: null,
    disetujui_oleh: null,
    disetujui_at: null,
    alasan_penolakan: null,
    dibuat_oleh: 'u1',
    terkunci: true,
    ...o,
  },
];

const adaSql = (p: Panggilan[], s: string) => p.some((x) => x.sql.includes(s));
// MUTASI proker_lock (bukan sekadar JOIN baca di detailProker).
const mengubahLock = (p: Panggilan[]) =>
  p.some((x) => /(INSERT INTO|DELETE FROM|UPDATE) proker_lock/.test(x.sql));

describe('editProkerTerkunci', () => {
  it('MINOR: tetap DISETUJUI, tak menyentuh proker_lock / proker_revisi', async () => {
    // detailProker(editProkerTerkunci), detailProker(ubahProker), UPDATE(ubahProker).
    const { tx, panggilan } = klienTiruan([PROKER(), PROKER(), []]);
    const r = await editProkerTerkunci(tx, konteks(), 'p1', { deskripsi: 'baru' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nilai.jenis).toBe('MINOR');
      expect(r.nilai.status).toBe('DISETUJUI');
    }
    expect(adaSql(panggilan, 'proker_revisi')).toBe(false);
    expect(adaSql(panggilan, 'MENUNGGU_APPROVAL_REVISI')).toBe(false);
    expect(mengubahLock(panggilan)).toBe(false);
  });

  it('MAYOR: snapshot + MENUNGGU_APPROVAL_REVISI, TIDAK menyentuh proker_lock', async () => {
    // + INSERT proker_revisi, UPDATE status.
    const { tx, panggilan } = klienTiruan([PROKER(), PROKER(), [], [], []]);
    const r = await editProkerTerkunci(tx, konteks(), 'p1', { tanggal_hari_h_selesai: '2026-12-10' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nilai.jenis).toBe('MAYOR');
      expect(r.nilai.status).toBe('MENUNGGU_APPROVAL_REVISI');
    }
    expect(adaSql(panggilan, 'INSERT INTO proker_revisi')).toBe(true);
    expect(adaSql(panggilan, 'MENUNGGU_APPROVAL_REVISI')).toBe(true);
    expect(mengubahLock(panggilan)).toBe(false); // kunci lama dipertahankan
  });

  it('menolak proker yang bukan DISETUJUI (mis. DRAFT)', async () => {
    const { tx } = klienTiruan([PROKER({ status: 'DRAFT' })]);
    const r = await editProkerTerkunci(tx, konteks(), 'p1', { deskripsi: 'baru' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('STATUS_TIDAK_SESUAI');
  });

  it('perubahan kosong → TIDAK_ADA, tak meng-UPDATE', async () => {
    const { tx, panggilan } = klienTiruan([PROKER()]);
    const r = await editProkerTerkunci(tx, konteks(), 'p1', {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.jenis).toBe('TIDAK_ADA');
    expect(adaSql(panggilan, 'UPDATE proker')).toBe(false);
  });
});

describe('tolakRevisi', () => {
  const SNAP = [
    {
      tanggal_mulai_persiapan: '2026-11-01',
      tanggal_hari_h_mulai: '2026-12-06',
      tanggal_hari_h_selesai: '2026-12-07',
      kategori: 'TERJADWAL',
      departemen_id: DEPT,
      pola_ulang: null,
    },
  ];

  it('mengembalikan tanggal lama ke DISETUJUI dan menghapus snapshot', async () => {
    // detailProker, SELECT proker_revisi, UPDATE proker, DELETE proker_revisi.
    const { tx, panggilan } = klienTiruan([
      PROKER({ status: 'MENUNGGU_APPROVAL_REVISI' }),
      SNAP,
      [],
      [],
    ]);
    const r = await tolakRevisi(tx, konteks() as never, 'p1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.status).toBe('DISETUJUI');
    expect(panggilan.some((p) => p.sql.includes('UPDATE proker') && p.sql.includes('DISETUJUI'))).toBe(true);
    expect(adaSql(panggilan, 'DELETE FROM proker_revisi')).toBe(true);
    // Tidak pernah menyentuh proker_lock — kunci lama tetap.
    expect(mengubahLock(panggilan)).toBe(false);
  });

  it('menolak bila status bukan MENUNGGU_APPROVAL_REVISI', async () => {
    const { tx } = klienTiruan([PROKER({ status: 'DISETUJUI' })]);
    const r = await tolakRevisi(tx, konteks() as never, 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('STATUS_TIDAK_SESUAI');
  });

  it('gagal bila snapshot tak ada (keadaan tak konsisten)', async () => {
    const { tx } = klienTiruan([PROKER({ status: 'MENUNGGU_APPROVAL_REVISI' }), []]);
    const r = await tolakRevisi(tx, konteks() as never, 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('STATUS_TIDAK_SESUAI');
  });
});
