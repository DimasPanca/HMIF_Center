import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { ajukanSurat } from '@/lib/surat/status';

import { idSah, idTidakValid, responsGuard, responsSurat } from '@/app/api/surat/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** DRAFT → MENUNGGU_APPROVAL. Hanya pembuat; isian harus lolos skema lengkap. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('surat.create');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const hasil = await withAuditContext(request, guard.konteks, (tx) => ajukanSurat(tx, guard.konteks, id));
  return responsSurat(hasil);
}
