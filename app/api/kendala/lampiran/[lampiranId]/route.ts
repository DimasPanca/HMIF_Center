import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { gagal } from '@/lib/http/respond';
import { ambilLampiran, hapusLampiran } from '@/lib/kendala/lampiran';

import { TANPA_CACHE, responsKendala } from '@/app/api/kendala/_respons';

interface RouteContext {
  params: Promise<{ lampiranId: string }>;
}

const idSalah = () => gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });

/** Unduh lampiran dari bucket privat setelah hak baca kendalanya diperiksa. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kendala.read');
  if (!guard.ok) return guard.nilai;
  const { lampiranId } = await context.params;
  if (!z.uuid().safeParse(lampiranId).success) return idSalah();
  const l = await ambilLampiran(guard.konteks, lampiranId);
  if (!l) return gagal('TIDAK_DITEMUKAN', 'Lampiran tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
  const ascii = l.nama.replace(/[^\x20-\x7e]/g, '_');
  return new Response(new Uint8Array(l.isi), {
    headers: {
      ...TANPA_CACHE,
      'Content-Type': l.mime,
      'Content-Length': String(l.isi.length),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(l.nama)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('kendala.read');
  if (!guard.ok) return guard.nilai;
  const { lampiranId } = await context.params;
  if (!z.uuid().safeParse(lampiranId).success) return idSalah();
  return responsKendala(await hapusLampiran(request, guard.konteks, lampiranId));
}
