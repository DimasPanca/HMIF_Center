import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal } from '@/lib/http/respond';
import { SkemaTerapkanTemplate, terapkanTemplate } from '@/lib/kanban/checklist';

import { responsChecklist, responsGuard, TANPA_CACHE } from '../_response';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('kanban.update');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return gagal('TIDAK_VALID', 'ID kartu tidak valid.', { status: 422, headers: TANPA_CACHE });
  }
  const input = SkemaTerapkanTemplate.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return gagal('TIDAK_VALID', 'Permintaan template tidak valid.', {
      status: 422,
      details: input.error.issues,
      headers: TANPA_CACHE,
    });
  }
  const hasil = await withAuditContext(request, guard.konteks, (tx) => terapkanTemplate(tx, guard.konteks, id, input.data));
  return responsChecklist(hasil);
}
