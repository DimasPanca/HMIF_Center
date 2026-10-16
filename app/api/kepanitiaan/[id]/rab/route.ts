import { idSah, idTidakValid, responsRab, TANPA_CACHE } from '@/app/api/rab/_respons';
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { aksiRab, muatRab } from '@/lib/rab/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const terbatas = () => gagal('TIDAK_BERWENANG', 'RAB acara ini hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitianya.', { status: 403, headers: TANPA_CACHE });
const tidakAda = () => gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', { status: 404, headers: TANPA_CACHE });

/** Pohon RAB acara: divisi → sub-section → item, dengan hak tulis per divisi. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const rab = await muatRab(guard.konteks, id);
  if (rab === null) return tidakAda();
  if (rab === 'TERBATAS') return terbatas();
  return sukses(rab, { headers: TANPA_CACHE });
}

/**
 * Aksi struktur (`aksi`: TAMBAH_DIVISI, HAPUS_DIVISI, TAMBAH_SECTION,
 * UBAH_SECTION, HAPUS_SECTION, TAMBAH_ITEM). Hak per aksi diputuskan service.
 * Jawaban: `{ id, rab }` — id baris baru (bila ada) dan pohon terbaru.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();
  const awal = await muatRab(guard.konteks, id);
  if (awal === null) return tidakAda();
  if (awal === 'TERBATAS') return terbatas();

  const body = await request.json().catch(() => null);
  const hasil = await withAuditContext(request, guard.konteks, (tx) => aksiRab(tx, guard.konteks, id, body));
  if (!hasil.ok) return responsRab(hasil);
  const rab = await muatRab(guard.konteks, id);
  return sukses({ id: hasil.nilai.id, rab }, { status: 201, headers: TANPA_CACHE });
}
