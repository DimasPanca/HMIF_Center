import { z } from 'zod';

import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_KENDALA, type Hasil } from '@/lib/kendala/service';

export const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export function responsKendala<T>(h: Hasil<T>, status = 200) {
  return h.ok
    ? sukses(h.nilai, { status, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_KENDALA[h.kode], headers: TANPA_CACHE });
}

export const idSah = (id: string) => z.uuid().safeParse(id).success;
export const idTidakValid = () => gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
export const tidakAda = () => gagal('TIDAK_DITEMUKAN', 'Kendala tidak ditemukan.', { status: 404, headers: TANPA_CACHE });

export interface RouteId {
  params: Promise<{ id: string }>;
}
