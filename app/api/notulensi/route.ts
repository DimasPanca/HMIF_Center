import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { buatNotulensi, daftarNotulensi } from '@/lib/notulensi/service';

import { TANPA_CACHE, bacaBody, idSah, idTidakValid, responsGuard, responsNotulensi } from '@/app/api/notulensi/_respons';

export async function GET(request: Request) {
  const guard = await requirePermission('notulensi.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const url = new URL(request.url);
  const departemenId = url.searchParams.get('departemen_id') || null;
  if (departemenId && !idSah(departemenId)) return idTidakValid();

  const data = await daftarNotulensi(guard.konteks, {
    q: url.searchParams.get('q') ?? undefined,
    departemenId,
  });
  return sukses(data, { headers: TANPA_CACHE });
}

export async function POST(request: Request) {
  const guard = await requirePermission('notulensi.create');
  if (!guard.ok) return responsGuard(guard.nilai);

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, (tx) => buatNotulensi(tx, guard.konteks, body));
  return responsNotulensi(hasil, 201);
}
