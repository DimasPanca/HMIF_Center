'use client';

/**
 * Export Gantt ke PNG (T-078 #4) — dirasterisasi di peramban pada skala 2x
 * supaya tajam saat disisipkan ke Word dan dicetak. Gambar digambar ulang
 * dari view model (`svgEkspor`), bukan disalin dari layar: lengkap (semua
 * baris, termasuk yang tervirtualisasi/terlipat), berlabel, berlatar putih.
 *
 * PDF sengaja tidak disediakan (ADR-030): PNG cukup untuk disisipkan ke
 * dokumen, dan PDF dokumen datang dari Word/Gotenberg.
 *
 * Test id: gantt-export-png.
 */

import { ImageDown } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { svgEkspor } from '@/lib/gantt/export-svg';
import type { GanttViewModel } from '@/lib/gantt/types';

const SKALA_EKSPOR = 2;

/** Variabel CSS (`var(--x)`) → warna heks dari tema terang saat ini. */
function penerjemahWarna(): (c: string) => string {
  const gaya = getComputedStyle(document.documentElement);
  const kanvas = document.createElement('canvas').getContext('2d');
  return (c) => {
    const m = /^var\((--[\w-]+)\)$/.exec(c.trim());
    const mentah = m ? gaya.getPropertyValue(m[1]!).trim() : c;
    if (!kanvas || !mentah) return mentah;
    kanvas.fillStyle = '#000000';
    kanvas.fillStyle = mentah; // kanvas menormalkan warna CSS apa pun ke #rrggbb
    return String(kanvas.fillStyle);
  };
}

function namaBerkas(judul: string): string {
  const slug = judul.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'gantt';
  return `${slug}.png`;
}

export async function rasterPng(model: GanttViewModel, judul: string, lebarTimelineMin: number): Promise<Blob> {
  const { svg, lebar, tinggi } = svgEkspor(model, { judul, lebarTimelineMin, warna: penerjemahWarna() });
  const img = new Image();
  img.decoding = 'async';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const kanvas = document.createElement('canvas');
  kanvas.width = Math.ceil(lebar * SKALA_EKSPOR);
  kanvas.height = Math.ceil(tinggi * SKALA_EKSPOR);
  const ctx = kanvas.getContext('2d');
  if (!ctx) throw new Error('Kanvas tidak tersedia di peramban ini.');
  ctx.scale(SKALA_EKSPOR, SKALA_EKSPOR);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, lebar, tinggi);
  ctx.drawImage(img, 0, 0, lebar, tinggi);
  return new Promise((resolve, reject) => kanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat PNG.'))), 'image/png'));
}

export function GanttExport({ model, judul, svgRef }: { model: GanttViewModel; judul: string; svgRef: () => SVGSVGElement | null }) {
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  async function ekspor() {
    setProses(true);
    setGalat(null);
    try {
      const lebarLayar = svgRef()?.getBoundingClientRect().width ?? 0;
      const blob = await rasterPng(model, judul, lebarLayar);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = namaBerkas(judul);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Export gagal.');
    } finally {
      setProses(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" loading={proses} onClick={() => void ekspor()} data-testid="gantt-export-png">
        <ImageDown className="size-4" aria-hidden="true" />
        Export PNG
      </Button>
      {galat ? (
        <span role="alert" className="text-xs text-danger">
          {galat}
        </span>
      ) : null}
    </div>
  );
}
