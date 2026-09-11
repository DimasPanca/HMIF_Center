/**
 * lepas-kunci — langkah lifecycle harian: menyelesaikan acara yang lewat,
 * melepas kuncinya, dan menjalankan yang masa persiapannya tiba. SERVER-ONLY.
 *
 * Hanya membungkus fungsi SQL `lepas_kunci_selesai()` (migrasi 014a) — SATU
 * pernyataan atomik yang IDEMPOTEN (dijaga oleh filter status, ADR-009): dua kali
 * jalan dalam sehari tidak menggandakan efek. Logikanya sengaja di database,
 * bukan TS, supaya transisi status dan pelepasan kunci terjadi dalam satu
 * transaksi tanpa perjalanan bolak-balik.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-079 · SYSTEM_DESIGN §6.5 · ADR-009 ·
 *         migrasi 014a
 */

import type { TxKlien } from '@/lib/db/with-audit-context';

export interface HasilLepasKunci {
  /** Proker BERJALAN yang hari-H terakhirnya lewat → SELESAI. */
  jadi_selesai: number;
  /** Baris proker_lock yang dilepas (proker SELESAI/DIBATALKAN). */
  kunci_dilepas: number;
  /** Proker DISETUJUI yang masa persiapannya tiba → BERJALAN (kunci tetap). */
  jadi_berjalan: number;
}

export async function lepasKunciSelesai(tx: TxKlien): Promise<HasilLepasKunci> {
  const baris = await tx.$queryRaw<{ hasil: HasilLepasKunci }[]>`
    SELECT lepas_kunci_selesai() AS hasil
  `;
  return baris[0]!.hasil;
}
