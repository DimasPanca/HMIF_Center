import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { gagal, sukses } from '@/lib/http/respond';
import { analisisLpj, muatBahanLpj } from '@/lib/lpj/analyze';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/**
 * Analisis keuangan LPJ (T-104). `langsung` = dihitung SAAT INI dari RAB, nota
 * terverifikasi, dan pemasukan; `snapshot` = yang dibekukan saat LPJ
 * di-generate (T-105) — LPJ terbit selalu menampilkan snapshot, bukan hitungan ulang.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('lpj.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const bahan = await muatBahanLpj(guard.konteks, kepanitiaanId);
  if (bahan === null)
    return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  if (bahan === 'TERBATAS')
    return gagal('TIDAK_BERWENANG', 'Angka keuangan acara ini bukan hak Anda.', {
      status: 403,
      headers: TANPA_CACHE,
    });
  const lpj = await db.lpj.findUnique({
    where: { kepanitiaan_id: kepanitiaanId },
    select: { analisis: true, status: true },
  });
  return sukses(
    { langsung: analisisLpj(bahan), snapshot: lpj?.analisis ?? null, status: lpj?.status ?? null },
    { headers: TANPA_CACHE },
  );
}
