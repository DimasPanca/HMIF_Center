/**
 * rencana-store — persistensi rencana kepanitiaan & Gantt hasil submit wizard.
 * SERVER-ONLY.
 *
 * ===========================================================================
 * KENAPA TERPISAH DARI wizard-state DAN draft-store
 * ===========================================================================
 * `wizard-state.ts` harus tetap aman diimpor klien, jadi ia tidak menyentuh
 * database. `draft-store.ts` menyimpan corat-coret wizard yang DIHAPUS saat
 * submit. Berkas INI menyimpan rencana yang justru harus BERTAHAN melewati
 * submit — sampai approval (T-070) membentuk kepanitiaan sungguhan darinya.
 *
 * Baris `proker_rencana` terikat ke proker (bukan ke draft yang sudah dihapus,
 * bukan pula ke pengguna). Ia menampung susunan langkah 4-5 sebagai JSONB dan
 * TIDAK pernah mengunci kalender. `bentukKepanitiaanOtomatis()` (T-070)
 * membacanya lewat `ambilRencana` di dalam transaksi approval.
 *
 * Seluruh mutasi menerima `tx` dari `withAuditContext` (K-09).
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-069, T-070 · ADR-056 ·
 *         docs/ai/WIZARD_SUBMIT_CONTRACT.md · migrasi 021 · K-09
 */

import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import type { RencanaKepanitiaan, RencanaGantt } from './wizard-state';

if (typeof window !== 'undefined') {
  throw new Error('lib/proker/rencana-store.ts adalah modul server-only.');
}

export interface RencanaTersimpan {
  id: string;
  proker_id: string;
  kepanitiaan: RencanaKepanitiaan;
  gantt: RencanaGantt;
}

/**
 * Menyimpan rencana kepanitiaan & Gantt sebuah proker.
 *
 * Dipanggil di dalam transaksi submit, SETELAH proker dibuat dan SETELAH kedua
 * rencana lolos validasi (submit yang memvalidasi, store hanya menulis). Satu
 * rencana per proker (UNIQUE) — UPSERT supaya submit ulang idempoten sekalipun
 * jalur normalnya membuat proker baru tiap kali.
 */
export async function simpanRencana(
  tx: TxKlien,
  prokerId: string,
  periodeId: string,
  kepanitiaan: RencanaKepanitiaan,
  gantt: RencanaGantt,
): Promise<{ id: string }> {
  const baris = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO proker_rencana (proker_id, periode_id, kepanitiaan, gantt)
    VALUES (
      ${prokerId}::uuid,
      ${periodeId}::uuid,
      ${kepanitiaan as unknown as Prisma.InputJsonValue}::jsonb,
      ${gantt as unknown as Prisma.InputJsonValue}::jsonb
    )
    ON CONFLICT (proker_id) DO UPDATE
      SET kepanitiaan = EXCLUDED.kepanitiaan, gantt = EXCLUDED.gantt, updated_at = now()
    RETURNING id
  `;
  return { id: baris[0]!.id };
}

/**
 * Rencana milik sebuah proker, atau `null` bila tidak ada (mis. proker BERKALA/
 * RESPONSIF yang tak menyimpan rencana). Dipakai T-070 saat membentuk
 * kepanitiaan; JSONB dikembalikan apa adanya sebagai bentuk tervalidasi saat
 * ditulis.
 */
export async function ambilRencana(
  prokerId: string,
  klien: TxKlien | typeof db = db,
): Promise<RencanaTersimpan | null> {
  const baris = await klien.$queryRaw<
    { id: string; proker_id: string; kepanitiaan: RencanaKepanitiaan; gantt: RencanaGantt }[]
  >`
    SELECT id, proker_id, kepanitiaan, gantt
    FROM proker_rencana
    WHERE proker_id = ${prokerId}::uuid
  `;
  return baris[0] ?? null;
}
