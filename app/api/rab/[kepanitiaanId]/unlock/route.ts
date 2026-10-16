import { jalankanAksiStatus } from '@/app/api/rab/_status';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

/**
 * Kembali ke DRAFT, `{ alasan }` WAJIB (≥ 10 karakter, tercatat di
 * rab_meta.alasan_buka_kunci dan audit_log). Service memutuskan di dalam
 * transaksi (baris terkunci) jenisnya:
 *   DISETUJUI → DRAFT  buka kunci — `rab.lock`
 *   DIAJUKAN  → DRAFT  dikembalikan dengan catatan — `rab.lock` atau Ketua Pelaksana
 */
export async function POST(request: Request, context: RouteContext) {
  return jalankanAksiStatus(request, (await context.params).kepanitiaanId, 'buka');
}
