import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { tolakSurat } from '@/lib/surat/status';

import { bacaBody, idSah, idTidakValid, responsGuard, responsSurat } from '@/app/api/surat/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** MENUNGGU_APPROVAL → DITOLAK. Alasan wajib — ditolak server bila kosong (kontrak T-060 butir 4). */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('surat.approve');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => tolakSurat(tx, guard.konteks, id, body));
  return responsSurat(hasil);
}
