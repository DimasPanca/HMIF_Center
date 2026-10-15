import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { detailKendala, hapusKendala, ubahKendala } from '@/lib/kendala/service';

import { TANPA_CACHE, idSah, idTidakValid, responsKendala, tidakAda, type RouteId } from '../_respons';

export async function GET(_request: Request, context: RouteId) {
  const guard = await requirePermission('kendala.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const d = await detailKendala(guard.konteks, id);
  return d ? sukses(d, { headers: TANPA_CACHE }) : tidakAda();
}

/** Ubah status/prioritas/assignee; SELESAI wajib catatan penyelesaian. */
export async function PATCH(request: Request, context: RouteId) {
  const guard = await requirePermission('kendala.update');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const body = await request.json().catch(() => null);
  return responsKendala(await withAuditContext(request, guard.konteks, (tx) => ubahKendala(tx, guard.konteks, id, body)));
}

export async function DELETE(request: Request, context: RouteId) {
  const guard = await requirePermission('kendala.delete');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsKendala(await withAuditContext(request, guard.konteks, (tx) => hapusKendala(tx, guard.konteks, id)));
}
