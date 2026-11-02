/**
 * Lapor bug (ADR-060 §5). POST multipart: `deskripsi`, `halaman`, `peramban`, `lampiran` (opsional).
 * Semua pengguna aktif; dibatasi per jam per pengguna.
 */

import { konteksSaatIni } from '@/lib/auth/guard';
import { buatLaporan, STATUS_HTTP_BUG } from '@/lib/bug/service';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { cekBatas, respons429 } from '@/lib/security/rate-limit';

const MAKS_BADAN = 4.4 * 1024 * 1024;

export async function POST(request: Request) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) return gagal('TIDAK_TERAUTENTIKASI', 'Silakan masuk terlebih dahulu.', { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > MAKS_BADAN)
    return gagal('VALIDASI_GAGAL', 'Tangkapan layar terlalu besar (maksimal 4 MB).', { status: 413 });

  const batas = await cekBatas(`bug:${konteks.sesi.userId}`, 10, 60 * 60);
  if (!batas.ok) return respons429(batas, 'Terlalu banyak laporan dalam satu jam. Coba lagi nanti.');

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return gagal('VALIDASI_GAGAL', 'Laporan tidak dapat dibaca.', { status: 422 });
  }
  const teks = (k: string) => (typeof data.get(k) === 'string' ? (data.get(k) as string) : undefined);
  const berkas = data.get('lampiran');
  const lampiran = berkas instanceof File && berkas.size > 0 ? Buffer.from(await berkas.arrayBuffer()) : null;

  const h = await buatLaporan(
    (fn) => withAuditContext(request, konteks, fn),
    konteks,
    { deskripsi: teks('deskripsi') ?? '', halaman: teks('halaman'), peramban: teks('peramban') },
    lampiran,
  );
  return h.ok ? sukses(h.nilai, { status: 201 }) : gagal(h.kode, h.pesan, { status: STATUS_HTTP_BUG[h.kode] });
}
