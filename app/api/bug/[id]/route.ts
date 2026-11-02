import { konteksSaatIni } from '@/lib/auth/guard';
import { STATUS_HTTP_BUG, ubahLaporan } from '@/lib/bug/service';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

/** Admin: `{ status, catatan_admin }` (ADR-060 §5). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) return gagal('TIDAK_TERAUTENTIKASI', 'Silakan masuk terlebih dahulu.', { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as unknown;
  const h = await withAuditContext(request, konteks, (tx) => ubahLaporan(tx, konteks, id, body));
  return h.ok ? sukses(h.nilai) : gagal(h.kode, h.pesan, { status: STATUS_HTTP_BUG[h.kode] });
}
