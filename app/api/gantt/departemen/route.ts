import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { pastikanChartDepartemen } from '@/lib/gantt/service';
import { gagal, sukses } from '@/lib/http/respond';

import { TANPA_CACHE } from '@/app/api/gantt/_respons';

/** Buka (atau buat sekali) chart DEPARTEMEN periode berjalan. */
export async function POST(request: Request) {
  const guard = await requirePermission('gantt.create');
  if (!guard.ok) return guard.nilai;
  const body = (await request.json().catch(() => null)) as { departemen_id?: unknown } | null;
  const id = z.uuid().safeParse(body?.departemen_id);
  if (!id.success) return gagal('VALIDASI_GAGAL', 'Departemen wajib dipilih.', { status: 422, headers: TANPA_CACHE });
  const departemen = await db.departemen.findFirst({ where: { id: id.data, is_active: true }, select: { id: true, nama: true } });
  if (!departemen) return gagal('TIDAK_DITEMUKAN', 'Departemen tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
  const chartId = await withAuditContext(request, guard.konteks, (tx) => pastikanChartDepartemen(tx, guard.konteks, departemen));
  return chartId
    ? sukses({ id: chartId }, { status: 201, headers: TANPA_CACHE })
    : gagal('TIDAK_BERWENANG', 'Anda tidak dapat membuat Gantt untuk departemen ini.', { status: 403, headers: TANPA_CACHE });
}
