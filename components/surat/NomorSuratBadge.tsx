'use client';

/**
 * NomorSuratBadge — nomor surat dalam dua keadaan yang tidak boleh tertukar.
 *
 *   SEMENTARA  abu, ikon jam, keterangan tertulis "nomor sementara — ditetapkan
 *              saat disetujui". Dipakai form dan pratinjau (T-058, T-059).
 *   FINAL      JetBrains Mono kontras penuh, ikon centang, tombol salin.
 *
 * Bedanya tidak hanya warna (K-15): ikon, teks keterangan, dan keberadaan
 * tombol salin ikut berubah. Nomor sementara sengaja tidak dapat disalin —
 * menyalinnya ke grup WhatsApp adalah cara paling mudah sebuah `???` sampai
 * ke tangan orang lain sebagai nomor resmi.
 *
 * Harus dirender di dalam `ToastProvider` (umpan balik salin).
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-056 · DESIGN_SYSTEM §3.4, §8 · K-15
 */

import * as React from 'react';
import { BadgeCheck, Clock3, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { adalahNomorSementara } from '@/lib/surat/nomor';
import { cn } from '@/lib/utils';

export const TEKS_SEMENTARA = 'nomor sementara — ditetapkan saat disetujui';

type Toaster = Pick<ReturnType<typeof useToast>, 'success' | 'error'>;

/**
 * Menyalin nomor final ke clipboard dengan umpan balik toast.
 * Dipisah dari komponen supaya dapat dipakai tabel arsip (T-063) dan diuji tanpa DOM.
 */
export async function salinNomor(nomor: string, toast: Toaster): Promise<boolean> {
  if (adalahNomorSementara(nomor)) {
    toast.error({
      title: 'Nomor belum final',
      description: 'Nomor sementara tidak dapat disalin.',
      suggestion: 'Tunggu sampai surat disetujui.',
    });
    return false;
  }
  try {
    await navigator.clipboard.writeText(nomor);
    toast.success({ title: 'Nomor surat disalin', description: nomor });
    return true;
  } catch {
    toast.error({
      title: 'Gagal menyalin',
      description: 'Browser menolak akses clipboard.',
      suggestion: 'Pilih nomornya lalu salin manual.',
    });
    return false;
  }
}

export interface NomorSuratBadgeProps {
  nomor: string;
  /** Default: diturunkan dari bentuk nomornya (`???` = sementara). */
  sementara?: boolean;
  className?: string;
}

export function NomorSuratBadge({ nomor, sementara, className }: NomorSuratBadgeProps) {
  const isSementara = sementara ?? adalahNomorSementara(nomor);
  return isSementara ? (
    <BadgeSementara nomor={nomor} className={className} />
  ) : (
    <BadgeFinal nomor={nomor} className={className} />
  );
}

function BadgeSementara({ nomor, className }: { nomor: string; className?: string }) {
  return (
    <span
      data-slot="nomor-surat"
      data-keadaan="sementara"
      data-testid="nomor-surat-sementara"
      className={cn(
        'inline-flex max-w-full flex-col gap-0.5 rounded-sm border border-dashed border-[var(--border-default)] bg-[var(--neutral-subtle)] px-2.5 py-1.5',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
        <Clock3 aria-hidden className="size-3.5 shrink-0 text-[var(--neutral)]" />
        <span className="mono truncate">{nomor}</span>
      </span>
      <span className="text-[11px] leading-[14px] text-[var(--text-tertiary)]">{TEKS_SEMENTARA}</span>
    </span>
  );
}

function BadgeFinal({ nomor, className }: { nomor: string; className?: string }) {
  const toast = useToast();
  return (
    <span
      data-slot="nomor-surat"
      data-keadaan="final"
      data-testid="nomor-surat-final"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--bg-panel)] py-1 pl-2.5 pr-1',
        className,
      )}
    >
      <BadgeCheck aria-hidden className="size-3.5 shrink-0 text-[var(--success)]" />
      <span className="sr-only">Nomor surat final: </span>
      {/* select-all: satu klik memilih seluruh nomor bila clipboard ditolak browser. */}
      <span className="mono truncate font-medium text-[var(--text-primary)] select-all">{nomor}</span>
      <Button
        type="button"
        variant="ghost"
        className="h-[26px] px-1.5"
        aria-label={`Salin nomor surat ${nomor}`}
        onClick={() => void salinNomor(nomor, toast)}
      >
        <Copy aria-hidden />
      </Button>
    </span>
  );
}
