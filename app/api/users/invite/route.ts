import { requirePermission } from '@/lib/auth/guard';
import { STATUS_GAGAL, undang } from '@/lib/auth/invitation';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

// Tautan undangan hanya ada di respons ini; jangan sampai tersimpan di cache mana pun.
const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const guard = await requirePermission('user.create');
  if (!guard.ok) return guard.nilai;

  const badan: unknown = await request.json().catch(() => null);
  const asal = new URL(request.url).origin;

  const hasil = await withAuditContext(request, (tx) => undang(tx, guard.konteks, badan, asal));
  return hasil.ok
    ? sukses(hasil.nilai, { status: 201, headers: TANPA_CACHE })
    : gagal(hasil.kode, hasil.pesan, {
        status: STATUS_GAGAL[hasil.kode],
        details: hasil.isu,
        headers: TANPA_CACHE,
      });
}
