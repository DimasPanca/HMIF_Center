import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import {
  STATUS_GAGAL_IMPORT,
  bacaBerkasImport,
  pratinjauImportPengguna,
  simpanImportPengguna,
} from '@/lib/auth/import-pengguna';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

// 200 undangan berurutan, masing-masing satu panggilan Admin API Supabase.
export const maxDuration = 60;

// Respons simpan memuat tautan undangan sekali-tampil.
const TANPA_CACHE = { 'Cache-Control': 'no-store' };

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

export async function POST(request: Request) {
  const guard = await requirePermission('user.create');
  if (!guard.ok) return guard.nilai;

  const form = await request.formData().catch(() => null);
  const berkas = form?.get('berkas');
  if (!form || !(berkas instanceof File)) {
    return gagal('FILE_TIDAK_VALID', 'Unggah berkas CSV atau XLSX.', { status: 422, headers: TANPA_CACHE });
  }
  const permintaan = SkemaPermintaan.safeParse({
    mode: form.get('mode'),
    peta: bacaJson(form.get('peta')),
    lewati: bacaJson(form.get('lewati')),
  });
  if (!permintaan.success) {
    return gagal('TIDAK_VALID', 'Permintaan import tidak valid.', {
      status: 422,
      details: permintaan.error.issues.map((i) => ({ path: i.path.join('.'), pesan: i.message })),
      headers: TANPA_CACHE,
    });
  }

  const matriks = await bacaBerkasImport(berkas.name, Buffer.from(await berkas.arrayBuffer()));
  if (!matriks.ok) {
    return gagal(matriks.kode, matriks.pesan, { status: STATUS_GAGAL_IMPORT[matriks.kode], headers: TANPA_CACHE });
  }

  const { mode, peta, lewati } = permintaan.data;
  if (mode === 'pratinjau') {
    return sukses(await pratinjauImportPengguna(matriks.nilai, { petaManual: peta }), { headers: TANPA_CACHE });
  }

  const hasil = await simpanImportPengguna(
    (fn) => withAuditContext(request, guard.konteks, fn),
    guard.konteks,
    matriks.nilai,
    { petaManual: peta, lewati },
    new URL(request.url).origin,
  );
  return hasil.ok
    ? sukses(hasil.nilai, { headers: TANPA_CACHE })
    : gagal(hasil.kode, hasil.pesan, { status: STATUS_GAGAL_IMPORT[hasil.kode], headers: TANPA_CACHE });
}
