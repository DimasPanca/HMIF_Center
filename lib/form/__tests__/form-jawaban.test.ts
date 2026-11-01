import { describe, expect, it } from 'vitest';

import { jalurBagian, periksaJawaban, validasiJawaban } from '@/lib/form/jawaban';
import { SkemaStruktur, syaratBuka, type Pertanyaan, type Struktur } from '@/lib/form/skema';

const p = (id: string, tipe: Pertanyaan['tipe'], ext: Partial<Pertanyaan> = {}): Pertanyaan => ({
  id,
  tipe,
  judul: id,
  deskripsi: '',
  wajib: false,
  opsi: {},
  peran: null,
  ...ext,
});

/** Bagian A: status (mahasiswa → B, alumni → C, lewati → KIRIM). */
const STRUKTUR: Struktur = {
  bagian: [
    {
      id: 'A',
      judul: 'Data',
      deskripsi: '',
      lanjut_ke: null,
      pertanyaan: [
        p('nama', 'TEKS_SINGKAT', { wajib: true, peran: 'nama_lengkap' }),
        p('status', 'PILIHAN_GANDA', {
          wajib: true,
          opsi: {
            pilihan: [
              { id: 'mhs', label: 'Mahasiswa', lompat_ke: 'B' },
              { id: 'alm', label: 'Alumni', lompat_ke: 'C' },
              { id: 'lain', label: 'Lainnya', lompat_ke: 'KIRIM' },
            ],
          },
        }),
      ],
    },
    { id: 'B', judul: 'Mahasiswa', deskripsi: '', lanjut_ke: 'KIRIM', pertanyaan: [p('nim', 'TEKS_SINGKAT', { wajib: true })] },
    { id: 'C', judul: 'Alumni', deskripsi: '', lanjut_ke: null, pertanyaan: [p('lulus', 'ANGKA', { wajib: true, opsi: { min: 2000, maks: 2030 } })] },
  ],
};

describe('form-jawaban: struktur', () => {
  it('struktur contoh sah', () => {
    expect(SkemaStruktur.safeParse(STRUKTUR).success).toBe(true);
  });

  it('menolak lompatan pada kotak centang, tujuan tak dikenal, peran ganda, kisi kosong, dua pemicu lompatan dalam satu bagian', () => {
    const salah = (s: Struktur) => SkemaStruktur.safeParse(s).error?.issues.map((i) => i.message) ?? [];
    expect(salah({ bagian: [{ ...STRUKTUR.bagian[0]!, pertanyaan: [p('x', 'KOTAK_CENTANG', { opsi: { pilihan: [{ id: 'a', label: 'A', lompat_ke: 'A' }] } })] }] })).toContain(
      'Lompat bagian hanya untuk pilihan ganda atau dropdown.',
    );
    expect(salah({ bagian: [{ ...STRUKTUR.bagian[0]!, lanjut_ke: 'ZZZ', pertanyaan: [] }] })).toContain('Tujuan bagian tidak ada.');
    expect(salah({ bagian: [{ ...STRUKTUR.bagian[0]!, pertanyaan: [p('a', 'TEKS_SINGKAT', { peran: 'nim' }), p('b', 'TEKS_SINGKAT', { peran: 'nim' })] }] })).toContain(
      'NIM sudah dipakai pertanyaan lain.',
    );
    expect(salah({ bagian: [{ ...STRUKTUR.bagian[0]!, pertanyaan: [p('k', 'KISI_PILIHAN', { opsi: { baris: [], kolom: [] } })] }] })).toContain(
      'Kisi butuh minimal satu baris dan satu kolom.',
    );
    const dua = { opsi: { pilihan: [{ id: 'a', label: 'A', lompat_ke: 'KIRIM' }] } };
    expect(salah({ bagian: [{ ...STRUKTUR.bagian[0]!, pertanyaan: [p('x', 'PILIHAN_GANDA', dua), p('y', 'DROPDOWN', dua)] }] })).toContain(
      'Satu bagian hanya boleh punya satu pertanyaan yang menentukan lompatan.',
    );
  });

  it('syarat buka: pendaftaran butuh pertanyaan bertanda Nama lengkap, pendataan butuh Nama + NIM', () => {
    expect(syaratBuka('PENDAFTARAN', STRUKTUR)).toEqual([]);
    expect(syaratBuka('PENDATAAN_PENGURUS', STRUKTUR)).toEqual(['Form Pendataan Pengurus perlu pertanyaan yang ditandai "NIM".']);
    expect(syaratBuka('LAINNYA', { bagian: [{ ...STRUKTUR.bagian[0]!, pertanyaan: [] }] })).toEqual(['Tambahkan minimal satu pertanyaan.']);
  });
});

