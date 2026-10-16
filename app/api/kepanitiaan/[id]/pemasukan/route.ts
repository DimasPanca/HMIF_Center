import { dataTerbaru, guardPemasukan, idSah, responsPemasukan, TANPA_CACHE } from '@/app/api/kepanitiaan/[id]/_pemasukan';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal } from '@/lib/http/respond';
import { hapusSumber, tambahSumber, ubahSumber } from '@/lib/rab/pemasukan';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Sumber dana + peserta + ringkasan (T-092). */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;
  return dataTerbaru(g.konteks, id);
}

/** Tambah sumber dana manual (Kas Himpunan, Sponsor, Dana Fakultas, dst.). */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, g.konteks, (tx) => tambahSumber(tx, g.konteks, id, body));
  return h.ok ? dataTerbaru(g.konteks, id) : responsPemasukan(h);
}

/** Ubah sumber dana: `{ id, keterangan, saldo }`. */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const baris = body?.id;
  if (!idSah(baris)) return gagal('VALIDASI_GAGAL', 'ID sumber dana tidak valid.', { status: 422, headers: TANPA_CACHE });
  const h = await withAuditContext(request, g.konteks, (tx) => ubahSumber(tx, g.konteks, id, baris, body));
  return h.ok ? dataTerbaru(g.konteks, id) : responsPemasukan(h);
}

/** Hapus sumber dana `?baris=<id>` — Bendahara/Admin. */
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const g = await guardPemasukan(id);
  if (!g.ok) return g.respons;
  const baris = new URL(request.url).searchParams.get('baris');
  if (!idSah(baris)) return gagal('VALIDASI_GAGAL', 'ID sumber dana tidak valid.', { status: 422, headers: TANPA_CACHE });
  const h = await withAuditContext(request, g.konteks, (tx) => hapusSumber(tx, g.konteks, id, baris));
  return h.ok ? dataTerbaru(g.konteks, id) : responsPemasukan(h);
}
