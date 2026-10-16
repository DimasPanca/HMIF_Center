import { z } from 'zod';

import { muatAcara } from '@/lib/acara/service';
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_PROPOSAL, muatProposal, simpanProposal } from '@/lib/proposal/service';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Proposal acara: isian (sudah diprefill) + tarikan + ukuran prefill + hak tulis (T-096). */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const p = await muatProposal(guard.konteks, kepanitiaanId);
  return p
    ? sukses(p, { headers: TANPA_CACHE })
    : gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}

/** Auto-save `{ data }` — teks kaya disanitasi; susunan panitia & anggaran tidak diterima (zod strict). */
export async function PUT(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  // Cukup cek visibilitas acara — memuat seluruh proposal + prefill di tiap auto-save terlalu mahal.
  if (!(await muatAcara(guard.konteks, kepanitiaanId)))
    return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) =>
    simpanProposal(tx, guard.konteks, kepanitiaanId, body),
  );
  return h.ok
    ? sukses(h.nilai, { headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_PROPOSAL[h.kode], headers: TANPA_CACHE });
}
