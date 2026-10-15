/**
 * pdf-ulang — membuat PDF untuk surat yang SUDAH terbit (T-062). Server-only.
 *
 * PDF dibuat saat terbit bila diminta; kalau konverter sedang tidak tersedia
 * (layanan Gotenberg gratis yang "tidur" butuh ±1 menit untuk bangun) surat
 * tetap terbit sebagai DOCX dengan peringatan. Tanpa jalur ini PDF-nya tak
 * pernah dapat dibuat lagi. PDF dibuat dari DOCX yang SUDAH tersimpan — isinya
 * identik dengan dokumen terbit, bukan hasil generate ulang.
 *
 * Boleh untuk surat TERBIT apa pun format pilihannya: pemilik produk ingin
 * setiap surat dapat diperoleh sebagai PDF (2026-10-15).
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-062 · ADR-010
 */

import type { Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { GalatPdf, PdfTidakTersedia, docxToPdf } from '@/lib/documents/pdf-converter';
import { keys, storage } from '@/lib/storage';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/pdf-ulang.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type HasilPdfUlang =
  | { ok: true; ukuran: number }
  | { ok: false; kode: 'TIDAK_DITEMUKAN' | 'STATUS_TIDAK_SESUAI' | 'PDF_NONAKTIF' | 'GAGAL'; pesan: string };

export async function buatPdfSurat(request: Request, konteks: Konteks, suratId: string): Promise<HasilPdfUlang> {
  const s = await db.surat.findUnique({
    where: { id: suratId },
    select: { status: true, periode_id: true, dibuat_oleh: true, dokumen: { where: { jenis: 'SURAT', format: 'DOCX' }, select: { storage_key: true } } },
  });
  // Pembuat surat atau approver; periode berjalan saja (arsip lama baca saja, INV-08).
  const boleh = s && s.periode_id === konteks.periodeId && (s.dibuat_oleh === konteks.sesi.userId || can(konteks.roles, 'surat.approve'));
  if (!s || !boleh) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Surat tidak ditemukan.' };
  if (s.status !== 'TERBIT') return { ok: false, kode: 'STATUS_TIDAK_SESUAI', pesan: 'PDF hanya dapat dibuat untuk surat yang sudah terbit.' };
  const docx = s.dokumen[0];
  if (!docx) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Dokumen DOCX surat ini tidak ditemukan.' };

  let pdf: Buffer;
  try {
    pdf = (await docxToPdf(await storage.get(docx.storage_key))).pdf;
  } catch (e) {
    if (e instanceof PdfTidakTersedia) return { ok: false, kode: 'PDF_NONAKTIF', pesan: e.message };
    console.error(`[pdf-ulang] surat ${suratId}`, e);
    const sebab = e instanceof GalatPdf ? e.message : 'Konversi PDF gagal.';
    return { ok: false, kode: 'GAGAL', pesan: `${sebab} Coba lagi sebentar lagi — layanan PDF mungkin sedang bangun.` };
  }

  const key = keys.suratPdf(suratId);
  await storage.put(key, pdf, 'application/pdf', { upsert: true });
  try {
    await withAuditContext(request, konteks, async (tx) => {
      await tx.dokumen.deleteMany({ where: { surat_id: suratId, jenis: 'SURAT', format: 'PDF' } });
      await tx.dokumen.create({
        data: { surat_id: suratId, jenis: 'SURAT', format: 'PDF', storage_key: key, file_size: BigInt(pdf.length), generated_by: konteks.sesi.userId },
      });
    });
  } catch (e) {
    console.error(`[pdf-ulang] surat ${suratId}: gagal mencatat`, e);
    await storage.delete(key).catch(() => undefined);
    return { ok: false, kode: 'GAGAL', pesan: 'PDF gagal dicatat. Coba lagi.' };
  }
  return { ok: true, ukuran: pdf.length };
}
