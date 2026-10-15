/**
 * Kepala ruang kerja acara (T-084, USER_FLOW §6.2): breadcrumb yang selalu
 * terlihat (Acara → Divisi), nama acara, departemen PIC, status, ketua
 * pelaksana, rentang tanggal, dan `kode_kegiatan` — kode yang masuk ke nomor
 * surat — bersama tautan cepat "Buat Surat untuk acara ini".
 *
 * Test id: acara-breadcrumb, acara-header, acara-kode-kegiatan, acara-buat-surat.
 */

import { ChevronRight, FileSignature } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { STATUS_VALUES, StatusPill, type DomainStatus } from '@/components/ui/status-pill';
import type { RuangAcara } from '@/lib/acara/service';
import { formatRentangTanggal, formatTanggalPendek } from '@/lib/utils/format-tanggal';

function rentang(mulai: string | null, selesai: string | null): string | null {
  if (!mulai) return null;
  return selesai && selesai >= mulai ? formatRentangTanggal(mulai, selesai) : formatTanggalPendek(mulai);
}

export function AcaraHeader({
  acara,
  divisi,
  bolehSurat,
}: {
  acara: RuangAcara;
  /** Diisi pada ruang kerja divisi — menjadi ujung breadcrumb. */
  divisi?: { nama: string };
  bolehSurat: boolean;
}) {
  const persiapan = rentang(acara.persiapan_mulai, acara.hari_h_mulai);
  const hariH = rentang(acara.hari_h_mulai, acara.hari_h_selesai);
  const status = (STATUS_VALUES as readonly string[]).includes(acara.status) ? (acara.status as DomainStatus) : null;

  return (
    <div className="space-y-3">
      <nav
        aria-label="Breadcrumb"
        data-testid="acara-breadcrumb"
        className="sticky top-0 z-10 -mx-4 border-b border-default bg-app/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-secondary">
          <li>
            <Link href="/acara" className="hover:text-primary hover:underline">
              Acara Besar
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li className="min-w-0 truncate">
            {divisi ? (
              <Link href={`/acara/${acara.id}?tab=divisi`} className="hover:text-primary hover:underline">
                {acara.nama_acara}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-primary">
                {acara.nama_acara}
              </span>
            )}
          </li>
          {divisi ? (
            <>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li aria-current="page" className="min-w-0 truncate font-medium text-primary">
                Divisi {divisi.nama}
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <header data-testid="acara-header" className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{divisi ? `Divisi ${divisi.nama}` : acara.nama_acara}</h1>
            <Badge tone="primary">{acara.departemen.nama}</Badge>
            {status ? <StatusPill status={status} /> : null}
          </div>
          {divisi ? <p className="mt-0.5 text-[14px] text-secondary">{acara.nama_acara}</p> : null}
          <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-secondary">
            <div className="flex gap-1">
              <dt>Ketua Pelaksana:</dt>
              <dd className="text-primary">{acara.ketua_pelaksana ?? 'Belum ditetapkan'}</dd>
            </div>
            {persiapan ? (
              <div className="flex gap-1">
                <dt>Persiapan</dt>
                <dd>{persiapan}</dd>
              </div>
            ) : null}
            {hariH ? (
              <div className="flex gap-1">
                <dt>Hari-H</dt>
                <dd>{hariH}</dd>
              </div>
            ) : null}
            <div className="flex gap-1">
              <dt>Kode kegiatan:</dt>
              <dd data-testid="acara-kode-kegiatan" className="font-mono text-primary">
                {acara.kode_kegiatan ?? '—'}
              </dd>
            </div>
          </dl>
        </div>
        {bolehSurat ? (
          <Link href={`/surat/baru?acara=${acara.id}`} className={buttonVariants({ variant: 'secondary' })} data-testid="acara-buat-surat">
            <FileSignature aria-hidden="true" /> Buat Surat untuk acara ini
          </Link>
        ) : null}
      </header>
    </div>
  );
}
