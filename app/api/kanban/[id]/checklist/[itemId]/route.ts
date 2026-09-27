import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal } from '@/lib/http/respond';
import { hapusChecklist, SkemaUbahItem, ubahChecklist } from '@/lib/kanban/checklist';

import { responsChecklist, responsGuard, TANPA_CACHE } from '../_response';

interface RouteContext {
  params: Promise<{ id: string; itemId: string }>;
}

function idValid(id: string, itemId: string) {
  return z.uuid().safeParse(id).success && z.uuid().safeParse(itemId).success;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('kanban.update');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id, itemId } = await context.params;
  if (!idValid(id, itemId)) {
    return gagal('TIDAK_VALID', 'ID kartu atau item tidak valid.', { status: 422, headers: TANPA_CACHE });
  }
  const input = SkemaUbahItem.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return gagal('TIDAK_VALID', 'Perubahan checklist tidak valid.', {
      status: 422,
      details: input.error.issues,
      headers: TANPA_CACHE,
    });
  }
  const hasil = await withAuditContext(request, guard.konteks, (tx) => ubahChecklist(tx, guard.konteks, itemId, input.data));
  return responsChecklist(hasil);
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('kanban.delete');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id, itemId } = await context.params;
  if (!idValid(id, itemId)) {
    return gagal('TIDAK_VALID', 'ID kartu atau item tidak valid.', { status: 422, headers: TANPA_CACHE });
  }
  const hasil = await withAuditContext(request, guard.konteks, (tx) => hapusChecklist(tx, guard.konteks, itemId));
  return responsChecklist(hasil);
}
