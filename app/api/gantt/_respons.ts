import { z } from 'zod';

import type { Konteks } from '@/lib/auth/guard';
import { withAuditContext, type TxKlien } from '@/lib/db/with-audit-context';
import { GagalTransaksi, STATUS_GAGAL_GANTT, type Hasil } from '@/lib/gantt/service';
import { gagal, sukses } from '@/lib/http/respond';

export const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export function responsGantt<T>(h: Hasil<T>, status = 200) {
  return h.ok
    ? sukses(h.nilai, { status, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_GANTT[h.kode], headers: TANPA_CACHE });
}

/** Mutasi dalam satu transaksi beraudit; penolakan di tengah jalan membatalkan seluruhnya. */
export async function mutasi<T>(request: Request, konteks: Konteks, fn: (tx: TxKlien) => Promise<Hasil<T>>): Promise<Hasil<T>> {
  try {
    return await withAuditContext(request, konteks, fn);
  } catch (e) {
    if (e instanceof GagalTransaksi) return e.hasil;
    throw e;
  }
}

export const idSah = (id: string) => z.uuid().safeParse(id).success;
export const idTidakValid = () => gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
