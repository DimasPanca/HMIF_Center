import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal } from '@/lib/http/respond';
import { hapusPengurus, ubahPengurus } from '@/lib/pengurus/service';

import { TANPA_CACHE, responsPengurus } from '../_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const idSah = (id: string) => z.uuid().safeParse(id).success;
const idTidakValid = () => gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('pengurus.update');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const body = await request.json().catch(() => null);
  return responsPengurus(await withAuditContext(request, guard.konteks, (tx) => ubahPengurus(tx, guard.konteks, id, body)));
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('pengurus.delete');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsPengurus(await withAuditContext(request, guard.konteks, (tx) => hapusPengurus(tx, guard.konteks, id)));
}
