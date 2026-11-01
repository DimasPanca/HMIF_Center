import { requirePermission } from '@/lib/auth/guard';
import { eksporXlsx } from '@/lib/form/respons';
import { gagal } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Unduh semua respons sebagai .xlsx — satu baris per respons, satu kolom per pertanyaan. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const h = await eksporXlsx(guard.konteks, id);
  if (!h) return gagal('TIDAK_DITEMUKAN', 'Respons tidak ditemukan.', { status: 404 });
  return new Response(new Uint8Array(h.isi), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${h.nama.replace(/[^\w.-]+/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
