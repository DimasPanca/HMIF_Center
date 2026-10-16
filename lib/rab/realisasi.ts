/**
 * Realisasi RAB dari nota terverifikasi (T-103, PRD F-9.2, SYSTEM_DESIGN §11.4).
 *
 * Tidak ada saldo atau realisasi yang DISIMPAN: setiap kali diminta, seluruh
 * buku dihitung ulang dari nota TERVERIFIKASI, berurutan menurut tanggal
 * belanja (lalu waktu unggah, lalu id — stabil), bukan urutan verifikasi.
 * Karena itu membatalkan verifikasi nota mana pun (termasuk yang di tengah)
 * otomatis menghitung ulang seluruh saldo dari awal (kontrak 2–3).
 *
 *   PENGELUARAN  satu baris per ALOKASI (nominal alokasi, bukan total nota —
 *                kontrak 4); alokasi di luar RAB ikut, bertanda (kontrak 5)
 *   RAB AKTUAL   Σ alokasi per item; alokasi di luar RAB TIDAK masuk item
 *                mana pun — ia temuan LPJ (ADR-006)
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-103 · ADR-006 · ADR-007
 */

export interface AlokasiRealisasi {
  rab_item_id: string | null;
  jenis_barang: string | null;
  uraian_luar_rab: string | null;
  nominal: number;
}

export interface NotaRealisasi {
  id: string;
  /** YYYY-MM-DD */
  tanggal: string;
  /** ISO — pemecah urutan bila tanggal sama. */
  diunggah: string;
  divisi: string;
  alokasi: AlokasiRealisasi[];
}

export interface BarisPengeluaran {
  no: number;
  nota_id: string;
  tanggal: string;
  uraian: string;
  divisi: string;
  nominal: number;
  /** Saldo setelah baris ini. */
  saldo: number;
  luar_rab: boolean;
}

export interface BukuPengeluaran {
  saldo_awal: number;
  baris: BarisPengeluaran[];
  total_pengeluaran: number;
  sisa: number;
}

/** Urutan buku: tanggal belanja → waktu unggah → id. Tidak pernah urutan verifikasi. */
export function urutkanNota<N extends Pick<NotaRealisasi, 'tanggal' | 'diunggah' | 'id'>>(
  nota: readonly N[],
): N[] {
  return [...nota].sort(
    (a, b) =>
      a.tanggal.localeCompare(b.tanggal) ||
      a.diunggah.localeCompare(b.diunggah) ||
      a.id.localeCompare(b.id),
  );
}

export const LABEL_LUAR_RAB = 'Di luar RAB';

/** Buku PENGELUARAN lengkap dengan saldo berjalan — selalu dihitung dari awal. */
export function bukuPengeluaran(
  saldoAwal: number,
  nota: readonly NotaRealisasi[],
): BukuPengeluaran {
  let saldo = saldoAwal;
  let no = 0;
  const baris: BarisPengeluaran[] = [];
  for (const n of urutkanNota(nota)) {
    // Item RAB dulu (urut nama), lalu baris luar RAB — deterministik.
    const alokasi = [...n.alokasi].sort(
      (a, b) =>
        Number(a.rab_item_id === null) - Number(b.rab_item_id === null) ||
        (a.jenis_barang ?? a.uraian_luar_rab ?? '').localeCompare(
          b.jenis_barang ?? b.uraian_luar_rab ?? '',
          'id',
        ),
    );
    for (const a of alokasi) {
      saldo -= a.nominal;
      const luar = a.rab_item_id === null;
      baris.push({
        no: ++no,
        nota_id: n.id,
        tanggal: n.tanggal,
        uraian: luar
          ? `${LABEL_LUAR_RAB}: ${a.uraian_luar_rab ?? '-'}`
          : (a.jenis_barang ?? 'Item RAB'),
        divisi: n.divisi,
        nominal: a.nominal,
        saldo,
        luar_rab: luar,
      });
    }
  }
  const total = baris.reduce((s, b) => s + b.nominal, 0);
  return { saldo_awal: saldoAwal, baris, total_pengeluaran: total, sisa: saldoAwal - total };
}

/** Realisasi per item RAB = Σ nominal alokasi ke item itu (bukan total nota). */
export function realisasiPerItem(nota: readonly NotaRealisasi[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of nota) {
    for (const a of n.alokasi) {
      if (a.rab_item_id) m.set(a.rab_item_id, (m.get(a.rab_item_id) ?? 0) + a.nominal);
    }
  }
  return m;
}

export type PenandaSelisih = 'BELUM' | 'SESUAI' | 'HEMAT' | 'LEBIH';

/** Penanda rencana vs realisasi per item (tab RAB Aktual, kontrak 6). */
export function penandaSelisih(rencana: number, realisasi: number): PenandaSelisih {
  if (realisasi === 0) return 'BELUM';
  if (realisasi === rencana) return 'SESUAI';
  return realisasi > rencana ? 'LEBIH' : 'HEMAT';
}
