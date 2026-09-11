/**
 * cek-deadline — menghitung ulang urgensi deadline kartu Kanban tiap hari.
 * SERVER-ONLY.
 *
 * ===========================================================================
 * MENGHITUNG, BUKAN MENYIMPAN
 * ===========================================================================
 * Urgensi deadline (mendekati/kritis/terlambat) TIDAK disimpan sebagai kolom —
 * ia diturunkan dari `kanban_card.deadline` terhadap tanggal hari ini setiap kali
 * dibaca. Karena itu langkah harian ini tidak menulis status apa pun; ia
 * MERINGKAS berapa kartu berada di tiap ambang, untuk masuk audit CRON dan
 * (kelak) memicu notifikasi. Ambangnya dari `app_config`:
 * `deadline_critical_hari` (default 3) dan `deadline_warning_hari` (default 7).
 *
 * Read-only membuat langkah ini idempoten dengan sendirinya — dijalankan dua kali
 * memberi angka yang sama, tanpa efek samping (ADR-009). Kartu berkolom DONE
 * dikecualikan: yang sudah selesai tak punya deadline mendesak.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-079 · SYSTEM_DESIGN §6.5 ·
 *         migrasi 010 (kanban_card) · 013/018 (ambang app_config)
 */

import type { TxKlien } from '@/lib/db/with-audit-context';

export interface HasilCekDeadline {
  /** Deadline dalam jendela peringatan tetapi belum kritis. */
  mendekati: number;
  /** Deadline dalam jendela kritis (≤ deadline_critical_hari) tetapi belum lewat. */
  kritis: number;
  /** Deadline sudah lewat. */
  terlambat: number;
}

export async function cekDeadline(tx: TxKlien): Promise<HasilCekDeadline> {
  const baris = await tx.$queryRaw<{ mendekati: bigint; kritis: bigint; terlambat: bigint }[]>`
    WITH ambang AS (
      SELECT
        COALESCE((SELECT value::text::int FROM app_config WHERE key = 'deadline_warning_hari'), 7)  AS peringatan,
        COALESCE((SELECT value::text::int FROM app_config WHERE key = 'deadline_critical_hari'), 3)  AS kritis
    )
    SELECT
      count(*) FILTER (WHERE k.deadline < CURRENT_DATE)                                                AS terlambat,
      count(*) FILTER (WHERE k.deadline >= CURRENT_DATE
                         AND k.deadline <= CURRENT_DATE + (SELECT kritis FROM ambang))                AS kritis,
      count(*) FILTER (WHERE k.deadline >  CURRENT_DATE + (SELECT kritis FROM ambang)
                         AND k.deadline <= CURRENT_DATE + (SELECT peringatan FROM ambang))            AS mendekati
    FROM kanban_card k
    WHERE k.deadline IS NOT NULL AND k.kolom <> 'DONE'
  `;
  const b = baris[0]!;
  return { mendekati: Number(b.mendekati), kritis: Number(b.kritis), terlambat: Number(b.terlambat) };
}
