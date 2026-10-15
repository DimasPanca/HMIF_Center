import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { hapusBooking } from '@/lib/ruangan/service';

import { idSah, idTidakValid, responsRuangan } from '@/app/api/ruangan/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('ruangan.delete');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsRuangan(await withAuditContext(request, guard.konteks, (tx) => hapusBooking(tx, guard.konteks, id)));
}
