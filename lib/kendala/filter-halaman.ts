import { z } from 'zod';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { PRIORITAS, STATUS_KENDALA } from '@/lib/kendala/skema';
import type { FilterKendala } from '@/lib/kendala/service';

export type ParamCari = Record<string, string | string[] | undefined>;

const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/**
 * Query string → filter service. Nilai tak dikenal diabaikan (bukan galat):
 * tautan lama/terpotong tetap membuka daftar. Status kosong = semua status;
 * tanpa parameter sama sekali = yang belum selesai.
 */
export function bacaFilter(sp: ParamCari) {
  const q = satu(sp.q)?.slice(0, 200);
  const statusMentah = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = z.enum([...STATUS_KENDALA, 'AKTIF']).safeParse(statusMentah);
  const prioritas = z.enum(PRIORITAS).safeParse(satu(sp.prioritas));
  const departemen = z.uuid().safeParse(satu(sp.departemen));
  const periode = z.uuid().safeParse(satu(sp.periode));
  const f: FilterKendala = {
    q,
    status: status.success ? status.data : statusMentah === '' ? undefined : 'AKTIF',
    prioritas: prioritas.success ? prioritas.data : undefined,
    departemenId: departemen.success ? departemen.data : undefined,
    periodeId: periode.success ? periode.data : undefined,
  };
  return {
    f,
    nilai: { q, status: statusMentah === '' ? '' : f.status, prioritas: f.prioritas, departemen: f.departemenId, periode: f.periodeId },
  };
}

/** Periode berjalan dulu, lalu periode berstatus ARSIP. */
export async function pilihanPeriode(konteks: Konteks) {
  const semua = await db.periode.findMany({
    where: { OR: [{ id: konteks.periodeId }, { status: 'ARSIP' }] },
    orderBy: { tanggal_mulai: 'desc' },
    select: { id: true, nama: true },
  });
  return [...semua.filter((p) => p.id === konteks.periodeId), ...semua.filter((p) => p.id !== konteks.periodeId).map((p) => ({ ...p, nama: `${p.nama} (arsip)` }))];
}
