import { requirePermission } from '@/lib/auth/guard';
import { gagal } from '@/lib/http/respond';
import { unggahLampiran } from '@/lib/kendala/lampiran';

import { TANPA_CACHE, idSah, idTidakValid, responsKendala, type RouteId } from '@/app/api/kendala/_respons';

export async function POST(request: Request, context: RouteId) {
  const guard = await requirePermission('kendala.create');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const form = await request.formData().catch(() => null);
  const berkas = form?.get('berkas');
  if (!(berkas instanceof File)) return gagal('BERKAS_DITOLAK', 'Pilih berkas yang akan dilampirkan.', { status: 422, headers: TANPA_CACHE });
  return responsKendala(await unggahLampiran(request, guard.konteks, id, berkas), 201);
}
