import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { SkemaSetujui, setujuiSurat, terbitkanSurat } from '@/lib/surat/status';

import { TANPA_CACHE, bacaBody, idSah, idTidakValid, responsGuard, responsSurat } from '@/app/api/surat/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * MENUNGGU_APPROVAL → DISETUJUI → TERBIT. Ketua, Wakil, atau Sekum (INV-05).
 *
 * Dua langkah, dua transaksi: nomor dialokasikan dan di-commit dulu, baru
 * dokumen di-generate. Generate yang gagal mengembalikan 200 berstatus
 * DISETUJUI beserta peringatannya — nomornya sah dan tetap terpakai (INV-16).
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('surat.approve');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const opsi = SkemaSetujui.safeParse((await bacaBody(request)) ?? {});
  if (!opsi.success) return gagal('VALIDASI_GAGAL', 'Isian tidak valid.', { status: 422, headers: TANPA_CACHE });

  const disetujui = await withAuditContext(request, guard.konteks, (tx) => setujuiSurat(tx, guard.konteks, id, opsi.data));
  if (!disetujui.ok) return responsSurat(disetujui);

  const terbit = await terbitkanSurat(id);
  return sukses(
    {
      nomor: disetujui.nilai.nomor,
      status: terbit.status,
      peringatan: terbit.ok ? null : terbit.pesan,
    },
    { headers: TANPA_CACHE },
  );
}
