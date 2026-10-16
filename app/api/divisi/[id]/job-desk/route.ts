import { z } from 'zod';

import { muatJobDesk, simpanJobDesk } from '@/lib/acara/job-desk';
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };
const STATUS = { VALIDASI_GAGAL: 422, TIDAK_DITEMUKAN: 404, TIDAK_BERWENANG: 403 } as const;

/** Job desk divisi — konten tersanitasi + hak tulis pengguna (T-093). */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const data = await muatJobDesk(guard.konteks, id);
  return data ? sukses(data, { headers: TANPA_CACHE }) : gagal('TIDAK_DITEMUKAN', 'Divisi tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}

/**
 * Simpan job desk `{ konten }` (JSON TipTap) — disanitasi allowlist sebelum
 * disimpan. Divisi lain → 403 (T-085). Dipanggil auto-save tiap 10 detik.
 */
export async function PUT(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  if (!(await muatJobDesk(guard.konteks, id))) return gagal('TIDAK_DITEMUKAN', 'Divisi tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) => simpanJobDesk(tx, guard.konteks, id, body));
  return h.ok ? sukses(h.nilai, { headers: TANPA_CACHE }) : gagal(h.kode, h.pesan, { status: STATUS[h.kode], headers: TANPA_CACHE });
}
