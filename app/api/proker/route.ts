import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { SkemaFilterProker } from '@/lib/proker/schema';
import { buatProker, daftarProker, type GagalProker } from '@/lib/proker/service';

const STATUS_GAGAL: Record<GagalProker['kode'], number> = {
  TIDAK_DITEMUKAN: 404,
  DI_LUAR_LINGKUP: 403,
  TIDAK_VALID: 422,
  TIDAK_ADA_PERIODE_AKTIF: 409,
};

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

function responsGagal(hasil: GagalProker) {
  return jsonTanpaCache(
    {
      ok: false,
      error: {
        code: hasil.kode,
        message: hasil.pesan,
        ...(hasil.isu ? { details: hasil.isu } : {}),
      },
    },
    { status: STATUS_GAGAL[hasil.kode] },
  );
}

export async function GET(request: Request) {
  const guard = await requirePermission('proker.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  const hasilFilter = SkemaFilterProker.safeParse(query);
  if (!hasilFilter.success) {
    return jsonTanpaCache(
      {
        ok: false,
        error: {
          code: 'TIDAK_VALID',
          message: 'Filter daftar proker tidak valid.',
          details: hasilFilter.error.issues.map((isu) => ({
            path: isu.path.join('.'),
            pesan: isu.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  const data = await daftarProker(guard.konteks.periodeId, hasilFilter.data);
  return jsonTanpaCache({ ok: true, data });
}

export async function POST(request: Request) {
  const guard = await requirePermission('proker.create');
  if (!guard.ok) return responsGuard(guard.nilai);

  const body: unknown = await request.json().catch(() => null);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => buatProker(tx, guard.konteks, body));

  if (!hasil.ok) return responsGagal(hasil);
  return jsonTanpaCache({ ok: true, data: hasil.nilai }, { status: 201 });
}
