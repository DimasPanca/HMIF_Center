import { konteksSaatIni } from '@/lib/auth/guard';
import { ambilLampiran } from '@/lib/bug/service';
import { gagal } from '@/lib/http/respond';

/** Tangkapan layar laporan bug — hanya pelapor dan Admin (ADR-060 §5). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) return gagal('TIDAK_TERAUTENTIKASI', 'Silakan masuk terlebih dahulu.', { status: 401 });
  const { id } = await params;
  const l = await ambilLampiran(konteks, id);
  if (!l) return gagal('TIDAK_DITEMUKAN', 'Lampiran tidak ditemukan.', { status: 404 });
  return new Response(new Uint8Array(l.isi), {
    headers: {
      'Content-Type': l.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
