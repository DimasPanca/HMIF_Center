import { z } from 'zod';

import { idSah, idTidakValid, responsRab, TANPA_CACHE } from '@/app/api/rab/_respons';
import { requirePermission } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { bacaRabExcel } from '@/lib/rab/excel-import';
import { muatRab, rencanaImpor, simpanImpor } from '@/lib/rab/service';

export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ kepanitiaanId: string }>;
}

const BATAS_BERKAS = 5 * 1024 * 1024;

const SkemaPermintaan = z.object({
  mode: z.enum(['pratinjau', 'simpan']),
  /** Isian "jumlah untuk perhitungan" dari pratinjau: { barisExcel: angka }. */
  manual: z.record(z.string().regex(/^\d+$/), z.number().finite().min(0).max(10_000_000)).default({}),
});

function bacaJson(nilai: FormDataEntryValue | null): unknown {
  if (typeof nilai !== 'string' || nilai === '') return undefined;
  try {
    return JSON.parse(nilai);
  } catch {
    return null;
  }
}

/**
 * Impor RAB dari Excel berformat template (T-091). `mode=pratinjau` hanya
 * membaca dan mengembalikan rencana (tambah/ubah/sama/lewati + alasan);
 * `mode=simpan` menjalankan rencana yang SAMA dalam satu transaksi beraudit.
 * Ditolak 409 bila RAB terkunci; divisi yang bukan hak pengguna dilewati.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('kepanitiaan.read');
  if (!guard.ok) return guard.nilai;
  const { kepanitiaanId } = await context.params;
  if (!idSah(kepanitiaanId)) return idTidakValid();

  const akses = await muatRab(guard.konteks, kepanitiaanId);
  if (akses === null) return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
  if (akses === 'TERBATAS') return gagal('TIDAK_BERWENANG', 'RAB acara ini bukan hak Anda.', { status: 403, headers: TANPA_CACHE });

  const form = await request.formData().catch(() => null);
  const berkas = form?.get('berkas');
  if (!form || !(berkas instanceof File)) return gagal('FILE_TIDAK_VALID', 'Unggah berkas Excel (.xlsx).', { status: 422, headers: TANPA_CACHE });
  if (berkas.size > BATAS_BERKAS) return gagal('FILE_TIDAK_VALID', 'Berkas lebih dari 5 MB.', { status: 422, headers: TANPA_CACHE });
  const p = SkemaPermintaan.safeParse({ mode: form.get('mode'), manual: bacaJson(form.get('manual')) });
  if (!p.success) return gagal('VALIDASI_GAGAL', 'Permintaan impor tidak valid.', { status: 422, headers: TANPA_CACHE });
  const manual = Object.fromEntries(Object.entries(p.data.manual).map(([k, v]) => [Number(k), v]));

  const baca = await bacaRabExcel(Buffer.from(await berkas.arrayBuffer()));
  if (!baca.ok) return gagal('FILE_TIDAK_VALID', baca.pesan, { status: 422, headers: TANPA_CACHE });

  if (p.data.mode === 'pratinjau') return responsRab(await rencanaImpor(db, guard.konteks, kepanitiaanId, baca.nilai, manual));

  const hasil = await withAuditContext(request, guard.konteks, (tx) => simpanImpor(tx, guard.konteks, kepanitiaanId, baca.nilai, manual), {
    timeout: 60_000,
  });
  if (!hasil.ok) return responsRab(hasil);
  const rab = await muatRab(guard.konteks, kepanitiaanId);
  return sukses({ ringkas: hasil.nilai, rab: rab === 'TERBATAS' ? null : rab }, { headers: TANPA_CACHE });
}
