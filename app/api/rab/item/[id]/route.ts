import { idSah, idTidakValid, responsRab } from '@/app/api/rab/_respons';
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { hapusItem, ubahItem } from '@/lib/rab/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Ubah satu item RAB (sebagian). Total dihitung ulang di server — nilai di
 * jawaban adalah kebenaran yang dipakai grid (INV-27). Divisi lain → 403 (INV-30).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const body = await request.json().catch(() => null);
  return responsRab(await withAuditContext(request, guard.konteks, (tx) => ubahItem(tx, guard.konteks, id, body)));
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsRab(await withAuditContext(request, guard.konteks, (tx) => hapusItem(tx, guard.konteks, id)));
}
