import { idSah, idTidakValid, responsRab } from '@/app/api/rab/_respons';
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { muatRab, ubahStatusRab, type AksiStatus } from '@/lib/rab/service';

/**
 * Satu jalur untuk ketiga route status RAB (T-089). Hak per aksi diputuskan
 * service (`hitungIzinStatus`), mesin status ditegakkan ulang trigger 041.
 * Jawaban: `{ status, rab }` — pohon terbaru untuk grid.
 */
export async function jalankanAksiStatus(request: Request, kepanitiaanId: string, aksi: AksiStatus) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  if (!idSah(kepanitiaanId)) return idTidakValid();
  const body = await request.json().catch(() => null);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => ubahStatusRab(tx, guard.konteks, kepanitiaanId, aksi, body));
  if (!hasil.ok) return responsRab(hasil);
  const rab = await muatRab(guard.konteks, kepanitiaanId);
  return sukses({ status: hasil.nilai.status, rab: rab === 'TERBATAS' ? null : rab }, { headers: { 'Cache-Control': 'no-store' } });
}