describe('form-jawaban: jalur bagian (logika lompat)', () => {
  it('mengikuti pilihan: mahasiswa A→B lalu selesai; alumni A→C; lainnya langsung selesai', () => {
    expect(jalurBagian(STRUKTUR, { status: 'mhs' }).map((b) => b.id)).toEqual(['A', 'B']);
    expect(jalurBagian(STRUKTUR, { status: 'alm' }).map((b) => b.id)).toEqual(['A', 'C']);
    expect(jalurBagian(STRUKTUR, { status: 'lain' }).map((b) => b.id)).toEqual(['A']);
    expect(jalurBagian(STRUKTUR, {}).map((b) => b.id)).toEqual(['A', 'B']); // tanpa jawaban: urutan biasa, B berakhir KIRIM
  });

  it('logika melingkar tidak berputar selamanya', () => {
    const s: Struktur = { bagian: [{ ...STRUKTUR.bagian[1]!, id: 'X', lanjut_ke: 'Y' }, { ...STRUKTUR.bagian[1]!, id: 'Y', lanjut_ke: 'X' }] };
    expect(jalurBagian(s, {}).map((b) => b.id)).toEqual(['X', 'Y']);
  });

  it('jawaban di bagian yang dilompati dibuang, dan wajibnya tidak dituntut', () => {
    const h = validasiJawaban(STRUKTUR, { nama: 'Budi', status: 'alm', lulus: 2024, nim: '3337' });
    expect(h.ok).toBe(true);
    expect(h.jalur).toEqual(['A', 'C']);
    expect(h.baris.map((b) => b.pertanyaan_id).sort()).toEqual(['lulus', 'nama', 'status']);
  });

  it('wajib di jalur yang dilalui dituntut', () => {
    const h = validasiJawaban(STRUKTUR, { nama: '  ', status: 'mhs' });
    expect(h.ok).toBe(false);
    expect(h.galat).toEqual({ nama: 'Pertanyaan ini wajib diisi.', nim: 'Pertanyaan ini wajib diisi.' });
  });
});

