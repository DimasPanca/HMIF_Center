import sharp from 'sharp';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { svgEkspor } from '@/lib/gantt/export-svg';
import { SKALA, SKALA_KE_GEOMETRI, dariHari, keHari } from '@/lib/gantt/skema';
import { muatChart } from '@/lib/gantt/service';
import { transformGanttRows } from '@/lib/gantt/transform';
import { gagal } from '@/lib/http/respond';

import { TANPA_CACHE, idSah, idTidakValid } from '@/app/api/gantt/_respons';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ chartId: string }>;
}

/**
 * PNG 2x satu chart, dirender di server dari SVG yang sama dengan export
 * di peramban (`svgEkspor`) — untuk tautan langsung/otomasi. Tombol editor
 * merasterisasi di peramban karena font sistem pengguna selalu tersedia,
 * sedangkan server tanpa font hanya menjamin bar & warna (ADR-030).
 */
export async function GET(request: Request, context: RouteContext) {
  const guard = await requirePermission('gantt.read');
  if (!guard.ok) return guard.nilai;
  const { chartId } = await context.params;
  if (!idSah(chartId)) return idTidakValid();
  const skala = z.enum(SKALA).catch('minggu').parse(new URL(request.url).searchParams.get('skala') ?? 'minggu');
  const data = await muatChart(guard.konteks, chartId);
  if (!data) return gagal('TIDAK_DITEMUKAN', 'Chart tidak ditemukan.', { status: 404, headers: TANPA_CACHE });

  const hariIni = new Date().toISOString().slice(0, 10);
  const semua = data.task.flatMap((t) => [keHari(t.tanggal_mulai), keHari(t.tanggal_selesai)]);
  const h = keHari(hariIni);
  const model = transformGanttRows({
    groupRows: data.grup,
    taskRows: data.task.map((t) => ({ ...t, depends_on: data.dependensi.filter((d) => d.ke === t.id).map((d) => d.dari) })),
    scale: SKALA_KE_GEOMETRI[skala],
    range: {
      start: new Date(`${dariHari((semua.length ? Math.min(...semua, h) : h) - 7)}T00:00:00.000Z`),
      end: new Date(`${dariHari((semua.length ? Math.max(...semua, h) : h) + 21)}T00:00:00.000Z`),
    },
    today: new Date(`${hariIni}T00:00:00.000Z`),
  });
  const { svg } = svgEkspor(model, { judul: data.chart.judul });
  // density 144 = 2x dari 72 dpi bawaan SVG → lebar piksel dua kali lebar CSS.
  const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  const nama = `${data.chart.judul.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'gantt'}.png`;
  return new Response(new Uint8Array(png), {
    headers: {
      ...TANPA_CACHE,
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Content-Disposition': `attachment; filename="${nama}"`,
    },
  });
}
