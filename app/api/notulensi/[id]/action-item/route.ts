import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { tambahActionItem } from '@/lib/notulensi/service';

import { bacaBody, idSah, idTidakValid, responsGuard, responsNotulensi } from '@/app/api/notulensi/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('notulensi.update');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => tambahActionItem(tx, guard.konteks, id, body));
  return responsNotulensi(hasil, 201);
}
