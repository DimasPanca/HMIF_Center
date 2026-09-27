import { requirePermission } from '@/lib/auth/guard';
import { sukses } from '@/lib/http/respond';
import { daftarPengurus } from '@/lib/notulensi/service';

import { TANPA_CACHE, idSah, idTidakValid, responsGuard } from '@/app/api/notulensi/_respons';

export async function GET(request: Request) {
  const guard = await requirePermission('notulensi.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const departemenId = new URL(request.url).searchParams.get('departemen_id') || null;
  if (departemenId && !idSah(departemenId)) return idTidakValid();

  const data = await daftarPengurus(guard.konteks, departemenId);
  return sukses(data, { headers: TANPA_CACHE });
}
