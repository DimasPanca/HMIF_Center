import { z } from 'zod';
import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { hapusPeriode, STATUS_GAGAL, ubahPeriode, type GagalPeriode } from '@/lib/periode/service';

const SkemaId = z.uuid();
const HEADER_TANPA_CACHE = { 'Cache-Control': 'no-store' };

type RouteContext = { params: Promise<{ id: string }> };

function tanpaCache(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function responsGagal(hasil: GagalPeriode): NextResponse {
  return gagal(hasil.kode, hasil.pesan, {
    details: hasil.isu,
    status: STATUS_GAGAL[hasil.kode],
    headers: HEADER_TANPA_CACHE,
  });
}

function idTidakValid(): NextResponse {
  return gagal('VALIDASI_GAGAL', 'ID periode tidak valid.', {
    status: 422,
    headers: HEADER_TANPA_CACHE,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('periode.update');
  if (!guard.ok) return tanpaCache(guard.nilai);

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) return idTidakValid();

  const body: unknown = await request.json().catch(() => null);
  const hasil = await withAuditContext(request, (tx) => ubahPeriode(tx, id, body));
  if (!hasil.ok) return responsGagal(hasil);

  return sukses(hasil.nilai, { headers: HEADER_TANPA_CACHE });
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('periode.delete');
  if (!guard.ok) return tanpaCache(guard.nilai);

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) return idTidakValid();

  const hasil = await withAuditContext(request, (tx) => hapusPeriode(tx, id));
  if (!hasil.ok) return responsGagal(hasil);

  return sukses(hasil.nilai, { headers: HEADER_TANPA_CACHE });
}
