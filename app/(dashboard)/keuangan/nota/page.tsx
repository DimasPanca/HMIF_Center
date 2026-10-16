import { Plus } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { STATUS_VALUES, StatusPill, type DomainStatus } from '@/components/ui/status-pill';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { notaSaya } from '@/lib/nota/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

/** Nota saya (T-101): status tiap nota; yang dikembalikan Bendahara dapat diperbaiki. */
export default async function NotaSayaPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'nota.create')) notFound();
  const daftar = await notaSaya(konteks);

  return (
    <main
      className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6"
      data-testid="halaman-nota-saya"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3 pt-4">
          <div>
            <h1 className="text-2xl font-semibold">Nota saya</h1>
            <p className="text-[13px] text-secondary">
              Nota belanja yang Anda unggah di periode ini.
            </p>
          </div>
          <Link
            href="/keuangan/nota/upload"
            className={buttonVariants({ variant: 'primary' })}
            data-testid="nota-upload-baru"
          >
            <Plus aria-hidden="true" /> Upload nota
          </Link>
        </header>
        {daftar.length === 0 ? (
          <Card className="p-6 text-center text-[13px] text-secondary">
            Belum ada nota yang Anda unggah.
          </Card>
        ) : (
          <ul className="grid gap-2" data-testid="nota-saya">
            {daftar.map((n) => (
              <li key={n.id}>
                <Card
                  className="flex flex-wrap items-center gap-3 p-3"
                  data-testid="nota-saya-baris"
                  data-status={n.status}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium tabular-nums">
                      {formatRupiah(n.total_nota)}
                    </p>
                    <p className="text-[12px] text-secondary">
                      {formatTanggalPendek(n.tanggal_belanja)} · {n.divisi} · {n.acara}
                    </p>
                    {n.alasan_penolakan ? (
                      <p className="mt-1 text-[12px] text-danger">Alasan: {n.alasan_penolakan}</p>
                    ) : null}
                  </div>
                  {(STATUS_VALUES as readonly string[]).includes(n.status) ? (
                    <StatusPill status={n.status as DomainStatus} />
                  ) : (
                    n.status
                  )}
                  {n.dapat_diperbaiki && n.status !== 'MENUNGGU_VERIFIKASI' ? (
                    <Link
                      href={`/keuangan/nota/upload?perbaiki=${n.id}`}
                      className={buttonVariants({ variant: 'secondary' })}
                      data-testid="nota-perbaiki"
                    >
                      Perbaiki
                    </Link>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
