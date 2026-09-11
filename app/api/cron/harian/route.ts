import { NextResponse } from 'next/server';

import { cronTerotorisasi, jalankanCronHarian } from '@/lib/cron/harian';
import { withServiceContext } from '@/lib/db/with-audit-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!cronTerotorisasi(req.headers.get('authorization'))) {
    return NextResponse.json(
      { ok: false, error: { code: 'TIDAK_BERHAK', message: 'Cron tidak sah.' } },
      { status: 401 },
    );
  }

  const ringkasan = await withServiceContext((tx) => jalankanCronHarian(tx));
  return NextResponse.json({ ok: true, data: ringkasan });
}
