import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { STATUS_HTTP_FORM } from '@/lib/form/service';
import { daftarTemplate, pastikanTemplateBawaan, simpanTemplate } from '@/lib/form/template';
import { gagal, sukses } from '@/lib/http/respond';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** Template aktif (semua pembuat form); `?semua=1` termasuk nonaktif (halaman kelola). */
export async function GET(request: Request) {
  const guard = await requirePermission('form.read');
  if (!guard.ok) return guard.nilai;
  await pastikanTemplateBawaan();
  const semua = new URL(request.url).searchParams.get('semua') === '1';
  return sukses(await daftarTemplate({ termasukNonaktif: semua }), { headers: TANPA_CACHE });
}

export async function POST(request: Request) {
  const guard = await requirePermission('form_template.manage');
  if (!guard.ok) return guard.nilai;
  const body = await request.json().catch(() => null);
  const h = await withAuditContext(request, guard.konteks, (tx) => simpanTemplate(tx, guard.konteks, null, body));
  return h.ok
    ? sukses(h.nilai, { status: 201 })
    : gagal(h.kode, h.pesan, { details: h.details, status: STATUS_HTTP_FORM[h.kode] });
}
