import { z } from 'zod';

import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_NOTULENSI, type HasilNotulensi } from '@/lib/notulensi/service';

export const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function responsGuard(response: Response) {
  const body = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } };
  return gagal(body.error?.code ?? 'TIDAK_BERWENANG', body.error?.message ?? 'Akses ditolak.', {
    status: response.status,
    details: body.error?.details,
    headers: TANPA_CACHE,
  });
}

export function responsNotulensi<T>(hasil: HasilNotulensi<T>, status = 200) {
  if (!hasil.ok) {
    return gagal(hasil.kode, hasil.pesan, {
      status: STATUS_GAGAL_NOTULENSI[hasil.kode],
      details: hasil.details,
      headers: TANPA_CACHE,
    });
  }
  return sukses(hasil.nilai, { status, headers: TANPA_CACHE });
}

export function idSah(...ids: string[]): boolean {
  return ids.every((id) => z.uuid().safeParse(id).success);
}

export function idTidakValid() {
  return gagal('TIDAK_VALID', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
}

export function tidakDitemukan() {
  return gagal('TIDAK_DITEMUKAN', 'Notulensi tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}

export async function bacaBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
