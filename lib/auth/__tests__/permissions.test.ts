/**
 * Test lapisan permission.
 *
 * Blok pertama adalah matriks 8 role × 13 aksi kunci yang ditulis TANGAN dari
 * PRD §5.1 — bukan diturunkan dari kode. Itu yang membuatnya berguna: bila
 * seseorang mengubah satu sel di `MATRIKS`, tabel di bawah tidak ikut berubah,
 * dan perbedaannya menjadi kegagalan test alih-alih hak yang diam-diam
 * berpindah tangan.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-046 · PRD §5.1, §5.2 · INV-02, INV-03
 */

import { describe, expect, it } from 'vitest';

import {
  ROLES,
  SEMUA_PERMISSION,
  PERMISSIONS,
  barisTanpaAksi,
  can,
  lingkupUntuk,
  pelanggaranBph,
  type Permission,
  type RoleCode,
} from '../permissions';

/** Urutan kolom sama dengan tabel PRD §5.1. */
const KOLOM: RoleCode[] = ['ADMIN', 'KETUA', 'WAKIL', 'SEKUM', 'BENDUM', 'KADEPT', 'ANGGOTA', 'BPH'];

/**
 * Tiga belas aksi kunci, disalin dari PRD §5.1 (baris surat menurut ADR-036).
 * `1` = berhak, `0` = tidak. Kolom mengikuti KOLOM di atas.
 */
const MATRIKS_HARAPAN: [Permission, string][] = [
  //                          ADMIN KETUA WAKIL SEKUM BENDUM KADEPT ANGGOTA BPH
  ['proker.create',            '1' + '1' + '1' + '0' + '0' + '1' + '0' + '0'],
  ['proker.approve',           '0' + '1' + '1' + '0' + '0' + '0' + '0' + '0'],
  ['proker.delete',            '1' + '1' + '1' + '0' + '0' + '0' + '0' + '0'],
  ['proker.edit_terkunci',     '1' + '1' + '1' + '0' + '0' + '1' + '0' + '0'],
  // ADR-036 menggantikan baris PRD ini: surat disusun Sekum; lainnya hanya SK Aktif diri sendiri.
  ['surat.create',             '1' + '0' + '0' + '1' + '0' + '0' + '0' + '0'],
  ['surat.ajukan_aktif',       '0' + '1' + '1' + '1' + '1' + '1' + '1' + '0'],
  ['surat.approve',            '0' + '1' + '1' + '1' + '0' + '0' + '0' + '0'],
  ['rab.lock',                 '1' + '1' + '1' + '0' + '1' + '0' + '0' + '0'],
  ['nota.verify',              '1' + '0' + '0' + '0' + '1' + '0' + '0' + '0'],
  ['lpj.generate',             '1' + '0' + '0' + '0' + '1' + '0' + '0' + '0'],
  ['user.create',              '1' + '0' + '0' + '0' + '0' + '0' + '0' + '0'],
  ['backup.manage',            '1' + '0' + '0' + '0' + '0' + '0' + '0' + '0'],
  ['master_gantt.read',        '1' + '1' + '1' + '1' + '1' + '1' + '1' + '1'],
];

describe('matriks 8 role x 13 aksi kunci — PRD §5.1 + ADR-036', () => {
  for (const [permission, baris] of MATRIKS_HARAPAN) {
    for (const [i, role] of KOLOM.entries()) {
      const harap = baris[i] === '1';
      it(`${role} ${harap ? 'BOLEH' : 'tidak boleh'} ${permission}`, () => {
        expect(can([role], permission)).toBe(harap);
      });
    }
  }
});

