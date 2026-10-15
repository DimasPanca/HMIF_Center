import { Target } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { BilahProgres } from '@/components/acara/DivisiCard';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { STATUS_VALUES, StatusPill, type DomainStatus } from '@/components/ui/status-pill';
import { daftarAcara } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatRentangTanggal, formatTanggalPendek } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

const statusSah = (s: string) => ((STATUS_VALUES as readonly string[]).includes(s) ? (s as DomainStatus) : null);

function hariH(mulai: string | null, selesai: string | null): string {
  if (!mulai) return 'Tanggal belum ditetapkan';
  return selesai && selesai > mulai ? formatRentangTanggal(mulai, selesai) : formatTanggalPendek(mulai);
}

/**
 * Daftar acara besar periode aktif (T-084 kontrak 1): status, tanggal, PIC
 * departemen, total RAB, progres. Sumber: tabel `kepanitiaan` — terbentuk
 * otomatis saat proker TERJADWAL disetujui (PRD F-8.1).
 */
export default async function DaftarAcaraPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'kepanitiaan.read')) notFound();

  const acara = await daftarAcara(konteks);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <Target className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Acara Besar</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Daftar acara</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Acara besar periode ini. Kepanitiaan terbentuk otomatis saat proker terjadwal disetujui; panitianya boleh lintas departemen.
            </p>
          </div>
        </header>

        {acara.length === 0 ? (
          <Card>
            <BelumTersedia
              testid="acara-kosong"
              ikon="folder"
              judul="Belum ada acara besar"
              penjelasan="Acara besar muncul di sini setelah proker terjadwal disetujui dan kepanitiaannya terbentuk."
              aksi={{ label: 'Lihat daftar proker', href: '/proker' }}
            />
          </Card>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {acara.map((a) => {
              const status = statusSah(a.status);
              return (
                <li key={a.id}>
                  <Card className="flex h-full flex-col gap-3 p-4" data-testid="acara-item">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/acara/${a.id}`} className="text-[16px] font-semibold hover:underline" data-testid="acara-item-buka">
                          {a.nama_acara}
                        </Link>
                        <p className="mt-0.5 text-[13px] text-secondary">{hariH(a.hari_h_mulai, a.hari_h_selesai)}</p>
                      </div>
                      {status ? <StatusPill status={status} className="shrink-0" /> : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="primary">PIC {a.departemen.nama}</Badge>
                      {a.kode_kegiatan ? <Badge>{a.kode_kegiatan}</Badge> : null}
                      {a.saya_panitia ? <Badge tone="info">Anda panitia</Badge> : null}
                    </div>
                    <dl className="grid gap-1 text-[13px]">
                      <div className="flex justify-between gap-2">
                        <dt className="text-secondary">Ketua Pelaksana</dt>
                        <dd className="truncate">{a.ketua_pelaksana ?? 'Belum ditetapkan'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-secondary">Total RAB</dt>
                        <dd className="tabular-nums" data-testid="acara-item-rab">
                          {a.total_rab === null ? 'Terbatas' : formatRupiah(a.total_rab)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-secondary">Divisi</dt>
                        <dd className="tabular-nums">{a.jumlah_divisi}</dd>
                      </div>
                    </dl>
                    <div className="mt-auto">
                      <BilahProgres progres={a.progres} label="Progres" />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
