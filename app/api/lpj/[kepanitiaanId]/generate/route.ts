import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { bolehBacaLpj } from '@/lib/lpj/generate';
import { STATUS_GAGAL_LPJ, dokumenLpjTerakhir, generateLpj } from '@/lib/lpj/generate';
import { storage } from '@/lib/storage';
import { MIME_DOCX } from '@/lib/tor/generate';

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/**
 * Generate LPJ (T-105): prasyarat & isian wajib → 422 + `details.kurang`;
 * snapshot analisis disimpan; lampiran = master setiap nota terverifikasi.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('lpj.generate');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const h = await generateLpj(guard.konteks, kepanitiaanId, (f) =>
    withAuditContext(request, guard.konteks, f),
  );
  return h.ok
    ? sukses(h.nilai, { status: 201, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, {
        status: STATUS_GAGAL_LPJ[h.kode],
        headers: TANPA_CACHE,
        ...(h.details ? { details: h.details } : {}),
      });
}

/** Unduh LPJ terakhir (`?format=pdf` bila pernah dibuat) — dialirkan dari bucket privat. */
export async function GET(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  if (!bolehBacaLpj(guard.konteks.roles)) {
    return gagal('TIDAK_BERWENANG', 'LPJ tidak dapat Anda buka.', {
      status: 403,
      headers: TANPA_CACHE,
    });
  }
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const pdf = new URL(request.url).searchParams.get('format') === 'pdf';
  const d = await dokumenLpjTerakhir(guard.konteks, kepanitiaanId, pdf ? 'PDF' : 'DOCX');
  if (!d)
    return gagal('TIDAK_DITEMUKAN', 'LPJ acara ini belum pernah dibuat.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  let isi: Buffer;
  try {
    isi = await storage.get(d.storage_key);
  } catch (e) {
    console.error(`[lpj] ${kepanitiaanId}: berkas ${d.storage_key} tidak dapat dibaca`, e);
    return gagal('TIDAK_DITEMUKAN', 'Berkas LPJ tidak ditemukan di penyimpanan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  }
  const nama = `LPJ ${d.nama_acara}`
    .replace(/[\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const ext = pdf ? 'pdf' : 'docx';
  return new Response(new Uint8Array(isi), {
    status: 200,
    headers: {
      ...TANPA_CACHE,
      'Content-Type': pdf ? 'application/pdf' : MIME_DOCX,
      'Content-Length': String(isi.length),
      'Content-Disposition': `attachment; filename="${nama.replace(/[^\x20-\x7e]/g, '_')}.${ext}"; filename*=UTF-8''${encodeURIComponent(nama)}.${ext}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
