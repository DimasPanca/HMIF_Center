'use client';

/**
 * Bidang isian dokumen acara yang dipakai editor TOR (T-094) dan Proposal
 * (T-096): teks kaya (TipTap dimuat dinamis; pembaca melihat KontenProsa tanpa
 * TipTap) dan teks satu baris.
 */

import type { JSONContent } from '@tiptap/react';
import dynamic from 'next/dynamic';

import { KontenProsa } from '@/components/acara/KontenProsa';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { NodeProseMirror } from '@/lib/notulensi/sanitasi';
import { adaTeks } from '@/lib/tor/schema';

const NotulensiEditor = dynamic(
  () => import('@/components/notulensi/NotulensiEditor').then((m) => m.NotulensiEditor),
  {
    ssr: false,
    loading: () => <Skeleton variant="text" rows={3} loadingLabel="Memuat editor…" />,
  },
);

export function TeksKaya({
  label,
  konten,
  bolehTulis,
  onChange,
}: {
  label: string;
  konten: NodeProseMirror;
  bolehTulis: boolean;
  onChange: (k: NodeProseMirror) => void;
}) {
  if (!bolehTulis) {
    return adaTeks(konten) ? (
      <KontenProsa konten={konten} />
    ) : (
      <p className="text-[13px] text-secondary">Belum diisi.</p>
    );
  }
  return (
    <NotulensiEditor
      konten={konten as JSONContent}
      editable
      label={label}
      onChange={(k) => onChange(k as NodeProseMirror)}
    />
  );
}

export function Teks({
  id,
  label,
  nilai,
  bolehTulis,
  maks,
  onChange,
  labelTampak = false,
}: {
  id: string;
  label: string;
  nilai: string;
  bolehTulis: boolean;
  maks: number;
  onChange: (v: string) => void;
  /** true = label tampil di atas input; false = hanya untuk pembaca layar. */
  labelTampak?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelTampak ? 'mb-1 block text-[12px] text-secondary' : 'sr-only'}>
        {label}
      </label>
      <Input
        id={id}
        value={nilai}
        readOnly={!bolehTulis}
        maxLength={maks}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
