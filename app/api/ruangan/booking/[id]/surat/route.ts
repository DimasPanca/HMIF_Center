import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { suratDariBooking } from '@/lib/ruangan/service';

import { idSah, idTidakValid, responsRuangan } from '@/app/api/ruangan/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * "Buat Surat Peminjaman Ruangan": membuat (atau membuka kembali) surat 05
 * varian PEMINJAMAN_RUANGAN yang terisi dari booking. Jawaban memuat `tujuan`,
 * halaman yang harus dibuka klien.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('surat.create');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  return responsRuangan(await withAuditContext(request, guard.konteks, (tx) => suratDariBooking(tx, guard.konteks, id)));
}
