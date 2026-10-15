import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { bacaBerkasPengurus, pratinjauImportPengurus, simpanImportPengurus } from '@/lib/pengurus/service';

import { TANPA_CACHE, responsPengurus } from '../_respons';

export const maxDuration = 60;

const SkemaPermintaan = z.object({
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

/**
 * Import Data Pengurus dari CSV/XLSX (T-107): `mode=pratinjau` hanya membaca;
 * `mode=simpan` menyimpan seluruhnya dalam satu transaksi beraudit.
 */
export async function POST(request: Request) {
  const guard = await requirePermission('pengurus.create');
  if (!guard.ok) return guard.nilai;

  const form = await request.formData().catch(() => null);
  const berkas = form?.get('berkas');
  if (!form || !(berkas instanceof File)) {
    return gagal('FILE_TIDAK_VALID', 'Unggah berkas CSV atau XLSX.', { status: 422, headers: TANPA_CACHE });
  }
  const p = SkemaPermintaan.safeParse({ mode: form.get('mode'), peta: bacaJson(form.get('peta')), lewati: bacaJson(form.get('lewati')) });
  if (!p.success) return gagal('VALIDASI_GAGAL', 'Permintaan import tidak valid.', { status: 422, headers: TANPA_CACHE });

  const matriks = await bacaBerkasPengurus(berkas.name, Buffer.from(await berkas.arrayBuffer()));
  if (!matriks.ok) return responsPengurus(matriks);

  if (p.data.mode === 'pratinjau') {
    return sukses(await pratinjauImportPengurus(guard.konteks, matriks.nilai, p.data.peta), { headers: TANPA_CACHE });
  }
  const hasil = await withAuditContext(
    request,
    guard.konteks,
    (tx) => simpanImportPengurus(tx, guard.konteks, matriks.nilai, { petaManual: p.data.peta, lewati: p.data.lewati }),
    { timeout: 60_000 },
  );
  return responsPengurus(hasil);
}
