import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { STATUS_GAGAL, ubahPengguna } from '@/lib/auth/invitation';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('user.update');
  if (!guard.ok) return guard.nilai;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return gagal('TIDAK_VALID', 'ID pengguna tidak valid.', { status: 422 });
  }

  const badan: unknown = await request.json().catch(() => null);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => ubahPengguna(tx, guard.konteks, id, badan));
  return hasil.ok
    ? sukses(hasil.nilai)
    : gagal(hasil.kode, hasil.pesan, { status: STATUS_GAGAL[hasil.kode], details: hasil.isu });
}
