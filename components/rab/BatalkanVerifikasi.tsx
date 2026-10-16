'use client';

/**
 * Batalkan verifikasi satu nota dari buku PENGELUARAN (T-103 kontrak 3) —
 * Bendahara/Admin, wajib alasan. Saldo dihitung ulang penuh setelah refresh.
 */

import { Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function BatalkanVerifikasi({ notaId }: { notaId: string }) {
  const router = useRouter();
  const [buka, setBuka] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  const jalankan = async (alasan: string) => {
    setGalat(null);
    const r = await fetch(`/api/nota/${notaId}/verify`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alasan }),
    }).catch(() => null);
    const b = r
      ? ((await r.json().catch(() => null)) as { ok: boolean; error?: { message?: string } } | null)
      : null;
    if (!r?.ok || !b?.ok) {
      setGalat(b?.error?.message || 'Gagal membatalkan verifikasi.');
      return;
    }
    router.refresh();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-label="Batalkan verifikasi nota ini"
        onClick={() => setBuka(true)}
        data-testid="rab-batalkan-verifikasi"
      >
        <Undo2 aria-hidden="true" />
      </Button>
      {galat ? (
        <span role="alert" className="text-[11px] text-danger">
          {galat}
        </span>
      ) : null}
      <ConfirmDialog
        level="reason"
        open={buka}
        onOpenChange={setBuka}
        title="Batalkan verifikasi nota?"
        description="Nota kembali ke antrian verifikasi. Seluruh saldo pengeluaran dan realisasi RAB dihitung ulang dari awal."
        reasonLabel="Alasan pembatalan (min. 5 karakter)"
        reasonPlaceholder="Contoh: nominal galon ternyata salah ketik"
        confirmLabel="Batalkan verifikasi"
        confirmVariant="danger"
        onConfirm={(p) => {
          setBuka(false);
          if (p.level === 'reason') void jalankan(p.reason);
        }}
      />
    </>
  );
}
