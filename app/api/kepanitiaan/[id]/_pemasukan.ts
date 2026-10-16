import { z } from 'zod';

import { requirePermission, type Konteks } from '@/lib/auth/guard';
import { gagal, sukses } from '@/lib/http/respond';
import { STATUS_GAGAL_PEMASUKAN, muatPemasukan, type Hasil } from '@/lib/rab/pemasukan';

export const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export function responsPemasukan<T>(h: Hasil<T>, status = 200) {
  return h.ok
    ? sukses(h.nilai, { status, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { status: STATUS_GAGAL_PEMASUKAN[h.kode], headers: TANPA_CACHE });
}

export const idSah = (id: string | null | undefined): id is string => !!id && z.uuid().safeParse(id).success;

/**
 * Guard bersama route pemasukan/peserta: sesi + acara terlihat + angka
 * keuangan boleh dibaca (pimpinan, Kadept PIC, panitia). Hak tulis/hapus
 * diputuskan service per aksi.
 */
export async function guardPemasukan(id: string): Promise<{ ok: true; konteks: Konteks } | { ok: false; respons: Response }> {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return { ok: false, respons: guard.nilai };
  if (!idSah(id)) return { ok: false, respons: gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE }) };
  const data = await muatPemasukan(guard.konteks, id);
  if (data === null) return { ok: false, respons: gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', { status: 404, headers: TANPA_CACHE }) };
  if (data === 'TERBATAS') {
    return { ok: false, respons: gagal('TIDAK_BERWENANG', 'Data keuangan acara ini bukan hak Anda.', { status: 403, headers: TANPA_CACHE }) };
  }
  return { ok: true, konteks: guard.konteks };
}

/** Jawaban sesudah mutasi: data lengkap terbaru supaya ringkasan klien = baris server. */
export async function dataTerbaru(konteks: Konteks, id: string) {
  return sukses(await muatPemasukan(konteks, id), { headers: TANPA_CACHE });
}
