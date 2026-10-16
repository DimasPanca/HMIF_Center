'use client';

/**
 * Gantt divisi di ruang kerja divisi (T-093, PRD F-8.2): editor T-078 apa
 * adanya pada chart scope DIVISI. Hak (baca/tulis, tombol tambah) datang dari
 * `muatChart` → `hakChart`, yang memakai aturan divisi T-085 — divisi lain
 * melihat chart tanpa satu pun kontrol tulis.
 *
 * Divisi lama yang belum punya chart: penulis divisi mendapat tombol
 * "Buat timeline divisi" (POST /api/divisi/[id]/gantt), pembaca tidak.
 */

import { CalendarPlus, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { GanttEditor } from '@/components/gantt/GanttEditor';
import { Button } from '@/components/ui/button';
import type { DataChart } from '@/lib/gantt/service';

export function DivisiGantt({
  data,
  supabaseUrl,
  supabaseKey,
}: {
  data: DataChart;
  supabaseUrl: string | null;
  supabaseKey: string | null;
}) {
  return (
    <div className="space-y-2" data-testid="divisi-gantt">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/gantt/${data.chart.id}`}
          className="flex min-w-0 items-center gap-2 text-[14px] font-medium hover:underline"
        >
          <span className="truncate">{data.chart.judul}</span>
          <Maximize2 aria-hidden="true" className="size-4 shrink-0 text-tertiary" />
          <span className="sr-only">(buka layar penuh)</span>
        </Link>
      </div>
      <GanttEditor
        awal={data}
        chartId={data.chart.id}
        supabaseUrl={supabaseUrl}
        supabaseKey={supabaseKey}
      />
    </div>
  );
}

export function BuatTimelineDivisi({ divisiId }: { divisiId: string }) {
  const router = useRouter();
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  const buat = async () => {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch(`/api/divisi/${divisiId}/gantt`, { method: 'POST' });
      const b = (await r.json().catch(() => null)) as {
        ok: boolean;
        error?: { message?: string };
      } | null;
      if (!r.ok || !b?.ok) throw new Error(b?.error?.message || 'Timeline divisi gagal dibuat.');
      router.refresh();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Timeline divisi gagal dibuat.');
      setProses(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={() => void buat()}
        disabled={proses}
        data-testid="divisi-gantt-buat"
      >
        <CalendarPlus aria-hidden="true" /> {proses ? 'Membuat…' : 'Buat timeline divisi'}
      </Button>
      {galat ? (
        <p role="alert" className="text-[13px] text-danger">
          {galat}
        </p>
      ) : null}
    </div>
  );
}
