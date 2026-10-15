'use client';

/**
 * Pratinjau wajib sebelum upload (T-100 kontrak 3, PRD F-11.3): gambar penuh
 * layar dengan dua tombol besar — Ambil Ulang dan Gunakan. Catatan fallback
 * ("tepi tidak terdeteksi") ditampilkan sebagai informasi, bukan galat: foto
 * apa adanya tetap sah dipakai.
 *
 * Test id: scan-preview, scan-preview-gambar, scan-preview-status,
 * scan-ambil-ulang, scan-gunakan.
 */

import { Check, RotateCcw, ScanLine } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function ScanPreview({
  url,
  terpindai,
  catatan,
  labelUlang,
  onAmbilUlang,
  onGunakan,
}: {
  url: string;
  terpindai: boolean;
  catatan: string | null;
  labelUlang: string;
  onAmbilUlang: () => void;
  onGunakan: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="scan-preview">
      <div className="relative flex h-[62dvh] min-h-64 items-center justify-center overflow-hidden rounded-sm bg-[var(--neutral-subtle)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL lokal, bukan aset Next. */}
        <img src={url} alt="Pratinjau nota" data-testid="scan-preview-gambar" className="max-h-full max-w-full object-contain" />
      </div>
      <p data-testid="scan-preview-status" data-terpindai={terpindai ? '1' : '0'} className="flex items-start gap-2 text-[13px] text-secondary">
        <ScanLine aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {terpindai ? 'Tepi dokumen terdeteksi — perspektif sudah diluruskan.' : (catatan ?? 'Foto dipakai apa adanya.')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" className="h-12 text-[15px]" onClick={onAmbilUlang} data-testid="scan-ambil-ulang">
          <RotateCcw aria-hidden="true" /> {labelUlang}
        </Button>
        <Button className="h-12 text-[15px]" onClick={onGunakan} data-testid="scan-gunakan">
          <Check aria-hidden="true" /> Gunakan
        </Button>
      </div>
    </div>
  );
}
