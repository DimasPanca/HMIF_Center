import Link from 'next/link';
import { ArrowRight, CalendarRange, ClipboardCheck, Inbox } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarApproval } from '@/lib/proker/approval';
import { formatRentangTanggal, formatTanggalPendek } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

const LABEL_KATEGORI = {
  TERJADWAL: 'Terjadwal',
  BERKALA: 'Berkala',
  RESPONSIF: 'Responsif',
} as const;

function rentang(mulai: string | null, selesai: string | null) {
  return mulai && selesai ? formatRentangTanggal(mulai, selesai) : 'Tidak mengunci kalender';
}

export default async function ApprovalProkerPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'proker.approve')) notFound();

  const antrian = await daftarApproval(konteks);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <ClipboardCheck className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
              Program kerja
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold">Antrian approval proker</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Tinjau pengajuan secara menyeluruh sebelum kalender dan ruang kerja kepanitiaan
              dibentuk.
            </p>
          </div>
        </header>

        <section data-testid="approval-antrian" aria-label="Antrian approval proker">
          {antrian.length === 0 ? (
            <div
              role="status"
              className="flex min-h-56 flex-col items-center justify-center rounded-md border border-default bg-panel p-6 text-center"
            >
              <Inbox className="size-9 text-tertiary" aria-hidden="true" />
              <h2 className="mt-3 text-[16px] font-semibold text-primary">Antrian sudah bersih</h2>
              <p className="mt-1 max-w-md text-[13px] leading-[18px] text-secondary">
                Belum ada program kerja yang menunggu persetujuan Ketua atau Wakil.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {antrian.map((item) => (
                <Link
                  key={item.id}
                  href={`/proker/approval/${item.id}`}
                  data-testid={`approval-item-${item.id}`}
                  className="group rounded-md border border-default bg-panel p-4 outline-none transition-[border-color,background-color,box-shadow] duration-fast hover:border-strong hover:bg-subtle focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] motion-reduce:transition-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-primary">{item.nama}</p>
                      <p className="mt-1 text-[12px] text-secondary">
                        {item.nama_departemen} · {LABEL_KATEGORI[item.kategori]}
                      </p>
                    </div>
                    <StatusPill status={item.status} className="shrink-0" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-subtle pt-3 text-[12px] text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarRange className="size-3.5" aria-hidden="true" />
                      {rentang(item.tanggal_mulai_persiapan, item.tanggal_hari_h_selesai)}
                    </span>
                    <span>
                      Diajukan{' '}
                      {item.diajukan_at ? formatTanggalPendek(item.diajukan_at.slice(0, 10)) : '—'}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
                      Buka detail
                      <ArrowRight
                        className="size-3.5 transition-transform duration-fast group-hover:translate-x-0.5 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
