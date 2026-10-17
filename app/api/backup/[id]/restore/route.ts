import { after } from 'next/server';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import {
  SkemaPermintaanRestore,
  bolehDilanjutkan,
  daftarRestore,
  jalankanRestore,
  mulaiRestore,
  pratinjauRestore,
} from '@/lib/backup/restore';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Satu tahap restore (pra-restore, verifikasi, terapkan) per pemanggilan;
// yang terputus dilanjutkan lewat aksi `lanjut`.
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

const SkemaAksi = z.discriminatedUnion('aksi', [
  z.object({ aksi: z.literal('pratinjau'), permintaan: SkemaPermintaanRestore }),
  z.object({ aksi: z.literal('mulai'), permintaan: SkemaPermintaanRestore }),
  z.object({ aksi: z.literal('lanjut'), jobId: z.uuid() }),
]);

const STATUS = { VALIDASI_GAGAL: 422, TIDAK_DITEMUKAN: 404, KONFLIK: 409, DITOLAK: 422 } as const;

/** Riwayat & progres restore untuk satu backup (T-112 kontrak 6). */
export async function GET(_req: Request, context: RouteContext) {
  const guard = await requirePermission('backup.read');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });
  return sukses(await daftarRestore(id), { headers: TANPA_CACHE });
}

/**
 * `{ aksi: 'pratinjau' | 'mulai', permintaan }` atau `{ aksi: 'lanjut', jobId }`.
 * `mulai` membuat job lalu mengerjakannya setelah respons 202 — backup
 * pra-restore lebih dulu, tanpa opsi dilewati (kontrak 1).
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requirePermission('backup.manage');
  if (!guard.ok) return guard.nilai;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });

  const body = SkemaAksi.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return gagal('VALIDASI_GAGAL', body.error.issues[0]?.message ?? 'Permintaan tidak valid.', {
      status: 422,
      details: body.error.issues,
      headers: TANPA_CACHE,
    });
  }
  const b = body.data;

  if (b.aksi === 'pratinjau') {
    try {
      return sukses(await pratinjauRestore(id, b.permintaan), { headers: TANPA_CACHE });
    } catch (e) {
      return gagal('DITOLAK', e instanceof Error ? e.message : 'Pratinjau gagal.', {
        status: 422,
        headers: TANPA_CACHE,
      });
    }
  }

  if (b.aksi === 'lanjut') {
    if (!(await bolehDilanjutkan(b.jobId))) {
      return gagal('KONFLIK', 'Restore ini tidak sedang terputus — tunggu progresnya.', {
        status: 409,
        headers: TANPA_CACHE,
      });
    }
    after(() => jalankanRestore(b.jobId));
    return sukses({ id: b.jobId }, { status: 202, headers: TANPA_CACHE });
  }

  const m = await withAuditContext(
    request,
    guard.konteks,
    (tx) => mulaiRestore(tx, id, b.permintaan, guard.konteks.sesi.userId),
    { timeout: 30_000 },
  );
  if (!m.ok) return gagal(m.kode, m.pesan, { status: STATUS[m.kode], headers: TANPA_CACHE });
  after(() => jalankanRestore(m.id));
  return sukses({ id: m.id }, { status: 202, headers: TANPA_CACHE });
}
