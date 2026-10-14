/**
 * unduh — siapa boleh mengunduh dokumen surat, dan berkas mana. Server-only.
 *
 * Aturannya mengikuti baris `surat_arsip` matriks PRD (permission `surat.read`):
 * pemegang lingkup penuh boleh mengunduh surat mana pun, termasuk arsip periode
 * lain (INV-08: lintas periode hanya baca); pemegang lingkup DEPARTEMEN (Kadept)
 * hanya surat departemennya sendiri atau yang ia buat. Surat yang tidak boleh
 * dilihat dijawab sama dengan surat yang tidak ada — keberadaannya pun tidak
 * dibocorkan.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-061 · PRD §5.1 · INV-08
 */

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/unduh.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

/** Status yang punya dokumen: dokumen surat yang dibatalkan tetap diarsipkan. */
const STATUS_BERDOKUMEN = ['TERBIT', 'DIBATALKAN'];

/** `05/001/UN43.3.7/HMIF/X/2025` → `05-001-UN43.3.7-HMIF-X-2025.docx`. */
export function namaBerkasSurat(nomorLengkap: string, ekstensi: string = 'docx'): string {
  const aman = nomorLengkap
    .replace(/[/\\]/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^[.-]+/, '');
  return `${aman || 'surat'}.${ekstensi}`;
}

export type FormatUnduh = 'DOCX' | 'PDF';

export const MIME_UNDUH: Record<FormatUnduh, string> = {
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  PDF: 'application/pdf',
};

export type HasilUnduh =
  | { ok: true; key: string; namaBerkas: string; format: FormatUnduh }
  | { ok: false; kode: 'TIDAK_DITEMUKAN' | 'BELUM_TERBIT' | 'PDF_NONAKTIF'; pesan: string };

/** `?format=` → format berkas; selain "pdf" berarti DOCX. */
export function formatDariQuery(nilai: string | null): FormatUnduh {
  return nilai?.toLowerCase() === 'pdf' ? 'PDF' : 'DOCX';
}

export async function dokumenSuratUntuk(
  konteks: Konteks,
  suratId: string,
  format: FormatUnduh = 'DOCX',
  pdfAktif = false,
): Promise<HasilUnduh> {
  const tidakAda = { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Dokumen surat tidak ditemukan.' } as const;
  // Ditolak terang-terangan, bukan diam-diam diganti DOCX (ADR-010).
  if (format === 'PDF' && !pdfAktif) {
    return { ok: false, kode: 'PDF_NONAKTIF', pesan: 'Format PDF belum tersedia. Unduh dokumen DOCX.' };
  }

  const s = await db.surat.findUnique({
    where: { id: suratId },
    select: { status: true, nomor_lengkap: true, departemen_id: true, dibuat_oleh: true },
  });
  if (!s) return tidakAda;

  if (lingkupKonteks(konteks, 'surat.read') === 'DEPARTEMEN') {
    const milikDepartemen = s.departemen_id !== null && konteks.departemenIds.includes(s.departemen_id);
    if (!milikDepartemen && s.dibuat_oleh !== konteks.sesi.userId) return tidakAda;
  }

  if (!STATUS_BERDOKUMEN.includes(s.status) || !s.nomor_lengkap) {
    // Draft orang lain bukan arsip: tidak ada, bukan "belum terbit".
    const diAntrian = s.status === 'MENUNGGU_APPROVAL' || s.status === 'DISETUJUI';
    if (!diAntrian && s.dibuat_oleh !== konteks.sesi.userId) return tidakAda;
    return { ok: false, kode: 'BELUM_TERBIT', pesan: 'Surat ini belum terbit, jadi belum punya dokumen.' };
  }

  const d = await db.dokumen.findFirst({
    where: { surat_id: suratId, jenis: 'SURAT', format },
    orderBy: { created_at: 'desc' },
    select: { storage_key: true },
  });
  if (!d) return tidakAda;
  return { ok: true, key: d.storage_key, namaBerkas: namaBerkasSurat(s.nomor_lengkap, format.toLowerCase()), format };
}
