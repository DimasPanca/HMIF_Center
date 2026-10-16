import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { gagal, sukses } from '@/lib/http/respond';
import { dokumenProposalTerakhir, generateProposal } from '@/lib/proposal/generate';
import { storage } from '@/lib/storage';
import { MIME_DOCX } from '@/lib/tor/generate';

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

/** Generate proposal (T-096): kepanitiaan, anggaran, rincian RAB, rundown ditarik saat itu juga. */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const h = await generateProposal(guard.konteks, kepanitiaanId);
  if (!h.ok)
    return gagal(h.kode, h.pesan, {
      status: STATUS[h.kode],
      headers: TANPA_CACHE,
      ...(h.kurang ? { details: { kurang: h.kurang } } : {}),
    });
  return sukses(
    { dokumen_id: h.dokumen_id, ukuran: h.ukuran, pdf: h.pdf, peringatan: h.peringatan ?? null },
    { status: 201, headers: TANPA_CACHE },
  );
}

/** Unduh ulang proposal terakhir (`?format=pdf` bila PDF pernah dibuat). */
export async function GET(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!z.uuid().safeParse(kepanitiaanId).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  const pdf = new URL(request.url).searchParams.get('format') === 'pdf';
  const d = await dokumenProposalTerakhir(guard.konteks, kepanitiaanId, pdf ? 'PDF' : 'DOCX');
  if (!d)
    return gagal('TIDAK_DITEMUKAN', 'Proposal acara ini belum pernah dibuat.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  let isi: Buffer;
  try {
    isi = await storage.get(d.storage_key);
  } catch (e) {
    console.error(`[proposal] ${kepanitiaanId}: berkas ${d.storage_key} tidak dapat dibaca`, e);
    return gagal('TIDAK_DITEMUKAN', 'Berkas proposal tidak ditemukan di penyimpanan.', {
      status: 404,
      headers: TANPA_CACHE,
    });
  }
  const nama = `Proposal ${d.nama_acara}`
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
