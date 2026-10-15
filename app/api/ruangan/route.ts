import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { buatRuangan, daftarRuangan } from '@/lib/ruangan/service';

import { TANPA_CACHE, responsRuangan } from './_respons';

/** Daftar ruangan aktif. KADEPT (`C*`) ikut membaca — ia memilih ruangan saat mengajukan peminjaman. */
export async function GET() {
  const baca = await requirePermission('ruangan.read');
  const guard = baca.ok ? baca : await requirePermission('ruangan.create');
  if (!guard.ok) return guard.nilai;
  return sukses(await daftarRuangan(), { headers: TANPA_CACHE });
}

/** Tambah ruangan — Sekretaris/Admin (`ruangan.update`, cermin RLS ruangan_insert). */
export async function POST(request: Request) {
  const guard = await requirePermission('ruangan.update');
  if (!guard.ok) return guard.nilai;
  const body = await request.json().catch(() => null);
  return responsRuangan(await withAuditContext(request, guard.konteks, (tx) => buatRuangan(tx, body)), 201);
}
