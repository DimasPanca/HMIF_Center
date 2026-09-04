import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { detailProker, ubahProker, type GagalProker } from '@/lib/proker/service';

const STATUS_GAGAL: Record<GagalProker['kode'], number> = {
  TIDAK_DITEMUKAN: 404,
  DI_LUAR_LINGKUP: 403,
  TIDAK_VALID: 422,
  TIDAK_ADA_PERIODE_AKTIF: 409,
};

const SkemaId = z.uuid();

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

function responsIdTidakValid() {
  return jsonTanpaCache(
    {
      ok: false,
      error: { code: 'TIDAK_VALID', message: 'ID proker tidak valid.' },
    },
    { status: 422 },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('proker.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) return responsIdTidakValid();

  const data = await detailProker(id);
  if (!data) {
    return jsonTanpaCache(
      {
        ok: false,
        error: { code: 'TIDAK_DITEMUKAN', message: 'Proker tidak ditemukan.' },
      },
      { status: 404 },
    );
  }

  return jsonTanpaCache({ ok: true, data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('proker.update');
  if (!guard.ok) return responsGuard(guard.nilai);

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) return responsIdTidakValid();

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonTanpaCache(
      {
        ok: false,
        error: { code: 'TIDAK_VALID', message: 'Perubahan proker harus berupa objek JSON.' },
      },
      { status: 422 },
    );
  }

  const hasil = await withAuditContext(request, (tx) =>
    ubahProker(tx, guard.konteks, id, body as Record<string, unknown>),
  );

  if (!hasil.ok) return responsGagal(hasil);
  return jsonTanpaCache({ ok: true, data: hasil.nilai });
}
