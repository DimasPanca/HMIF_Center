import { jalankanAksiStatus } from '@/app/api/rab/_status';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

/** DIAJUKAN → DISETUJUI (RAB dikunci): `rab.lock` — Bendum, Ketua, Wakil, Admin. */
export async function POST(request: Request, context: RouteContext) {
  return jalankanAksiStatus(request, (await context.params).kepanitiaanId, 'kunci');
}
