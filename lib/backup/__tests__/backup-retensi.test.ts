import { describe, expect, it } from 'vitest';

import {
  BATAS_MANUAL_PER_HARI,
  SIMPAN_OTOMATIS,
  pilihUntukDihapus,
  type BarisRetensi,
} from '@/lib/backup/retensi';
import { mulaiBackup } from '@/lib/backup/service';

const hari = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);

function otomatis(n: number, status: BarisRetensi['status'] = 'SUKSES'): BarisRetensi {
  return {
    id: `oto-${String(n).padStart(2, '0')}`,
    jenis: 'OTOMATIS',
    status,
    created_at: hari(n * 30),
  };
}

describe('backup-retensi (ADR-016)', () => {
  it('simulasi 15 backup otomatis menyisakan 12 yang terbaru', () => {
    const baris = Array.from({ length: 15 }, (_, i) => otomatis(i + 1));
    const hapus = pilihUntukDihapus(baris);
    expect(SIMPAN_OTOMATIS).toBe(12);
    expect(hapus.sort()).toEqual(['oto-01', 'oto-02', 'oto-03']);
    const sisa = baris.filter((b) => !hapus.includes(b.id));
    expect(sisa).toHaveLength(12);
    expect(Math.min(...sisa.map((b) => b.created_at.getTime()))).toBe(hari(4 * 30).getTime());
  });

  it('backup MANUAL dan PRA_RESTORE tidak pernah ikut terhapus, setua apa pun', () => {
    const baris: BarisRetensi[] = [
      ...Array.from({ length: 13 }, (_, i) => otomatis(i + 10)),
      { id: 'manual-tua', jenis: 'MANUAL', status: 'SUKSES', created_at: hari(0) },
      { id: 'pra-restore-tua', jenis: 'PRA_RESTORE', status: 'SUKSES', created_at: hari(1) },
      ...Array.from({ length: 20 }, (_, i): BarisRetensi => ({
        id: `m-${i}`,
        jenis: 'MANUAL',
        status: 'SUKSES',
        created_at: hari(i),
      })),
    ];
    const hapus = pilihUntukDihapus(baris);
    expect(hapus).toEqual(['oto-10']);
    expect(hapus.some((id) => !id.startsWith('oto-'))).toBe(false);
  });

  it('GAGAL dan BERJALAN tidak dihitung ke dalam 12 dan tidak dihapus', () => {
    const baris = [
      ...Array.from({ length: 12 }, (_, i) => otomatis(i + 1)),
      otomatis(20, 'GAGAL'),
      otomatis(21, 'BERJALAN'),
    ];
    expect(pilihUntukDihapus(baris)).toEqual([]);
  });

  it('batas manual 3 per hari', () => {
    expect(BATAS_MANUAL_PER_HARI).toBe(3);
  });
});

describe('backup-retensi: batas backup manual harian (mulaiBackup)', () => {
  /** Transaksi tiruan: hanya permukaan yang dipakai `mulaiBackup`. */
  function txTiruan(manualHariIni: number, berjalan = false) {
    const dibuat: unknown[] = [];
    const tx = {
      $executeRaw: async () => 0,
      $queryRaw: async (teks: TemplateStringsArray) =>
        teks.join('?').includes('count(*)') ? [{ jumlah: manualHariIni }] : [{ id: null }],
      backup: {
        findFirst: async () => (berjalan ? { id: 'jalan' } : null),
        create: async (a: unknown) => void dibuat.push(a),
      },
    };
    return { tx: tx as unknown as Parameters<typeof mulaiBackup>[0], dibuat };
  }

  it('manual ke-4 dalam sehari ditolak BATAS_HARIAN tanpa membuat baris', async () => {
    const { tx, dibuat } = txTiruan(3);
    const h = await mulaiBackup(tx, { jenis: 'MANUAL', userId: null });
    expect(h).toMatchObject({ ok: false, kode: 'BATAS_HARIAN' });
    expect(dibuat).toHaveLength(0);
  });

  it('manual ke-3 masih boleh; OTOMATIS & PRA_RESTORE tidak terkena batas manual', async () => {
    expect((await mulaiBackup(txTiruan(2).tx, { jenis: 'MANUAL' })).ok).toBe(true);
    expect((await mulaiBackup(txTiruan(9).tx, { jenis: 'OTOMATIS' })).ok).toBe(true);
    expect((await mulaiBackup(txTiruan(9).tx, { jenis: 'PRA_RESTORE' })).ok).toBe(true);
  });

  it('backup lain BERJALAN → KONFLIK', async () => {
    expect(await mulaiBackup(txTiruan(0, true).tx, { jenis: 'OTOMATIS' })).toMatchObject({
      ok: false,
      kode: 'KONFLIK',
    });
  });
});