describe('aturan kunci PRD §5.2', () => {
  it('butir 1 — hanya Ketua atau Wakil yang menyetujui proker', () => {
    expect(PERMISSIONS['proker.approve']).toEqual(['KETUA', 'WAKIL']);
  });

  it('butir 2 — surat disetujui Ketua, Wakil, atau Sekum; Admin TIDAK termasuk', () => {
    expect(PERMISSIONS['surat.approve']).toEqual(['KETUA', 'WAKIL', 'SEKUM']);
  });

  it('butir 3 — BPH tidak pernah menjadi approver', () => {
    expect(PERMISSIONS['proker.approve']).not.toContain('BPH');
    expect(PERMISSIONS['surat.approve']).not.toContain('BPH');
  });

  it('butir 6 — kedelapan role dapat melihat Master Gantt', () => {
    expect(PERMISSIONS['master_gantt.read']).toEqual([...ROLES]);
  });
});

describe('INV-03 — BPH tidak pernah menambah hak tulis', () => {
  it('tidak ada satu pun baris matriks yang memberi BPH hak selain baca', () => {
    expect(pelanggaranBph()).toEqual([]);
  });

  it('BPH tidak muncul di satu pun permission non-baca', () => {
    const menulis = SEMUA_PERMISSION.filter((p) => !p.endsWith('.read'));
    const bocor = menulis.filter((p) => PERMISSIONS[p].includes('BPH'));
    expect(bocor).toEqual([]);
  });

  it('BPH + ANGGOTA tidak menambah satu pun hak TULIS', () => {
    // Inti INV-03, diuji menyeluruh dan bukan lewat satu-dua contoh: menambah
    // BPH ke role mana pun tidak boleh mengubah satu jawaban pun pada aksi
    // yang mengubah data.
    const menulis = SEMUA_PERMISSION.filter((p) => !p.endsWith('.read'));
    for (const p of menulis) {
      expect(can(['BPH', 'ANGGOTA'], p), p).toBe(can(['ANGGOTA'], p));
    }
  });

  it('BPH MEMANG menambah hak baca — dan itu memang perannya', () => {
    // Kontrak T-046 menulis "BPH+ANGGOTA bisa menulis sebagai Anggota, tetapi
    // tidak mendapat hak tambahan". Dibaca harfiah, kalimat itu bertentangan
    // dengan PRD §5.1: pada baris "Surat — arsip", BPH memegang `R` sementara
    // Anggota memegang `—`.
    //
    // Yang menang PRD, dan itu masuk akal — BPH adalah role pengawas. INV-03
    // menyebut batasnya dengan tepat: yang tidak pernah bertambah adalah hak
    // TULIS. Test di atas menjaga persis itu.
    expect(can(['ANGGOTA'], 'surat.read')).toBe(false);
    expect(can(['BPH', 'ANGGOTA'], 'surat.read')).toBe(true);
  });

  it('BPH sendirian tidak dapat menulis apa pun, tetapi tetap dapat membaca', () => {
    expect(can(['BPH'], 'proker.create')).toBe(false);
    expect(can(['BPH'], 'rab.lock')).toBe(false);
    expect(can(['BPH'], 'nota.verify')).toBe(false);
    expect(can(['BPH'], 'audit.read')).toBe(true);
    expect(can(['BPH'], 'rab.read')).toBe(true);
  });
});

describe('gabungan hak — role ganda', () => {
  it('KADEPT + BENDUM memperoleh gabungan, bukan irisan', () => {
    expect(can(['KADEPT'], 'nota.verify')).toBe(false);
    expect(can(['BENDUM'], 'proker.create')).toBe(false);

    expect(can(['KADEPT', 'BENDUM'], 'nota.verify')).toBe(true);
    expect(can(['KADEPT', 'BENDUM'], 'proker.create')).toBe(true);
  });

  it('role ganda tidak pernah menciptakan hak yang tidak dimiliki keduanya', () => {
    for (const p of SEMUA_PERMISSION) {
      const gabungan = can(['KADEPT', 'BENDUM'], p);
      const sendiri = can(['KADEPT'], p) || can(['BENDUM'], p);
      expect(gabungan, p).toBe(sendiri);
    }
  });

  it('daftar role kosong tidak berhak apa pun', () => {
    for (const p of SEMUA_PERMISSION) {
      expect(can([], p), p).toBe(false);
    }
  });
});

