import { z } from 'zod';

import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL, mintaRevisi } from '@/lib/proker/approval';

const SkemaId = z.uuid();
const TANPA_CACHE = { 'Cache-Control': 'no-store' };

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) {
    return gagal('TIDAK_LOGIN', 'Sesi tidak aktif.', { status: 401, headers: TANPA_CACHE });
  }
  if (!can(konteks.roles, 'proker.approve')) {
    return gagal('TIDAK_BERHAK', 'Bukan hak Anda.', { status: 403, headers: TANPA_CACHE });
  }

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) {
    return gagal('TIDAK_VALID', 'ID proker tidak valid.', {
      status: 422,
      headers: TANPA_CACHE,
    });
  }

  const body: unknown = await request.json().catch(() => null);
  const catatan =
    typeof body === 'object' && body !== null && 'catatan' in body && typeof body.catatan === 'string'
      ? body.catatan
      : '';
  const hasil = await withAuditContext(request, konteks, (tx) => mintaRevisi(tx, id, catatan));
  if (!hasil.ok) {
    return gagal(hasil.kode, hasil.pesan, {
      status: STATUS_GAGAL[hasil.kode],
      headers: TANPA_CACHE,
    });
  }

  return sukses(hasil.nilai, { headers: TANPA_CACHE });
}
