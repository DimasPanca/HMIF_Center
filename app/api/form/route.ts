import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { buatForm, daftarForm, STATUS_HTTP_FORM } from '@/lib/form/service';
import { gagal, sukses } from '@/lib/http/respond';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Form periode aktif yang terlihat pengguna; `?kepanitiaan_id=` = form satu acara (ADR-038). */
export async function GET(request: Request) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const k = new URL(request.url).searchParams.get('kepanitiaan_id');
  if (k && !z.uuid().safeParse(k).success) return gagal('VALIDASI_GAGAL', 'ID acara tidak valid.', { status: 422, headers: TANPA_CACHE });
  return sukses(await daftarForm(guard.konteks, { kepanitiaanId: k ?? undefined }), { headers: TANPA_CACHE });
}

/** Buat form `{ kategori, judul, deskripsi, kepanitiaan_id?, template_id? }` — mulai sebagai DRAF. */
export async function POST(request: Request) {
  const guard = await requirePermission('form.create');
  if (!guard.ok) return guard.nilai;
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) => buatForm(tx, guard.konteks, body));
  return h.ok
    ? sukses(h.nilai, { status: 201, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { details: h.details, status: STATUS_HTTP_FORM[h.kode], headers: TANPA_CACHE });
}