describe('form-jawaban: setiap tipe', () => {
  const cek = (q: Pertanyaan, v: Parameters<typeof periksaJawaban>[1]) => periksaJawaban(q, v);

  it('teks singkat satu baris & batas panjang; paragraf boleh baris baru', () => {
    expect(cek(p('a', 'TEKS_SINGKAT'), 'Budi\nSantoso')).toEqual({ galat: 'Jawaban singkat cukup satu baris.' });
    expect(cek(p('a', 'TEKS_SINGKAT', { opsi: { maks: 3 } }), 'Budi')).toEqual({ galat: 'Maksimal 3 karakter (sekarang 4).' });
    expect(cek(p('a', 'PARAGRAF'), 'Baris 1\nBaris 2')).toEqual({ baris: { pertanyaan_id: 'a', nilai_teks: 'Baris 1\nBaris 2' } });
  });

  it('email dinormalisasi huruf kecil; angka dengan batas & koma desimal', () => {
    expect(cek(p('e', 'EMAIL'), ' Budi@Gmail.COM ')).toEqual({ baris: { pertanyaan_id: 'e', nilai_teks: 'budi@gmail.com' } });
    expect(cek(p('e', 'EMAIL'), 'budi@')).toHaveProperty('galat');
    expect(cek(p('n', 'ANGKA', { opsi: { min: 1, maks: 10 } }), '2,5')).toEqual({ baris: { pertanyaan_id: 'n', nilai_angka: 2.5 } });
    expect(cek(p('n', 'ANGKA', { opsi: { maks: 10 } }), 11)).toEqual({ galat: 'Maksimal 10.' });
  });

  it('pilihan ganda hanya id yang tersedia; "Lainnya" dengan teks', () => {
    const q = p('s', 'PILIHAN_GANDA', { opsi: { pilihan: [{ id: 'a', label: 'A' }], lainnya: true } });
    expect(cek(q, 'a')).toEqual({ baris: { pertanyaan_id: 's', nilai_teks: 'a' } });
    expect(cek(q, 'zzz')).toEqual({ galat: 'Pilih salah satu jawaban yang tersedia.' });
    expect(cek(q, { lainnya: 'Dosen' })).toEqual({ baris: { pertanyaan_id: 's', nilai_json: { lainnya: 'Dosen' } } });
  });

  it('kotak centang: unik, tersedia, batas min/maks', () => {
    const q = p('c', 'KOTAK_CENTANG', { opsi: { pilihan: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], maks_pilih: 2 } });
    expect(cek(q, ['a', 'a', 'b'])).toEqual({ baris: { pertanyaan_id: 'c', nilai_json: ['a', 'b'] } });
    expect(cek(q, ['a', 'b', 'c'])).toEqual({ galat: 'Pilih maksimal 2.' });
    expect(cek(q, ['x'])).toEqual({ galat: 'Ada pilihan yang tidak tersedia.' });
  });

  it('skala hanya bilangan bulat dalam rentang', () => {
    const q = p('k', 'SKALA', { opsi: { skala_min: 1, skala_maks: 5 } });
    expect(cek(q, 5)).toEqual({ baris: { pertanyaan_id: 'k', nilai_angka: 5 } });
    expect(cek(q, 6)).toEqual({ galat: 'Pilih nilai 1 sampai 5.' });
    expect(cek(q, 2.5)).toEqual({ galat: 'Pilih nilai 1 sampai 5.' });
  });

  it('kisi pilihan: setiap baris satu kolom; wajib menuntut semua baris; kisi centang boleh banyak', () => {
    const opsi = { baris: [{ id: 'r1', label: 'Sesi 1' }, { id: 'r2', label: 'Sesi 2' }], kolom: [{ id: 'k1', label: 'Baik' }, { id: 'k2', label: 'Buruk' }] };
    expect(cek(p('g', 'KISI_PILIHAN', { opsi, wajib: true }), { r1: 'k1' })).toEqual({ galat: 'Lengkapi baris "Sesi 2".' });
    expect(cek(p('g', 'KISI_PILIHAN', { opsi }), { r1: 'k1', r2: 'k2' })).toEqual({ baris: { pertanyaan_id: 'g', nilai_json: { r1: 'k1', r2: 'k2' } } });
    expect(cek(p('g', 'KISI_CENTANG', { opsi }), { r1: ['k1', 'k2'] })).toEqual({ baris: { pertanyaan_id: 'g', nilai_json: { r1: ['k1', 'k2'] } } });
    expect(cek(p('g', 'KISI_PILIHAN', { opsi }), { r1: 'zz' })).toEqual({ galat: 'Pilihan pada baris "Sesi 1" tidak tersedia.' });
  });

  it('tanggal benar-benar ada; waktu JJ:MM', () => {
    expect(cek(p('t', 'TANGGAL'), '2026-02-30')).toEqual({ galat: 'Pilih tanggal yang valid.' });
    expect(cek(p('t', 'TANGGAL'), '2026-12-06')).toEqual({ baris: { pertanyaan_id: 't', nilai_tanggal: '2026-12-06' } });
    expect(cek(p('w', 'WAKTU'), '24:00')).toHaveProperty('galat');
    expect(cek(p('w', 'WAKTU'), '08:30')).toEqual({ baris: { pertanyaan_id: 'w', nilai_waktu: '08:30' } });
  });

  it('unggah berkas wajib menuntut berkas yang diterima server', () => {
    const q = p('u', 'UNGGAH_BERKAS', { wajib: true });
    expect(periksaJawaban(q, undefined)).toEqual({ galat: 'Unggah berkas terlebih dahulu.' });
    expect(periksaJawaban(q, undefined, true)).toEqual({ baris: { pertanyaan_id: 'u' } });
  });
});
