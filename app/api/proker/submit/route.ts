import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL, submitWizard } from '@/lib/proker/submit';

export async function POST(request: Request) {
  const guard = await requirePermission('proker.create');
  if (!guard.ok) return guard.nilai;

  const hasil = await withAuditContext(request, (tx) => submitWizard(tx, guard.konteks));
  if (!hasil.ok) {
    return gagal(hasil.kode, hasil.pesan, {
      status: STATUS_GAGAL[hasil.kode],
      details: hasil.isu,
    });
  }

  return sukses(hasil.nilai, { status: 201 });
}
