import { idSah, idTidakValid } from '@/app/api/rab/_respons';
import { requirePermission } from '@/lib/auth/guard';
import { gagal } from '@/lib/http/respond';
import { eksporRabXlsx, namaBerkasRab } from '@/lib/rab/excel-export';
import { dataEksporRab } from '@/lib/rab/service';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Unduh RAB acara sebagai Excel 4 sheet berstruktur identik template asli
 * (T-090). Hak baca sama dengan grid RAB: pimpinan, Kadept PIC, panitia.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!idSah(kepanitiaanId)) return idTidakValid();

  const data = await dataEksporRab(guard.konteks, kepanitiaanId);
  if (data === null) return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', { status: 404 });
  if (data === 'TERBATAS') return gagal('TIDAK_BERWENANG', 'RAB acara ini hanya dapat diunduh pimpinan, Kadept penanggung jawab, dan panitianya.', { status: 403 });

  const isi = await eksporRabXlsx(data);
  const nama = namaBerkasRab(data.namaAcara, new Date());
  return new Response(new Uint8Array(isi), {
    headers: {
      'Content-Type': MIME_XLSX,
      'Content-Disposition': `attachment; filename="${nama.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
