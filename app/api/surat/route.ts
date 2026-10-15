import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { sukses } from '@/lib/http/respond';
import { MAKS_EXPORT, daftarArsip, filterDariQuery, semuaArsip } from '@/lib/surat/arsip';
import { simpanDraft } from '@/lib/surat/draft';
import { MIME_XLSX, buatExcelArsip } from '@/lib/surat/export-daftar';

import { TANPA_CACHE, bacaBody, responsGuard, responsSurat } from '@/app/api/surat/_respons';

/**
 * Arsip surat (T-063): 50 baris per halaman dengan kursor (`?cursor=`), filter
 * lewat query yang sama dengan URL halaman arsip. `?format=xlsx` mengekspor
 * SELURUH baris yang cocok filter (maks. 5000) sebagai Excel.
 */
export async function GET(request: Request) {
  const guard = await requirePermission('surat.read');
  if (!guard.ok) return responsGuard(guard.nilai);

  const params = new URL(request.url).searchParams;
  const filter = filterDariQuery(params);

  if (params.get('format') === 'xlsx') {
    const baris = await semuaArsip(guard.konteks, filter);
    const tanggal = new Date().toISOString().slice(0, 10);
    const isi = await buatExcelArsip(
      baris,
      `Arsip Surat HMIF — diekspor ${tanggal}${baris.length >= MAKS_EXPORT ? ` (dibatasi ${MAKS_EXPORT} baris)` : ''}`,
    );
    return new Response(new Uint8Array(isi), {
      headers: {
        ...TANPA_CACHE,
        'Content-Type': MIME_XLSX,
        'Content-Disposition': `attachment; filename="arsip-surat-${tanggal}.xlsx"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return sukses(await daftarArsip(guard.konteks, filter), { headers: TANPA_CACHE });
}

/** Membuat draft surat. Pembaruan berikutnya (auto-save) lewat PATCH /api/surat/[id]. */
export async function POST(request: Request) {
  const guard = await requirePermission('surat.create');
  if (!guard.ok) return responsGuard(guard.nilai);

  const body = await bacaBody(request);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => simpanDraft(tx, guard.konteks, body, null));
  return responsSurat(hasil, 201);
}
