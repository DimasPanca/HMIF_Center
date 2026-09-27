import { FilePlus2, ScrollText, Search } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarNotulensi } from '@/lib/notulensi/service';
import { formatTanggalPanjang } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

export default async function ArsipNotulensiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'notulensi.read')) notFound();

  const { q: qMentah } = await searchParams;
  const q = (Array.isArray(qMentah) ? qMentah[0] : qMentah)?.trim().slice(0, 200) ?? '';
  const notulensi = await daftarNotulensi(konteks, { q: q || undefined });
  const bolehMembuat = can(konteks.roles, 'notulensi.create');

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
              aria-hidden="true"
            >
              <ScrollText className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Kesekretariatan</p>
              <h1 className="mt-0.5 text-2xl font-semibold">Arsip notulensi</h1>
              <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
                Cari notulensi rapat periode aktif berdasarkan judul, tempat, isi, atau poin keputusan.
              </p>
            </div>
          </div>
          {bolehMembuat ? (
            <Link href="/sekretariat/notulensi/baru" className={buttonVariants()}>
              <FilePlus2 aria-hidden="true" />
              Notulensi baru
            </Link>
          ) : null}
        </header>

        <form method="get" role="search" className="flex max-w-xl gap-2">
          <Input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={200}
            data-testid="notulensi-cari"
            aria-label="Cari notulensi"
            placeholder="Cari kata di judul atau isi rapat"
          />
          <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
            <Search aria-hidden="true" />
            Cari
          </button>
        </form>

        <Card className="overflow-hidden p-0" data-testid="notulensi-list">
          <Table
            aria-label="Arsip notulensi periode aktif"
            rowCount={notulensi.length}
            emptyState={
              <div className="py-4">
                <ScrollText className="mx-auto size-8 text-tertiary" aria-hidden="true" />
                <p className="mt-3 text-[14px] font-semibold text-primary">
                  {q ? 'Tidak ada notulensi yang cocok' : 'Belum ada notulensi'}
                </p>
                <p className="mt-1 text-[12px] text-secondary">
                  {q ? 'Coba kata kunci lain.' : 'Notulensi rapat periode aktif akan muncul di sini.'}
                </p>
              </div>
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Judul rapat</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Tempat</TableHead>
                <TableHead>Tingkat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notulensi.map((n) => (
                <TableRow key={n.id} data-testid={`notulensi-row-${n.id}`}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/sekretariat/notulensi/${n.id}`}
                      className="rounded-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
                    >
                      {n.judul}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatTanggalPanjang(n.tanggal)}</TableCell>
                  <TableCell>{n.tempat ?? '—'}</TableCell>
                  <TableCell>{n.nama_departemen ?? 'Himpunan'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </main>
  );
}
