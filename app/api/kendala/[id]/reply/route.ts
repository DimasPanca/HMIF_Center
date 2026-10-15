import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { balasKendala } from '@/lib/kendala/service';

import { idSah, idTidakValid, responsKendala, type RouteId } from '@/app/api/kendala/_respons';

/** Balasan berulir (`parent_id` opsional). BPH/Sekum/Bendum hanya membaca. */
export async function POST(request: Request, context: RouteId) {
  const guard = await requirePermission('kendala.create');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const body = await request.json().catch(() => null);
  return responsKendala(await withAuditContext(request, guard.konteks, (tx) => balasKendala(tx, guard.konteks, id, body)), 201);
}
