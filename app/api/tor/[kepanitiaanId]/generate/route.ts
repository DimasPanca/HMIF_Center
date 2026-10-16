import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { gagal, sukses } from '@/lib/http/respond';
import { storage } from '@/lib/storage';
import { MIME_DOCX, dokumenTorTerakhir, generateTor } from '@/lib/tor/generate';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };
const STATUS = {
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  BELUM_LENGKAP: 422,
  GAGAL: 502,
} as const;

/**
 * Generate TOR (T-095): anggaran ditarik ulang dari RAB, bagian wajib yang
 * kosong → 422 beserta daftar `kurang`. Hasil dicatat sebagai baris `dokumen`.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const h = await generateTor(guard.konteks, kepanitiaanId);
  if (!h.ok) {
    return gagal(h.kode, h.pesan, {
      status: STATUS[h.kode],
      headers: TANPA_CACHE,
      ...(h.kurang ? { details: { kurang: h.kurang } } : {}),
    });
  }
  return sukses(
    { dokumen_id: h.dokumen_id, ukuran: h.ukuran },
    { status: 201, headers: TANPA_CACHE },
  );
}

/** Unduh ulang TOR terakhir — dialirkan dari bucket privat, tanpa signed URL. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const d = await dokumenTorTerakhir(guard.konteks, kepanitiaanId);
  if (!d)
    return gagal('TIDAK_DITEMUKAN', 'TOR acara ini belum pernah dibuat.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  let isi: Buffer;
  try {
    isi = await storage.get(d.storage_key);
  } catch (e) {
    console.error(`[tor] ${kepanitiaanId}: berkas ${d.storage_key} tidak dapat dibaca`, e);
    return gagal('TIDAK_DITEMUKAN', 'Berkas TOR tidak ditemukan di penyimpanan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  }
  const nama = `TOR ${d.nama_acara}`
    .replace(/[\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return new Response(new Uint8Array(isi), {
    status: 200,
    headers: {
      ...TANPA_CACHE,
      'Content-Type': MIME_DOCX,
      'Content-Length': String(isi.length),
      'Content-Disposition': `attachment; filename="${nama.replace(/[^\x20-\x7e]/g, '_')}.docx"; filename*=UTF-8''${encodeURIComponent(nama)}.docx`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
