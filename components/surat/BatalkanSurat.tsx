'use client';

/**
 * Pembatalan surat TERBIT dari halaman detail arsip (T-060 API, T-063 UI).
 * Wajib beralasan (≥ 5 karakter, sama dengan `SkemaAlasan`); nomornya tidak
 * dikembalikan dan surat tetap di arsip berlabel Dibatalkan (INV-16).
 *
 * Test id: surat-batalkan, surat-alasan-batal, surat-batalkan-kirim, surat-batalkan-galat.
 */

import { Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const MIN_ALASAN = 5;

export function BatalkanSurat({ suratId, nomor }: { suratId: string; nomor: string }) {
  const router = useRouter();
  const [buka, setBuka] = React.useState(false);
  const [alasan, setAlasan] = React.useState('');
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const idAlasan = React.useId();

  async function kirim() {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch(`/api/surat/${suratId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alasan: alasan.trim() }),
      });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok) {
        setGalat(isi?.error?.message ?? 'Pembatalan gagal. Coba lagi.');
        return;
      }
      setBuka(false);
      router.refresh();
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  if (!buka) {
    return (
      <Button type="button" variant="secondary" onClick={() => setBuka(true)} data-testid="surat-batalkan">
        <Ban aria-hidden="true" /> Batalkan surat
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-sm border border-default p-3">
      <p className="text-[13px] text-secondary">
        Nomor <span className="font-mono text-primary">{nomor}</span> tetap tercatat dan tidak dipakai ulang. Surat tetap
        tampil di arsip dengan label Dibatalkan.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={idAlasan}>Alasan pembatalan</Label>
        <Textarea
          id={idAlasan}
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Contoh: tujuan surat salah, diganti surat baru."
          data-testid="surat-alasan-batal"
        />
      </div>
      {galat ? <InlineAlert data-testid="surat-batalkan-galat" title="Tidak dapat dibatalkan" detail={galat} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="danger"
          onClick={() => void kirim()}
          disabled={proses || alasan.trim().length < MIN_ALASAN}
          data-testid="surat-batalkan-kirim"
        >
          {proses ? 'Memproses…' : 'Batalkan surat'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setBuka(false)} disabled={proses}>
          Kembali
        </Button>
      </div>
    </div>
  );
}
