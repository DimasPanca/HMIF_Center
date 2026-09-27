'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PoinKeputusanProps {
  keputusan: string[];
  editable: boolean;
  onUbah?: (daftar: string[]) => void;
}

export function PoinKeputusan({ keputusan, editable, onUbah }: PoinKeputusanProps) {
  const [draf, setDraf] = useState('');

  function tambah() {
    const teks = draf.trim();
    if (!teks) return;
    onUbah?.([...keputusan, teks]);
    setDraf('');
  }

  return (
    <div className="space-y-3">
      {keputusan.length === 0 ? (
        <p className="text-[13px] text-secondary">Belum ada poin keputusan.</p>
      ) : null}
      <ol data-testid="notulensi-keputusan" className="space-y-1.5">
        {keputusan.map((teks, i) => (
          <li
            key={`${i}-${teks}`}
            data-testid={`notulensi-keputusan-item-${i}`}
            className="flex min-h-9 items-start gap-3 rounded-sm border border-default px-3 py-1.5"
          >
            <span className="mt-0.5 text-[12px] font-semibold text-tertiary tabular-nums">{i + 1}.</span>
            <p className="flex-1 text-[14px] leading-5 break-words text-primary">{teks}</p>
            {editable ? (
              <Button
                variant="ghost"
                className="-my-1 w-[34px] px-0"
                aria-label={`Hapus keputusan ${i + 1}`}
                onClick={() => onUbah?.(keputusan.filter((_, j) => j !== i))}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <div className="flex gap-2">
          <Input
            data-testid="notulensi-keputusan-tambah"
            aria-label="Poin keputusan baru"
            placeholder="Tulis poin keputusan, lalu tekan Enter"
            value={draf}
            maxLength={500}
            onChange={(e) => setDraf(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                tambah();
              }
            }}
          />
          <Button variant="secondary" onClick={tambah} disabled={!draf.trim()}>
            <Plus aria-hidden="true" />
            Tambah
          </Button>
        </div>
      ) : null}
    </div>
  );
}
