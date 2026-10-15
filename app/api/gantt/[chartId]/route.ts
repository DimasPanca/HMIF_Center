import { requirePermission } from '@/lib/auth/guard';
import { gagal, sukses } from '@/lib/http/respond';
import { SkemaTambah } from '@/lib/gantt/skema';
import { muatChart, tambahGrup, tambahTask } from '@/lib/gantt/service';

import { TANPA_CACHE, idSah, idTidakValid, mutasi, responsGantt } from '@/app/api/gantt/_respons';

interface RouteContext {
  params: Promise<{ chartId: string }>;
}

/** Grup, task, dependensi, dan hak pengguna atas satu chart. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.read');
  if (!guard.ok) return guard.nilai;
  const { chartId } = await context.params;
  if (!idSah(chartId)) return idTidakValid();
  const data = await muatChart(guard.konteks, chartId);
  return data
    ? sukses(data, { headers: TANPA_CACHE })
    : gagal('TIDAK_DITEMUKAN', 'Chart tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}

/** Tambah task atau grup: `{ jenis: 'task' | 'grup', data }`. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.create');
  if (!guard.ok) return guard.nilai;
  const { chartId } = await context.params;
  if (!idSah(chartId)) return idTidakValid();
  const body = SkemaTambah.safeParse(await request.json().catch(() => null));
  if (!body.success) return gagal('VALIDASI_GAGAL', 'Jenis tambahan harus task atau grup.', { status: 422, headers: TANPA_CACHE });
  const { jenis, data } = body.data;
  return responsGantt(
    await mutasi(request, guard.konteks, (tx) =>
      jenis === 'task' ? tambahTask(tx, guard.konteks, chartId, data) : tambahGrup(tx, guard.konteks, chartId, data),
    ),
    201,
  );
}
