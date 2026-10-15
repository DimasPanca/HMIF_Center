import { Archive, ChevronRight, Download, FilePlus2, FileSpreadsheet, Files, Inbox } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { FilterArsipBar } from '@/components/surat/FilterArsip';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarArsip, filterDariQuery, pilihanFilterArsip, queryDariFilter } from '@/lib/surat/arsip';
import { cn } from '@/lib/utils';
import { formatTanggalSurat } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const tautan =
  'rounded-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]';

/**
 * Arsip Surat (T-063, PRD F-4.4). Filter & kursor di URL — dapat dibagikan.
 * Surat DIBATALKAN selalu tampil dengan badge dan nomornya; arsip yang
 * menyembunyikannya membuat urutan nomor tampak berlubang.
 */
export default async function ArsipSuratPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'surat.read')) notFound();

  const filter = filterDariQuery(await searchParams);
  const periodeId = filter.periode ?? konteks.periodeId;
  const [halaman, pilihan] = await Promise.all([daftarArsip(konteks, filter), pilihanFilterArsip(konteks, periodeId)]);
  const bolehMembuat = can(konteks.roles, 'surat.create');
  const queryExport = queryDariFilter(filter, { cursor: undefined });

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
              aria-hidden="true"
            >
              <Archive className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Persuratan</p>
              <h1 className="mt-0.5 text-2xl font-semibold">Arsip surat</h1>
              <p className="mt-1 text-[14px] leading-5 text-secondary" data-testid="arsip-jumlah">
                <span className="tabular-nums">{halaman.total}</span> surat
                {filter.q ? (
                  <>
                    {' '}
                    cocok dengan <q>{filter.q}</q>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <a
              href={`/api/surat${queryExport}${queryExport ? '&' : '?'}format=xlsx`}
              className={buttonVariants({ variant: 'secondary' })}
              data-testid="arsip-export"
              download
            >
              <FileSpreadsheet aria-hidden="true" /> Export Excel
            </a>
            {bolehMembuat ? (
              <Link href="/surat/massal" className={buttonVariants({ variant: 'secondary' })}>
                <Files aria-hidden="true" /> Surat aktif massal
              </Link>
            ) : null}
            {bolehMembuat ? (
              <Link href="/surat/baru" className={buttonVariants()}>
                <FilePlus2 aria-hidden="true" /> Buat surat
              </Link>
            ) : null}
          </div>
        </header>

        <FilterArsipBar filter={filter} pilihan={pilihan} periodeAktif={konteks.periodeId} />

        <Card className="overflow-hidden p-0">
          <Table
            aria-label="Arsip surat"
            data-testid="arsip-tabel"
            rowCount={halaman.baris.length}
            emptyState={
              <div className="py-4" data-testid="arsip-kosong">
                <Inbox className="mx-auto size-8 text-tertiary" aria-hidden="true" />
                <p className="mt-3 text-[14px] font-semibold text-primary">Tidak ada surat</p>
                <p className="mt-1 text-[12px] text-secondary">
                  {filter.q || filter.jenis || filter.status || filter.bulan || filter.departemen || filter.kegiatan
                    ? 'Tidak ada surat yang cocok dengan filter ini.'
                    : 'Surat yang diajukan pada periode ini akan muncul di sini.'}
                </p>
              </div>
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Perihal</TableHead>
                <TableHead>Tujuan</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Pembuat</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {halaman.baris.map((s) => {
                const batal = s.status === 'DIBATALKAN';
                return (
                  <TableRow key={s.id} data-testid={`arsip-baris-${s.id}`} data-status={s.status}>
                    <TableCell className={cn('whitespace-nowrap font-mono text-[12px]', batal && 'text-secondary')}>
                      {s.nomor_lengkap ?? <span className="font-sans text-tertiary">Belum bernomor</span>}
                    </TableCell>
                    <TableCell className="text-[13px]">{s.nama_jenis}</TableCell>
                    <TableCell className="min-w-56 font-medium">
                      <Link href={`/surat/${s.id}`} className={tautan}>
                        {s.perihal || s.nama_jenis}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-44 text-[13px]">{s.tujuan_nama === '-' ? '—' : s.tujuan_nama}</TableCell>
                    <TableCell className="whitespace-nowrap text-[13px]">{formatTanggalSurat(s.tanggal_surat)}</TableCell>
                    <TableCell className="text-[13px]">{s.nama_pembuat}</TableCell>
                    <TableCell className="text-[13px]">{s.nama_penyetuju ?? '—'}</TableCell>
                    <TableCell>
                      <StatusPill status={s.status} />
                    </TableCell>
                    <TableCell action>
                      <div className="flex items-center gap-1">
                        {s.ada_docx ? (
                          <a
                            href={`/api/surat/${s.id}/download`}
                            className={buttonVariants({ variant: 'ghost' })}
                            aria-label={`Unduh DOCX ${s.nomor_lengkap ?? s.perihal}`}
                            data-testid={`arsip-unduh-docx-${s.id}`}
                            download
                          >
                            <Download aria-hidden="true" /> DOCX
                          </a>
                        ) : null}
                        {s.ada_pdf ? (
                          <a
                            href={`/api/surat/${s.id}/download?format=pdf`}
                            className={buttonVariants({ variant: 'ghost' })}
                            aria-label={`Unduh PDF ${s.nomor_lengkap ?? s.perihal}`}
                            download
                          >
                            <Download aria-hidden="true" /> PDF
                          </a>
                        ) : null}
                        <Link
                          href={`/surat/${s.id}`}
                          className={buttonVariants({ variant: 'ghost' })}
                          aria-label={`Detail ${s.nomor_lengkap ?? s.perihal}`}
                        >
                          <ChevronRight aria-hidden="true" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {filter.cursor || halaman.berikut ? (
          <nav aria-label="Halaman arsip" className="flex flex-wrap items-center justify-between gap-2">
            {filter.cursor ? (
              <Link href={`/surat${queryDariFilter(filter, { cursor: undefined })}`} className={buttonVariants({ variant: 'ghost' })}>
                Ke halaman pertama
              </Link>
            ) : (
              <span />
            )}
            {halaman.berikut ? (
              <Link
                href={`/surat${queryDariFilter(filter, { cursor: halaman.berikut })}`}
                className={buttonVariants({ variant: 'secondary' })}
                data-testid="arsip-berikutnya"
              >
                Halaman berikutnya <ChevronRight aria-hidden="true" />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
