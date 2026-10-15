import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { nonaktifkanRuangan, ubahRuangan } from '@/lib/ruangan/service';

import { idSah, idTidakValid, responsRuangan } from '../_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('ruangan.update');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const body = await request.json().catch(() => null);
  return responsRuangan(await withAuditContext(request, guard.konteks, (tx) => ubahRuangan(tx, id, body)));
}

/** Menonaktifkan ruangan; riwayat booking-nya tetap utuh. */
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('ruangan.delete');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsRuangan(await withAuditContext(request, guard.konteks, (tx) => nonaktifkanRuangan(tx, id)));
}
