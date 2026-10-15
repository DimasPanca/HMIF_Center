import { describe, expect, it } from 'vitest';

import { kenaliBerkas, namaAman } from '@/lib/kendala/berkas';
import {
  KEDALAMAN_MAKS,
  SkemaUbahKendala,
  idTerMention,
  pecahMention,
  susunUtas,
  tokenMention,
  type BalasanDatar,
} from '@/lib/kendala/skema';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

function b(id: string, parent: string | null, menit: number, nama = `Penulis ${id}`): BalasanDatar {
  return { id, parent_id: parent, konten: `isi ${id}`, penulis_id: U1, nama_penulis: nama, created_at: `2026-10-15T10:${String(menit).padStart(2, '0')}:00+00` };
}

describe('susunUtas', () => {
  it('menyusun pohon kronologis dengan kedalaman benar', () => {
    const utas = susunUtas([b('c', 'a', 3), b('a', null, 1), b('b', 'a', 2), b('d', null, 4)]);
    expect(utas.map((s) => s.id)).toEqual(['a', 'd']);
    expect(utas[0]!.anak.map((s) => [s.id, s.kedalaman])).toEqual([
      ['b', 2],
      ['c', 2],
    ]);
  });

  it('meratakan balasan lebih dalam dari tingkat 3 dan menyebut yang dibalas', () => {
    const utas = susunUtas([b('a', null, 1), b('b', 'a', 2), b('c', 'b', 3, 'Citra'), b('d', 'c', 4), b('e', 'd', 5)]);
    const t2 = utas[0]!.anak[0]!;
    expect(t2.kedalaman).toBe(2);
    const t3 = t2.anak;
    expect(t3.map((s) => s.id)).toEqual(['c', 'd', 'e']);
    expect(t3.every((s) => s.kedalaman === KEDALAMAN_MAKS)).toBe(true);
    expect(t3[1]!.membalas).toBe('Citra');
    expect(t3[2]!.membalas).toBe('Penulis d');
    expect(t3[0]!.membalas).toBeNull();
  });

  it('balasan yatim tampil di tingkat atas', () => {
    const utas = susunUtas([b('x', 'hilang', 1)]);
    expect(utas.map((s) => [s.id, s.kedalaman])).toEqual([['x', 1]]);
  });
});

describe('mention', () => {
  it('memecah token menjadi segmen teks dan mention', () => {
    const teks = `Tolong ${tokenMention('Budi Santoso', U1)} cek, cc ${tokenMention('Ani', U2)}.`;
    expect(pecahMention(teks)).toEqual([
      { t: 'teks', v: 'Tolong ' },
      { t: 'mention', nama: 'Budi Santoso', id: U1 },
      { t: 'teks', v: ' cek, cc ' },
      { t: 'mention', nama: 'Ani', id: U2 },
      { t: 'teks', v: '.' },
    ]);
    expect(idTerMention(`${teks} ${tokenMention('Budi', U1)}`)).toEqual([U1, U2]);
  });

  it('teks bertanda HTML tetap teks biasa', () => {
    expect(pecahMention('<b>@[x](bukan-uuid)</b>')).toEqual([{ t: 'teks', v: '<b>@[x](bukan-uuid)</b>' }]);
  });

  it('token membuang karakter yang merusak format', () => {
    expect(tokenMention('A]b[c', U1)).toBe(`@[Abc](${U1})`);
  });
});

describe('SkemaUbahKendala', () => {
  it('SELESAI wajib catatan penyelesaian', () => {
    expect(SkemaUbahKendala.safeParse({ status: 'SELESAI' }).success).toBe(false);
    expect(SkemaUbahKendala.safeParse({ status: 'SELESAI', catatan_penyelesaian: '  ok  ' }).success).toBe(false);
    expect(SkemaUbahKendala.safeParse({ status: 'SELESAI', catatan_penyelesaian: 'Pindah ke aula FT' }).success).toBe(true);
    expect(SkemaUbahKendala.safeParse({ status: 'SEDANG_DITANGANI' }).success).toBe(true);
  });
});

describe('kenaliBerkas', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  it('menerima jenis yang isinya cocok dengan ekstensinya', () => {
    expect(kenaliBerkas('bukti.PNG', png)?.mime).toBe('image/png');
    expect(kenaliBerkas('surat.pdf', Buffer.from('%PDF-1.7'))?.ext).toBe('pdf');
    expect(kenaliBerkas('foto.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
  });
  it('menolak ekstensi palsu dan jenis di luar daftar', () => {
    expect(kenaliBerkas('virus.png', Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(kenaliBerkas('skrip.html', Buffer.from('<html>'))).toBeNull();
    expect(kenaliBerkas('tanpa-ekstensi', png)).toBeNull();
  });
  it('namaAman membuang path dan karakter kendali', () => {
    expect(namaAman(String.raw`..\..\C:\rahasia\nota "a".pdf`)).toBe('nota a.pdf');
    expect(namaAman('../etc/pass\u0007wd')).toBe('passwd');
    expect(namaAman('')).toBe('lampiran');
  });
});
