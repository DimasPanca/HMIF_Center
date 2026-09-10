/**
 * approval — keputusan Ketua/Wakil atas proker yang menunggu: setujui, tolak,
 * minta revisi, serta antrian yang mereka lihat. SERVER-ONLY.
 *
 * ===========================================================================
 * SATU TRANSAKSI: KUNCI + KEPANITIAAN LAHIR BERSAMA
 * ===========================================================================
 * `setujuiProker` memanggil dua fungsi SECURITY DEFINER dalam SATU transaksi
 * (K-09): `setujui_proker` (menegakkan anti-bentrok & mengunci kalender, INV-09)
 * lalu — hanya untuk TERJADWAL yang lolos — `bentuk_kepanitiaan` (membentuk
 * kepanitiaan dari proker_rencana). Bila salah satu gagal, keduanya urung; tak
 * pernah ada kepanitiaan yatim atau kunci tanpa kepanitiaan (kontrak T-070).
 *
 * Bila `setujui_proker` menemukan bentrok, ia mengembalikan daftar konflik dan
 * memindahkan proker ke PERLU_REVISI sendiri — kita meneruskan daftar itu ke
 * pemanggil (untuk panel konflik inline) dan TIDAK membentuk kepanitiaan.
 *
 * Tolak & minta-revisi hanya meng-UPDATE status proker; itu diizinkan RLS bagi
 * Ketua/Wakil (kelola_dept org-wide), jadi tak perlu SECURITY DEFINER.
 *
 * Route handler (lane ui) tinggal: guard `proker.approve` → withAuditContext →
 * fungsi di sini → sukses()/gagal(). Antrian hanya untuk Ketua & Wakil (INV-05);
 * BPH tak melihatnya karena tak memiliki `proker.approve` (INV-04) — ditegakkan
 * guard route, bukan di sini.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-070 · PRD F-5.4 · USER_FLOW §4.3 ·
 *         docs/ai/APPROVAL_CONTRACT.md · INV-04, INV-05, INV-09
 */

import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import type { Konteks } from '@/lib/auth/guard';

import { detailProker } from './service';
import { STATUS_MENUNGGU, bolehTransisi, type ProkerKategori, type ProkerStatus } from './status';
import { bentukKepanitiaanOtomatis } from '@/lib/kepanitiaan/bentuk-otomatis';

// ---------------------------------------------------------------------------
// Bentuk data
// ---------------------------------------------------------------------------

/** Satu proker di antrian approval Ketua/Wakil. */
export interface RingkasApproval {
  id: string;
  nama: string;
  kategori: ProkerKategori;
  status: ProkerStatus;
  departemen_id: string;
  nama_departemen: string;
  tanggal_mulai_persiapan: string | null;
  tanggal_hari_h_mulai: string | null;
  tanggal_hari_h_selesai: string | null;
  diajukan_at: string | null;
}

/** Satu proker yang membentrok, dari `setujui_proker` (INV-09). */
export interface KonflikApproval {
  proker: string;
  departemen: string;
  mulai: string;
  selesai: string;
}

export type KodeGagalApproval =
  | 'TIDAK_DITEMUKAN'
  | 'STATUS_TIDAK_SESUAI'
  | 'WAJIB_ALASAN'
  | 'KONFLIK';

export interface GagalApproval {
  ok: false;
  kode: KodeGagalApproval;
  pesan: string;
  /** Terisi untuk `KONFLIK`: daftar proker yang menghalangi. */
  konflik?: KonflikApproval[];
}

export type HasilApproval<T> = { ok: true; nilai: T } | GagalApproval;

export const STATUS_GAGAL: Record<KodeGagalApproval, number> = {
  TIDAK_DITEMUKAN: 404,
  STATUS_TIDAK_SESUAI: 409,
  WAJIB_ALASAN: 422,
  KONFLIK: 409,
};

// ---------------------------------------------------------------------------
// Antrian
// ---------------------------------------------------------------------------

/**
 * Proker yang menunggu keputusan pada periode aktif, terlama dahulu. BERKALA tak
 * pernah muncul (ia DISETUJUI langsung saat submit, tak pernah MENUNGGU).
 */
export async function daftarApproval(
  konteks: Konteks,
  klien: TxKlien | typeof db = db,
): Promise<RingkasApproval[]> {
  if (!konteks.periodeId) return [];
  return klien.$queryRaw<RingkasApproval[]>`
    SELECT
      p.id, p.nama, p.kategori, p.status,
      p.departemen_id, d.nama AS nama_departemen,
      to_char(p.tanggal_mulai_persiapan, 'YYYY-MM-DD') AS tanggal_mulai_persiapan,
      to_char(p.tanggal_hari_h_mulai,    'YYYY-MM-DD') AS tanggal_hari_h_mulai,
      to_char(p.tanggal_hari_h_selesai,  'YYYY-MM-DD') AS tanggal_hari_h_selesai,
      to_char(p.diajukan_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS diajukan_at
    FROM proker p
    JOIN departemen d ON d.id = p.departemen_id
    WHERE p.periode_id = ${konteks.periodeId}::uuid
      AND p.status = ANY(${[...STATUS_MENUNGGU]}::proker_status[])
    ORDER BY p.diajukan_at ASC NULLS LAST
  `;
}

