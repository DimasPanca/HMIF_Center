'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import type { RingkasRestore } from '@/lib/backup/restore';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

type ResponsApi<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const LABEL_TAHAP: Record<string, string> = {
  PRA_RESTORE: 'Backup pra-restore',
  VERIFIKASI: 'Verifikasi checksum',
  TERAPKAN: 'Menerapkan',
  SELESAI: 'Selesai',
};

/** Restore terakhir sebuah backup: tahap, progres, laporan (T-112 kontrak 6). */
export function ProgresRestore({
  backupId,
  segarkan,
  bolehKelola,
}: {
  backupId: string;
  segarkan: number;
  bolehKelola: boolean;
}) {
  const [job, setJob] = useState<RingkasRestore | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    const r = await fetch(`/api/backup/${backupId}/restore`, { cache: 'no-store' });
    const b = (await r.json().catch(() => null)) as ResponsApi<RingkasRestore[]> | null;
    if (b?.ok) setJob(b.data[0] ?? null);
  }, [backupId]);

  useEffect(() => {
    void muat();
  }, [muat, segarkan]);

  const berjalan = job?.status === 'BERJALAN';
  useEffect(() => {
    if (!berjalan) return;
    const t = setInterval(() => void muat(), 2000);
    return () => clearInterval(t);
  }, [berjalan, muat]);

  async function lanjutkan() {
    if (!job) return;
    setGalat(null);
    const r = await fetch(`/api/backup/${backupId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aksi: 'lanjut', jobId: job.id }),
    });
    const b = (await r.json().catch(() => null)) as ResponsApi<unknown> | null;
    if (!b?.ok) setGalat(b && !b.ok ? b.error.message : 'Restore tidak dapat dilanjutkan.');
    await muat();
  }

  if (!job) return null;
  const l = job.laporan;
  return (
    <div
      className="space-y-1 rounded-sm border border-default p-2 text-[12px]"
      data-testid="progres-restore"
      data-status={job.status}
      data-tahap={job.tahap}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={job.status} />
        <span className="font-medium">
          Restore{' '}
          {job.mode === 'PENUH'
            ? 'penuh'
            : `per modul (${job.modul.join(', ')} · ${job.strategi?.toLowerCase()})`}
        </span>
        <span className="text-secondary">{formatTanggalWaktu(job.created_at)}</span>
      </div>
      {berjalan ? (
        <div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuenow={job.progres.persen ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progres restore"
          >
            <div
              className="h-full bg-[var(--primary)] transition-all"
              style={{ width: `${job.progres.persen ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-secondary">
            {LABEL_TAHAP[job.tahap] ?? job.tahap} · {job.progres.persen ?? 0}% · {job.progres.pesan}
          </p>
        </div>
      ) : null}
      {job.terputus && bolehKelola ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-warning">
            Restore terputus di tahap {LABEL_TAHAP[job.tahap] ?? job.tahap}.
          </span>
          <Button variant="secondary" onClick={() => void lanjutkan()}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Lanjutkan
          </Button>
        </div>
      ) : null}
      {job.error_message ? <p className="text-danger">{job.error_message}</p> : null}
      {l.terpakai?.length ? (
        <p className="text-secondary" data-testid="laporan-terpakai">
          Sudah terpakai:{' '}
          {l.terpakai
            .map(
              (t) =>
                `${t.modul} (${t.tabel.reduce((n, x) => n + (x.tertulis ?? 0), 0)} baris tertulis)`,
            )
            .join(', ')}
          {l.gagalPada ? ` · gagal pada ${l.gagalPada}` : ''}
        </p>
      ) : null}
      {job.status === 'SUKSES' && job.mode === 'PENUH' ? (
        <p className="text-secondary">
          {l.berkasStorage ?? 0} berkas dipulihkan · {l.database?.tabelDikosongkan ?? 0} tabel
          database dalam {l.database?.detik ?? 0} detik
        </p>
      ) : null}
      {l.praRestoreId ? (
        <p className="text-tertiary">Backup pra-restore: {l.praRestoreId}</p>
      ) : null}
      {galat ? <p className="text-danger">{galat}</p> : null}
    </div>
  );
}
