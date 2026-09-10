import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { editProkerTerkunci, STATUS_GAGAL as STATUS_GAGAL_EDIT } from '@/lib/proker/edit-terkunci';
import { detailProker, dalamLingkup, ubahProker } from '@/lib/proker/service';

const SkemaId = z.uuid();
const TANPA_CACHE = { 'Cache-Control': 'no-store' };
const STATUS_GAGAL: Record<string, number> = {
  ...STATUS_GAGAL_EDIT,
  TIDAK_DITEMUKAN: 404,
  DI_LUAR_LINGKUP: 403,
  TIDAK_VALID: 422,
  TIDAK_ADA_PERIODE_AKTIF: 409,
  STATUS_TIDAK_SESUAI: 409,
};
const STATUS_EDIT_BIASA = ['DRAFT', 'PERLU_REVISI', 'DITOLAK'] as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function responsGuard(response: Response) {
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

  return gagal(code, message, { status: response.status, headers: TANPA_CACHE });
}

function responsIdTidakValid() {
  return gagal('TIDAK_VALID', 'ID proker tidak valid.', {
    status: 422,
    headers: TANPA_CACHE,
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('proker.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) return responsIdTidakValid();

  const data = await detailProker(id);
  if (
    !data ||
    data.periode_id !== guard.konteks.periodeId ||
    !dalamLingkup(guard.konteks, 'proker.read', data.departemen_id)
  ) {
    return gagal('TIDAK_DITEMUKAN', 'Proker tidak ditemukan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  }

  return sukses(data, { headers: TANPA_CACHE });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('proker.update');
  if (!guard.ok) return responsGuard(guard.nilai);

  const { id } = await context.params;
  if (!SkemaId.safeParse(id).success) return responsIdTidakValid();

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return gagal('TIDAK_VALID', 'Perubahan proker harus berupa objek JSON.', {
      status: 422,
      headers: TANPA_CACHE,
    });
  }

  const perubahan = body as Record<string, unknown>;
  const hasil = await withAuditContext(request, async (tx) => {
    const proker = await detailProker(id, tx);
    if (!proker || proker.periode_id !== guard.konteks.periodeId) {
      return {
        ok: false as const,
        kode: 'TIDAK_DITEMUKAN',
        pesan: 'Proker tidak ditemukan.',
      };
    }

    if (proker.status === 'DISETUJUI') {
      return editProkerTerkunci(tx, guard.konteks, id, perubahan);
    }
    if (STATUS_EDIT_BIASA.some((status) => status === proker.status)) {
      return ubahProker(tx, guard.konteks, id, perubahan);
    }

    return {
      ok: false as const,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: `Proker berstatus ${proker.status} tidak dapat disunting.`,
    };
  });

  if (!hasil.ok) {
    return gagal(hasil.kode, hasil.pesan, {
      status: STATUS_GAGAL[hasil.kode] ?? 400,
      details: 'isu' in hasil ? hasil.isu : undefined,
      headers: TANPA_CACHE,
    });
  }

  return sukses(hasil.nilai, { headers: TANPA_CACHE });
}
