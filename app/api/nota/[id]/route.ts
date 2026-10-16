import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_NOTA, perbaikiNota } from '@/lib/nota/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Pengunggah memperbaiki nota (DITOLAK / PERLU_PERBAIKAN / menunggu) → kembali MENUNGGU_VERIFIKASI. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('nota.create');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) =>
    perbaikiNota(tx, guard.konteks, id, body),
  );
  return h.ok
    ? sukses(h.nilai, { headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, {
        status: STATUS_GAGAL_NOTA[h.kode],
        headers: TANPA_CACHE,
        ...(h.details ? { details: h.details } : {}),
      });
}
