import { z } from 'zod';

import { SkemaBuatKartu } from '@/components/kanban/schema';
import type { KartuKanban } from '@/components/kanban/types';
import { requirePermission } from '@/lib/auth/guard';
import { lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

async function responsGuard(response: Response) {
  const body = (await response.json()) as { error?: { code?: string; message?: string } };
  return gagal(body.error?.code ?? 'TIDAK_BERWENANG', body.error?.message ?? 'Akses ditolak.', {
    status: response.status,
    headers: TANPA_CACHE,
  });
}

export async function GET(request: Request) {
  const guard = await requirePermission('kanban.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const departemenId = new URL(request.url).searchParams.get('departemen_id');
  if (!departemenId || !z.uuid().safeParse(departemenId).success) {
    return gagal('TIDAK_VALID', 'ID departemen tidak valid.', { status: 400 });
  }
  const departemen = await db.departemen.findUnique({ where: { id: departemenId }, select: { id: true } });
  if (!departemen) return gagal('TIDAK_DITEMUKAN', 'Departemen tidak ditemukan.', { status: 404 });
  if (
    lingkupUntuk(guard.konteks.roles, 'kanban.read') === 'DEPARTEMEN' &&
    !guard.konteks.departemenIds.includes(departemenId)
  ) {
    return gagal('TIDAK_BERWENANG', 'Anda tidak memiliki akses ke departemen ini.', {
      status: 403,
      headers: TANPA_CACHE,
    });
  }

  const baris = await db.kanban_card.findMany({
    where: {
      departemen_id: departemenId,
      OR: [{ proker_id: null }, { proker: { periode_id: guard.konteks.periodeId } }],
    },
    select: {
      id: true,
      departemen_id: true,
      proker_id: true,
      proker: { select: { nama: true } },
      judul: true,
      deskripsi: true,
      kolom: true,
      prioritas: true,
      assignee_id: true,
      app_user_kanban_card_assignee_idToapp_user: {
        select: { nama_lengkap: true, avatar_path: true },
      },
      deadline: true,
      urutan: true,
      checklist_item: { select: { selesai: true } },
    },
    orderBy: [{ urutan: 'asc' }, { created_at: 'asc' }],
  });
  const data: KartuKanban[] = baris.map((item) => ({
    id: item.id,
    departemen_id: item.departemen_id ?? departemenId,
    proker_id: item.proker_id,
    proker_nama: item.proker?.nama ?? null,
    judul: item.judul,
    deskripsi: item.deskripsi,
    kolom: item.kolom,
    prioritas: item.prioritas,
    assignee_id: item.assignee_id,
    assignee_nama: item.app_user_kanban_card_assignee_idToapp_user?.nama_lengkap ?? null,
    avatar_path: item.app_user_kanban_card_assignee_idToapp_user?.avatar_path ?? null,
    deadline: item.deadline?.toISOString().slice(0, 10) ?? null,
    urutan: item.urutan,
    checklist_selesai: item.checklist_item.filter((entry) => entry.selesai).length,
    checklist_total: item.checklist_item.length,
  }));
  return sukses(data, { headers: TANPA_CACHE });
}

export async function POST(request: Request) {
  const guard = await requirePermission('kanban.create');
  if (!guard.ok) return responsGuard(guard.nilai);
  const input = SkemaBuatKartu.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return gagal('TIDAK_VALID', 'Data kartu tidak valid.', { status: 400, details: input.error.issues });
  }
  const { departemen_id, proker_id, judul, deskripsi, prioritas, assignee_id, deadline } = input.data;
  const hasil = await withAuditContext(request, async (tx) => {
    const dept = await tx.departemen.findUnique({ where: { id: departemen_id }, select: { id: true } });
    if (!dept) return { ok: false as const, code: 'TIDAK_DITEMUKAN', status: 404 };
    if (proker_id) {
      const proker = await tx.proker.findUnique({
        where: { id: proker_id },
        select: { departemen_id: true, periode_id: true },
      });
      if (!proker || proker.departemen_id !== departemen_id || proker.periode_id !== guard.konteks.periodeId) {
        return { ok: false as const, code: 'TIDAK_VALID', status: 400 };
      }
    }
    if (assignee_id) {
      const pengurus = await tx.user_role.findFirst({
        where: { user_id: assignee_id, departemen_id, periode_id: guard.konteks.periodeId, app_user: { is_active: true } },
        select: { id: true },
      });
      if (!pengurus) return { ok: false as const, code: 'TIDAK_VALID', status: 400 };
    }
    if (!guard.konteks.roles.includes('ADMIN')) {
      const role = await tx.user_role.findFirst({
        where: {
          user_id: guard.konteks.sesi.userId,
          periode_id: guard.konteks.periodeId,
          departemen_id,
          role: { in: ['KADEPT', 'ANGGOTA'] },
        },
        select: { id: true },
      });
      if (!role) return { ok: false as const, code: 'TIDAK_BERWENANG', status: 403 };
    }
    const kartu = await tx.kanban_card.create({
      data: {
        departemen_id,
        proker_id,
        judul,
        deskripsi,
        prioritas,
        assignee_id,
        deadline: deadline ? new Date(`${deadline}T00:00:00.000Z`) : null,
        created_by: guard.konteks.sesi.userId,
      },
      select: { id: true },
    });
    return { ok: true as const, id: kartu.id };
  });
  if (!hasil.ok) {
    return gagal(hasil.code, hasil.code === 'TIDAK_BERWENANG' ? 'Anda tidak berwenang menambah kartu di departemen ini.' : 'Kartu tidak dapat dibuat.', { status: hasil.status });
  }
  return sukses({ id: hasil.id }, { status: 201, headers: TANPA_CACHE });
}
