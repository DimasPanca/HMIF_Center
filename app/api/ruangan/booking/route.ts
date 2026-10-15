import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { buatBooking, daftarBooking } from '@/lib/ruangan/service';

import { TANPA_CACHE, idSah, responsRuangan } from '../_respons';

/** Booking periode aktif per bulan (`?bulan=YYYY-MM`, `?ruangan=<id>`). */
export async function GET(request: Request) {
  const baca = await requirePermission('ruangan.read');
  const guard = baca.ok ? baca : await requirePermission('ruangan.create');
  if (!guard.ok) return guard.nilai;
  const p = new URL(request.url).searchParams;
  const ruangan = p.get('ruangan') ?? undefined;
  return sukses(
    await daftarBooking(guard.konteks, { bulan: p.get('bulan') ?? undefined, ruangan: ruangan && idSah(ruangan) ? ruangan : undefined }),
    { headers: TANPA_CACHE },
  );
}

/**
 * Catat peminjaman. Bentrok dijawab 409 `BENTROK` berisi detail jadwal lain;
 * kirim ulang dengan `lanjutkan_meski_bentrok: true` untuk tetap menyimpan
 * (PRD F-14.2: peringatan, bukan blokir).
 */
export async function POST(request: Request) {
  const guard = await requirePermission('ruangan.create');
  if (!guard.ok) return guard.nilai;
  const body = await request.json().catch(() => null);
  return responsRuangan(await withAuditContext(request, guard.konteks, (tx) => buatBooking(tx, guard.konteks, body)), 201);
}
