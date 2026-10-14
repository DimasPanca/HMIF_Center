/**
 * nomor — nomor surat: pratinjau di klien, alokasi di database.
 *
 * Nomor final TIDAK PERNAH dirakit di TypeScript (INV-15). Satu-satunya jalan
 * mendapatkannya adalah `alokasi_nomor_surat` / `alokasi_nomor_batch`, yang
 * memegang advisory lock per periode dan menaikkan counter secara atomik.
 * Menghitung "nomor berikutnya" dari MAX() di sini — meski hanya untuk
 * pratinjau — akan memberi pengguna angka yang belum tentu ia dapatkan.
 *
 * Modul ini aman diimpor klien: `TxKlien` dan `Konteks` hanya tipe, dan
 * transaksinya disuntikkan pemanggil (route T-060, di dalam withAuditContext).
 *
 * Sumber: SYSTEM_DESIGN §7 · PRD F-4.1 · ADR-001, ADR-003 · INV-14, INV-15, INV-16
 */

import type { Konteks } from '@/lib/auth/guard';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { bulanRomawi } from '@/lib/utils/romawi';

/** Pengganti nomor urut pada pratinjau — jelas bukan angka, tidak dapat disalah-kira final. */
export const PENANDA_SEMENTARA = '???';

export interface InputPreviewNomor {
  kodeSurat: string;
  kodeKegiatan: string;
  /** YYYY-MM-DD, seperti `surat.tanggal_surat`. */
  tanggalSurat: string;
  /** Dari `app_config.kode_administrasi` lewat `KonfigSurat` — tidak pernah literal (ADR-001). */
  kodeAdministrasi: string;
}

/**
 * Pratinjau bergaya `05/???/UN43.3.7/HMIF/X/2026`.
 *
 * Bulan dan tahun dibaca langsung dari string tanggal, bukan lewat `Date`:
 * `new Date('2026-11-01')` adalah tengah malam UTC, yang di zona waktu negatif
 * jatuh ke Oktober. Bagian yang belum terisi menjadi `?` supaya pratinjau
 * tetap berbentuk enam segmen, sama seperti nomor final.
 */
export function previewNomor(input: InputPreviewNomor): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(input.tanggalSurat.trim());
  const bulan = m ? Number(m[2]) : NaN;
  const romawi = bulan >= 1 && bulan <= 12 ? bulanRomawi(bulan) : '?';
  const tahun = m ? m[1]! : '?';

  return [
    input.kodeSurat.trim() || '?',
    PENANDA_SEMENTARA,
    input.kodeAdministrasi.trim() || '?',
    input.kodeKegiatan.trim().toUpperCase() || '?',
    romawi,
    tahun,
  ].join('/');
}

/** Nomor sementara tidak pernah boleh dikirim atau disimpan sebagai nomor final. */
export function adalahNomorSementara(nomor: string): boolean {
  return nomor.split('/')[1] === PENANDA_SEMENTARA;
}

// ---------------------------------------------------------------------------
// Alokasi — hanya lewat fungsi database
// ---------------------------------------------------------------------------

export type HasilAlokasi =
  | { ok: true; nomor: string }
  | { ok: false; kode: 'TIDAK_DITEMUKAN' | 'STATUS_TIDAK_SESUAI'; pesan: string };

interface BarisSurat {
  id: string;
  periode_id: string;
  status: string;
  nomor_lengkap: string | null;
}

async function bacaSurat(tx: TxKlien, ids: string[]): Promise<BarisSurat[]> {
  return tx.$queryRaw<BarisSurat[]>`
    SELECT id::text, periode_id::text, status::text, nomor_lengkap
    FROM surat WHERE id = ANY(${ids}::uuid[])
  `;
}

/**
 * Menolak lebih awal dengan kode yang dapat dipetakan ke HTTP, alih-alih
 * membiarkan exception plpgsql menjadi 500. Fungsi database tetap memeriksa
 * ulang semuanya — ini lapis pesan, bukan lapis keamanan.
 *
 * Surat periode lain diperlakukan tidak ada (INV-08): koneksi aplikasi dapat
 * melewati RLS, jadi lingkup periode ditegakkan di sini.
 */
function periksa(s: BarisSurat | undefined, konteks: Konteks): HasilAlokasi | null {
  if (!s || s.periode_id !== konteks.periodeId) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Surat tidak ditemukan.' };
  }
  // Idempoten: approval yang di-retry mendapat nomor yang sama, tanpa menaikkan counter.
  if (s.nomor_lengkap) return { ok: true, nomor: s.nomor_lengkap };
  if (s.status !== 'MENUNGGU_APPROVAL') {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: `Surat berstatus ${s.status} — nomor hanya diberikan saat surat disetujui.`,
    };
  }
  return null;
}

/**
 * Mengalokasikan nomor final untuk satu surat dan memindahkannya ke DISETUJUI.
 *
 * Approver selalu pengguna sesi (`konteks.sesi.userId`), tidak pernah dari body
 * request (INV-02). Hak `surat.approve` diperiksa guard route sebelum ini dipanggil.
 */
export async function alokasiNomor(tx: TxKlien, konteks: Konteks, suratId: string): Promise<HasilAlokasi> {
  const [s] = await bacaSurat(tx, [suratId]);
  const ditolak = periksa(s, konteks);
  if (ditolak) return ditolak;

  const r = await tx.$queryRaw<{ nomor: string }[]>`
    SELECT alokasi_nomor_surat(${suratId}::uuid, ${konteks.sesi.userId}::uuid) AS nomor
  `;
  return { ok: true, nomor: r[0]!.nomor };
}

/** Batas yang sama dengan `alokasi_nomor_batch` — lebih dari itu ditolak database. */
export const MAKS_BATCH_NOMOR = 50;

export type HasilAlokasiBatch =
  | { ok: true; nomor: { suratId: string; nomor: string }[] }
  | { ok: false; kode: 'TIDAK_DITEMUKAN' | 'STATUS_TIDAK_SESUAI' | 'BATCH_TERLALU_BESAR'; pesan: string; suratId?: string };

/**
 * Alokasi berurutan untuk banyak surat dalam satu advisory lock — dipakai
 * generate massal Surat Aktif Organisasi (T-064). Semua-atau-tidak: satu surat
 * yang tidak memenuhi syarat menggagalkan batch sebelum counter disentuh.
 */
export async function alokasiNomorBatch(tx: TxKlien, konteks: Konteks, suratIds: string[]): Promise<HasilAlokasiBatch> {
  const unik = [...new Set(suratIds)];
  if (unik.length === 0) return { ok: true, nomor: [] };
  if (unik.length > MAKS_BATCH_NOMOR) {
    return {
      ok: false,
      kode: 'BATCH_TERLALU_BESAR',
      pesan: `Paling banyak ${MAKS_BATCH_NOMOR} surat per batch — pecah menjadi beberapa batch.`,
    };
  }

  const baris = new Map((await bacaSurat(tx, unik)).map((s) => [s.id, s]));
  for (const id of unik) {
    const ditolak = periksa(baris.get(id), konteks);
    if (ditolak && !ditolak.ok) return { ...ditolak, suratId: id };
  }

  const r = await tx.$queryRaw<{ surat_id: string; nomor: string }[]>`
    SELECT surat_id::text, nomor FROM alokasi_nomor_batch(${unik}::uuid[], ${konteks.sesi.userId}::uuid)
  `;
  return { ok: true, nomor: r.map((x) => ({ suratId: x.surat_id, nomor: x.nomor })) };
}
