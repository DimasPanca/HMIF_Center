import { requirePermission } from '@/lib/auth/guard';
import { gagal, sukses } from '@/lib/http/respond';
import { buatPdfSurat } from '@/lib/surat/pdf-ulang';

import { TANPA_CACHE, idSah, idTidakValid, responsGuard } from '@/app/api/surat/_respons';

/** 50 detik cukup untuk layanan Gotenberg gratis yang baru bangun. */
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const STATUS = { TIDAK_DITEMUKAN: 404, STATUS_TIDAK_SESUAI: 409, PDF_NONAKTIF: 409, GAGAL: 502 } as const;

/** Buat (ulang) PDF dari DOCX surat yang sudah terbit (T-062). */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('surat.read');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const h = await buatPdfSurat(request, guard.konteks, id);
  if (!h.ok) return gagal(h.kode, h.pesan, { status: STATUS[h.kode], headers: TANPA_CACHE });
  return sukses({ ukuran: h.ukuran }, { headers: TANPA_CACHE });
}
