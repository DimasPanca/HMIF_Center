import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { daftarPenggunaTerlingkup } from '@/lib/auth/invitation';
import { ROLES } from '@/lib/auth/permissions';
import { gagal, sukses } from '@/lib/http/respond';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

const SkemaFilter = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  departemen_id: z.uuid().optional(),
  aktif: z.enum(['true', 'false']).optional(),
});

export async function GET(request: Request) {
  const guard = await requirePermission('user.read');
  if (!guard.ok) return guard.nilai;

  const param = Object.fromEntries(
    [...new URL(request.url).searchParams].filter(([, nilai]) => nilai !== ''),
  );
  const filter = SkemaFilter.safeParse(param);
  if (!filter.success) {
    return gagal('TIDAK_VALID', 'Filter tidak valid.', {
      status: 422,
      details: filter.error.issues.map((i) => ({ path: i.path.join('.'), pesan: i.message })),
      headers: TANPA_CACHE,
    });
  }

  const { aktif, q, ...lain } = filter.data;
  const data = await daftarPenggunaTerlingkup(guard.konteks, {
    ...lain,
    q: q || undefined,
    aktif: aktif === undefined ? undefined : aktif === 'true',
  });
  return sukses(data, { headers: TANPA_CACHE });
}
