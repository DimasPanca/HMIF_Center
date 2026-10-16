/**
 * Gate T-088 — `npm run test -- rab-calculate`.
 *
 * Nama berkas memuat "rab-calculate" supaya perintah verifikasi kontrak
 * benar-benar memilihnya (filter vitest mencocokkan path berkas).
 */
import { describe, expect, it } from 'vitest';

import { bulatkanJumlah, hitungRab, hitungTotalItem, kaliRupiah, type ItemHitung } from '@/lib/rab/calculate';
import { terapkanUbah, type ItemRab } from '@/lib/rab/item';

const item = (id: string, jumlah: number | null, harga: number, o: Partial<ItemHitung> = {}): ItemHitung => ({
  id,
  jumlah_numerik: jumlah,
  harga_satuan: harga,
  total: 0,
  total_manual: false,
  ...o,
});

/** 3 divisi × 2 sub-section × 5 item (kontrak T-088 butir 6). */
function rabContoh() {
  return ['Acara', 'Konsumsi', 'PDD'].map((nama, d) => ({
    id: `d${d}`,
    nama,
    sections: [0, 1].map((s) => ({
      id: `d${d}s${s}`,
      items: [0, 1, 2, 3, 4].map((i) => {
        const id = `d${d}s${s}i${i}`;
        if (d === 1 && s === 0 && i === 4) return item(id, null, 75_000); // jumlah kosong
        if (d === 2 && s === 1 && i === 0) return item(id, 2, 999_999, { total_manual: true, total: 1_500_000 });
        return item(id, i + 1, 10_000 * (d + 1) + 500 * s);
      }),
    })),
  }));
}

describe('hitungRab — SYSTEM_DESIGN §11.2', () => {
  const hasil = hitungRab(rabContoh(), 749_300);

  it('total per item, sub-section, divisi, dan grand total', () => {
    // Divisi Acara: harga 10.000 (s0) dan 10.500 (s1), jumlah 1..5 → 15 × harga
    expect(hasil.perDivisi[0]!.sections[0]!.subtotal).toBe(150_000);
    expect(hasil.perDivisi[0]!.sections[1]!.subtotal).toBe(157_500);
    expect(hasil.perDivisi[0]!.total).toBe(307_500);
    // Konsumsi s0: 1..4 × 20.000 = 200.000; item ke-5 tanpa jumlah = 0
    expect(hasil.perDivisi[1]!.sections[0]!.subtotal).toBe(200_000);
    expect(hasil.perDivisi[1]!.total).toBe(200_000 + 15 * 20_500);
    // PDD s1: item 0 manual 1.500.000, item 1..4 = (2+3+4+5) × 30.500
    expect(hasil.perDivisi[2]!.sections[1]!.subtotal).toBe(1_500_000 + 14 * 30_500);
    const totalDivisi = hasil.perDivisi.reduce((x, d) => x + d.total, 0);
    expect(hasil.totalDivisi).toBe(totalDivisi);
    expect(hasil.grandTotal).toBe(totalDivisi + 749_300);
  });

  it('item tanpa jumlah numerik dihitung 0 dan ditandai', () => {
    const kosong = hasil.perDivisi[1]!.sections[0]!.items[4]!;
    expect(kosong.total).toBe(0);
    expect(kosong.tanpaJumlah).toBe(true);
    expect(hasil.itemTanpaJumlah).toBe(1);
    expect(hasil.perDivisi[0]!.sections[0]!.items[0]!.tanpaJumlah).toBe(false);
  });

  it('total_manual mengunci nilai — tidak ditimpa jumlah × harga', () => {
    const manual = hasil.perDivisi[2]!.sections[1]!.items[0]!;
    expect(manual.total).toBe(1_500_000);
    expect(manual.tanpaJumlah).toBe(false);
  });

  it('dana tak terduga tidak tercampur ke total divisi', () => {
    expect(hitungRab(rabContoh(), 0).totalDivisi).toBe(hasil.totalDivisi);
    expect(hasil.danaTakTerduga).toBe(749_300);
  });

  it('tidak mengubah masukan', () => {
    const masuk = rabContoh();
    const salinan = JSON.stringify(masuk);
    hitungRab(masuk);
    expect(JSON.stringify(masuk)).toBe(salinan);
  });
});

describe('aritmetika rupiah tanpa galat float', () => {
  it('0,29 × Rp50 = Rp15 — float memberi 14,4999… lalu dibulatkan ke 14', () => {
    expect(Math.round(0.29 * 50)).toBe(14); // bukti galat float yang dihindari
    expect(kaliRupiah(0.29, 50)).toBe(15);
    expect(kaliRupiah(2.5, 3333)).toBe(8333); // setengah ke atas
  });

  it('jumlah dibulatkan dua desimal seperti NUMERIC(12,2) Postgres', () => {
    expect(bulatkanJumlah(2.675)).toBe(2.68);
    expect(bulatkanJumlah(1.005)).toBe(1.01);
    expect(bulatkanJumlah(16)).toBe(16);
    expect(bulatkanJumlah(null)).toBeNull();
  });

  it('harga besar tetap eksak', () => {
    expect(kaliRupiah(12.5, 999_999_999_999)).toBe(12_499_999_999_988);
  });

  it('100 item acak: hasil identik dengan acuan BigInt, tanpa galat pembulatan', () => {
    let benih = 20261016;
    const acak = () => {
      benih = (benih * 1103515245 + 12345) % 2 ** 31;
      return benih / 2 ** 31;
    };
    const items = Array.from({ length: 100 }, (_, i) =>
      item(`r${i}`, Math.round(acak() * 100_000) / 100, Math.round(acak() * 50_000_000)),
    );
    const acuan = items.reduce((x, i) => {
      const p = BigInt(Math.round(i.jumlah_numerik! * 100)) * BigInt(i.harga_satuan);
      return x + (p + BigInt(50)) / BigInt(100);
    }, BigInt(0));
    const h = hitungRab([{ id: 'd', sections: [{ id: 's', items }] }]);
    expect(BigInt(h.grandTotal)).toBe(acuan);
    // Klien dan server memakai fungsi yang sama: urutan penjumlahan pun tak mengubah hasil.
    const terbalik = hitungRab([{ id: 'd', sections: [{ id: 's', items: [...items].reverse() }] }]);
    expect(terbalik.grandTotal).toBe(h.grandTotal);
  });
});

describe('terapkanUbah memakai kalkulasi yang sama (INV-27)', () => {
  it('total item dari grid = hitungTotalItem', () => {
    const lama: ItemRab = {
      id: 'x',
      section_id: 's',
      no_urut: 1,
      jenis_barang: 'Sewa',
      jumlah_teks: '2,5',
      jumlah_numerik: 2.5,
      harga_satuan: 3333,
      total: 0,
      total_manual: false,
      keterangan: null,
    };
    const baru = terapkanUbah(lama, { harga_satuan: 3333 });
    expect(baru.total).toBe(hitungTotalItem(baru));
    expect(baru.total).toBe(8333);
  });
});
