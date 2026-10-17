import { after } from 'next/server';

import { requirePermission } from '@/lib/auth/guard';
import { daftarBackup, mulaiBackup, prosesBackup, tandaiTerhenti } from '@/lib/backup/service';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Backup berjalan di `after()` setelah respons dikirim; batasnya mengikuti
// fungsi ini. Lebih dari batas → `tandaiTerhenti` menandainya GAGAL.
export const maxDuration = 300;

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Daftar backup + progres yang sedang berjalan (T-110 kontrak 7). */
export async function GET() {
  const guard = await requirePermission('backup.read');
  if (!guard.ok) return guard.nilai;
  return sukses(await daftarBackup(), { headers: TANPA_CACHE });
}

/**
 * "Backup Sekarang" (PRD F-16.2): membuat baris BERJALAN lalu mengerjakan
 * bundelnya setelah respons 202 — UI memantau progresnya lewat GET.
 */
export async function POST(request: Request) {
  const guard = await requirePermission('backup.manage');
  if (!guard.ok) return guard.nilai;

  await tandaiTerhenti();
  const m = await withAuditContext(request, guard.konteks, (tx) =>
    mulaiBackup(tx, { jenis: 'MANUAL', userId: guard.konteks.sesi.userId }),
  );
  if (!m.ok) {
    return gagal(m.kode, m.pesan, {
      status: m.kode === 'BATAS_HARIAN' ? 429 : 409,
      headers: TANPA_CACHE,
    });
  }

  after(() => prosesBackup(m.id, 'MANUAL'));
  return sukses({ id: m.id }, { status: 202, headers: TANPA_CACHE });
}
