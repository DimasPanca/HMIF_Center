import { NextResponse, after } from 'next/server';

import { backupBulanan } from '@/lib/backup/retensi';
import { cronTerotorisasi, jalankanCronHarian } from '@/lib/cron/harian';
import { withServiceContext } from '@/lib/db/with-audit-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Tanggal 1 backup bulanan berjalan di `after()` dalam fungsi yang sama;
// batasnya ini (juga dipasang di vercel.json).
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronTerotorisasi(req.headers.get('authorization'))) {
    return NextResponse.json(
      { ok: false, error: { code: 'TIDAK_BERHAK', message: 'Cron tidak sah.' } },
      { status: 401 },
    );
  }

  const ringkasan = await withServiceContext((tx) => jalankanCronHarian(tx));

  // T-111: cabang tanggal 1 — tetap SATU entri cron (ADR-009). Lifecycle harian
  // sudah selesai & tercatat; backup bulanan + retensi menyusul setelah respons.
  if (ringkasan.tanggal_1) after(() => backupBulanan());

  return NextResponse.json({
    ok: true,
    data: { ...ringkasan, backup_bulanan: ringkasan.tanggal_1 ? 'DIJADWALKAN' : 'BUKAN_TANGGAL_1' },
  });
}
