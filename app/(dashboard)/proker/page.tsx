import Link from 'next/link';
import {
  CalendarDays,
  ClipboardList,
  ClipboardPlus,
  LockKeyhole,
  UnlockKeyhole,
} from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarProker, dalamLingkup } from '@/lib/proker/service';
import { cn } from '@/lib/utils';
import { formatRentangTanggal } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

const LABEL_KATEGORI = {
  TERJADWAL: 'Terjadwal',
  BERKALA: 'Berkala',
  RESPONSIF: 'Responsif',
} as const;

function rentangProker(mulai: string | null, selesai: string | null, berkala: boolean) {
  if (mulai && selesai) return formatRentangTanggal(mulai, selesai);
  return berkala ? 'Mengikuti pola berkala' : 'Belum dijadwalkan';
}

export default async function DaftarProkerPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'proker.read')) notFound();

  const proker = await daftarProker(konteks.periodeId);
  const bolehMembuat = can(konteks.roles, 'proker.create');
  const bolehMenyunting = can(konteks.roles, 'proker.update');

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
              aria-hidden="true"
            >
              <ClipboardList className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
                Program kerja
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold">Daftar program kerja</h1>
              <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
                Pantau status pengajuan dan lihat apakah jadwal program kerja sudah terkunci.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link href="/proker/kalender" className={buttonVariants({ variant: 'secondary' })}>
              <CalendarDays aria-hidden="true" />
              Kalender
            </Link>
            {bolehMembuat ? (
              <Link href="/proker/baru" className={buttonVariants()}>
                <ClipboardPlus aria-hidden="true" />
                Tambah proker
              </Link>
            ) : null}
          </div>
        </header>

        <Card className="overflow-hidden p-0">
          <Table
            aria-label="Daftar program kerja periode aktif"
            rowCount={proker.length}
            emptyState={
              <div className="py-4">
                <ClipboardList className="mx-auto size-8 text-tertiary" aria-hidden="true" />
                <p className="mt-3 text-[14px] font-semibold text-primary">
                  Belum ada program kerja
                </p>
                <p className="mt-1 text-[12px] text-secondary">
                  Program kerja yang diajukan pada periode aktif akan muncul di sini.
                </p>
              </div>
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Departemen</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Pelaksanaan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kunci kalender</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proker.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {bolehMenyunting &&
                    dalamLingkup(konteks, 'proker.update', item.departemen_id) ? (
                      <Link
                        href={`/proker/${item.id}`}
                        className="rounded-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
                      >
                        {item.nama}
                      </Link>
                    ) : (
                      item.nama
                    )}
                  </TableCell>
                  <TableCell>{item.nama_departemen}</TableCell>
                  <TableCell>{LABEL_KATEGORI[item.kategori]}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {rentangProker(
                      item.tanggal_hari_h_mulai,
                      item.tanggal_hari_h_selesai,
                      item.kategori === 'BERKALA',
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={item.status} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]',
                        item.terkunci ? 'text-danger' : 'text-secondary',
                      )}
                    >
                      {item.terkunci ? (
                        <LockKeyhole className="size-3.5" aria-hidden="true" />
                      ) : (
                        <UnlockKeyhole className="size-3.5" aria-hidden="true" />
                      )}
                      {item.terkunci ? 'Terkunci' : 'Belum terkunci'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </main>
  );
}
