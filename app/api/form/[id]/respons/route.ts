import { requirePermission } from '@/lib/auth/guard';
import { muatRespons } from '@/lib/form/respons';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Ringkasan + daftar respons — pembaca respons saja (BPH tidak, ADR-038 #6). */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const data = await muatRespons(guard.konteks, id);
  return data ? sukses(data, { headers: TANPA_CACHE }) : gagal('TIDAK_DITEMUKAN', 'Respons tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}
