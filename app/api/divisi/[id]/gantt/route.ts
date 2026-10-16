import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { pastikanChartDivisi } from '@/lib/gantt/service';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Buka (atau buat sekali) chart Gantt scope DIVISI untuk divisi ini (T-093). */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const chartId = await withAuditContext(request, guard.konteks, (tx) => pastikanChartDivisi(tx, guard.konteks, id));
  return chartId
    ? sukses({ id: chartId }, { status: 201, headers: TANPA_CACHE })
    : gagal('TIDAK_BERWENANG', 'Timeline divisi ini dibuat panitia divisinya, Kadept penanggung jawab, atau pimpinan.', { status: 403, headers: TANPA_CACHE });
}
