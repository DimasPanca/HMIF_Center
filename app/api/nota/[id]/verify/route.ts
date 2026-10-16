import { batalkanVerifikasi, setujuiNota } from '@/lib/nota/verifikasi';

import { jalankanAksiNota } from '@/app/api/nota/[id]/_aksi';

/** Setujui nota (T-102): INV-28 diperiksa ulang; RAB DISETUJUI → REALISASI pada nota pertama. */
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return jalankanAksiNota(request, context.params, (tx, k, id) => setujuiNota(tx, k, id));
}

/**
 * Batalkan verifikasi `{ alasan }` (T-103): nota kembali MENUNGGU_VERIFIKASI;
 * PENGELUARAN & RAB AKTUAL dihitung ulang penuh saat berikutnya dibaca.
 */
export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return jalankanAksiNota(request, context.params, batalkanVerifikasi);
}
