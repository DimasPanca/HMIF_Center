/**
 * Daftar kendala + filter (T-082 #6). Komponen server: filter berupa form GET
 * biasa sehingga hasil pencarian dapat dibagikan sebagai tautan dan tetap
 * berfungsi tanpa JavaScript.
 *
 * Test id: kendala-filter, kendala-cari, kendala-filter-status,
 * kendala-filter-prioritas, kendala-daftar, kendala-baris-{id}.
 */

import { CircleAlert, MessageSquare, Paperclip, Search } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LABEL_PRIORITAS, LABEL_STATUS_KENDALA, PRIORITAS, STATUS_KENDALA } from '@/lib/kendala/skema';
import type { BarisKendala } from '@/lib/kendala/service';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

import { tonePrioritas, toneStatus } from './tone';

export interface NilaiFilter {
  q?: string;
  status?: string;
  prioritas?: string;
  departemen?: string;
  periode?: string;
}

export function KendalaList({
  baris,
  filter,
  aksi,
  departemen,
  periode,
  tampilDepartemen,
}: {
  baris: BarisKendala[];
  filter: NilaiFilter;
  /** URL tujuan form filter (halaman ini sendiri). */
  aksi: string;
  /** Pilihan departemen (hanya di halaman lintas departemen). */
  departemen?: { id: string; nama: string }[];
  /** Pilihan periode untuk arsip. */
  periode?: { id: string; nama: string }[];
  tampilDepartemen: boolean;
}) {
  return (
    <div className="grid gap-4">
      <form method="get" action={aksi} className="flex flex-wrap items-end gap-2" data-testid="kendala-filter" role="search">
        <label className="grid min-w-56 flex-1 gap-1 text-xs text-secondary">
          Cari judul, deskripsi, atau solusi
          <Input name="q" type="search" defaultValue={filter.q ?? ''} maxLength={200} placeholder="mis. venue, sponsor, perizinan" data-testid="kendala-cari" />
        </label>
        <label className="grid gap-1 text-xs text-secondary">
          Status
          <Select name="status" placeholder={null} defaultValue={filter.status ?? 'AKTIF'} data-testid="kendala-filter-status">
            <option value="AKTIF">Belum selesai</option>
            <option value="">Semua status</option>
            {STATUS_KENDALA.map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUS_KENDALA[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-secondary">
          Prioritas
          <Select name="prioritas" placeholder={null} defaultValue={filter.prioritas ?? ''} data-testid="kendala-filter-prioritas">
            <option value="">Semua prioritas</option>
            {PRIORITAS.map((p) => (
              <option key={p} value={p}>
                {LABEL_PRIORITAS[p]}
              </option>
            ))}
          </Select>
        </label>
        {departemen ? (
          <label className="grid gap-1 text-xs text-secondary">
            Departemen
            <Select name="departemen" placeholder={null} defaultValue={filter.departemen ?? ''} data-testid="kendala-filter-departemen">
              <option value="">Semua departemen</option>
              {departemen.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nama}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {periode && periode.length > 1 ? (
          <label className="grid gap-1 text-xs text-secondary">
            Periode
            <Select name="periode" placeholder={null} defaultValue={filter.periode ?? ''} data-testid="kendala-filter-periode">
              {periode.map((p, i) => (
                <option key={p.id} value={i === 0 ? '' : p.id}>
                  {p.nama}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <Button type="submit" variant="secondary" data-testid="kendala-terapkan">
          <Search className="size-4" aria-hidden="true" />
          Terapkan
        </Button>
      </form>

      {baris.length ? (
        <ul className="divide-y divide-[var(--border-subtle)] rounded-sm border border-default bg-panel" data-testid="kendala-daftar">
          {baris.map((k) => (
            <li key={k.id}>
              <Link
                href={`/departemen/kendala/${k.id}`}
                data-testid={`kendala-baris-${k.id}`}
                className="block p-3 outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={tonePrioritas(k.prioritas)}>
                    {k.prioritas === 'KRITIS' ? <CircleAlert data-slot="badge-icon" aria-hidden="true" /> : null}
                    {LABEL_PRIORITAS[k.prioritas]}
                  </Badge>
                  <Badge tone={toneStatus(k.status)}>{LABEL_STATUS_KENDALA[k.status]}</Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-primary">{k.judul}</span>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-secondary">
                  {tampilDepartemen ? <span>{k.nama_departemen ?? 'Lintas organisasi'}</span> : null}
                  <span>oleh {k.nama_pembuat}</span>
                  {k.nama_assignee ? <span>PJ {k.nama_assignee}</span> : null}
                  {k.nama_proker ? <span>{k.nama_proker}</span> : null}
                  <span>{formatTanggalPendek(k.created_at)}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="size-3" aria-hidden="true" />
                    {k.jumlah_balasan}
                  </span>
                  {k.jumlah_lampiran ? (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3" aria-hidden="true" />
                      {k.jumlah_lampiran}
                    </span>
                  ) : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-sm border border-dashed border-default p-6 text-center text-[13px] text-secondary" data-testid="kendala-kosong">
          {filter.q ? 'Tidak ada kendala yang cocok dengan pencarian.' : 'Belum ada kendala.'}
        </p>
      )}
    </div>
  );
}
