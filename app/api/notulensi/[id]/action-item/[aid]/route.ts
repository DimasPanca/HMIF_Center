import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { hapusActionItem } from '@/lib/notulensi/service';

import { idSah, idTidakValid, responsGuard, responsNotulensi } from '@/app/api/notulensi/_respons';

interface RouteContext {
  params: Promise<{ id: string; aid: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('notulensi.update');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id, aid } = await context.params;
  if (!idSah(id, aid)) return idTidakValid();

  const hasil = await withAuditContext(request, (tx) => hapusActionItem(tx, guard.konteks, aid));
  return responsNotulensi(hasil);
}
