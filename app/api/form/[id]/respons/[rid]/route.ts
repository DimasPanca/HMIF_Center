import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { ubahSeleksi } from '@/lib/form/respons';
import { STATUS_HTTP_FORM } from '@/lib/form/service';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string; rid: string }>;
}

/** Status seleksi Open Recruitment `{ status_seleksi: BARU | LOLOS | TIDAK_LOLOS }`. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id, rid } = await context.params;
  const body = (await request.json().catch(() => null)) as { status_seleksi?: unknown } | null;
  const h = await withAuditContext(request, guard.konteks, (tx) => ubahSeleksi(tx, guard.konteks, id, rid, body?.status_seleksi));
  return h.ok ? sukses(h.nilai) : gagal(h.kode, h.pesan, { status: STATUS_HTTP_FORM[h.kode] });
}
