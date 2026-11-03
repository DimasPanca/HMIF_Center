'use client';

/**
 * Panel Admin untuk laporan bug (ADR-060 §5): saring per status, baca detail & lampiran, ubah status
 * dengan catatan. Test id: admin-bug-filter-{STATUS}, admin-bug-item, admin-bug-status, admin-bug-simpan.
 */

import { ExternalLink, ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { LABEL_STATUS_BUG, LencanaStatusBug } from '@/components/bug/LaporBug';
import { Button } from '@/components/ui/button';
import type { LaporanBug, StatusBug } from '@/lib/bug/service';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';
import { cn } from '@/lib/utils';

const URUT: StatusBug[] = ['BARU', 'DITANGANI', 'SELESAI', 'DITOLAK'];

function Item({ l }: { l: LaporanBug }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusBug>(l.status);
  const [catatan, setCatatan] = useState(l.catatan_admin);
  const [memuat, setMemuat] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const berubah = status !== l.status || catatan !== l.catatan_admin;

  async function simpan() {
    setMemuat(true);
    setPesan(null);
    const r = await fetch(`/api/bug/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, catatan_admin: catatan }) });
    const d = (await r.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
    setMemuat(false);
    if (d?.ok) {
      setPesan({ ok: true, teks: 'Tersimpan.' });
      router.refresh();
    } else setPesan({ ok: false, teks: d?.error?.message ?? 'Gagal menyimpan.' });
  }

  return (
    <li data-testid="admin-bug-item" className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <LencanaStatusBug status={l.status} />
          <span className="text-[13px] font-medium text-primary">{l.pelapor.nama}</span>
          <span className="text-[12px] text-tertiary">{l.pelapor.email}</span>
          <time dateTime={l.created_at} className="text-[12px] text-tertiary">
            · {formatTanggalWaktu(l.created_at)}
          </time>
        </div>
        <p className="text-[14px] leading-6 whitespace-pre-wrap text-primary">{l.deskripsi}</p>
        <dl className="space-y-1 text-[12px] text-secondary">
          {l.halaman ? (
            <div className="flex gap-1">
              <dt className="text-tertiary">Halaman:</dt>
              <dd className="min-w-0 truncate">
                <a href={l.halaman} className="inline-flex items-center gap-1 text-link hover:underline" target="_blank" rel="noopener noreferrer">
                  {l.halaman} <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              </dd>
            </div>
          ) : null}
          {l.peramban ? (
            <div className="flex gap-1">
              <dt className="text-tertiary">Peramban:</dt>
              <dd className="min-w-0 truncate" title={l.peramban}>
                {l.peramban}
              </dd>
            </div>
          ) : null}
          {l.ditangani_oleh ? (
            <div className="flex gap-1">
              <dt className="text-tertiary">Ditangani:</dt>
              <dd>
                {l.ditangani_oleh} · {formatTanggalWaktu(l.updated_at)}
              </dd>
            </div>
          ) : null}
        </dl>
        {l.ada_lampiran ? (
          <a href={`/api/bug/${l.id}/lampiran`} target="_blank" rel="noopener noreferrer" className="block w-fit overflow-hidden rounded-md border border-default hover:border-strong">
            {/* eslint-disable-next-line @next/next/no-img-element -- lampiran privat lewat rute berizin */}
            <img src={`/api/bug/${l.id}/lampiran`} alt="Tangkapan layar dari pelapor" className="max-h-48 max-w-full bg-subtle object-contain" loading="lazy" />
            <span className="flex items-center gap-1 border-t border-default px-2 py-1 text-[12px] text-secondary">
              <ImageIcon aria-hidden="true" className="size-3.5" /> Buka ukuran penuh
            </span>
          </a>
        ) : null}
      </div>

      <div className="space-y-2 rounded-md bg-subtle p-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-secondary">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusBug)}
            data-testid="admin-bug-status"
            className="h-9 w-full rounded-md border border-default bg-panel px-2 text-[14px] text-primary"
          >
            {URUT.map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUS_BUG[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-secondary">Catatan untuk pelapor</span>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-md border border-default bg-panel px-2 py-1.5 text-[13px] text-primary"
            placeholder="Mis. sudah diperbaiki di versi hari ini."
          />
        </label>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={simpan} disabled={!berubah || memuat} data-testid="admin-bug-simpan">
            {memuat ? 'Menyimpan…' : 'Simpan'}
          </Button>
          {pesan ? <span className={cn('text-[12px]', pesan.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>{pesan.teks}</span> : null}
        </div>
      </div>
    </li>
  );
}

export function AdminLaporanBug({ laporan }: { laporan: LaporanBug[] }) {
  const [saring, setSaring] = useState<StatusBug | 'SEMUA'>('BARU');
  const jumlah = Object.fromEntries(URUT.map((s) => [s, laporan.filter((l) => l.status === s).length])) as Record<StatusBug, number>;
  const tampil = saring === 'SEMUA' ? laporan : laporan.filter((l) => l.status === saring);

  return (
    <div className="mx-auto max-w-[76rem] space-y-5 px-4 pt-6 pb-24 sm:px-6">
      <div>
        <h1 className="text-[28px] leading-9 font-semibold text-primary">Laporan bug</h1>
        <p className="mt-1 text-[15px] text-secondary">Laporan dari pengguna. Ubah status dan beri catatan - pelapor melihatnya di halaman Lapor bug.</p>
      </div>
      <div role="group" aria-label="Saring status" className="flex flex-wrap gap-1.5">
        {(['BARU', 'DITANGANI', 'SELESAI', 'DITOLAK', 'SEMUA'] as const).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`admin-bug-filter-${s}`}
            aria-pressed={saring === s}
            onClick={() => setSaring(s)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium',
              saring === s ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-primary' : 'border-default text-secondary hover:bg-subtle hover:text-primary',
            )}
          >
            {s === 'SEMUA' ? 'Semua' : LABEL_STATUS_BUG[s].label}
            <span className="tabular-nums text-tertiary">{s === 'SEMUA' ? laporan.length : jumlah[s]}</span>
          </button>
        ))}
      </div>
      {tampil.length === 0 ? (
        <p className="rounded-lg border border-dashed border-default px-4 py-10 text-center text-[14px] text-secondary">Tidak ada laporan dengan status ini.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-default)] overflow-hidden rounded-lg border border-default bg-panel">
          {tampil.map((l) => (
            <Item key={`${l.id}-${l.updated_at}`} l={l} />
          ))}
        </ul>
      )}
    </div>
  );
}
