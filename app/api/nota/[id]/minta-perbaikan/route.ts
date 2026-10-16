import { mintaPerbaikanNota } from '@/lib/nota/verifikasi';

import { jalankanAksiNota } from '@/app/api/nota/[id]/_aksi';

/** Minta perbaikan `{ alasan }` (catatan wajib) → PERLU_PERBAIKAN, kembali ke pengunggah. */
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return jalankanAksiNota(request, context.params, mintaPerbaikanNota);
}
