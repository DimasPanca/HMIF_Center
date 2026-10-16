import { describe, expect, it } from 'vitest';

import {
  BAGIAN_TOR,
  SkemaBarisRundown,
  SkemaDataTor,
  SkemaSimpanTor,
  adaTeks,
  kelengkapanTor,
  normalisasiTor,
  peringatanBobot,
  torKosong,
  totalBobot,
  type DataTor,
} from '@/lib/tor/schema';

const doc = (teks: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: teks ? [{ type: 'text', text: teks }] : [] }],
});
const luarKosong = { rundown: 0, anggaran: false, penandatangan: false };

function torPenuh(): DataTor {
  return {
    nama_kegiatan: 'Kegiatan Tahunan 1',
    tema: 'Synergy',
    gambaran_umum: doc('Gambaran'),
    tujuan: ['Mempererat'],
    bentuk_acara: { uraian: doc('Seminar'), sub: [] },
    waktu_tempat: [{ sesi: 'Sesi 1', tanggal: '2026-11-10', waktu: '08.00 WIB', tempat: 'Aula' }],
    sasaran: { uraian: doc(''), estimasi_jumlah: 120, jumlah_kelompok: 12 },
    kondisi: [{ sesi: 'Sesi 1', ketentuan: 'Wajib hadir' }],
    parameter: [{ kriteria: 'Keaktifan', bobot: 100, kkm: 70 }],
    rangkaian: [{ nama: 'Pembukaan', uraian: '' }],
    penutup: doc('Demikian'),
  };
}

describe('skema TOR', () => {
  it('14 bagian persis PRD F-10.1, berurutan', () => {
    expect(BAGIAN_TOR.map((b) => b.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(BAGIAN_TOR.find((b) => b.no === 12)?.judul).toBe('Anggaran');
  });

  it('TOR kosong lolos skema (draf boleh setengah jadi)', () => {
    expect(SkemaDataTor.safeParse(torKosong()).success).toBe(true);
  });

  it('anggaran & rundown TIDAK diterima di tor.data (strict)', () => {
    expect(SkemaDataTor.safeParse({ ...torKosong(), anggaran: { total: 1 } }).success).toBe(false);
    expect(SkemaDataTor.safeParse({ ...torKosong(), rundown: [] }).success).toBe(false);
  });

  it('teks kaya wajib dokumen ProseMirror', () => {
    expect(SkemaDataTor.safeParse({ ...torKosong(), penutup: '<p>x</p>' }).success).toBe(false);
  });

  it('rundown: tanggal & acara wajib, jam selesai setelah jam mulai', () => {
    const dasar = {
      id: '6f1b0f7e-2a51-4c55-9f0e-0d6a6f6a1c11',
      tanggal: '2026-11-10',
      waktu_mulai: '08:00',
      waktu_selesai: '09:30',
      acara: 'Pembukaan',
      keterangan: '',
    };
    expect(SkemaBarisRundown.safeParse(dasar).success).toBe(true);
    expect(SkemaBarisRundown.safeParse({ ...dasar, acara: '  ' }).success).toBe(false);
    expect(SkemaBarisRundown.safeParse({ ...dasar, tanggal: '' }).success).toBe(false);
    expect(SkemaBarisRundown.safeParse({ ...dasar, waktu_selesai: '07:00' }).success).toBe(false);
    expect(
      SkemaBarisRundown.safeParse({ ...dasar, waktu_mulai: '', waktu_selesai: '' }).success,
    ).toBe(true);
  });

  it('isi simpan: rundown opsional', () => {
    expect(SkemaSimpanTor.safeParse({ data: torKosong() }).success).toBe(true);
  });
});

describe('bobot parameter kelulusan', () => {
  it('tepat 100% tanpa peringatan, termasuk pecahan', () => {
    expect(peringatanBobot([{ bobot: 33.33 }, { bobot: 33.33 }, { bobot: 33.34 }])).toBeNull();
    expect(totalBobot([{ bobot: 33.33 }, { bobot: 33.33 }, { bobot: 33.34 }])).toBe(100);
  });

  it('kurang/lebih ditandai beserta selisihnya', () => {
    expect(peringatanBobot([{ bobot: 40 }, { bobot: 50 }])).toBe(
      'Total bobot 90% — kurang 10% dari 100%.',
    );
    expect(peringatanBobot([{ bobot: 70 }, { bobot: 40.5 }])).toBe(
      'Total bobot 110,5% — lebih 10,5% dari 100%.',
    );
    expect(peringatanBobot([{ bobot: null }])).toContain('kurang 100%');
  });

  it('tanpa parameter tidak ada peringatan', () => {
    expect(peringatanBobot([])).toBeNull();
  });
});

describe('kelengkapan TOR', () => {
  it('TOR kosong: 0 dari 14, seluruh bagian disebut', () => {
    const k = kelengkapanTor(torKosong(), luarKosong);
    expect(k).toMatchObject({ terisi: 0, total: 14 });
    expect(k.kurang).toHaveLength(14);
  });

  it('11 bagian tor.data terisi + rundown + anggaran + penandatangan = 14', () => {
    expect(kelengkapanTor(torPenuh(), { rundown: 3, anggaran: true, penandatangan: true })).toEqual(
      { terisi: 14, total: 14, kurang: [] },
    );
  });

  it('bagian luar dihitung dari fakta, bukan tor.data', () => {
    const k = kelengkapanTor(torPenuh(), luarKosong);
    expect(k.terisi).toBe(11);
    expect(k.kurang).toEqual(['11. Susunan Acara (Rundown)', '12. Anggaran', '14. Penandatangan']);
  });

  it('paragraf kosong tidak dihitung terisi', () => {
    expect(adaTeks(doc(''))).toBe(false);
    expect(adaTeks(doc('  '))).toBe(false);
    expect(adaTeks(doc('a'))).toBe(true);
  });
});

describe('normalisasi tor.data dari DB', () => {
  it('kolom rusak diganti kosong, kolom sah dipertahankan, kolom asing dibuang', () => {
    const n = normalisasiTor(
      { tema: 'Sah', tujuan: 'bukan array', asing: 1 },
      { nama_kegiatan: 'Dari acara' },
    );
    expect(n.tema).toBe('Sah');
    expect(n.tujuan).toEqual([]);
    expect(n.nama_kegiatan).toBe('Dari acara');
    expect('asing' in n).toBe(false);
  });

  it('null → TOR kosong berisi nama & tema acara', () => {
    expect(normalisasiTor(null, { nama_kegiatan: 'KT1', tema: 'T' })).toEqual(
      torKosong({ nama_kegiatan: 'KT1', tema: 'T' }),
    );
  });
});
