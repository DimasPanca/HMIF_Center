import { z } from 'zod';

import { SkemaGeserKartu } from '@/components/kanban/schema';
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requirePermission('kanban.update');
  if (!guard.ok) {
    const body = (await guard.nilai.json()) as { error?: { code?: string; message?: string } };
    return gagal(body.error?.code ?? 'TIDAK_BERWENANG', body.error?.message ?? 'Akses ditolak.', {
      status: guard.nilai.status,
      headers: TANPA_CACHE,
    });
  }
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return gagal('TIDAK_VALID', 'ID kartu tidak valid.', { status: 400 });
  }
  const input = SkemaGeserKartu.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return gagal('TIDAK_VALID', 'Perubahan kartu tidak valid.', { status: 400, details: input.error.issues });
  }
  const hasil = await withAuditContext(request, guard.konteks, async (tx) => {
    const kartu = await tx.kanban_card.findUnique({
      where: { id },
      select: {
        id: true,
        departemen_id: true,
        divisi_id: true,
        proker: { select: { periode_id: true, departemen_id: true } },
      },
    });
    if (!kartu) return { ok: false as const, code: 'TIDAK_DITEMUKAN', status: 404 };
    if (
      !kartu.departemen_id ||
      kartu.divisi_id ||
      (kartu.proker &&
        (kartu.proker.periode_id !== guard.konteks.periodeId ||
          kartu.proker.departemen_id !== kartu.departemen_id))
    ) {
      return { ok: false as const, code: 'TIDAK_BERWENANG', status: 403 };
    }
    if (!guard.konteks.roles.includes('ADMIN')) {
      // Role dan departemen wajib cocok pada baris yang sama; gabungan ID role lain tidak cukup.
      const role = await tx.user_role.findFirst({
        where: {
          user_id: guard.konteks.sesi.userId,
          periode_id: guard.konteks.periodeId,
          departemen_id: kartu.departemen_id,
          role: { in: ['KADEPT', 'ANGGOTA'] },
        },
        select: { id: true },
      });
      if (!role) return { ok: false as const, code: 'TIDAK_BERWENANG', status: 403 };
    }
    const tersimpan = await tx.kanban_card.update({
      where: { id },
      data: { kolom: input.data.kolom, urutan: input.data.urutan },
      select: { id: true, kolom: true, urutan: true },
    });
    return { ok: true as const, data: tersimpan };
  });
  if (!hasil.ok) {
    return gagal(hasil.code, hasil.code === 'TIDAK_DITEMUKAN' ? 'Kartu tidak ditemukan.' : 'Anda tidak berwenang mengubah kartu ini.', { status: hasil.status, headers: TANPA_CACHE });
  }
  return sukses(hasil.data, { headers: TANPA_CACHE });
}
