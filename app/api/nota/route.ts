import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_NOTA, buatNota, notaSaya } from '@/lib/nota/service';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Nota yang diunggah pengguna di periode berjalan (status + alasan penolakan). */
export async function GET() {
  const guard = await requirePermission('nota.create');
  if (!guard.ok) return guard.nilai;
  return sukses(await notaSaya(guard.konteks), { headers: TANPA_CACHE });
}

/**
 * Unggah nota (T-101): `{ divisi_id, image_id, tanggal_belanja, total_nota,
 * keterangan, alokasi[] }`. Gambar sudah diunggah lewat /api/images/upload.
 * Alokasi ≠ total → 422 `ALOKASI_TIDAK_SEIMBANG` + `details.selisih` (ADR-007).
 */
export async function POST(request: Request) {
  const guard = await requirePermission('nota.create');
  if (!guard.ok) return guard.nilai;
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) =>
    buatNota(tx, guard.konteks, body),
  );
  return h.ok
    ? sukses(h.nilai, { status: 201, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, {
        status: STATUS_GAGAL_NOTA[h.kode],
        headers: TANPA_CACHE,
        ...(h.details ? { details: h.details } : {}),
      });
}
