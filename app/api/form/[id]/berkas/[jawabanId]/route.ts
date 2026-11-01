import { requirePermission } from '@/lib/auth/guard';
import { ambilBerkas } from '@/lib/form/respons';
import { gagal } from '@/lib/http/respond';

interface RouteContext {
  params: Promise<{ id: string; jawabanId: string }>;
}

/**
 * Berkas jawaban — dialirkan lewat server (bukan signed URL) karena bucket
 * privat dan izinnya = izin membaca respons. `?unduh=1` memaksa unduh.
 */
export async function GET(request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id, jawabanId } = await context.params;
  const b = await ambilBerkas(guard.konteks, id, jawabanId);
  if (!b) return gagal('TIDAK_DITEMUKAN', 'Berkas tidak ditemukan.', { status: 404 });
  const unduh = new URL(request.url).searchParams.get('unduh') === '1';
  return new Response(new Uint8Array(b.isi), {
    headers: {
      'Content-Type': b.mime,
      'Content-Disposition': `${unduh ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(b.nama)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
