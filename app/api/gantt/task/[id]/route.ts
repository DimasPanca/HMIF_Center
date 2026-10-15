import { requirePermission } from '@/lib/auth/guard';
import { hapusTask, ubahTask } from '@/lib/gantt/service';

import { idSah, idTidakValid, mutasi, responsGantt } from '@/app/api/gantt/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Ubah task — termasuk geser/ubah durasi lewat drag. Hak aksi diperiksa
 * SEBELUM keberadaan task (BPH mendapat 403 walau id-nya tidak ada), supaya
 * jawaban tidak membocorkan task mana yang ada.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.update');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const body = await request.json().catch(() => null);
  return responsGantt(await mutasi(request, guard.konteks, (tx) => ubahTask(tx, guard.konteks, id, body)));
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.delete');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsGantt(await mutasi(request, guard.konteks, (tx) => hapusTask(tx, guard.konteks, id)));
}
