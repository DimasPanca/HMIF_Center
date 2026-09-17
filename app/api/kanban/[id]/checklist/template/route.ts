import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { daftarTemplate, simpanTemplate, SkemaSimpanTemplate } from '@/lib/kanban/checklist';

import { lingkupBacaKartu, responsChecklist, responsGuard, TANPA_CACHE } from '../_response';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kanban.read');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return gagal('TIDAK_VALID', 'ID kartu tidak valid.', { status: 422, headers: TANPA_CACHE });
  }
  const akses = await lingkupBacaKartu(guard.konteks, id);
  if (!akses.ok) return responsChecklist(akses);
  const data = await daftarTemplate(guard.konteks, akses.nilai.departemenId);
  return sukses(data, { headers: TANPA_CACHE });
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('kanban.create');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return gagal('TIDAK_VALID', 'ID kartu tidak valid.', { status: 422, headers: TANPA_CACHE });
  }
  const input = SkemaSimpanTemplate.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return gagal('TIDAK_VALID', 'Template checklist tidak valid.', {
      status: 422,
      details: input.error.issues,
      headers: TANPA_CACHE,
    });
  }
  const hasil = await withAuditContext(request, (tx) => simpanTemplate(tx, guard.konteks, id, input.data));
  return responsChecklist(hasil, 201);
}
