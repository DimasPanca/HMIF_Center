import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { terapkanPengurus } from '@/lib/form/respons';
import { STATUS_HTTP_FORM } from '@/lib/form/service';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string; rid: string }>;
}

/** Terapkan satu respons Pendataan Pengurus ke Data Pengurus (Sekum/Admin). */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id, rid } = await context.params;
  const h = await withAuditContext(request, guard.konteks, (tx) => terapkanPengurus(tx, guard.konteks, id, rid));
  return h.ok ? sukses(h.nilai) : gagal(h.kode, h.pesan, { status: STATUS_HTTP_FORM[h.kode] });
}
