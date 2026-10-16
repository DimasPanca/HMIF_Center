import { z } from 'zod';

import { requirePermission, type Konteks } from '@/lib/auth/guard';
import { withAuditContext, type TxKlien } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_VERIFIKASI, type Hasil } from '@/lib/nota/verifikasi';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Kerangka bersama tiga aksi verifikasi (T-102): guard `nota.verify`, UUID, audit, respons. */
export async function jalankanAksiNota<T>(
  request: Request,
  params: Promise<{ id: string }>,
  aksi: (tx: TxKlien, konteks: Konteks, id: string, body: unknown) => Promise<Hasil<T>>,
) {
  const guard = await requirePermission('nota.verify');
  if (!guard.ok) return guard.nilai;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const body = await request.json().catch(() => ({}));
  const h = await withAuditContext(request, guard.konteks, (tx) =>
    aksi(tx, guard.konteks, id, body),
  );
  return h.ok
    ? sukses(h.nilai, { headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, {
        status: STATUS_GAGAL_VERIFIKASI[h.kode],
        headers: TANPA_CACHE,
        ...(h.details ? { details: h.details } : {}),
      });
}
