import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { hapusForm, muatForm, simpanForm, STATUS_HTTP_FORM } from '@/lib/form/service';
import { gagal, sukses } from '@/lib/http/respond';
import { storage } from '@/lib/storage';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const data = await muatForm(guard.konteks, id);
  return data ? sukses(data, { headers: TANPA_CACHE }) : gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}

/** Simpan pengaturan + struktur utuh (auto-save editor). Divalidasi `SkemaSimpanForm`. */
export async function PUT(request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) => simpanForm(tx, guard.konteks, id, body));
  return h.ok
    ? sukses(h.nilai, { headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { details: h.details, status: STATUS_HTTP_FORM[h.kode], headers: TANPA_CACHE });
}

/**
 * Hapus form beserta respons (CASCADE). Berkas jawaban di storage dibersihkan
 * SETELAH transaksi berhasil — sisa berkas karena kegagalan storage hanya
 * sampah privat, sebaliknya (berkas hilang, baris tetap) tidak boleh terjadi.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  const h = await withAuditContext(request, guard.konteks, (tx) => hapusForm(tx, guard.konteks, id));
  if (!h.ok) return gagal(h.kode, h.pesan, { status: STATUS_HTTP_FORM[h.kode], headers: TANPA_CACHE });
  try {
    const sisa = await storage.list(`form/${h.nilai.id}/`);
    await Promise.allSettled(sisa.map((o) => storage.delete(o.key)));
  } catch (e) {
    console.warn(`[form] gagal membersihkan berkas form ${h.nilai.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return sukses(h.nilai, { headers: TANPA_CACHE });
}
