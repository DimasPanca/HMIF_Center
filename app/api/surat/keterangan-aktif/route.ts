import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { buatDraftSkAktif, daftarPengajuanSaya, identitasPemohon } from '@/lib/surat/keterangan-aktif';
import { ajukanSurat } from '@/lib/surat/status';

import { TANPA_CACHE, bacaBody, responsGuard, responsSurat } from '@/app/api/surat/_respons';

/** Identitas pemohon (dari Data Pengurus) + pengajuan SK Aktif miliknya di periode aktif. */
export async function GET() {
  const guard = await requirePermission('surat.ajukan_aktif');
  if (!guard.ok) return responsGuard(guard.nilai);
  const [identitas, pengajuan] = await Promise.all([identitasPemohon(guard.konteks), daftarPengajuanSaya(guard.konteks)]);
  return sukses({ identitas, pengajuan }, { headers: TANPA_CACHE });
}

/**
 * `{ keperluan }` → SK Aktif atas nama pemohon, langsung diajukan (ADR-036).
 * Dua transaksi: draft harus ter-commit sebelum pengajuan memeriksanya.
 */
export async function POST(request: Request) {
  const guard = await requirePermission('surat.ajukan_aktif');
  if (!guard.ok) return responsGuard(guard.nilai);
  const body = await bacaBody(request);
  const draft = await withAuditContext(request, guard.konteks, (tx) => buatDraftSkAktif(tx, guard.konteks, body));
  if (!draft.ok) return responsSurat(draft);
  const aju = await withAuditContext(request, guard.konteks, (tx) => ajukanSurat(tx, guard.konteks, draft.nilai.id));
  if (!aju.ok) return responsSurat(aju);
  return responsSurat({ ok: true, nilai: { id: draft.nilai.id, status: aju.nilai.status } }, 201);
}