// ---------------------------------------------------------------------------
// Keputusan
// ---------------------------------------------------------------------------

interface HasilSetuju {
  status: 'DISETUJUI';
  locked: boolean;
  kepanitiaan_id?: string;
}

/**
 * Menyetujui proker. Untuk TERJADWAL: mengunci kalender lalu membentuk
 * kepanitiaan; bila bentrok, mengembalikan `KONFLIK` (proker menjadi
 * PERLU_REVISI) tanpa membentuk apa pun.
 */
export async function setujuiProker(
  tx: TxKlien,
  konteks: Konteks,
  prokerId: string,
): Promise<HasilApproval<HasilSetuju>> {
  const proker = await detailProker(prokerId, tx);
  if (!proker) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Proker tidak ditemukan.' };
  }
  if (!STATUS_MENUNGGU.includes(proker.status)) {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: `Proker berstatus ${proker.status} — hanya yang menunggu approval dapat disetujui.`,
    };
  }

  // setujui_proker menegakkan anti-bentrok DAN transisi status (INV-09).
  const r = await tx.$queryRaw<
    { hasil: { ok: boolean; locked?: boolean; reason?: string; konflik?: KonflikApproval[] } }[]
  >`
    SELECT setujui_proker(${prokerId}::uuid, ${konteks.sesi.userId}::uuid) AS hasil
  `;
  const hasil = r[0]!.hasil;

  if (!hasil.ok) {
    // Bentrok: proker sudah dipindah ke PERLU_REVISI oleh setujui_proker.
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'Tanggal proker bentrok dengan proker terjadwal lain.',
      konflik: hasil.konflik ?? [],
    };
  }

  // TERJADWAL yang lolos: bentuk kepanitiaan dari rencana, transaksi yang sama.
  let kepanitiaanId: string | undefined;
  if (proker.kategori === 'TERJADWAL') {
    const b = await bentukKepanitiaanOtomatis(tx, prokerId, konteks.sesi.userId);
    kepanitiaanId = b.kepanitiaan_id;
  }

  return {
    ok: true,
    nilai: { status: 'DISETUJUI', locked: Boolean(hasil.locked), kepanitiaan_id: kepanitiaanId },
  };
}

/** Menolak proker. Alasan wajib (PRD F-5.4) dan ikut tercatat audit. */
export async function tolakProker(
  tx: TxKlien,
  prokerId: string,
  alasan: string,
): Promise<HasilApproval<{ status: 'DITOLAK' }>> {
  return ubahKeputusan(tx, prokerId, 'DITOLAK', alasan, 'Alasan penolakan wajib diisi.');
}

/** Meminta revisi. Catatan wajib; proker kembali ke pengusul (PERLU_REVISI). */
export async function mintaRevisi(
  tx: TxKlien,
  prokerId: string,
  catatan: string,
): Promise<HasilApproval<{ status: 'PERLU_REVISI' }>> {
  return ubahKeputusan(tx, prokerId, 'PERLU_REVISI', catatan, 'Catatan revisi wajib diisi.');
}

/**
 * Inti tolak & minta-revisi: keduanya hanya memindahkan status dan menyimpan
 * alasan pada `alasan_penolakan` (satu kolom untuk "kenapa tidak disetujui").
 * Transisinya divalidasi terhadap TRANSISI (status.ts) — bukan UPDATE buta.
 */
async function ubahKeputusan<S extends 'DITOLAK' | 'PERLU_REVISI'>(
  tx: TxKlien,
  prokerId: string,
  ke: S,
  alasan: string,
  pesanWajib: string,
): Promise<HasilApproval<{ status: S }>> {
  if (!alasan || !alasan.trim()) {
    return { ok: false, kode: 'WAJIB_ALASAN', pesan: pesanWajib };
  }

  const proker = await detailProker(prokerId, tx);
  if (!proker) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Proker tidak ditemukan.' };
  }
  if (!STATUS_MENUNGGU.includes(proker.status) || !bolehTransisi(proker.status, ke)) {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: `Proker berstatus ${proker.status} tidak dapat dipindah ke ${ke}.`,
    };
  }

  await tx.$executeRaw`
    UPDATE proker
    SET status = ${ke}::proker_status, alasan_penolakan = ${alasan.trim()}, updated_at = now()
    WHERE id = ${prokerId}::uuid
  `;

  return { ok: true, nilai: { status: ke } };
}
