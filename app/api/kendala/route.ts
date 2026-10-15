import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { PRIORITAS, STATUS_KENDALA } from '@/lib/kendala/skema';
import { buatKendala, daftarKendala } from '@/lib/kendala/service';

import { TANPA_CACHE, responsKendala } from './_respons';

const SkemaFilter = z.object({
  departemen: z.uuid().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum([...STATUS_KENDALA, 'AKTIF']).optional(),
  prioritas: z.enum(PRIORITAS).optional(),
});

/** Daftar kendala periode berjalan dalam lingkup baca pengguna (+ pencarian teks penuh). */
export async function GET(request: Request) {
  const guard = await requirePermission('kendala.read');
  if (!guard.ok) return guard.nilai;
  const p = new URL(request.url).searchParams;
  const f = SkemaFilter.safeParse(Object.fromEntries([...p.entries()].filter(([, v]) => v)));
  if (!f.success) return gagal('VALIDASI_GAGAL', 'Filter tidak valid.', { status: 422, headers: TANPA_CACHE });
  return sukses(
    await daftarKendala(guard.konteks, { departemenId: f.data.departemen, q: f.data.q, status: f.data.status, prioritas: f.data.prioritas }),
    { headers: TANPA_CACHE },
  );
}

/** Lapor kendala baru di satu departemen. */
export async function POST(request: Request) {
  const guard = await requirePermission('kendala.create');
  if (!guard.ok) return guard.nilai;
  const body = (await request.json().catch(() => null)) as { departemen_id?: unknown } | null;
  const dept = z.uuid().safeParse(body?.departemen_id);
  if (!dept.success) return gagal('VALIDASI_GAGAL', 'Departemen wajib dipilih.', { status: 422, headers: TANPA_CACHE });
  return responsKendala(await withAuditContext(request, guard.konteks, (tx) => buatKendala(tx, guard.konteks, dept.data, body)), 201);
}
