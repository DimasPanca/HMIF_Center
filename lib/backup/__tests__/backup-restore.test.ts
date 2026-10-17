import { describe, expect, it } from 'vitest';

import { pecahLarikJson, susunDumpSql } from '@/lib/backup/export-modul';
import { strategiSah, validasiModul } from '@/lib/backup/import-modul';
import { NAMA_SISTEM, SkemaPermintaanRestore, cekKecocokan, pecahDump } from '@/lib/backup/restore';

const SISTEM = { versiSkema: '1', migrasiTerakhir: '048_restore_job' };
const BUNDEL = {
  versiSkema: '1',
  migrasiTerakhir: '048_restore_job',
  dump: { metode: 'sql_per_tabel' as const, tabel: ['proker'] },
};

describe('backup-restore: kecocokan bundel', () => {
  it('versi skema berbeda → ditolak dengan pesan menyebut KEDUA versi, untuk mode apa pun', () => {
    for (const mode of ['PENUH', 'MODUL'] as const) {
      const p = cekKecocokan({ ...BUNDEL, versiSkema: '2' }, SISTEM, mode);
      expect(p).toContain('backup v2');
      expect(p).toContain('sistem v1');
      expect(p).toContain('migrasi otomatis tidak dilakukan');
    }
  });

  it('restore penuh menuntut migrasi yang sama; per modul tetap boleh', () => {
    const lama = { ...BUNDEL, migrasiTerakhir: '047_lpj_hapus_kaskade' };
    expect(cekKecocokan(lama, SISTEM, 'PENUH')).toMatch(/047_lpj_hapus_kaskade.*048_restore_job/);
    expect(cekKecocokan(lama, SISTEM, 'MODUL')).toBeNull();
    expect(cekKecocokan(BUNDEL, SISTEM, 'PENUH')).toBeNull();
  });

  it('dump pg_dump (ber-DDL) tidak dipulihkan dari aplikasi', () => {
    expect(
      cekKecocokan({ ...BUNDEL, dump: { metode: 'pg_dump', tabel: [] } }, SISTEM, 'PENUH'),
    ).toMatch(/psql/);
  });
});

describe('backup-restore: dump', () => {
  it('BEGIN/COMMIT berkas dibuang supaya dump berjalan di transaksi pemanggil; insert tidak menimpa (ON CONFLICT DO NOTHING)', () => {
    const sql = susunDumpSql(
      [
        {
          nama: 'audit_log',
          kolom: ['id', 'aksi'],
          serial: ['id'],
          jumlah: 1,
          json: '[\n    {\n        "id": 1,\n        "aksi": "COMMIT;"\n    }\n]',
        },
      ],
      { versiSkema: '1', migrasiTerakhir: '048', dibuatPada: 't' },
    );
    const p = pecahDump(sql);
    expect(p).toHaveLength(3);
    expect(p[0]).toBe('SET LOCAL session_replication_role = replica;');
    expect(p[1]).toMatch(/^INSERT INTO public\."audit_log" /);
    expect(p[1]).toContain('"aksi": "COMMIT;"');
    expect(p[1]!.endsWith('ON CONFLICT DO NOTHING;')).toBe(true);
    expect(p[2]).toMatch(/^SELECT setval\(/);
  });

  it('tabel besar dipecah menjadi beberapa INSERT ≤ batas, tanpa kehilangan/menggandakan baris', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      isi: 'x'.repeat(100),
      angka: 12500000.5,
    }));
    const json = JSON.stringify(rows, null, 4);
    const potong = pecahLarikJson(json, 1000);
    expect(potong.length).toBeGreaterThan(5);
    expect(potong.every((x) => x.length <= 1300)).toBe(true);
    expect(potong.flatMap((x) => JSON.parse(x) as unknown[])).toEqual(rows);
    expect(pecahLarikJson('[1,2]', 1)).toEqual(['[1,2]']);
    // Ukuran bawaan 1 MB: larik kecil tetap satu INSERT, dan setiap potong menjadi satu pernyataan.
    const sql = susunDumpSql(
      [{ nama: 'audit_log', kolom: ['id'], serial: [], jumlah: rows.length, json }],
      { versiSkema: '1', migrasiTerakhir: '048', dibuatPada: 't' },
    );
    expect(pecahDump(sql).filter((x) => x.startsWith('INSERT'))).toHaveLength(1);
  });
});

describe('backup-restore: permintaan & validasi modul', () => {
  it('konfirmasi restore penuh = nama sistem', () => {
    expect(NAMA_SISTEM).toBe('HMIF Center');
    expect(
      SkemaPermintaanRestore.safeParse({ mode: 'MODUL', modul: [], strategi: 'TAMBAH' }).success,
    ).toBe(false);
    expect(
      SkemaPermintaanRestore.safeParse({
        mode: 'MODUL',
        modul: ['bukan-modul'],
        strategi: 'TAMBAH',
      }).success,
    ).toBe(false);
    expect(
      SkemaPermintaanRestore.safeParse({ mode: 'MODUL', modul: ['prokers'], strategi: 'HAPUS' })
        .success,
    ).toBe(false);
    expect(
      SkemaPermintaanRestore.safeParse({
        mode: 'MODUL',
        modul: ['prokers', 'rab'],
        strategi: 'GABUNG',
      }).success,
    ).toBe(true);
  });

  it('audit-log hanya Tambah (INV-06)', () => {
    expect(strategiSah('audit-log', 'TAMBAH')).toBeNull();
    expect(strategiSah('audit-log', 'TIMPA')).toMatch(/append-only/);
    expect(strategiSah('audit-log', 'GABUNG')).toMatch(/append-only/);
    expect(strategiSah('prokers', 'TIMPA')).toBeNull();
  });

  it('berkas modul divalidasi sebelum impor: bentuk, nama modul, tabel milik modul, versi', () => {
    const sah = {
      modul: 'rab',
      versiSkema: '1',
      migrasiTerakhir: '048',
      dibuatPada: 't',
      tabel: { rab_item: [{ id: 'a' }] },
    };
    expect(validasiModul('rab', sah, '1').ok).toBe(true);
    expect(validasiModul('rab', { ...sah, tabel: 'x' }, '1')).toMatchObject({ ok: false });
    expect(validasiModul('nota', sah, '1')).toMatchObject({
      ok: false,
      pesan: expect.stringContaining('bukan "nota"'),
    });
    expect(validasiModul('rab', { ...sah, tabel: { proker: [] } }, '1')).toMatchObject({
      ok: false,
      pesan: expect.stringContaining('proker bukan bagian modul rab'),
    });
    expect(validasiModul('rab', { ...sah, versiSkema: '9' }, '1')).toMatchObject({
      ok: false,
      pesan: 'Versi skema tidak cocok: backup v9, sistem v1.',
    });
  });
});
