import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { STATUS_HTTP_FORM } from '@/lib/form/service';
import { hapusTemplate, muatTemplate, simpanTemplate } from '@/lib/form/template';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return gagal('TIDAK_DITEMUKAN', 'Template tidak ditemukan.', { status: 404 });
  const t = await muatTemplate(id);
  return t ? sukses(t, { headers: TANPA_CACHE }) : gagal('TIDAK_DITEMUKAN', 'Template tidak ditemukan.', { status: 404 });
}

export async function PUT(request: Request, context: RouteContext) {
  const guard = await requirePermission('form_template.manage');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) => simpanTemplate(tx, guard.konteks, id, body));
  return h.ok ? sukses(h.nilai) : gagal(h.kode, h.pesan, { details: h.details, status: STATUS_HTTP_FORM[h.kode] });
}

/** Template yang pernah dipakai atau bawaan hanya dinonaktifkan. */
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('form_template.manage');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const h = await withAuditContext(request, guard.konteks, (tx) => hapusTemplate(tx, guard.konteks, id));
  return h.ok ? sukses(h.nilai) : gagal(h.kode, h.pesan, { status: STATUS_HTTP_FORM[h.kode] });
}
