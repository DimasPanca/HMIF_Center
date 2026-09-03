/**
 * Test parser kolom jumlah RAB.
 *
 * Tujuh baris pertama adalah tabel SYSTEM_DESIGN §11.1 apa adanya, dan itulah
 * yang menyingkap bahwa kode contoh di dokumen bertentangan dengan tabelnya
 * sendiri — regex kasus 2 di sana meloloskan ketiga baris yang justru ditandai
 * butuh konfirmasi.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-086 · SYSTEM_DESIGN §11.1 · INV-26
 */

import { describe, expect, it } from 'vitest';
import { parseJumlah } from '../parse-jumlah';

describe('tabel SYSTEM_DESIGN 11.1 — tujuh baris, persis', () => {
  const tabel: [string, number | null, boolean][] = [
    ['10', 10, false],
    ['156', 156, false],
    ['16 Unit', 16, false],
    ['10 lembar', 10, false],
    ['2 pack (12 pcs/pack)', 2, true],
    ['2 Hari 1 Malam', 2, true],
    ['1 pack (isi 100)', 1, true],
  ];

  for (const [input, numerik, butuh] of tabel) {
    it(`"${input}" -> ${numerik}, konfirmasi ${butuh ? 'ya' : 'tidak'}`, () => {
      const h = parseJumlah(input);
      expect(h.teks).toBe(input);
      expect(h.numerik).toBe(numerik);
      expect(h.butuhInputManual).toBe(butuh);
    });
  }
});

describe('KOREKSI: satuan harus menghabiskan sisa teks', () => {
  // Regex dokumen /^(\d+([.,]\d+)?)\s*[A-Za-z]/ hanya menuntut "ada huruf
  // setelah angka", sehingga ketiga kasus kompleks lolos sebagai sederhana.
  // Ketiganya diuji terpisah di sini karena inilah cacat yang diperbaiki.
  it('"2 Hari 1 Malam" tidak dianggap angka+satuan', () => {
    // Kalau lolos sebagai sederhana, ia tersimpan sebagai jumlah 2 tanpa ada
    // yang menyadari satuannya bukan "2 sesuatu".
    expect(parseJumlah('2 Hari 1 Malam').butuhInputManual).toBe(true);
  });

  it('"2 pack (12 pcs/pack)" tidak dianggap angka+satuan', () => {
    // Bisa berarti 2 pack atau 24 pcs. Hanya yang membelinya yang tahu.
    expect(parseJumlah('2 pack (12 pcs/pack)').butuhInputManual).toBe(true);
  });

  it('"1 pack (isi 100)" tidak dianggap angka+satuan', () => {
    expect(parseJumlah('1 pack (isi 100)').butuhInputManual).toBe(true);
  });

  it('tetapi satuan satu kata memang lolos', () => {
    for (const s of ['16 Unit', '10 lembar', '2 Pcs', '5 buah', '3Kg']) {
      expect(parseJumlah(s).butuhInputManual).toBe(false);
    }
  });
});

describe('desimal dan pemisah ribuan', () => {
  it('koma adalah desimal', () => {
    expect(parseJumlah('2,5').numerik).toBe(2.5);
    expect(parseJumlah('0,75').numerik).toBe(0.75);
    expect(parseJumlah('2,5 kg').numerik).toBe(2.5);
  });

  it('titik dengan tepat tiga digit adalah pemisah ribuan', () => {
    // Inti koreksi kedua. parseFloat('1.000') menghasilkan 1, dan RAB dengan
    // 1.000 lembar stiker akan dihitung sebagai 1 lembar tanpa ada yang gagal.
    expect(parseJumlah('1.000').numerik).toBe(1000);
    expect(parseJumlah('1.500 lembar').numerik).toBe(1500);
    expect(parseJumlah('1.000.000').numerik).toBe(1_000_000);
  });

  it('titik dengan digit selain tiga tetap desimal', () => {
    expect(parseJumlah('1.5').numerik).toBe(1.5);
    expect(parseJumlah('0.25').numerik).toBe(0.25);
  });

  it('gabungan ribuan dan desimal', () => {
    expect(parseJumlah('1.500,5').numerik).toBe(1500.5);
  });
});

describe('teks selalu apa adanya (INV-26)', () => {
  it('tidak mengubah isi, hanya memangkas spasi tepi', () => {
    // Ekspor Excel wajib menghasilkan sel identik dengan arsip. "16 Unit"
    // yang berubah menjadi "16" cukup untuk menggagalkan gerbang G4.
    expect(parseJumlah('  16 Unit  ').teks).toBe('16 Unit');
    expect(parseJumlah('2 pack (12 pcs/pack)').teks).toBe('2 pack (12 pcs/pack)');
    expect(parseJumlah('1.000').teks).toBe('1.000');
  });

  it('huruf besar-kecil satuan dipertahankan', () => {
    expect(parseJumlah('16 UNIT').teks).toBe('16 UNIT');
    expect(parseJumlah('16 unit').teks).toBe('16 unit');
  });
});

describe('masukan yang tidak sah', () => {
  it('kosong menghasilkan null, bukan nol', () => {
    // Menebak 0 lebih buruk daripada mengaku tidak tahu: 0 akan lolos ke
    // kalkulasi sebagai angka yang sah.
    for (const s of ['', '   ']) {
      const h = parseJumlah(s);
      expect(h.numerik).toBeNull();
      expect(h.butuhInputManual).toBe(true);
    }
  });

  it('teks tanpa angka menghasilkan null', () => {
    for (const s of ['Paket', 'sesuai kebutuhan', '-']) {
      const h = parseJumlah(s);
      expect(h.teks).toBe(s.trim());
      expect(h.numerik).toBeNull();
      expect(h.butuhInputManual).toBe(true);
    }
  });

  it('angka negatif DITOLAK, bukan diperbaiki diam-diam', () => {
    // Tanpa penjaga ini, "-5" jatuh ke kasus kompleks dan angka pertama yang
    // ditemukan adalah "5" — tandanya hilang dan jumlahnya berubah positif.
    for (const s of ['-5', '-5 unit', '- 12', 'diskon -3 pcs']) {
      const h = parseJumlah(s);
      expect(h.numerik).toBeNull();
      expect(h.butuhInputManual).toBe(true);
    }
  });

  it('menerima null dan undefined tanpa melempar', () => {
    // Nilainya datang dari sel Excel yang bisa saja kosong.
    for (const s of [null, undefined]) {
      const h = parseJumlah(s as unknown as string);
      expect(h.teks).toBe('');
      expect(h.numerik).toBeNull();
      expect(h.butuhInputManual).toBe(true);
    }
  });
});

describe('bentuk kembalian', () => {
  it('selalu memuat ketiga field', () => {
    const h = parseJumlah('10');
    expect(Object.keys(h).sort()).toEqual(['butuhInputManual', 'numerik', 'teks']);
  });

  it('numerik tidak pernah negatif', () => {
    // Sepasang dengan CHECK rab_item_jumlah_positif di migrasi 007.
    for (const s of ['10', '16 Unit', '-5', '2 Hari 1 Malam', '', 'Paket', '1.000']) {
      const n = parseJumlah(s).numerik;
      if (n !== null) expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});
