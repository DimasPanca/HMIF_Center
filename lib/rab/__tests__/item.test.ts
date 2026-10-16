import { describe, expect, it } from 'vitest';

import { SkemaUbahItem, jumlahkanAcara, terapkanUbah, totalItem, type DivisiRab, type ItemRab } from '@/lib/rab/item';

const item = (o: Partial<ItemRab> = {}): ItemRab => ({
  id: 'i1',
  section_id: 's1',
  no_urut: 1,
  jenis_barang: 'Galon',
  jumlah_teks: '10',
  jumlah_numerik: 10,
  harga_satuan: 5000,
  total: 50000,
  total_manual: false,
  keterangan: null,
  ...o,
});

describe('terapkanUbah — aturan yang sama di klien dan server (INV-27)', () => {
  it('"16 Unit" tersimpan apa adanya dan terhitung 16 (INV-26)', () => {
    const b = terapkanUbah(item(), { jumlah_teks: '16 Unit' });
    expect(b.jumlah_teks).toBe('16 Unit');
    expect(b.jumlah_numerik).toBe(16);
    expect(b.total).toBe(80000);
  });

  it('"2 Hari 1 Malam": perkiraan dari angka pertama, lalu isian manual menang', () => {
    const kira = terapkanUbah(item(), { jumlah_teks: '2 Hari 1 Malam' });
    expect(kira.jumlah_numerik).toBe(2);
    const pasti = terapkanUbah(kira, { jumlah_numerik: 3 });
    expect(pasti.jumlah_teks).toBe('2 Hari 1 Malam');
    expect(pasti.total).toBe(15000);
  });

  it('isian manual diabaikan bila teksnya angka jelas', () => {
    expect(terapkanUbah(item(), { jumlah_teks: '4', jumlah_numerik: 99 }).jumlah_numerik).toBe(4);
  });

  it('mengubah harga satuan menghitung ulang total', () => {
    expect(terapkanUbah(item(), { harga_satuan: 7500 }).total).toBe(75000);
  });

  it('total manual mengunci nilai; dimatikan → kembali terhitung', () => {
    const kunci = terapkanUbah(item(), { total_manual: true, total: 42000 });
    expect(kunci.total).toBe(42000);
    expect(terapkanUbah(kunci, { harga_satuan: 9000 }).total).toBe(42000);
    expect(terapkanUbah(kunci, { total_manual: false }).total).toBe(50000);
  });

  it('pecahan dibulatkan ke rupiah bulat', () => {
    expect(totalItem({ jumlah_numerik: 2.5, harga_satuan: 3333, total: 0, total_manual: false })).toBe(8333);
  });
});

describe('SkemaUbahItem', () => {
  it('menolak harga negatif dan kunci asing', () => {
    expect(SkemaUbahItem.safeParse({ harga_satuan: -1 }).success).toBe(false);
    expect(SkemaUbahItem.safeParse({ section_id: 'x' }).success).toBe(false);
  });
});

describe('jumlah bertingkat', () => {
  it('total acara = jumlah seluruh item seluruh divisi', () => {
    const d: DivisiRab[] = [
      { id: 'd1', nama: 'Konsumsi', warna: null, boleh_tulis: true, sections: [{ id: 's1', nama: 'A', urutan: 0, items: [item(), item({ id: 'i2', harga_satuan: 30000, jumlah_numerik: 58 })] }] },
      { id: 'd2', nama: 'PDD', warna: null, boleh_tulis: false, sections: [{ id: 's2', nama: 'B', urutan: 0, items: [item({ id: 'i3', total_manual: true, total: 400000 })] }] },
    ];
    expect(jumlahkanAcara(d)).toBe(50000 + 1740000 + 400000);
  });
});
