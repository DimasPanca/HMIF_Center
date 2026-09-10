/**
 * edit-terkunci — menyunting proker yang sudah DISETUJUI (mengunci kalender).
 * SERVER-ONLY.
 *
 * ===========================================================================
 * MINOR DISIMPAN, MAYOR MINTA APPROVAL ULANG (USER_FLOW §4.4, INV-13)
 * ===========================================================================
 * `klasifikasiPerubahan` memilah patch. Suntingan MINOR (deskripsi, anggaran,
 * dst.) disimpan langsung lewat `ubahProker`; proker TETAP DISETUJUI dan kuncinya
 * tak tersentuh. Suntingan MAYOR (tanggal/kategori/departemen) menyimpan nilai
 * BARU ke baris proker, mengubah status ke MENUNGGU_APPROVAL_REVISI, tetapi
 * SENGAJA TIDAK MENYENTUH `proker_lock` — kunci LAMA dipertahankan sampai revisi
 * diputuskan (kontrak T-071 "Jangan": jangan lepas kunci saat pengajuan). Nilai
 * lama di-snapshot ke `proker_revisi` supaya penolakan revisi dapat memulihkannya
 * (lihat lib/proker/approval.ts tolakRevisi).
 *
 * Berlaku hanya untuk status DISETUJUI. Proker DRAFT/PERLU_REVISI disunting lewat
 * `ubahProker` biasa (belum mengunci apa pun); route yang memilih jalurnya.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-071 · USER_FLOW §4.4, §11.1 ·
 *         docs/ai/EDIT_TERKUNCI_CONTRACT.md · migrasi 023 · INV-13
 */

import type { Prisma } from '@prisma/client';

import type { TxKlien } from '@/lib/db/with-audit-context';
import type { Konteks } from '@/lib/auth/guard';

import { detailProker, dalamLingkup, ubahProker } from './service';
import type { ProkerStatus } from './status';
import { klasifikasiPerubahan, type JenisPerubahan } from './klasifikasi-perubahan';

export type KodeGagalEdit =
  | 'TIDAK_DITEMUKAN'
  | 'STATUS_TIDAK_SESUAI'
  | 'DI_LUAR_LINGKUP'
  | 'TIDAK_VALID'
  | 'TIDAK_ADA_PERIODE_AKTIF';

export interface GagalEdit {
  ok: false;
  kode: KodeGagalEdit;
  pesan: string;
  isu?: { path: string; pesan: string }[];
}

export interface EditTersimpan {
  status: ProkerStatus;
  /** MAYOR memicu approval ulang; MINOR & TIDAK_ADA tetap DISETUJUI. */
  jenis: JenisPerubahan;
}

export type HasilEdit = { ok: true; nilai: EditTersimpan } | GagalEdit;

export const STATUS_GAGAL: Record<KodeGagalEdit, number> = {
  TIDAK_DITEMUKAN: 404,
  STATUS_TIDAK_SESUAI: 409,
  DI_LUAR_LINGKUP: 403,
  TIDAK_VALID: 422,
  TIDAK_ADA_PERIODE_AKTIF: 409,
};

/**
 * Menyunting proker DISETUJUI. `perubahan` adalah patch berisi medan yang
 * diubah saja (bentuknya sama dengan `InputProker`, seluruhnya opsional).
 */
export async function editProkerTerkunci(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  perubahan: Record<string, unknown>,
): Promise<HasilEdit> {
  const lama = await detailProker(id, tx);
  if (!lama) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Proker tidak ditemukan.' };
  }
  // Pembatasan periode ditegakkan di service, bukan RLS (koneksi app bisa
  // melewati RLS) — konsisten dengan approval.ts.
  if (lama.periode_id !== konteks.periodeId) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Proker tidak ditemukan.' };
  }
  if (!dalamLingkup(konteks, 'proker.update', lama.departemen_id)) {
    return { ok: false, kode: 'DI_LUAR_LINGKUP', pesan: 'Proker ini bukan milik departemen Anda.' };
  }
  if (lama.status !== 'DISETUJUI') {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: `Hanya proker DISETUJUI yang disunting lewat jalur ini (status: ${lama.status}).`,
    };
  }

  // Bandingkan dengan tipe yang selaras: estimasi_anggaran dibaca sebagai teks
  // oleh detailProker, sedangkan patch mengirim angka.
  const lamaBanding: Record<string, unknown> = {
    ...(lama as unknown as Record<string, unknown>),
    estimasi_anggaran: lama.estimasi_anggaran === null ? null : Number(lama.estimasi_anggaran),
  };
  const kelas = klasifikasiPerubahan(lamaBanding, perubahan);

  if (kelas.jenis === 'TIDAK_ADA') {
    return { ok: true, nilai: { status: 'DISETUJUI', jenis: 'TIDAK_ADA' } };
  }

  // Terapkan & validasi lewat ubahProker (menggabung dengan baris tersimpan,
  // memvalidasi SkemaProker, lalu UPDATE — status tak diubahnya). Bila tak valid,
  // tak ada yang tersentuh (snapshot pun belum dibuat).
  const r = await ubahProker(tx, konteks, id, perubahan);
  if (!r.ok) return { ok: false, kode: r.kode, pesan: r.pesan, isu: r.isu };

  if (kelas.jenis === 'MINOR') {
    // Tetap DISETUJUI; kunci kalender tak tersentuh.
    return { ok: true, nilai: { status: 'DISETUJUI', jenis: 'MINOR' } };
  }

  // MAYOR: snapshot nilai LAMA (dari `lama`, sebelum ubahProker menimpanya di
  // baris) untuk revert bila revisi ditolak, lalu pindah ke antrian revisi.
  await tx.$executeRaw`
    INSERT INTO proker_revisi (
      proker_id, tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
      kategori, departemen_id, pola_ulang
    ) VALUES (
      ${id}::uuid,
      ${lama.tanggal_mulai_persiapan}::date,
      ${lama.tanggal_hari_h_mulai}::date,
      ${lama.tanggal_hari_h_selesai}::date,
      ${lama.kategori}::proker_kategori,
      ${lama.departemen_id}::uuid,
      ${(lama.pola_ulang ?? null) as Prisma.InputJsonValue | null}::jsonb
    )
    ON CONFLICT (proker_id) DO UPDATE SET
      tanggal_mulai_persiapan = EXCLUDED.tanggal_mulai_persiapan,
      tanggal_hari_h_mulai    = EXCLUDED.tanggal_hari_h_mulai,
      tanggal_hari_h_selesai  = EXCLUDED.tanggal_hari_h_selesai,
      kategori                = EXCLUDED.kategori,
      departemen_id           = EXCLUDED.departemen_id,
      pola_ulang              = EXCLUDED.pola_ulang
  `;

  // Kunci LAMA (proker_lock) TIDAK disentuh — itu inti INV-13.
  await tx.$executeRaw`
    UPDATE proker
    SET status = 'MENUNGGU_APPROVAL_REVISI', diajukan_at = now(), updated_at = now()
    WHERE id = ${id}::uuid
  `;

  return { ok: true, nilai: { status: 'MENUNGGU_APPROVAL_REVISI', jenis: 'MAYOR' } };
}
