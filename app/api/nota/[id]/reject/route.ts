import { tolakNota } from '@/lib/nota/verifikasi';

import { jalankanAksiNota } from '@/app/api/nota/[id]/_aksi';

/** Tolak nota `{ alasan }` — tanpa alasan ditolak server (422). */
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return jalankanAksiNota(request, context.params, tolakNota);
}
