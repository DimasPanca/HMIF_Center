import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { bolehBacaLpj } from '@/lib/lpj/generate';
import { STATUS_GAGAL_LPJ, aksiLpj } from '@/lib/lpj/generate';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/**
 * Alur persetujuan LPJ (ADR-015) `{ aksi: 'ajukan'|'setujui'|'kembalikan', alasan? }`:
 * DRAFT→DIAJUKAN (Bendum/Admin) → DISETUJUI_BENDUM (Bendum/Admin) → FINAL (Ketua).
 * FINAL tidak dapat diubah; RAB acaranya menjadi SELESAI.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  if (!bolehBacaLpj(guard.konteks.roles)) {
    return gagal('TIDAK_BERWENANG', 'LPJ tidak dapat Anda buka.', {
      status: 403,
      headers: TANPA_CACHE,
    });
  }
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) =>
    aksiLpj(tx, guard.konteks, kepanitiaanId, body),
  );
  return h.ok
    ? sukses(h.nilai, { headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_LPJ[h.kode], headers: TANPA_CACHE });
}
