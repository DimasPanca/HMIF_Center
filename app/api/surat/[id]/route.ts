import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { detailDraft, simpanDraft } from '@/lib/surat/draft';

import {
  TANPA_CACHE,
  bacaBody,
  idSah,
  idTidakValid,
  responsGuard,
  responsSurat,
  tidakDitemukan,
} from '@/app/api/surat/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Draft milik pengguna sendiri — dipakai saat melanjutkan draft. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('surat.create');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const data = await detailDraft(guard.konteks, id);
  return data ? sukses(data, { headers: TANPA_CACHE }) : tidakDitemukan();
}

/** Auto-save: dipanggil tiap 10 detik dan saat blur selama ada perubahan. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('surat.create');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => simpanDraft(tx, guard.konteks, body, id));
  return responsSurat(hasil);
}
