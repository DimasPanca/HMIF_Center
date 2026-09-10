/**
 * Test klasifikasi perubahan proker terkunci (murni).
 *
 * Yang dijaga: garis minor/mayor persis di tempatnya. Salah menaruh satu medan
 * berakibat serius — tanggal yang lolos sebagai "minor" akan menggeser kalender
 * tanpa approval (INV-13 bocor), dan deskripsi yang terklasifikasi "mayor" memaksa
 * approval ulang untuk suntingan sepele.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-071 · USER_FLOW §4.4
 */

import { describe, expect, it } from 'vitest';

import { klasifikasiPerubahan, perluApprovalUlang } from '../klasifikasi-perubahan';

const LAMA = {
  nama: 'SYNCHRONIZE',
  kategori: 'TERJADWAL',
  departemen_id: '33333333-3333-4333-8333-333333333333',
  deskripsi: 'Deskripsi lama',
  tujuan: null,
  estimasi_peserta: 100,
  estimasi_anggaran: 5_000_000,
  penanggung_jawab: null,
  sumber_dana: ['KAS_HIMPUNAN'],
  tanggal_mulai_persiapan: '2026-11-01',
  tanggal_hari_h_mulai: '2026-12-06',
  tanggal_hari_h_selesai: '2026-12-07',
  pola_ulang: null,
};

describe('klasifikasiPerubahan', () => {
  it('tanpa perubahan → TIDAK_ADA', () => {
    expect(klasifikasiPerubahan(LAMA, {}).jenis).toBe('TIDAK_ADA');
  });

  it('mengirim nilai sama tidak dihitung berubah', () => {
    const h = klasifikasiPerubahan(LAMA, { deskripsi: 'Deskripsi lama', estimasi_peserta: 100 });
    expect(h.jenis).toBe('TIDAK_ADA');
  });

  it('null vs undefined dianggap setara (medan tetap kosong)', () => {
    expect(klasifikasiPerubahan(LAMA, { tujuan: null, penanggung_jawab: undefined }).jenis).toBe('TIDAK_ADA');
  });

  it('hanya medan minor → MINOR', () => {
    const h = klasifikasiPerubahan(LAMA, { deskripsi: 'baru', estimasi_anggaran: 6_000_000 });
    expect(h.jenis).toBe('MINOR');
    expect(h.medanMinor).toContain('deskripsi');
    expect(h.medanMayor).toEqual([]);
  });

  it('perubahan tanggal → MAYOR', () => {
    const h = klasifikasiPerubahan(LAMA, { tanggal_hari_h_mulai: '2026-12-10' });
    expect(h.jenis).toBe('MAYOR');
    expect(h.medanMayor).toContain('tanggal_hari_h_mulai');
  });

  it('perubahan kategori → MAYOR', () => {
    expect(klasifikasiPerubahan(LAMA, { kategori: 'RESPONSIF' }).jenis).toBe('MAYOR');
  });

  it('perubahan departemen → MAYOR', () => {
    expect(klasifikasiPerubahan(LAMA, { departemen_id: '44444444-4444-4444-8444-444444444444' }).jenis).toBe('MAYOR');
  });

  it('campuran minor + mayor → MAYOR (mayor menang)', () => {
    const h = klasifikasiPerubahan(LAMA, { deskripsi: 'baru', tanggal_mulai_persiapan: '2026-10-20' });
    expect(h.jenis).toBe('MAYOR');
    expect(h.medanMinor).toContain('deskripsi');
    expect(h.medanMayor).toContain('tanggal_mulai_persiapan');
  });

  it('array sumber_dana: beda isi → MINOR, sama → tak berubah', () => {
    expect(klasifikasiPerubahan(LAMA, { sumber_dana: ['KAS_HIMPUNAN', 'SPONSOR'] }).jenis).toBe('MINOR');
    expect(klasifikasiPerubahan(LAMA, { sumber_dana: ['KAS_HIMPUNAN'] }).jenis).toBe('TIDAK_ADA');
  });

  it('medan di luar daftar (mis. status) diabaikan', () => {
    expect(klasifikasiPerubahan(LAMA, { status: 'DIBATALKAN' }).jenis).toBe('TIDAK_ADA');
  });

  it('perluApprovalUlang: true untuk mayor, false untuk minor', () => {
    expect(perluApprovalUlang(LAMA, { tanggal_hari_h_selesai: '2026-12-08' })).toBe(true);
    expect(perluApprovalUlang(LAMA, { deskripsi: 'baru' })).toBe(false);
  });
});
