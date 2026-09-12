import { requirePermission } from '@/lib/auth/guard';
import { gagal, sukses } from '@/lib/http/respond';

import { muatDashboard } from './data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const guard = await requirePermission('master_gantt.read');
  if (!guard.ok) {
    guard.nilai.headers.set('Cache-Control', 'no-store');
    return guard.nilai;
  }

  try {
    return sukses(await muatDashboard(guard.konteks), { headers: TANPA_CACHE });
  } catch (error) {
    console.error('Dashboard kontekstual belum dapat dimuat.', error);
    return gagal('GAGAL_MEMUAT_DASHBOARD', 'Dashboard belum dapat dimuat.', {
      status: 500,
      headers: TANPA_CACHE,
    });
  }
}
