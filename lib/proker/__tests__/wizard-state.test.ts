/**
 * Test mesin keadaan wizard proker (murni, tanpa database).
 *
 * Yang dijaga di sini: langkah mana yang berlaku per kategori, kapan sebuah
 * langkah valid (dan karena itu boleh dilewati), pesan durasi yang menyebut
 * angka aktual, dan kapan cek konflik relevan. Persistensi draft diuji lewat
 * smoke database, bukan di sini.
 *
 * Batas 15 dan 45 hari diuji tepat di angkanya — sama seperti test schema.ts —
 * karena perbandingan eksklusif menolak dua tanggal yang sebenarnya sah tanpa
 * satu pun kasus lain menangkapnya.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-068 · PRD F-5.3 · USER_FLOW §4.1
 */

import { describe, expect, it } from 'vitest';

import { SkemaProker } from '../schema';
import {
  LANGKAH,
  bolehLanjut,
  durasiPersiapan,
  keInputProker,
  keRencana,
  langkahUntuk,
  permintaanCekKonflik,
  pesanDurasi,
  terapkanLangkah,
  validasiLangkah,
  type DraftKepanitiaan,
  type DraftGantt,
  type WizardDraft,
} from '../wizard-state';

const DEPT = '33333333-3333-4333-8333-333333333333';
const PJ = '44444444-4444-4444-8444-444444444444';

/** Draft TERJADWAL lengkap langkah 1-3 (contoh SYNCHRONIZE PRD F-5.2). */
const TERJADWAL: WizardDraft = {
  departemen_id: DEPT,
  nama: 'SYNCHRONIZE',
  kategori: 'TERJADWAL',
  tanggal_mulai_persiapan: '2026-11-01',
  tanggal_hari_h_mulai: '2026-12-06',
  tanggal_hari_h_selesai: '2026-12-07',
};

// ---------------------------------------------------------------------------
// Model langkah
// ---------------------------------------------------------------------------

