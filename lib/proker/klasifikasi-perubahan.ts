/**
 * klasifikasi-perubahan — memilah suntingan proker terkunci menjadi MINOR atau
 * MAYOR. Modul MURNI, aman di klien DAN server (tak menyentuh database).
 *
 * ===========================================================================
 * KENAPA KLASIFIKASI, DAN KENAPA DI SATU TEMPAT
 * ===========================================================================
 * Proker DISETUJUI sudah mengunci kalender. Menyuntingnya tidak boleh serampangan
 * (PRD §5.2 no.4, USER_FLOW §4.4):
 *
 *   - MINOR  — deskripsi, tujuan, sasaran, estimasi peserta/anggaran, penanggung
 *              jawab, nama, sumber dana, pola: tidak menyentuh kalender, jadi
 *              disimpan langsung dan proker TETAP DISETUJUI.
 *   - MAYOR  — tanggal apa pun, kategori, atau departemen: menggeser (atau
 *              melepas) kunci kalender, jadi WAJIB disetujui ulang Ketua/Wakil.
 *              Statusnya menjadi MENUNGGU_APPROVAL_REVISI dan kunci LAMA
 *              dipertahankan sampai keputusan (INV-13).
 *
 * Aturan minor/mayor hidup DI SATU tempat supaya klien (menampilkan peringatan
 * "perubahan tanggal memerlukan persetujuan ulang") dan server (menentukan
 * transisi status) tidak pernah berbeda (K-04). UI TIDAK boleh menyimpulkan
 * sendiri field mana yang mayor.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-071 · PRD §5.2 no.4 ·
 *         USER_FLOW §4.4, §11.1 · INV-13 · K-04
 */

/**
 * Medan yang menggeser kunci kalender bila berubah. Persis tiga kolom tanggal
 * plus kategori dan departemen — sama dengan yang membentuk `proker_lock.rentang`
 * dan yang menentukan apakah proker mengunci sama sekali.
 */
export const MEDAN_MAYOR = [
  'tanggal_mulai_persiapan',
  'tanggal_hari_h_mulai',
  'tanggal_hari_h_selesai',
  'kategori',
  'departemen_id',
] as const;

/** Medan yang tidak menyentuh kalender — aman disimpan tanpa approval ulang. */
export const MEDAN_MINOR = [
  'nama',
  'deskripsi',
  'tujuan',
  'sasaran',
  'estimasi_peserta',
  'penanggung_jawab',
  'estimasi_anggaran',
  'sumber_dana',
  'pola_ulang',
] as const;

export type JenisPerubahan = 'TIDAK_ADA' | 'MINOR' | 'MAYOR';

export interface HasilKlasifikasi {
  /** MAYOR bila ada satu saja medan mayor berubah; MINOR bila hanya minor; TIDAK_ADA bila tak ada. */
  jenis: JenisPerubahan;
  medanMayor: string[];
  medanMinor: string[];
}

/** Dua nilai dianggap sama bila serialisasinya sama — cukup untuk skalar, array, JSONB. */
function sama(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Perlakukan null dan undefined sebagai "tak diisi" yang setara, supaya
  // mengirim null untuk medan yang memang kosong tidak terhitung perubahan.
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Membandingkan `perubahan` (patch) terhadap `lama` (nilai tersimpan) dan
 * memilah medan yang BENAR-BENAR berbeda menjadi minor/mayor. Hanya medan yang
 * hadir di `perubahan` yang diperiksa; medan yang tak dikirim tidak dihitung
 * berubah. Medan di luar dua daftar (mis. status, id) diabaikan — bukan urusan
 * suntingan pengguna.
 */
export function klasifikasiPerubahan(
  lama: Record<string, unknown>,
  perubahan: Record<string, unknown>,
): HasilKlasifikasi {
  const medanMayor: string[] = [];
  const medanMinor: string[] = [];

  for (const medan of MEDAN_MAYOR) {
    if (medan in perubahan && !sama(perubahan[medan], lama[medan])) medanMayor.push(medan);
  }
  for (const medan of MEDAN_MINOR) {
    if (medan in perubahan && !sama(perubahan[medan], lama[medan])) medanMinor.push(medan);
  }

  const jenis: JenisPerubahan =
    medanMayor.length > 0 ? 'MAYOR' : medanMinor.length > 0 ? 'MINOR' : 'TIDAK_ADA';

  return { jenis, medanMayor, medanMinor };
}

/** Ringkas: apakah patch ini memerlukan persetujuan ulang Ketua/Wakil. */
export function perluApprovalUlang(lama: Record<string, unknown>, perubahan: Record<string, unknown>): boolean {
  return klasifikasiPerubahan(lama, perubahan).jenis === 'MAYOR';
}
