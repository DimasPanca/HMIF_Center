import { z } from 'zod';

import { dataTerbaru, guardPemasukan, idSah, responsPemasukan, TANPA_CACHE } from '@/app/api/kepanitiaan/[id]/_pemasukan';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { bacaBerkasPeserta, hapusPeserta, pratinjauImportPeserta, simpanImportPeserta, tambahPeserta, ubahPeserta } from '@/lib/rab/pemasukan';

export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SkemaImport = z.object({
  mode: z.enum(['pratinjau', 'simpan']),
  peta: z.record(z.string(), z.int().min(-1)).optional(),
  lewati: z.array(z.int().min(2)).max(5_000).optional(),
});

function bacaJson(nilai: FormDataEntryValue | null): unknown {
  if (typeof nilai !== 'string' || nilai === '') return undefined;
  try {
    return JSON.parse(nilai);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;
  return dataTerbaru(g.konteks, id);
}

/**
 * JSON → tambah satu peserta. multipart (`berkas`, `mode=pratinjau|simpan`)
 * → import massal CSV/XLSX: pratinjau dulu, simpan dalam satu transaksi.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;

  if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const berkas = form?.get('berkas');
    if (!form || !(berkas instanceof File)) return gagal('FILE_TIDAK_VALID', 'Unggah berkas CSV atau XLSX.', { status: 422, headers: TANPA_CACHE });
    const p = SkemaImport.safeParse({ mode: form.get('mode'), peta: bacaJson(form.get('peta')), lewati: bacaJson(form.get('lewati')) });
    if (!p.success) return gagal('VALIDASI_GAGAL', 'Permintaan import tidak valid.', { status: 422, headers: TANPA_CACHE });
    const matriks = await bacaBerkasPeserta(berkas.name, Buffer.from(await berkas.arrayBuffer()));
    if (!matriks.ok) return responsPemasukan(matriks);
    if (p.data.mode === 'pratinjau') return sukses(await pratinjauImportPeserta(id, matriks.nilai, p.data.peta), { headers: TANPA_CACHE });
    const h = await withAuditContext(
      request,
      g.konteks,
      (tx) => simpanImportPeserta(tx, g.konteks, id, matriks.nilai, { petaManual: p.data.peta, lewati: p.data.lewati }),
      { timeout: 60_000 },
    );
    return responsPemasukan(h);
  }

  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, g.konteks, (tx) => tambahPeserta(tx, g.konteks, id, body));
  return h.ok ? dataTerbaru(g.konteks, id) : responsPemasukan(h);
}

/** Ubah sebagian satu peserta: `{ id, ...field }` (mis. centang status bayar). */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const pesertaId = typeof body?.id === 'string' ? body.id : null;
  if (!idSah(pesertaId)) return gagal('VALIDASI_GAGAL', 'ID peserta tidak valid.', { status: 422, headers: TANPA_CACHE });
  const isi = Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => k !== 'id'));
  const h = await withAuditContext(request, g.konteks, (tx) => ubahPeserta(tx, g.konteks, id, pesertaId, isi));
  return h.ok ? dataTerbaru(g.konteks, id) : responsPemasukan(h);
}

/** Hapus peserta `?baris=<id>` — Bendahara/Admin. */
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;
  const baris = new URL(request.url).searchParams.get('baris');
  if (!idSah(baris)) return gagal('VALIDASI_GAGAL', 'ID peserta tidak valid.', { status: 422, headers: TANPA_CACHE });
  const h = await withAuditContext(request, g.konteks, (tx) => hapusPeserta(tx, g.konteks, id, baris));
  return h.ok ? dataTerbaru(g.konteks, id) : responsPemasukan(h);
}
