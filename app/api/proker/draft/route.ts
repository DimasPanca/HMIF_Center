import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import {
  STATUS_GAGAL,
  ambilDraft,
  hapusDraft,
  simpanDraft,
} from '@/lib/proker/draft-store';
import type { NomorLangkah, WizardDraft } from '@/lib/proker/wizard-state';

const SkemaSimpanDraft = z
  .object({
    data: z.record(z.string(), z.unknown()),
    langkah: z.number().int().min(1).max(6),
  })
  .strict();

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const guard = await requirePermission('proker.create');
  if (!guard.ok) return guard.nilai;

  const draft = await ambilDraft(guard.konteks);
  return sukses(draft, { headers: TANPA_CACHE });
}

export async function PUT(request: Request) {
  const guard = await requirePermission('proker.create');
  if (!guard.ok) return guard.nilai;

  const body: unknown = await request.json().catch(() => null);
  const parsed = SkemaSimpanDraft.safeParse(body);
  if (!parsed.success) {
    return gagal('TIDAK_VALID', 'Data draft tidak valid.', {
      status: 422,
      headers: TANPA_CACHE,
      details: parsed.error.issues.map((isu) => ({
        path: isu.path.join('.'),
        pesan: isu.message,
      })),
    });
  }

  const hasil = await withAuditContext(request, (tx) =>
    simpanDraft(
      tx,
      guard.konteks,
      parsed.data.data as WizardDraft,
      parsed.data.langkah as NomorLangkah,
    ),
  );

  return hasil.ok
    ? sukses(hasil.nilai, { headers: TANPA_CACHE })
    : gagal(hasil.kode, hasil.pesan, {
        status: STATUS_GAGAL[hasil.kode],
        headers: TANPA_CACHE,
      });
}

export async function DELETE(request: Request) {
  const guard = await requirePermission('proker.create');
  if (!guard.ok) return guard.nilai;

  const hasil = await withAuditContext(request, (tx) => hapusDraft(tx, guard.konteks));
  return hasil.ok
    ? sukses(hasil.nilai, { headers: TANPA_CACHE })
    : gagal(hasil.kode, hasil.pesan, {
        status: STATUS_GAGAL[hasil.kode],
        headers: TANPA_CACHE,
      });
}
