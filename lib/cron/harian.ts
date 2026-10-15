/**
 * harian — orkestrator cron harian: satu titik yang menjalankan langkah-langkah
 * lifecycle harian dan mencatat ringkasannya ke audit. SERVER-ONLY.
 *
 * ===========================================================================
 * SATU ENDPOINT, SATU TRANSAKSI (ADR-009)
 * ===========================================================================
 * Vercel Hobby membatasi jumlah cron, jadi HANYA ADA SATU: `/api/cron/harian`.
 * Route (lane ui) memverifikasi rahasia lalu memanggil `jalankanCronHarian`
 * lewat `withServiceContext` (tanpa pengguna; audit tercatat sebagai 'sistem').
 * Fungsi ini yang bercabang, bukan tiga cron terpisah:
 *   - Setiap hari: lepas_kunci_selesai() + hitung ulang urgensi deadline.
 *   - Tanggal 1: `tanggal_1` = true supaya backup bulanan dapat menyusul
 *     (diaktifkan T-111) — backup-nya sendiri BELUM dijalankan di sini.
 *
 * IDEMPOTEN: `lepasKunciSelesai` dijaga status, `cekDeadline` read-only. Dua kali
 * jalan sehari tidak menggandakan transisi. Baris audit memang bertambah tiap
 * jalan — itu catatan, bukan mutasi state; menahannya justru menyembunyikan
 * bahwa cron berjalan.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-079 · SYSTEM_DESIGN §15.2, §6.5 ·
 *         ADR-009 · docs/ai/CRON_CONTRACT.md
 */

import type { Prisma } from '@prisma/client';

import type { TxKlien } from '@/lib/db/with-audit-context';

import { lepasKunciSelesai, type HasilLepasKunci } from './lepas-kunci';
import { cekDeadline, type HasilCekDeadline } from './cek-deadline';

export interface RingkasanCron {
  tanggal: string;
  /** true pada tanggal 1 — penanda agar backup bulanan menyusul (T-111). */
  tanggal_1: boolean;
  lepas: HasilLepasKunci;
  deadline: HasilCekDeadline;
}

/**
 * Menjalankan lifecycle harian dan mencatat ringkasannya ke `audit_log` (aksi
 * `CRON`). `tx` dari `withServiceContext` — audit_context-nya sudah 'sistem'.
 */
export async function jalankanCronHarian(tx: TxKlien): Promise<RingkasanCron> {
  const lepas = await lepasKunciSelesai(tx);
  const deadline = await cekDeadline(tx);

  const meta = await tx.$queryRaw<{ tanggal: string; tanggal_1: boolean }[]>`
    SELECT to_char(hari_ini_jakarta(), 'YYYY-MM-DD') AS tanggal,
           (EXTRACT(DAY FROM hari_ini_jakarta()) = 1) AS tanggal_1
  `;
  const { tanggal, tanggal_1 } = meta[0]!;
  const ringkasan: RingkasanCron = { tanggal, tanggal_1, lepas, deadline };

  // Ringkasan setiap eksekusi masuk audit (kontrak §4): jumlah proker yang
  // berubah status ada di `lepas`. periode_aktif() menautkannya ke periode.
  await tx.$executeRaw`
    INSERT INTO audit_log (aksi, entitas, entitas_id, nilai_baru, user_agent, periode_id)
    VALUES ('CRON', 'proker', NULL, ${ringkasan as unknown as Prisma.InputJsonValue}::jsonb, 'sistem', periode_aktif())
  `;

  return ringkasan;
}

/**
 * Apakah request cron sah — header `Authorization: Bearer ${CRON_SECRET}` cocok.
 *
 * Rahasia dibaca saat dipanggil (bukan saat modul dimuat) supaya tak membekukan
 * nilai lama. Bila `CRON_SECRET` tak diset, SELALU tolak — endpoint cron yang
 * terbuka tanpa rahasia lebih berbahaya daripada cron yang tak jalan.
 */
export function cronTerotorisasi(authHeader: string | null | undefined): boolean {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) return false;
  return authHeader === `Bearer ${rahasia}`;
}
