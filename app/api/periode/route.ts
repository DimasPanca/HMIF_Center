import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import {
  buatPeriode,
  daftarPeriode,
  detailPeriode,
  STATUS_GAGAL,
  type GagalPeriode,
} from '@/lib/periode/service';

const HEADER_TANPA_CACHE = { 'Cache-Control': 'no-store' };

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

export async function GET() {
  const guard = await requirePermission('periode.read');
  if (!guard.ok) return tanpaCache(guard.nilai);

  return sukses(await daftarPeriode(), { headers: HEADER_TANPA_CACHE });
}

export async function POST(request: Request) {
  const guard = await requirePermission('periode.create');
  if (!guard.ok) return tanpaCache(guard.nilai);

  const body: unknown = await request.json().catch(() => null);
  const hasil = await withAuditContext(request, async (tx) => {
    const dibuat = await buatPeriode(tx, body);
    if (!dibuat.ok) return dibuat;

    const periode = await detailPeriode(dibuat.nilai.id, tx);
    if (!periode) {
      return {
        ok: false as const,
        kode: 'TIDAK_DITEMUKAN' as const,
        pesan: 'Periode yang baru dibuat tidak dapat ditemukan.',
      };
    }
    return { ok: true as const, nilai: periode };
  });

  if (!hasil.ok) return responsGagal(hasil);
  return sukses(hasil.nilai, { status: 201, headers: HEADER_TANPA_CACHE });
}
