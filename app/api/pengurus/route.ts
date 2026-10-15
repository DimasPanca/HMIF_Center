import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { buatPengurus, daftarPengurusLengkap } from '@/lib/pengurus/service';

import { TANPA_CACHE, filterDariUrl, responsPengurus } from './_respons';

/** Daftar pengurus periode berjalan (atau `?periode=` arsip, baca saja). */
export async function GET(request: Request) {
  const guard = await requirePermission('pengurus.read');
  if (!guard.ok) return guard.nilai;
  return sukses(await daftarPengurusLengkap(guard.konteks, filterDariUrl(request.url)), { headers: TANPA_CACHE });
}

/** Tambah satu pengurus (form satuan). Tidak membuat akun. */
export async function POST(request: Request) {
  const guard = await requirePermission('pengurus.create');
  if (!guard.ok) return guard.nilai;
  const body = await request.json().catch(() => null);
  return responsPengurus(await withAuditContext(request, guard.konteks, (tx) => buatPengurus(tx, guard.konteks, body)), 201);
}
