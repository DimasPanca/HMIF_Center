'use client';

import { CheckCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { STATUS_KEHADIRAN, type StatusKehadiran } from '@/lib/notulensi/skema';
import { cn } from '@/lib/utils';

export interface BarisHadir {
  user_id: string;
  nama: string;
  jabatan: string | null;
}

const LABEL: Record<StatusKehadiran, string> = { HADIR: 'Hadir', IZIN: 'Izin', SAKIT: 'Sakit', ALFA: 'Alfa' };

const WARNA_TERPILIH: Record<StatusKehadiran, string> = {
  HADIR: 'bg-[var(--success-subtle)] text-[var(--success)]',
  IZIN: 'bg-[var(--info-subtle)] text-[var(--info)]',
  SAKIT: 'bg-[var(--warning-subtle)] text-[var(--warning)]',
  ALFA: 'bg-[var(--danger-subtle)] text-[var(--danger)]',
};

export function hitungRingkasan(status: Record<string, StatusKehadiran>, userIds: Iterable<string>) {
  const r = { hadir: 0, izin: 0, sakit: 0, alfa: 0, kosong: 0 };
  for (const id of userIds) {
    const s = status[id];
    if (s === 'HADIR') r.hadir++;
    else if (s === 'IZIN') r.izin++;
    else if (s === 'SAKIT') r.sakit++;
    else if (s === 'ALFA') r.alfa++;
    else r.kosong++;
  }
  return r;
}

interface DaftarHadirProps {
  baris: BarisHadir[];
  status: Record<string, StatusKehadiran>;
  editable: boolean;
  memuat?: boolean;
  onUbah?: (userId: string, status: StatusKehadiran | null) => void;
  onTandaiSemuaHadir?: () => void;
}

export function DaftarHadir({ baris, status, editable, memuat = false, onUbah, onTandaiSemuaHadir }: DaftarHadirProps) {
  const r = hitungRingkasan(status, baris.map((b) => b.user_id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-secondary tabular-nums">
          <span data-testid="notulensi-hadir-ringkasan" className="font-medium text-primary">
            {r.hadir} Hadir · {r.izin} Izin · {r.sakit} Sakit · {r.alfa} Alfa
          </span>
          {r.kosong > 0 ? <span> · {r.kosong} belum diisi</span> : null}
        </p>
        {editable && r.kosong > 0 ? (
          <Button variant="secondary" onClick={onTandaiSemuaHadir}>
            <CheckCheck aria-hidden="true" />
            Tandai sisanya Hadir
          </Button>
        ) : null}
      </div>

      {memuat ? (
        <p className="text-[13px] text-secondary">Memuat daftar pengurus…</p>
      ) : baris.length === 0 ? (
        <p className="text-[13px] text-secondary">Belum ada pengurus pada periode aktif untuk daftar hadir ini.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] rounded-sm border border-default">
          {baris.map((b) => {
            const terpilih = status[b.user_id];
            return (
              <li key={b.user_id} className="flex min-h-9 flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-primary">{b.nama}</p>
                  {b.jabatan ? <p className="truncate text-[12px] text-secondary">{b.jabatan}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {editable ? (
                    <div
                      role="radiogroup"
                      aria-label={`Kehadiran ${b.nama}`}
                      data-testid={`notulensi-hadir-${b.user_id}`}
                      className="inline-flex overflow-hidden rounded-sm border border-[var(--text-tertiary)]"
                    >
                      {STATUS_KEHADIRAN.map((s) => (
                        <label
                          key={s}
                          className={cn(
                            'flex h-[30px] cursor-pointer items-center px-2.5 text-[12px] font-medium text-secondary transition-colors duration-fast motion-reduce:transition-none',
                            'hover:bg-subtle has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--border-focus)] has-[input:focus-visible]:ring-inset',
                            '[&:not(:first-child)]:border-l [&:not(:first-child)]:border-[var(--text-tertiary)]',
                            terpilih === s && WARNA_TERPILIH[s],
                          )}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={`hadir-${b.user_id}`}
                            value={s}
                            checked={terpilih === s}
                            onChange={() => onUbah?.(b.user_id, s)}
                            onClick={() => terpilih === s && onUbah?.(b.user_id, null)}
                          />
                          {LABEL[s]}
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <span
                    data-testid={`notulensi-hadir-status-${b.user_id}`}
                    data-status={terpilih ?? ''}
                    className={cn(
                      'min-w-[4.5rem] rounded-xs px-2 py-0.5 text-center text-[12px] font-medium',
                      terpilih ? WARNA_TERPILIH[terpilih] : 'text-tertiary',
                      editable && 'sr-only',
                    )}
                  >
                    {terpilih ? LABEL[terpilih] : 'Belum diisi'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
