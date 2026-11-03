'use client';

/**
 * DaftarForm — beranda modul Formulir. Disusun menurut pertanyaan pertama
 * pengguna: "form mana yang sedang jalan dan sudah berapa yang mengisi?"
 * Karena itu form DIBUKA tampil lebih dulu dengan jumlah respons besar dan
 * tombol "Salin tautan" langsung di kartu; draf & form tertutup di belakang.
 */

import { BarChart3, CalendarClock, ClipboardList, Copy, FilePlus2, LayoutTemplate, PencilLine, Search, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { INFO_KATEGORI } from '@/lib/form/skema';
import type { RingkasForm } from '@/lib/form/service';
import { cn } from '@/lib/utils';

export const LABEL_STATUS: Record<RingkasForm['status'], { label: string; tone: BadgeTone }> = {
  DRAF: { label: 'Draf', tone: 'neutral' },
  DIBUKA: { label: 'Dibuka', tone: 'success' },
  DITUTUP: { label: 'Ditutup', tone: 'warning' },
};

type Saring = 'SEMUA' | RingkasForm['status'];

export function DaftarForm(props: { forms: RingkasForm[]; bolehBuat: boolean; bolehTemplate: boolean; acaraId?: string }) {
  return (
    <ToastProvider>
      <Isi {...props} />
    </ToastProvider>
  );
}

function Isi({ forms, bolehBuat, bolehTemplate, acaraId }: { forms: RingkasForm[]; bolehBuat: boolean; bolehTemplate: boolean; acaraId?: string }) {
  const [saring, setSaring] = React.useState<Saring>('SEMUA');
  const [q, setQ] = React.useState('');
  const toast = useToast();
  const hitung = (s: Saring) => (s === 'SEMUA' ? forms.length : forms.filter((f) => f.status === s).length);
  const tampil = forms.filter(
    (f) => (saring === 'SEMUA' || f.status === saring) && (!q.trim() || `${f.judul} ${f.acara?.nama ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const hrefBaru = acaraId ? `/form/baru?acara=${acaraId}` : '/form/baru';

  const salin = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/f/${token}`);
      toast.success({ description: 'Tautan form disalin. Bagikan ke calon pengisi.' });
    } catch {
      toast.info({ description: `${window.location.origin}/f/${token}` });
    }
  };

  return (
    <div className="space-y-4">
      {!acaraId && (
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Formulir</h1>
              <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
                Pengganti Google Form: pendaftaran peserta, evaluasi acara, open recruitment, dan pendataan pengurus - datanya langsung masuk sistem.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {bolehTemplate && (
              <Link href="/form/template" className={buttonVariants({ variant: 'secondary' })}>
                <LayoutTemplate aria-hidden /> Template
              </Link>
            )}
            {bolehBuat && (
              <Link href={hrefBaru} className={buttonVariants()}>
                <FilePlus2 aria-hidden /> Form baru
              </Link>
            )}
          </div>
        </header>
      )}

      {forms.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Saring status" className="flex flex-wrap gap-1">
            {(['SEMUA', 'DIBUKA', 'DRAF', 'DITUTUP'] as Saring[]).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={saring === s}
                onClick={() => setSaring(s)}
                className={cn(
                  'h-8 rounded-full border px-3 text-[13px] font-medium tabular-nums transition-colors',
                  saring === s ? 'border-transparent bg-[var(--primary)] text-[var(--primary-text)]' : 'border-default bg-panel text-secondary hover:bg-subtle',
                )}
              >
                {s === 'SEMUA' ? 'Semua' : LABEL_STATUS[s].label} · {hitung(s)}
              </button>
            ))}
          </div>
          <label className="relative w-full sm:w-64">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tertiary" />
            <span className="sr-only">Cari form</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari judul atau acara…"
              className="h-[34px] w-full rounded-sm border border-default bg-panel pr-3 pl-8 text-[14px] outline-none focus:border-[var(--border-focus)]"
            />
          </label>
          {acaraId && bolehBuat && (
            <Link href={hrefBaru} className={buttonVariants({ className: 'sm:ml-auto' })}>
              <FilePlus2 aria-hidden /> Form untuk acara ini
            </Link>
          )}
        </div>
      )}

      {forms.length === 0 ? (
        <section className="rounded-md border border-dashed border-strong bg-panel px-6 py-10 text-center">
          <ClipboardList aria-hidden className="mx-auto size-10 stroke-[1.5] text-tertiary" />
          <h2 className="mt-3 text-[16px] font-semibold">Belum ada form</h2>
          <ol className="mx-auto mt-3 grid max-w-xl gap-2 text-left text-[13px] leading-5 text-secondary sm:grid-cols-3">
            <li className="rounded-sm bg-subtle p-3"><b className="text-primary">1. Pilih kegunaan</b><br />Pendaftaran, evaluasi, oprec, atau pendataan.</li>
            <li className="rounded-sm bg-subtle p-3"><b className="text-primary">2. Mulai dari template</b><br />Pertanyaan umum sudah disiapkan, tinggal sesuaikan.</li>
            <li className="rounded-sm bg-subtle p-3"><b className="text-primary">3. Buka &amp; bagikan</b><br />Salin tautan, kirim ke grup peserta.</li>
          </ol>
          {bolehBuat ? (
            <Link href={hrefBaru} className={buttonVariants({ className: 'mt-5' })}>
              <FilePlus2 aria-hidden /> Buat form pertama
            </Link>
          ) : (
            <p className="mt-4 text-[13px] text-tertiary">Form dibuat oleh Sekum, pimpinan, atau panitia acara.</p>
          )}
        </section>
      ) : tampil.length === 0 ? (
        <p className="rounded-md border border-default bg-panel px-4 py-8 text-center text-[14px] text-secondary">Tidak ada form yang cocok.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tampil.map((f) => (
            <li key={f.id} className="flex flex-col rounded-md border border-default bg-panel p-4" data-testid="kartu-form">
              <div className="flex items-center gap-2">
                <Badge tone={LABEL_STATUS[f.status].tone}>{LABEL_STATUS[f.status].label}</Badge>
                <span className="truncate text-[12px] text-tertiary">{INFO_KATEGORI[f.kategori].label}</span>
              </div>
              <Link href={f.boleh_kelola ? `/form/${f.id}` : `/form/${f.id}/respons`} className="mt-2 line-clamp-2 text-[16px] leading-6 font-semibold text-primary hover:underline">
                {f.judul}
              </Link>
              {f.acara && !acaraId && <p className="mt-0.5 truncate text-[13px] text-secondary">{f.acara.nama}</p>}
              <div className="mt-3 flex items-end gap-4">
                <div>
                  <p className="text-[24px] leading-7 font-semibold tabular-nums">
                    {f.jumlah_respons}
                    {f.kuota ? <span className="text-[14px] font-normal text-tertiary">/{f.kuota}</span> : null}
                  </p>
                  <p className="flex items-center gap-1 text-[12px] text-tertiary">
                    <Users aria-hidden className="size-3.5" /> respons
                  </p>
                </div>
                {f.ditutup_pada && (
                  <p className="flex items-center gap-1 pb-0.5 text-[12px] text-secondary">
                    <CalendarClock aria-hidden className="size-3.5" />
                    Tutup {new Date(f.ditutup_pada).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-subtle pt-3">
                {f.status === 'DIBUKA' && (
                  <button type="button" onClick={() => void salin(f.token)} className={buttonVariants({ variant: 'secondary', className: 'h-8 px-2.5 text-[13px]' })}>
                    <Copy aria-hidden /> Salin tautan
                  </button>
                )}
                {f.boleh_kelola && (
                  <Link href={`/form/${f.id}`} className={buttonVariants({ variant: 'ghost', className: 'h-8 px-2.5 text-[13px]' })}>
                    <PencilLine aria-hidden /> Edit
                  </Link>
                )}
                {f.boleh_kelola && (
                  <Link href={`/form/${f.id}/respons`} className={buttonVariants({ variant: 'ghost', className: 'h-8 px-2.5 text-[13px]' })}>
                    <BarChart3 aria-hidden /> Respons
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
