import { setujuiNota } from '@/lib/nota/verifikasi';

import { jalankanAksiNota } from '@/app/api/nota/[id]/_aksi';

/** Setujui nota (T-102): INV-28 diperiksa ulang; RAB DISETUJUI → REALISASI pada nota pertama. */
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return jalankanAksiNota(request, context.params, (tx, k, id) => setujuiNota(tx, k, id));
}
