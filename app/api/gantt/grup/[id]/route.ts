import { requirePermission } from '@/lib/auth/guard';
import { hapusGrup, ubahGrup } from '@/lib/gantt/service';

import { idSah, idTidakValid, mutasi, responsGantt } from '@/app/api/gantt/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.update');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const body = await request.json().catch(() => null);
  return responsGantt(await mutasi(request, guard.konteks, (tx) => ubahGrup(tx, guard.konteks, id, body)));
}

/** Menghapus grup ikut menghapus task di dalamnya (FK cascade). */
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.delete');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsGantt(await mutasi(request, guard.konteks, (tx) => hapusGrup(tx, guard.konteks, id)));
}
