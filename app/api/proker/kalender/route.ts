import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/guard';
import { kalenderTerkunci } from '@/lib/proker/service';

function jsonTanpaCache(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function responsGuard(response: NextResponse) {
  const body = (await response.json()) as {
    error?: { code?: unknown; message?: unknown; pesan?: unknown };
  };
  const code = typeof body.error?.code === 'string' ? body.error.code : 'TIDAK_BERWENANG';
  const message =
    typeof body.error?.message === 'string'
      ? body.error.message
      : typeof body.error?.pesan === 'string'
        ? body.error.pesan
        : 'Permintaan tidak dapat diproses.';

  return jsonTanpaCache({ ok: false, error: { code, message } }, { status: response.status });
}

export async function GET() {
  const guard = await requirePermission('proker.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const data = await kalenderTerkunci(guard.konteks.periodeId);
  return jsonTanpaCache({ ok: true, data });
}
