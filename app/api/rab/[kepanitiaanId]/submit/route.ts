import { jalankanAksiStatus } from '@/app/api/rab/_status';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

/** DRAFT → DIAJUKAN: panitia acara mengajukan RAB ke Ketua Pelaksana & Bendahara. */
export async function POST(request: Request, context: RouteContext) {
  return jalankanAksiStatus(request, (await context.params).kepanitiaanId, 'ajukan');
}
