'use client';

import { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import type { RingkasBackup } from '@/lib/backup/service';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

type ResponsApi<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const LABEL_JENIS: Record<RingkasBackup['jenis'], string> = {
  OTOMATIS: 'Otomatis',
  MANUAL: 'Manual',
  PRA_RESTORE: 'Pra-restore',
};

function ukuran(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Daftar backup + tombol "Backup Sekarang"; memantau progres selama ada yang BERJALAN (T-110). */
export function BackupPanel({ bolehKelola }: { bolehKelola: boolean }) {
  const [daftar, setDaftar] = useState<RingkasBackup[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);

  const muat = useCallback(async () => {
    const r = await fetch('/api/backup', { cache: 'no-store' });
    const b = (await r.json().catch(() => null)) as ResponsApi<RingkasBackup[]> | null;
    if (b?.ok) setDaftar(b.data);
    else setGalat(b && !b.ok ? b.error.message : 'Daftar backup tidak dapat dimuat.');
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const berjalan = daftar?.some((b) => b.status === 'BERJALAN') ?? false;
  useEffect(() => {
    if (!berjalan) return;
    const t = setInterval(() => void muat(), 2000);
    return () => clearInterval(t);
  }, [berjalan, muat]);

  async function mulai() {
    setMengirim(true);
    setGalat(null);
    try {
      const r = await fetch('/api/backup', { method: 'POST' });
      const b = (await r.json().catch(() => null)) as ResponsApi<{ id: string }> | null;
      if (!b?.ok) setGalat(b && !b.ok ? b.error.message : 'Backup tidak dapat dimulai.');
      await muat();
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {bolehKelola ? (
          <Button onClick={mulai} disabled={mengirim || berjalan} data-testid="backup-sekarang">
            <DatabaseBackup className="size-4" aria-hidden="true" />
            {berjalan ? 'Backup sedang berjalan…' : 'Backup Sekarang'}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => void muat()}
          aria-label="Muat ulang daftar backup"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Muat ulang
        </Button>
      </div>
      {galat ? (
        <p role="alert" className="text-[13px] text-danger" data-testid="backup-galat">
          {galat}
        </p>
      ) : null}

      {daftar === null ? (
        <p className="text-[13px] text-secondary">Memuat…</p>
      ) : daftar.length === 0 ? (
        <EmptyState
          icon={<DatabaseBackup />}
          title="Belum ada backup"
          description="Backup otomatis berjalan setiap tanggal 1. Admin dapat membuat backup manual kapan saja."
          action={
            bolehKelola ? (
              <Button onClick={mulai} disabled={mengirim}>
                Backup Sekarang
              </Button>
            ) : (
              <Button onClick={() => void muat()}>Muat ulang</Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2" data-testid="daftar-backup">
          {daftar.map((b) => (
            <li key={b.id}>
              <Card
                className="space-y-2 p-3"
                data-testid="baris-backup"
                data-status={b.status}
                data-id={b.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={b.status} />
                    <span className="text-[13px] font-medium">{LABEL_JENIS[b.jenis]}</span>
                    <span className="text-[12px] text-secondary">
                      {formatTanggalWaktu(b.created_at)}
                      {b.dibuat_oleh ? ` · ${b.dibuat_oleh}` : ''}
                    </span>
                  </div>
                  <span className="text-[12px] text-secondary tabular-nums">
                    {ukuran(b.ukuran_bytes)}
                    {b.jumlah_berkas !== null ? ` · ${b.jumlah_berkas} berkas` : ''}
                    {b.jumlah_record !== null
                      ? ` · ${b.jumlah_record.toLocaleString('id-ID')} record`
                      : ''}
                    {b.versi_skema ? ` · skema v${b.versi_skema}` : ''}
                    {b.migrasi_terakhir ? ` (${b.migrasi_terakhir})` : ''}
                  </span>
                </div>
                {b.progres ? (
                  <div data-testid="progres-backup">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-subtle"
                      role="progressbar"
                      aria-valuenow={b.progres.persen}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Progres backup"
                    >
                      <div
                        className="h-full bg-[var(--primary)] transition-all"
                        style={{ width: `${b.progres.persen}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[12px] text-secondary">
                      {b.progres.persen}% · {b.progres.pesan}
                    </p>
                  </div>
                ) : null}
                {b.error_message ? (
                  <p className="text-[12px] text-danger">{b.error_message}</p>
                ) : null}
                {b.keterbatasan.length ? (
                  <ul className="list-disc pl-5 text-[12px] text-secondary">
                    {b.keterbatasan.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
