import { z } from 'zod';

import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_PENGURUS, type Hasil } from '@/lib/pengurus/service';

export const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export function responsPengurus<T>(h: Hasil<T>, status = 200) {
  return h.ok
    ? sukses(h.nilai, { status, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_PENGURUS[h.kode], headers: TANPA_CACHE });
}

export const SkemaFilterPengurus = z.object({
  q: z.string().trim().max(100).optional(),
  departemen: z.uuid().optional(),
  status: z.enum(['aktif', 'nonaktif', 'semua']).optional(),
  periode: z.uuid().optional(),
});

/** Filter dari query; nilai tak sah diabaikan satu per satu. */
export function filterDariUrl(url: string) {
  const p = new URL(url).searchParams;
  const hasil: Record<string, string> = {};
  for (const k of Object.keys(SkemaFilterPengurus.shape) as (keyof typeof SkemaFilterPengurus.shape)[]) {
    const v = p.get(k);
    if (v && SkemaFilterPengurus.shape[k].safeParse(v).success) hasil[k] = v.trim();
  }
  return hasil as z.infer<typeof SkemaFilterPengurus>;
}
