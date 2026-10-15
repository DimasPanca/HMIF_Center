'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';

/** Membuat chart DEPARTEMEN periode ini lalu memuat ulang halaman. */
export function BuatChartDepartemen({ departemenId }: { departemenId: string }) {
  const router = useRouter();
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  async function buat() {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch('/api/gantt/departemen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ departemen_id: departemenId }),
      });
      const b = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !b?.ok) return setGalat(b?.error?.message ?? 'Gagal membuat Gantt.');
      router.refresh();
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button onClick={() => void buat()} loading={proses} data-testid="gantt-departemen-buat">
        Buat Gantt departemen
      </Button>
      {galat ? (
        <p role="alert" className="text-[13px] text-danger">
          {galat}
        </p>
      ) : null}
    </div>
  );
}
