/**
 * bentuk-otomatis — membentuk kepanitiaan sungguhan dari rencana saat approval.
 * SERVER-ONLY.
 *
 * ===========================================================================
 * PEMBUNGKUS FUNGSI SECURITY DEFINER, BUKAN LOGIKA DI TS
 * ===========================================================================
 * Pembentukan menulis ke rab_meta/divisi/gantt yang policy tulisnya berbasis
 * keanggotaan (my_kepanitiaan). Approver (Ketua/Wakil) belum menjadi anggota
 * kepanitiaan yang baru lahir, jadi RLS akan menolak sebagian INSERT-nya. Karena
 * itu seluruh pembentukan hidup di fungsi SECURITY DEFINER `bentuk_kepanitiaan`
 * (migrasi 022), seperti `setujui_proker` untuk kunci kalender. Berkas ini hanya
 * memanggilnya di dalam transaksi approval — memindahkan logikanya ke TS berarti
 * menjalankannya di bawah RLS approver dan gagal di rab_meta.
 *
 * Membaca proker_rencana (hasil submit T-069) dan menghapusnya setelah
 * materialisasi. Hanya berlaku untuk TERJADWAL; kategori lain mengembalikan
 * `dibentuk:false`. Idempoten: bila kepanitiaan proker sudah ada, tak membentuk
 * dua.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-070 · migrasi 022 ·
 *         docs/ai/APPROVAL_CONTRACT.md · K-09
 */

import type { TxKlien } from '@/lib/db/with-audit-context';

if (typeof window !== 'undefined') {
  throw new Error('lib/kepanitiaan/bentuk-otomatis.ts adalah modul server-only.');
}

export interface HasilBentuk {
  ok: boolean;
  /** false untuk non-TERJADWAL atau kepanitiaan yang sudah ada. */
  dibentuk: boolean;
  alasan?: 'BUKAN_TERJADWAL' | 'SUDAH_ADA';
  kepanitiaan_id?: string;
}

/**
 * Membentuk kepanitiaan+divisi+member+rab_meta+job_desk+gantt dari
 * proker_rencana. Dipanggil dalam transaksi approval, SETELAH setujui_proker
 * berhasil, sehingga kepanitiaan dan kunci kalender lahir/gagal bersama.
 *
 * `approverId` = konteks.sesi.userId; dipakai sebagai job_desk.updated_by dan
 * dicatat audit. Melempar bila proker/rencana tidak ada (kesalahan pemanggilan,
 * bukan keadaan normal).
 */
export async function bentukKepanitiaanOtomatis(
  tx: TxKlien,
  prokerId: string,
  approverId: string,
): Promise<HasilBentuk> {
  const baris = await tx.$queryRaw<{ hasil: HasilBentuk }[]>`
    SELECT bentuk_kepanitiaan(${prokerId}::uuid, ${approverId}::uuid) AS hasil
  `;
  return baris[0]!.hasil;
}
