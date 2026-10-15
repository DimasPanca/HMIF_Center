import { requirePermission } from '@/lib/auth/guard';
import { daftarPengurusLengkap, exportPengurusXlsx } from '@/lib/pengurus/service';

import { TANPA_CACHE, filterDariUrl } from '../_respons';

/** Export daftar pengurus (filter sama dengan halaman) ke Excel. */
export async function GET(request: Request) {
  const guard = await requirePermission('pengurus.read');
  if (!guard.ok) return guard.nilai;
  const baris = await daftarPengurusLengkap(guard.konteks, filterDariUrl(request.url));
  const tanggal = new Date().toISOString().slice(0, 10);
  const isi = await exportPengurusXlsx(baris, `Data Pengurus HMIF — diekspor ${tanggal}`);
  return new Response(new Uint8Array(isi), {
    headers: {
      ...TANPA_CACHE,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="data-pengurus-${tanggal}.xlsx"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
