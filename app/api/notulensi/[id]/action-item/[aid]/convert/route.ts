import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { konversiActionItem } from '@/lib/notulensi/service';

import { bacaBody, idSah, idTidakValid, responsGuard, responsNotulensi } from '@/app/api/notulensi/_respons';

interface RouteContext {
  params: Promise<{ id: string; aid: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('notulensi.update');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id, aid } = await context.params;
  if (!idSah(id, aid)) return idTidakValid();

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, (tx) => konversiActionItem(tx, guard.konteks, aid, body));
  return responsNotulensi(hasil);
}
