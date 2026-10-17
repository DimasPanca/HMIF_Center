import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { bolehBacaLpj } from '@/lib/lpj/generate';
import { STATUS_GAGAL_LPJ, muatLpj, simpanManualLpj } from '@/lib/lpj/generate';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** LPJ acara: isian manual, prasyarat, analisis (snapshot bila sudah diajukan), lampiran, izin (T-105). */
export async function GET(_request: Request, context: RouteContext) {
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
  const l = await muatLpj(guard.konteks, kepanitiaanId);
  if (l === null)
    return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  if (l === 'TERBATAS')
    return gagal('TIDAK_BERWENANG', 'Angka keuangan acara ini bukan hak Anda.', {
      status: 403,
      headers: TANPA_CACHE,
    });
  return sukses(l, { headers: TANPA_CACHE });
}

/** Simpan isian manual `{ manual }` — hanya selama DRAFT (trigger 046 menjaga di DB juga). */
export async function PUT(request: Request, context: RouteContext) {
  const guard = await requirePermission('lpj.generate');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const l = await muatLpj(guard.konteks, kepanitiaanId);
  if (l === null)
    return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  if (l === 'TERBATAS')
    return gagal('TIDAK_BERWENANG', 'Angka keuangan acara ini bukan hak Anda.', {
      status: 403,
      headers: TANPA_CACHE,
    });
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) =>
    simpanManualLpj(tx, guard.konteks, kepanitiaanId, body),
  );
  return h.ok
    ? sukses(h.nilai, { headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_LPJ[h.kode], headers: TANPA_CACHE });
}
