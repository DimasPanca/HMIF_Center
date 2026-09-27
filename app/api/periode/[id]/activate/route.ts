import { z } from 'zod';
import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import {
  aktifkanPeriode,
  SkemaAktivasi,
  STATUS_GAGAL,
  type GagalPeriode,
} from '@/lib/periode/service';

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

export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('periode.update');
  if (!guard.ok) return tanpaCache(guard.nilai);

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) {
    return gagal('VALIDASI_GAGAL', 'ID periode tidak valid.', {
      status: 422,
      headers: HEADER_TANPA_CACHE,
    });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = SkemaAktivasi.safeParse(body);
  if (!parsed.success) {
    return gagal('VALIDASI_GAGAL', 'Konfirmasi aktivasi belum valid.', {
      status: 422,
      details: parsed.error.issues.map((isu) => ({
        path: isu.path.join('.'),
        pesan: isu.message,
      })),
      headers: HEADER_TANPA_CACHE,
    });
  }

  const hasil = await withAuditContext(request, guard.konteks, (tx) =>
    aktifkanPeriode(tx, id, parsed.data.konfirmasi),
  );
  if (!hasil.ok) return responsGagal(hasil);

  return sukses(hasil.nilai, { headers: HEADER_TANPA_CACHE });
}
