import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { STATUS_HTTP_FORM, ubahStatusForm } from '@/lib/form/service';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** `{ aksi: 'buka' | 'tutup' }` — membuka menuntut syarat kategori terpenuhi. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { aksi?: unknown } | null;
  const h = await withAuditContext(request, guard.konteks, (tx) => ubahStatusForm(tx, guard.konteks, id, body?.aksi));
  return h.ok ? sukses(h.nilai) : gagal(h.kode, h.pesan, { details: h.details, status: STATUS_HTTP_FORM[h.kode] });
}
