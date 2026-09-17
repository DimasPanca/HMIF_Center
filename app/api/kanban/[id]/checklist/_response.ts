import type { Konteks } from '@/lib/auth/guard';
import { lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { HasilChecklist } from '@/lib/kanban/checklist';
import { STATUS_GAGAL_CHECKLIST } from '@/lib/kanban/checklist';
import { gagal, sukses } from '@/lib/http/respond';

export const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function responsGuard(response: Response) {
  const body = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } };
  return gagal(body.error?.code ?? 'TIDAK_BERWENANG', body.error?.message ?? 'Akses ditolak.', {
    status: response.status,
    details: body.error?.details,
    headers: TANPA_CACHE,
  });
}

export function responsChecklist<T>(hasil: HasilChecklist<T>, status = 200) {
  if (!hasil.ok) {
    return gagal(hasil.kode, hasil.pesan, {
      status: STATUS_GAGAL_CHECKLIST[hasil.kode],
      details: hasil.details,
      headers: TANPA_CACHE,
    });
  }
  return sukses(hasil.nilai, { status, headers: TANPA_CACHE });
}

export async function lingkupBacaKartu(
  konteks: Konteks,
  cardId: string,
): Promise<HasilChecklist<{ departemenId: string }>> {
  const kartu = await db.kanban_card.findUnique({
    where: { id: cardId },
    select: {
      departemen_id: true,
      divisi_id: true,
      proker: { select: { periode_id: true, departemen_id: true } },
    },
  });
  if (!kartu) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Kartu tidak ditemukan.' };
  const tidakSesuai =
    !kartu.departemen_id ||
    kartu.divisi_id !== null ||
    (kartu.proker !== null &&
      (kartu.proker.periode_id !== konteks.periodeId || kartu.proker.departemen_id !== kartu.departemen_id));
  if (
    tidakSesuai ||
    (lingkupUntuk(konteks.roles, 'kanban.read') === 'DEPARTEMEN' &&
      !konteks.departemenIds.includes(kartu.departemen_id!))
  ) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Anda tidak berwenang membaca checklist kartu ini.',
    };
  }
  return { ok: true, nilai: { departemenId: kartu.departemen_id! } };
}
