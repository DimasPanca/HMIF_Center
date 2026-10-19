import { ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS = ['MENUNGGU_VERIFIKASI', 'PERLU_PERBAIKAN', 'TERVERIFIKASI', 'DITOLAK'] as const;
type StatusNota = (typeof STATUS)[number];
const LABEL: Record<StatusNota, string> = {
  MENUNGGU_VERIFIKASI: 'Menunggu',
  PERLU_PERBAIKAN: 'Perlu perbaikan',
  TERVERIFIKASI: 'Terverifikasi',
  DITOLAK: 'Ditolak',
};

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
const tanggal = (d: Date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);

/**
 * Semua nota belanja periode aktif lintas acara, untuk Bendahara (ADR-037).
 * Verifikasinya tetap di antrean Verifikasi Nota; halaman ini untuk memantau.
 */
export default async function SemuaNotaPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'nota.verify')) notFound();
  const { status } = await searchParams;
  const pilihan = STATUS.includes(status as StatusNota) ? (status as StatusNota) : null;

  const [nota, jumlah] = await Promise.all([
    db.nota.findMany({
      where: { divisi: { kepanitiaan: { proker: { periode_id: konteks.periodeId } } }, ...(pilihan ? { status: pilihan } : {}) },
      orderBy: [{ tanggal_belanja: 'desc' }, { created_at: 'desc' }],
      take: 300,
      select: {
        id: true,
        tanggal_belanja: true,
        total_nota: true,
        keterangan: true,
        status: true,
        divisi: { select: { nama: true, kepanitiaan: { select: { id: true, nama_acara: true } } } },
        app_user_nota_uploader_idToapp_user: { select: { nama_lengkap: true } },
      },
    }),
    db.nota.groupBy({
      by: ['status'],
      where: { divisi: { kepanitiaan: { proker: { periode_id: konteks.periodeId } } } },
      _count: { _all: true },
    }),
  ]);
  const hitung = Object.fromEntries(jumlah.map((j) => [j.status, j._count._all])) as Partial<Record<string, number>>;
  const total = jumlah.reduce((s, j) => s + j._count._all, 0);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]" aria-hidden="true">
            <ReceiptText className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Keuangan</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Semua nota</h1>
            <p className="mt-1 text-[14px] leading-5 text-secondary">Nota belanja seluruh acara periode ini. Ketuk nota untuk membuka acaranya.</p>
          </div>
        </header>

        <nav aria-label="Saring status nota" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {[{ kunci: null, label: 'Semua', n: total }, ...STATUS.map((s) => ({ kunci: s, label: LABEL[s], n: hitung[s] ?? 0 }))].map((f) => (
            <Link
              key={f.label}
              href={f.kunci ? `/keuangan/nota/semua?status=${f.kunci}` : '/keuangan/nota/semua'}
              aria-current={pilihan === f.kunci ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 text-[14px]',
                pilihan === f.kunci ? 'border-[var(--primary)] bg-[var(--primary-subtle)] font-medium text-[var(--primary)]' : 'border-default bg-panel text-secondary',
              )}
            >
              <span className="truncate">{f.label}</span>
              <span className="tabular-nums">{f.n}</span>
            </Link>
          ))}
        </nav>

        {nota.length === 0 ? (
          <p className="rounded-sm border border-dashed border-default px-3 py-6 text-center text-[14px] text-tertiary">Tidak ada nota.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {nota.map((n) => (
              <li key={n.id}>
                <Link href={`/acara/${n.divisi.kepanitiaan.id}?tab=nota`} className="block focus-visible:outline-2 focus-visible:outline-offset-2">
                  <Card className="space-y-2 p-4 transition-colors hover:border-[var(--primary)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusPill status={n.status} />
                      <span className="text-[16px] font-semibold tabular-nums">{rupiah(Number(n.total_nota))}</span>
                    </div>
                    <p className="text-[14px] font-medium break-words">{n.keterangan || 'Nota belanja'}</p>
                    <p className="text-[13px] text-secondary break-words">
                      {n.divisi.kepanitiaan.nama_acara} · Divisi {n.divisi.nama}
                    </p>
                    <p className="text-[12px] text-tertiary">
                      {tanggal(n.tanggal_belanja)} · diunggah {n.app_user_nota_uploader_idToapp_user.nama_lengkap}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
