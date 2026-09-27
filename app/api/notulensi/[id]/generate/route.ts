import { requirePermission } from '@/lib/auth/guard';
import { generateDocxNotulensi } from '@/lib/notulensi/service';

import { idSah, idTidakValid, responsGuard, responsNotulensi } from '@/app/api/notulensi/_respons';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function POST(_request: Request, context: RouteContext) {
  const guard = await requirePermission('notulensi.read');
  if (!guard.ok) return responsGuard(guard.nilai);
  const { id } = await context.params;
  if (!idSah(id)) return idTidakValid();

  const hasil = await generateDocxNotulensi(guard.konteks, id);
  if (!hasil.ok) return responsNotulensi(hasil);

  return new Response(new Uint8Array(hasil.nilai.docx), {
    status: 200,
    headers: {
      'Content-Type': MIME_DOCX,
      'Content-Disposition': `attachment; filename="${hasil.nilai.nama_berkas}"`,
      'Cache-Control': 'no-store',
    },
  });
}