describe('lingkup — tanda * dan ** pada PRD §5.1', () => {
  it('KADEPT terbatas pada departemennya', () => {
    expect(lingkupUntuk(['KADEPT'], 'proker.create')).toBe('DEPARTEMEN');
  });

  it('ANGGOTA mengunggah nota terbatas pada DIVISI, bukan departemen', () => {
    // Menjaga urutan pembacaan `**` sebelum `*`. Dibalik, sel `C**` cocok pada
    // pemeriksaan `*` lebih dulu dan hak Anggota melebar dari satu divisi ke
    // seluruh departemen — tanpa satu pun tanda bahwa itu terjadi.
    expect(lingkupUntuk(['ANGGOTA'], 'nota.create')).toBe('DIVISI');
    expect(lingkupUntuk(['ANGGOTA'], 'rab.create')).toBe('DIVISI');
  });

  it('role tak berlingkup membatalkan batas role lain', () => {
    expect(lingkupUntuk(['KADEPT', 'KETUA'], 'proker.create')).toBeNull();
    expect(lingkupUntuk(['ADMIN'], 'nota.create')).toBeNull();
  });

  it('KADEPT + ANGGOTA memakai batas yang lebih longgar', () => {
    // Kadept boleh mengunggah nota untuk seluruh departemennya (`C*`), Anggota
    // hanya untuk divisinya (`C**`). Yang berlaku adalah hak Kadept.
    expect(lingkupUntuk(['ANGGOTA', 'KADEPT'], 'nota.create')).toBe('DEPARTEMEN');
  });

  it('null bila permission-nya memang tidak dimiliki', () => {
    expect(lingkupUntuk(['ANGGOTA'], 'proker.approve')).toBeNull();
    expect(lingkupUntuk([], 'proker.create')).toBeNull();
  });
});

describe('kelengkapan terhadap PRD §5.1', () => {
  it('seluruh 26 baris matriks ditunjuk setidaknya satu permission', () => {
    expect(barisTanpaAksi()).toEqual([]);
  });

  it('setiap permission dimiliki setidaknya satu role', () => {
    const mati = SEMUA_PERMISSION.filter((p) => PERMISSIONS[p].length === 0);
    expect(mati).toEqual([]);
  });

  it('kesebelas contoh SYSTEM_DESIGN §5.4 cocok seluruhnya', () => {
    // Contoh di dokumen memang tidak lengkap, tetapi yang ada di sana harus
    // tetap benar. Bila kelak berbeda, salah satunya keliru dan itu harus
    // ketahuan di sini, bukan di produksi.
    expect(PERMISSIONS['proker.create']).toEqual(['ADMIN', 'KETUA', 'WAKIL', 'KADEPT']);
    expect(PERMISSIONS['proker.approve']).toEqual(['KETUA', 'WAKIL']);
    expect(PERMISSIONS['proker.delete']).toEqual(['ADMIN', 'KETUA', 'WAKIL']);
    expect(PERMISSIONS['surat.create']).toEqual(['ADMIN', 'SEKUM']); // ADR-036
    expect(PERMISSIONS['surat.approve']).toEqual(['KETUA', 'WAKIL', 'SEKUM']);
    expect(PERMISSIONS['rab.lock']).toEqual(['ADMIN', 'KETUA', 'WAKIL', 'BENDUM']);
    expect(PERMISSIONS['nota.verify']).toEqual(['ADMIN', 'BENDUM']);
    expect(PERMISSIONS['lpj.generate']).toEqual(['ADMIN', 'BENDUM']);
    expect(PERMISSIONS['user.create']).toEqual(['ADMIN']);
    expect(PERMISSIONS['periode.create']).toEqual(['ADMIN']);
    expect(PERMISSIONS['backup.manage']).toEqual(['ADMIN']);
  });

  it('ROLES sama persis dengan enum role_code migrasi 002', () => {
    expect([...ROLES]).toEqual([
      'ADMIN',
      'KETUA',
      'WAKIL',
      'SEKUM',
      'BENDUM',
      'KADEPT',
      'ANGGOTA',
      'BPH',
    ]);
  });
});
