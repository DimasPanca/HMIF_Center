import { requirePermission } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { gagal } from '@/lib/http/respond';
import { storage } from '@/lib/storage';
import { bacaKonfigPdf } from '@/lib/documents/pdf-converter';
import { MIME_UNDUH, dokumenSuratUntuk, formatDariQuery } from '@/lib/surat/unduh';

import { TANPA_CACHE, idSah, idTidakValid, responsGuard } from '@/app/api/surat/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const STATUS_GAGAL = { TIDAK_DITEMUKAN: 404, BELUM_TERBIT: 409, PDF_NONAKTIF: 409 } as const;

/**
 * Unduh dokumen surat yang sudah terbit (T-061; `?format=pdf` T-062). Berkasnya
 * dibaca dari bucket privat di server dan dialirkan langsung — tidak ada signed
 * URL yang dapat diteruskan ke orang lain. Nama berkas = nomor surat dengan "/"
 * menjadi "-". PDF saat PDF_ENABLED=false ditolak 409, bukan diganti DOCX.
 */
export async function GET(request: Request, context: RouteContext) {
  // Pemohon SK Aktif (ADR-036) mengunduh suratnya sendiri walau tidak berhak membaca arsip.
  const baca = await requirePermission('surat.read');
  const guard = baca.ok ? baca : await requirePermission('surat.ajukan_aktif');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  if (!baca.ok) {
    const milik = await db.surat.findUnique({ where: { id }, select: { dibuat_oleh: true, kode_surat: true } });
    if (!milik || milik.dibuat_oleh !== guard.konteks.sesi.userId || milik.kode_surat !== '02') {
      return gagal('TIDAK_DITEMUKAN', 'Dokumen surat tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
    }
  }

  const format = formatDariQuery(new URL(request.url).searchParams.get('format'));
  const pdfAktif = bacaKonfigPdf().aktif;
  const d = await dokumenSuratUntuk(guard.konteks, id, format, pdfAktif);
  if (!d.ok) return gagal(d.kode, d.pesan, { status: STATUS_GAGAL[d.kode], headers: TANPA_CACHE });

  let isi: Buffer;
  try {
    isi = await storage.get(d.key);
  } catch (e) {
    console.error(`[unduh] surat ${id}: berkas ${d.key} tidak dapat dibaca`, e);
    return gagal('TIDAK_DITEMUKAN', 'Berkas dokumen tidak ditemukan di penyimpanan.', { status: 404, headers: TANPA_CACHE });
  }

  return new Response(new Uint8Array(isi), {
    status: 200,
    headers: {
      ...TANPA_CACHE,
      'Content-Type': MIME_UNDUH[d.format],
      'Content-Length': String(isi.length),
      'Content-Disposition': `attachment; filename="${d.namaBerkas}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
