import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { simpanDraft } from '@/lib/surat/draft';

import { bacaBody, responsGuard, responsSurat } from '@/app/api/surat/_respons';

/** Membuat draft surat. Pembaruan berikutnya (auto-save) lewat PATCH /api/surat/[id]. */
export async function POST(request: Request) {
  const guard = await requirePermission('surat.create');
  if (!guard.ok) return responsGuard(guard.nilai);

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => simpanDraft(tx, guard.konteks, body, null));
  return responsSurat(hasil, 201);
}