describe('model langkah', () => {
  it('enam langkah, urut 1-6', () => {
    expect(LANGKAH.map((l) => l.nomor)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('TERJADWAL memakai keenam langkah', () => {
    expect(langkahUntuk('TERJADWAL').map((l) => l.nomor)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // PRD F-5.3: kepanitiaan & gantt "wajib untuk TERJADWAL". BERKALA/RESPONSIF
  // tidak membentuk kepanitiaan, jadi langkah 4-5 dilewati untuk keduanya.
  it('BERKALA melewati kepanitiaan dan gantt', () => {
    expect(langkahUntuk('BERKALA').map((l) => l.nomor)).toEqual([1, 2, 3, 6]);
  });

  it('RESPONSIF melewati kepanitiaan dan gantt', () => {
    expect(langkahUntuk('RESPONSIF').map((l) => l.nomor)).toEqual([1, 2, 3, 6]);
  });

  it('sebelum kategori dipilih, tampilkan seluruh langkah', () => {
    expect(langkahUntuk(undefined)).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// terapkanLangkah
// ---------------------------------------------------------------------------

describe('terapkanLangkah', () => {
  it('menggabungkan patch ke draft', () => {
    const d = terapkanLangkah({ nama: 'A' }, { kategori: 'TERJADWAL', deskripsi: 'x' });
    expect(d).toEqual({ nama: 'A', kategori: 'TERJADWAL', deskripsi: 'x' });
  });

  it('undefined tidak menyentuh medan lama', () => {
    const d = terapkanLangkah({ nama: 'A' }, { nama: undefined });
    expect(d.nama).toBe('A');
  });

  // Tanpa aturan null-menghapus, mengosongkan medan mustahil — patch hanya bisa
  // menimpa. UI mengirim null untuk mengosongkan.
  it('null menghapus medan', () => {
    const d = terapkanLangkah({ nama: 'A', deskripsi: 'x' }, { deskripsi: null } as never);
    expect('deskripsi' in d).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Langkah 1
// ---------------------------------------------------------------------------

describe('validasiLangkah 1 — informasi dasar', () => {
  it('lengkap → valid', () => {
    expect(validasiLangkah(TERJADWAL, 1).ok).toBe(true);
  });

  it('tanpa nama → tidak valid, isu menunjuk nama', () => {
    const h = validasiLangkah({ ...TERJADWAL, nama: undefined }, 1);
    expect(h.ok).toBe(false);
    expect(h.isu.some((i) => i.path === 'nama')).toBe(true);
  });

  it('tanpa departemen → tidak valid', () => {
    expect(validasiLangkah({ ...TERJADWAL, departemen_id: undefined }, 1).ok).toBe(false);
  });

  it('estimasi peserta nol → tidak valid', () => {
    expect(validasiLangkah({ ...TERJADWAL, estimasi_peserta: 0 }, 1).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Langkah 2 — durasi 15-45 (kontrak 4)
// ---------------------------------------------------------------------------

describe('validasiLangkah 2 TERJADWAL — durasi persiapan', () => {
  const dengan = (persiapan: string) =>
    validasiLangkah({ ...TERJADWAL, tanggal_mulai_persiapan: persiapan }, 2);

  // Hari-H mulai 6 Des 2026. Batas diuji tepat di angkanya (BETWEEN inklusif).
  it('14 hari ditolak', () => expect(dengan('2026-11-22').ok).toBe(false));
  it('15 hari diterima', () => expect(dengan('2026-11-21').ok).toBe(true));
  it('45 hari diterima', () => expect(dengan('2026-10-22').ok).toBe(true));
  it('46 hari ditolak', () => expect(dengan('2026-10-21').ok).toBe(false));

  it('pesan menyebut angka aktual (kontrak 4)', () => {
    const h = dengan('2026-11-24'); // 12 hari
    expect(h.ok).toBe(false);
    expect(h.isu[0]!.pesan).toContain('12 hari');
    expect(h.isu[0]!.pesan).toContain('minimal 15');
  });

  it('hari-H selesai sebelum mulai ditolak', () => {
    const h = validasiLangkah({ ...TERJADWAL, tanggal_hari_h_selesai: '2026-12-05' }, 2);
    expect(h.ok).toBe(false);
  });
});

describe('validasiLangkah 2 BERKALA — pola pengulangan (kontrak 5)', () => {
  const berkala: WizardDraft = {
    departemen_id: DEPT,
    nama: 'Latihan Rutin',
    kategori: 'BERKALA',
    pola_ulang: { frekuensi: 'MINGGUAN', hari: ['SABTU'], mulai: '2026-09-01', selesai: '2027-06-30' },
  };

  it('pola lengkap → valid', () => {
    expect(validasiLangkah(berkala, 2).ok).toBe(true);
  });

  it('tanpa pola → tidak valid', () => {
    expect(validasiLangkah({ ...berkala, pola_ulang: undefined }, 2).ok).toBe(false);
  });

  // BERKALA bebas bentrok — durasi 15-45 tidak berlaku. Tanpa cabang kategori,
  // aturan TERJADWAL bocor ke BERKALA dan menolak pola yang sah.
  it('tidak terkena aturan durasi TERJADWAL', () => {
    expect(validasiLangkah(berkala, 2).ok).toBe(true);
  });
});

describe('validasiLangkah 2 RESPONSIF — hari-H wajib, persiapan tidak', () => {
  const responsif: WizardDraft = {
    departemen_id: DEPT,
    nama: 'Aksi Solidaritas',
    kategori: 'RESPONSIF',
    tanggal_hari_h_mulai: '2026-11-22',
    tanggal_hari_h_selesai: '2026-11-22',
  };

  it('hari-H saja → valid', () => {
    expect(validasiLangkah(responsif, 2).ok).toBe(true);
  });

  it('tanpa hari-H → tidak valid', () => {
    expect(validasiLangkah({ ...responsif, tanggal_hari_h_mulai: undefined }, 2).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// durasiPersiapan & pesanDurasi
// ---------------------------------------------------------------------------

describe('durasiPersiapan', () => {
  it('menghitung selisih hari', () => {
    expect(durasiPersiapan(TERJADWAL)).toBe(35);
  });
  it('null bila tanggal belum lengkap', () => {
    expect(durasiPersiapan({ tanggal_mulai_persiapan: '2026-11-01' })).toBeNull();
  });
});

describe('pesanDurasi', () => {
  it('di bawah 15 menyebut minimal', () => {
    expect(pesanDurasi(12)).toBe('Persiapan 12 hari — minimal 15 hari.');
  });
  it('di atas 45 menyebut maksimal', () => {
    expect(pesanDurasi(50)).toBe('Persiapan 50 hari — maksimal 45 hari.');
  });
});

// ---------------------------------------------------------------------------
// Langkah 3 & bolehLanjut
// ---------------------------------------------------------------------------

describe('validasiLangkah 3 — anggaran', () => {
  it('kosong → valid (seluruhnya opsional)', () => {
    expect(validasiLangkah(TERJADWAL, 3).ok).toBe(true);
  });
  it('anggaran negatif ditolak', () => {
    expect(validasiLangkah({ ...TERJADWAL, estimasi_anggaran: -1 }, 3).ok).toBe(false);
  });
  it('sumber dana tak dikenal ditolak', () => {
    expect(
      validasiLangkah({ ...TERJADWAL, sumber_dana: ['ENTAH' as never] }, 3).ok,
    ).toBe(false);
  });
});

describe('bolehLanjut', () => {
  it('langkah valid boleh dilewati', () => {
    expect(bolehLanjut(TERJADWAL, 1)).toBe(true);
  });
  it('langkah tak valid tidak boleh dilewati (kontrak 1)', () => {
    expect(bolehLanjut({ kategori: 'TERJADWAL' }, 1)).toBe(false);
  });
  // Sejak T-069, langkah 4 TERJADWAL dijaga: tanpa kepanitiaan tak boleh lanjut,
  // dengan kepanitiaan sah boleh.
  it('langkah 4 TERJADWAL tanpa kepanitiaan tidak boleh dilewati', () => {
    expect(bolehLanjut(TERJADWAL, 4)).toBe(false);
  });
  it('langkah 4 TERJADWAL dengan kepanitiaan sah boleh dilewati', () => {
    expect(bolehLanjut({ ...TERJADWAL, kepanitiaan: KEPANITIAAN_SAH }, 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// permintaanCekKonflik
// ---------------------------------------------------------------------------

describe('permintaanCekKonflik', () => {
  it('TERJADWAL lengkap → rentang mulai-persiapan..hari-H-selesai (INV-11)', () => {
    expect(permintaanCekKonflik(TERJADWAL)).toEqual({
      mulai: '2026-11-01',
      selesai: '2026-12-07',
    });
  });

  // BERKALA bebas bentrok, cek disembunyikan (kontrak 5).
  it('BERKALA → null', () => {
    expect(permintaanCekKonflik({ kategori: 'BERKALA' })).toBeNull();
  });

  // RESPONSIF tidak mengunci kalender.
  it('RESPONSIF → null', () => {
    expect(
      permintaanCekKonflik({
        kategori: 'RESPONSIF',
        tanggal_hari_h_mulai: '2026-11-22',
        tanggal_hari_h_selesai: '2026-11-22',
      }),
    ).toBeNull();
  });

  it('TERJADWAL tanggal belum lengkap → null', () => {
    expect(permintaanCekKonflik({ kategori: 'TERJADWAL', tanggal_mulai_persiapan: '2026-11-01' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// keInputProker
// ---------------------------------------------------------------------------

describe('keInputProker', () => {
  it('draft TERJADWAL lengkap lolos SkemaProker', () => {
    const input = keInputProker({ ...TERJADWAL, penanggung_jawab: PJ });
    // Assemble tidak memvalidasi; SkemaProker (jalur submit T-069) yang menjaga.
    expect(SkemaProker.safeParse(input).success).toBe(true);
  });

  it('membuang kebutuhan ruangan/barang yang bukan medan proker', () => {
    const input = keInputProker({ ...TERJADWAL, kebutuhan_ruangan: 'Aula', kebutuhan_barang: 'Kursi' });
    expect('kebutuhan_ruangan' in input).toBe(false);
    expect('kebutuhan_barang' in input).toBe(false);
  });

  it('membuang medan kosong', () => {
    const input = keInputProker({ ...TERJADWAL, deskripsi: '   ' });
    expect('deskripsi' in input).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Langkah 4 — Kepanitiaan (hanya TERJADWAL)
// ---------------------------------------------------------------------------

const KETUA = '55555555-5555-4555-8555-555555555555';
const KOOR = '66666666-6666-4666-8666-666666666666';

const KEPANITIAAN_SAH: DraftKepanitiaan = {
  ketua_pelaksana: KETUA,
  divisi: [
    { nama: 'Acara', koordinator_id: KOOR, anggota: [PJ] },
    { nama: 'Konsumsi', anggota: [] },
  ],
};

const GANTT_SAH: DraftGantt = {
  groups: [
    {
      nama: 'Persiapan',
      tasks: [{ nama: 'Rapat perdana', tanggal_mulai: '2026-11-01', tanggal_selesai: '2026-11-02' }],
    },
  ],
};

describe('validasi langkah 4 — kepanitiaan', () => {
  it('TERJADWAL: sah bila ada Ketua Pelaksana dan divisi bernama unik', () => {
    expect(validasiLangkah({ ...TERJADWAL, kepanitiaan: KEPANITIAAN_SAH }, 4).ok).toBe(true);
  });

  it('TERJADWAL: gagal tanpa Ketua Pelaksana', () => {
    const h = validasiLangkah({ ...TERJADWAL, kepanitiaan: { divisi: [{ nama: 'Acara' }] } }, 4);
    expect(h.ok).toBe(false);
    expect(h.isu.some((i) => i.path === 'ketua_pelaksana')).toBe(true);
  });

  it('TERJADWAL: gagal tanpa satu divisi pun', () => {
    expect(validasiLangkah({ ...TERJADWAL, kepanitiaan: { ketua_pelaksana: KETUA, divisi: [] } }, 4).ok).toBe(
      false,
    );
  });

  it('TERJADWAL: gagal bila nama divisi kembar (cermin divisi_unik_per_acara)', () => {
    const h = validasiLangkah(
      {
        ...TERJADWAL,
        kepanitiaan: { ketua_pelaksana: KETUA, divisi: [{ nama: 'Acara' }, { nama: 'acara' }] },
      },
      4,
    );
    expect(h.ok).toBe(false);
    expect(h.isu.some((i) => i.path.startsWith('divisi.'))).toBe(true);
  });

  it('BERKALA & RESPONSIF: langkah 4 dilewati (selalu sah)', () => {
    expect(validasiLangkah({ kategori: 'BERKALA' }, 4).ok).toBe(true);
    expect(validasiLangkah({ kategori: 'RESPONSIF' }, 4).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Langkah 5 — Gantt (hanya TERJADWAL)
// ---------------------------------------------------------------------------

describe('validasi langkah 5 — gantt', () => {
  it('TERJADWAL: sah dengan minimal satu task (ADR-056)', () => {
    expect(validasiLangkah({ ...TERJADWAL, gantt: GANTT_SAH }, 5).ok).toBe(true);
  });

  it('TERJADWAL: gagal bila tidak ada task sama sekali', () => {
    const h = validasiLangkah({ ...TERJADWAL, gantt: { groups: [{ nama: 'Persiapan', tasks: [] }] } }, 5);
    expect(h.ok).toBe(false);
  });

  it('TERJADWAL: gagal bila task selesai mendahului mulai', () => {
    const h = validasiLangkah(
      {
        ...TERJADWAL,
        gantt: {
          groups: [
            { nama: 'Persiapan', tasks: [{ nama: 'X', tanggal_mulai: '2026-11-05', tanggal_selesai: '2026-11-01' }] },
          ],
        },
      },
      5,
    );
    expect(h.ok).toBe(false);
  });

  it('TERJADWAL: gagal tanpa satu fase pun', () => {
    expect(validasiLangkah({ ...TERJADWAL, gantt: { groups: [] } }, 5).ok).toBe(false);
  });

  it('BERKALA: langkah 5 dilewati (selalu sah)', () => {
    expect(validasiLangkah({ kategori: 'BERKALA' }, 5).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Langkah 6 & keRencana
// ---------------------------------------------------------------------------

describe('langkah 6 & keRencana', () => {
  it('langkah 6 tidak punya isian sendiri (selalu sah)', () => {
    expect(validasiLangkah(TERJADWAL, 6).ok).toBe(true);
  });

  it('keRencana mengembalikan kepanitiaan & gantt dari draft', () => {
    const r = keRencana({ ...TERJADWAL, kepanitiaan: KEPANITIAAN_SAH, gantt: GANTT_SAH });
    expect(r.kepanitiaan).toEqual(KEPANITIAAN_SAH);
    expect(r.gantt).toEqual(GANTT_SAH);
  });

  it('keRencana mengembalikan objek kosong bila belum diisi', () => {
    expect(keRencana(TERJADWAL)).toEqual({ kepanitiaan: {}, gantt: {} });
  });

  it('keInputProker membuang kepanitiaan & gantt (bukan medan proker)', () => {
    const input = keInputProker({ ...TERJADWAL, kepanitiaan: KEPANITIAAN_SAH, gantt: GANTT_SAH });
    expect('kepanitiaan' in input).toBe(false);
    expect('gantt' in input).toBe(false);
  });
});
