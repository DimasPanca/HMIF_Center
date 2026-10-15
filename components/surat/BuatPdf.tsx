'use client';

/**
 * Tombol "Buat PDF" untuk surat terbit yang belum punya PDF (T-062) — mis.
 * karena layanan PDF sedang tidur saat surat diterbitkan.
 *
 * Test id: surat-buat-pdf, surat-buat-pdf-galat.
 */

import { FileText, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';

export function BuatPdf({ suratId }: { suratId: string }) {
  const router = useRouter();
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  async function buat() {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch(`/api/surat/${suratId}/pdf`, { method: 'POST' });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok) setGalat(isi?.error?.message ?? 'PDF gagal dibuat.');
      else router.refresh();
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={() => void buat()} disabled={proses} data-testid="surat-buat-pdf">
        {proses ? <Loader2 aria-hidden="true" className="animate-spin" /> : <FileText aria-hidden="true" />}
        {proses ? 'Membuat PDF… (bisa ±1 menit)' : 'Buat PDF'}
      </Button>
      {galat ? <InlineAlert data-testid="surat-buat-pdf-galat" title="PDF belum dapat dibuat" detail={galat} /> : null}
    </div>
  );
}
