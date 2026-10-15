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
 * Sejak T-083 langkah ini juga MENYEGARKAN agregat per departemen di
 * `deadline_ringkasan` (migrasi 038) untuk dashboard — upsert penuh atas
 * keadaan hari ini, jadi dijalankan dua kali tetap memberi isi yang sama
 * (ADR-009). Kartu berkolom DONE dikecualikan: yang sudah selesai tak punya
 * deadline mendesak. Batas hari memakai `hari_ini_jakarta()`, bukan
 * CURRENT_DATE server (UTC) — T-083 #4.
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
      count(*) FILTER (WHERE k.deadline < hari_ini_jakarta())                                                AS terlambat,
      count(*) FILTER (WHERE k.deadline >= hari_ini_jakarta()
                         AND k.deadline <= hari_ini_jakarta() + (SELECT kritis FROM ambang))                AS kritis,
      count(*) FILTER (WHERE k.deadline >  hari_ini_jakarta() + (SELECT kritis FROM ambang)
                         AND k.deadline <= hari_ini_jakarta() + (SELECT peringatan FROM ambang))            AS mendekati
    FROM kanban_card k
    WHERE k.deadline IS NOT NULL AND k.kolom <> 'DONE'
  `;
  await segarkanRingkasan(tx);
  const b = baris[0]!;
  return { mendekati: Number(b.mendekati), kritis: Number(b.kritis), terlambat: Number(b.terlambat) };
}

/** Agregat per departemen untuk dashboard (T-083 #5). Departemen tanpa kartu mendesak dihapus barisnya. */
async function segarkanRingkasan(tx: TxKlien): Promise<void> {
  await tx.$executeRaw`
    WITH ambang AS (
      SELECT
        COALESCE((SELECT value::text::int FROM app_config WHERE key = 'deadline_warning_hari'), 7)  AS peringatan,
        COALESCE((SELECT value::text::int FROM app_config WHERE key = 'deadline_critical_hari'), 3)  AS kritis
    ),
    hitung AS (
      SELECT k.departemen_id,
             count(*) FILTER (WHERE k.deadline < hari_ini_jakarta())::int AS terlambat,
             count(*) FILTER (WHERE k.deadline >= hari_ini_jakarta()
                                AND k.deadline <= hari_ini_jakarta() + (SELECT kritis FROM ambang))::int AS kritis,
             count(*) FILTER (WHERE k.deadline >  hari_ini_jakarta() + (SELECT kritis FROM ambang)
                                AND k.deadline <= hari_ini_jakarta() + (SELECT peringatan FROM ambang))::int AS peringatan
      FROM kanban_card k
      WHERE k.departemen_id IS NOT NULL AND k.deadline IS NOT NULL AND k.kolom <> 'DONE'
      GROUP BY k.departemen_id
    ),
    hapus AS (
      DELETE FROM deadline_ringkasan r
      WHERE NOT EXISTS (SELECT 1 FROM hitung h WHERE h.departemen_id = r.departemen_id)
    )
    INSERT INTO deadline_ringkasan (departemen_id, tanggal, peringatan, kritis, terlambat, dihitung_pada)
    SELECT departemen_id, hari_ini_jakarta(), peringatan, kritis, terlambat, now() FROM hitung
    ON CONFLICT (departemen_id) DO UPDATE
      SET tanggal = EXCLUDED.tanggal, peringatan = EXCLUDED.peringatan, kritis = EXCLUDED.kritis,
          terlambat = EXCLUDED.terlambat, dihitung_pada = EXCLUDED.dihitung_pada
  `;
}
