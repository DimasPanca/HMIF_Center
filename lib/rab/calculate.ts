/**
 * Kalkulasi RAB bertingkat (T-088, SYSTEM_DESIGN §11.2, PRD F-9.3). Murni, aman
 * untuk klien — grid dan server menjalankan fungsi yang SAMA (INV-27).
 *
 * ===========================================================================
 * TANPA FLOAT UNTUK UANG
 * ===========================================================================
 * `jumlah_numerik` boleh pecahan (NUMERIC(12,2), mis. 2,5 hari) dan harga
 * sampai 15 digit. `2.5 * 3333` dalam float = 8332.499999… — dibulatkan jadi
 * 8332, padahal benar 8333 (setengah ke atas). Di sini jumlah diubah ke
 * perseratus (bilangan bulat), dikali harga dalam BigInt, lalu dibagi 100
 * dengan pembulatan setengah-ke-atas. Penjumlahan berikutnya hanya
 * menjumlahkan bilangan bulat rupiah — eksak selama < 2^53 (≈ 9 ribu triliun).
 *
 * `total_manual` mengunci nilai pengguna: tidak pernah ditimpa hasil hitung.
 * Item tanpa jumlah numerik (dan tidak manual) dihitung 0 dan DITANDAI
 * `tanpaJumlah` supaya UI/ekspor dapat memintanya diisi.
 *
 * Dana tak terduga dicatat terpisah: tidak masuk total divisi, tetapi masuk
 * TOTAL akhir sebagai baris terakhir ringkasan (RAB_CELL_MAP §ringkasan).
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-088 · SYSTEM_DESIGN §11.2 · RAB_CELL_MAP · INV-27
 */

export interface ItemHitung {
  id: string;
  jumlah_numerik: number | null;
  harga_satuan: number;
  total: number;
  total_manual: boolean;
}

export interface SectionHitung<I extends ItemHitung = ItemHitung> {
  id: string;
  items: I[];
}

export interface DivisiHitung<I extends ItemHitung = ItemHitung, S extends SectionHitung<I> = SectionHitung<I>> {
  id: string;
  sections: S[];
}

export type HasilItem<I extends ItemHitung> = I & { total: number; tanpaJumlah: boolean };
export type HasilSection<I extends ItemHitung, S extends SectionHitung<I>> = Omit<S, 'items'> & { items: HasilItem<I>[]; subtotal: number };
export type HasilDivisi<I extends ItemHitung, S extends SectionHitung<I>, D extends DivisiHitung<I, S>> = Omit<D, 'sections'> & {
  sections: HasilSection<I, S>[];
  total: number;
};

export interface RabSummary<I extends ItemHitung, S extends SectionHitung<I>, D extends DivisiHitung<I, S>> {
  perDivisi: HasilDivisi<I, S, D>[];
  /** Jumlah total seluruh divisi — TANPA dana tak terduga. */
  totalDivisi: number;
  danaTakTerduga: number;
  /** TOTAL akhir = totalDivisi + dana tak terduga. */
  grandTotal: number;
  /** Item non-manual yang jumlah numeriknya kosong (dihitung 0). */
  itemTanpaJumlah: number;
}

const rupiahBulat = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

/**
 * Pembulatan dua desimal setengah-ke-atas pada representasi DESIMAL angka —
 * sama dengan cara NUMERIC(12,2) Postgres menyimpan `jumlah_numerik`.
 * `(2.675).toFixed(2)` = "2.67" (float), Postgres menyimpan 2.68; tanpa ini
 * klien dan server berselisih satu rupiah pada harga besar.
 */
export function bulatkanJumlah(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const [utuh, pecahan = ''] = Math.abs(n).toString().split('.');
  if (utuh!.includes('e') || pecahan.length <= 2) return n;
  const ratus = BigInt(utuh! + pecahan.slice(0, 2)) + BigInt(Number(pecahan[2]) >= 5 ? 1 : 0);
  return (n < 0 ? -1 : 1) * (Number(ratus) / 100);
}

/** round_half_up(jumlah × harga) dengan aritmetika bilangan bulat. */
export function kaliRupiah(jumlah: number, harga: number): number {
  if (!Number.isFinite(jumlah) || !Number.isFinite(harga) || jumlah <= 0 || harga <= 0) return 0;
  const perseratus = BigInt(Math.round(jumlah * 100)); // NUMERIC(12,2): dua desimal pasti tepat
  const hasil = (perseratus * BigInt(Math.round(harga)) + BigInt(50)) / BigInt(100);
  return Number(hasil);
}

/** Total satu item: nilai manual bila dikunci, selain itu jumlah × harga. */
export function hitungTotalItem(i: Pick<ItemHitung, 'jumlah_numerik' | 'harga_satuan' | 'total' | 'total_manual'>): number {
  if (i.total_manual) return rupiahBulat(i.total);
  return kaliRupiah(i.jumlah_numerik ?? 0, i.harga_satuan);
}

export function hitungRab<I extends ItemHitung, S extends SectionHitung<I>, D extends DivisiHitung<I, S>>(
  divisiList: readonly D[],
  danaTakTerduga = 0,
): RabSummary<I, S, D> {
  let itemTanpaJumlah = 0;

  const perDivisi = divisiList.map((div) => {
    const sections = div.sections.map((sec) => {
      const items = sec.items.map((item) => {
        const tanpaJumlah = !item.total_manual && item.jumlah_numerik === null;
        if (tanpaJumlah) itemTanpaJumlah++;
        return { ...item, total: hitungTotalItem(item), tanpaJumlah } as HasilItem<I>;
      });
      return { ...sec, items, subtotal: items.reduce((x, i) => x + i.total, 0) } as HasilSection<I, S>;
    });
    return { ...div, sections, total: sections.reduce((x, s) => x + s.subtotal, 0) } as HasilDivisi<I, S, D>;
  });

  const totalDivisi = perDivisi.reduce((x, d) => x + d.total, 0);
  const dana = rupiahBulat(danaTakTerduga);
  return { perDivisi, totalDivisi, danaTakTerduga: dana, grandTotal: totalDivisi + dana, itemTanpaJumlah };
}
