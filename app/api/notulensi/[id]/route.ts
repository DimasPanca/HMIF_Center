import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { detailNotulensi, perbaruiNotulensi } from '@/lib/notulensi/service';

import {
  TANPA_CACHE,
  bacaBody,
  idSah,
  idTidakValid,
  responsGuard,
  responsNotulensi,
  tidakDitemukan,
} from '@/app/api/notulensi/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('notulensi.read');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const data = await detailNotulensi(guard.konteks, id);
  return data ? sukses(data, { headers: TANPA_CACHE }) : tidakDitemukan();
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('notulensi.update');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => perbaruiNotulensi(tx, guard.konteks, id, body));
  return responsNotulensi(hasil);
}
