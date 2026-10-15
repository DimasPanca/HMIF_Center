import { describe, expect, it } from 'vitest';
import { parseTabel } from '@/lib/import/parse-tabel';
import { KOLOM_IMPORT_PENGURUS, SkemaPengurus, skemaBarisPengurus } from '@/lib/pengurus/skema';

const DEPT = [
  { id: '11111111-1111-4111-8111-111111111111', kode: 'KDR', nama: 'Kaderisasi' },
  { id: '22222222-2222-4222-8222-222222222222', kode: 'KOMINFO', nama: 'Komunikasi dan Informasi' },
];
const skema = skemaBarisPengurus(DEPT);
const baris = (o: Partial<Record<'nama_lengkap' | 'nim' | 'jabatan' | 'departemen' | 'angkatan' | 'status', string>>) =>
  skema.safeParse({ nama_lengkap: 'Nadia Putri', nim: '3337220100', jabatan: 'Staff', departemen: '', angkatan: '', status: '', ...o });

describe('skemaBarisPengurus', () => {
  it('departemen dikenali dari nama, kode, atau "Departemen X"; kosong = tanpa departemen', () => {
    expect(baris({ departemen: 'Kaderisasi' }).data?.departemen_id).toBe(DEPT[0]!.id);
    expect(baris({ departemen: 'kominfo' }).data?.departemen_id).toBe(DEPT[1]!.id);
    expect(baris({ departemen: 'Departemen Kaderisasi' }).data?.departemen_id).toBe(DEPT[0]!.id);
    expect(baris({ departemen: '' }).data?.departemen_id).toBeNull();
    expect(baris({ departemen: 'Humas' }).error?.issues[0]?.message).toBe('Departemen "Humas" tidak dikenali.');
  });

  it('status: kosong/Aktif → aktif; Nonaktif/Demisioner → nonaktif; lainnya error', () => {
    expect(baris({}).data?.is_aktif).toBe(true);
    expect(baris({ status: 'Aktif' }).data?.is_aktif).toBe(true);
    expect(baris({ status: 'Tidak Aktif' }).data?.is_aktif).toBe(false);
    expect(baris({ status: 'demisioner' }).data?.is_aktif).toBe(false);
    expect(baris({ status: 'cuti' }).success).toBe(false);
  });

  it('NIM: spasi dibuang, huruf ditolak; angkatan harus tahun', () => {
    expect(baris({ nim: '3337 2201 00' }).data?.nim).toBe('3337220100');
    expect(baris({ nim: '33372A' }).error?.issues[0]?.message).toBe('NIM hanya angka, 6–20 digit.');
    expect(baris({ angkatan: '2022' }).data?.angkatan).toBe(2022);
    expect(baris({ angkatan: 'dua ribu' }).success).toBe(false);
    expect(baris({ angkatan: '1999' }).error?.issues[0]?.message).toBe('Angkatan tidak masuk akal.');
  });

  it('kolom wajib kosong ditolak dengan pesan Indonesia', () => {
    expect(baris({ nama_lengkap: '  ' }).error?.issues[0]?.message).toBe('Nama lengkap wajib diisi.');
    expect(baris({ jabatan: '' }).error?.issues[0]?.message).toBe('Jabatan wajib diisi.');
  });
});

describe('import berkas hasil form pendataan', () => {
  it('judul kolom berbeda dikenali lewat alias; NIM ganda di berkas jadi PERINGATAN, bukan error', () => {
    const matriks = [
      ['Nama', 'NPM', 'Posisi', 'Divisi', 'Tahun Angkatan', 'Keaktifan'],
      ['Nadia Putri', '3337220100', 'Staff', 'Kaderisasi', '2022', 'Aktif'],
      ['Raka Pratama', '3337220100', 'Kadept', 'KOMINFO', '2021', ''],
      ['', '3337220101', 'Staff', '', '', ''],
    ];
    const h = parseTabel(matriks, KOLOM_IMPORT_PENGURUS, skema, { kunciUnik: 'nim' });
    expect(h.hilang).toEqual([]);
    expect(h.ringkas).toMatchObject({ total: 3, error: 1 });
    expect(h.baris[0]!.status).toBe('PERINGATAN');
    expect(h.baris[1]!.status).toBe('PERINGATAN');
    expect(h.baris[2]!.status).toBe('ERROR');
  });
});

describe('SkemaPengurus (form)', () => {
  it('nilai bawaan: tanpa departemen, tanpa angkatan, aktif', () => {
    expect(SkemaPengurus.parse({ nama_lengkap: 'A', nim: '123456', jabatan: 'Staff' })).toEqual({
      nama_lengkap: 'A',
      nim: '123456',
      jabatan: 'Staff',
      departemen_id: null,
      angkatan: null,
      is_aktif: true,
    });
  });
});
