import { z } from 'zod';

import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_RAB, type Hasil } from '@/lib/rab/service';

export const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export function responsRab<T>(h: Hasil<T>, status = 200) {
  return h.ok
    ? sukses(h.nilai, { status, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_RAB[h.kode], headers: TANPA_CACHE });
}

export const idSah = (id: string) => z.uuid().safeParse(id).success;
export const idTidakValid = () => gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
