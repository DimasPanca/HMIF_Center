import fs from 'node:fs/promises';
import path from 'node:path';

import { konteksSaatIni } from '@/lib/auth/guard';

/** Gambar Guide dari `docs/panduan/img` (ADR-060). Nama berkas divalidasi ketat — tidak ada path traversal. */
const POLA = /^[a-z0-9-]+\.(png|jpe?g|webp)$/i;
const TIPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

export async function GET(_req: Request, { params }: { params: Promise<{ nama: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) return new Response(null, { status: 401 });
  const { nama } = await params;
  const m = POLA.exec(nama);
  if (!m) return new Response(null, { status: 404 });
  const isi = await fs.readFile(path.join(process.cwd(), 'docs', 'panduan', 'img', nama)).catch(() => null);
  if (!isi) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(isi), {
    headers: { 'Content-Type': TIPE[m[1]!.toLowerCase()]!, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
