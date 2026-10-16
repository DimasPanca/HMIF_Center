import { z } from 'zod';

import { muatAcara } from '@/lib/acara/service';
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_TOR, muatTor, simpanTor } from '@/lib/tor/service';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** TOR acara: 11 bagian tersimpan + rundown + anggaran RAB + penandatangan + hak tulis (T-094). */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const t = await muatTor(guard.konteks, kepanitiaanId);
  return t
    ? sukses(t, { headers: TANPA_CACHE })
    : gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}

/**
 * Auto-save `{ data, rundown? }` (skema lib/tor/schema.ts). Teks kaya
 * disanitasi; rundown disinkronkan ke tabel `rundown` hanya bila dikirim.
 */
export async function PUT(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  // Acara periode lain / tak terlihat → 404, sama dengan GET.
  // Cukup cek visibilitas acara — memuat seluruh TOR + RAB di tiap auto-save terlalu mahal.
  if (!(await muatAcara(guard.konteks, kepanitiaanId)))
    return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) =>
    simpanTor(tx, guard.konteks, kepanitiaanId, body),
  );
  return h.ok
    ? sukses(h.nilai, { headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_TOR[h.kode], headers: TANPA_CACHE });
}
