import { ClipboardCheck, Files, Inbox } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AksiApprovalSurat } from '@/components/surat/AksiApprovalSurat';
import { SegarkanBerkala } from '@/components/surat/SegarkanBerkala';
import { SuratPreview } from '@/components/surat/SuratPreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarBatch } from '@/lib/surat/batch';
import { muatSurat } from '@/lib/surat/draft';
import { JENIS_SURAT } from '@/lib/surat/field-schemas';
import { bacaKetuaHimpunan, bacaKonfigSurat } from '@/lib/surat/konfig';
import { daftarAntrianSurat, type ItemAntrianSurat } from '@/lib/surat/status';
import { cn } from '@/lib/utils';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

function namaJenis(kode: string): string {
  return JENIS_SURAT.find((j) => j.kode === kode)?.nama ?? `Surat ${kode}`;
}

function ItemAntrian({ s, aktif }: { s: ItemAntrianSurat; aktif: boolean }) {
  return (
    <li>
      <Link
        href={`/surat/approval?id=${s.id}`}
        data-testid={`surat-antrian-item-${s.id}`}
        aria-current={aktif ? 'true' : undefined}
        className={cn(
          'block rounded-sm border px-3 py-2.5 transition-colors duration-fast hover:bg-subtle',
          aktif ? 'border-[var(--primary)] bg-[var(--primary-subtle)]' : 'border-default bg-panel',
        )}
      >
        <p className="text-[11px] font-medium text-tertiary">
          {s.kode_surat} · {namaJenis(s.kode_surat)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[14px] font-medium text-primary">{s.perihal || '(tanpa perihal)'}</p>
        <p className="mt-1 text-[12px] text-secondary">
          {s.nama_pembuat}
          {s.nama_departemen ? ` · ${s.nama_departemen}` : ''}
        </p>
        <p className="text-[12px] text-tertiary">Diajukan {formatTanggalWaktu(s.diajukan_at)}</p>
      </Link>
    </li>
  );
}

/**
 * Antrian approval surat (T-060) — satu antrian yang sama untuk Ketua, Wakil,
 * dan Sekum (INV-05). BPH tidak punya `surat.approve` sehingga halaman ini
 * 404 baginya (INV-04).
 */
export default async function ApprovalSuratPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'surat.approve')) notFound();

  const { id } = await searchParams;
  const [antrian, konfig, ketua, batch] = await Promise.all([
    daftarAntrianSurat(konteks),
    bacaKonfigSurat(),
    bacaKetuaHimpunan(konteks.periodeId),
    daftarBatch(konteks),
  ]);
  const batchMenunggu = batch.filter((b) => b.menunggu > 0);
  const semua = [...antrian.menunggu, ...antrian.gagalTerbit];
  // Surat yang baru diterbitkan keluar dari antrian; bila dibuka lewat `?id=`
  // (tautan antrian), hasilnya — nomor dan unduhan — tetap tampil setelah
  // halaman disegarkan alih-alih lenyap.
  const dipilih = id && /^[0-9a-f-]{36}$/i.test(id) ? await muatSurat(konteks, id, konfig) : null;
  const terpilih =
    dipilih && (dipilih.status === 'TERBIT' || semua.some((s) => s.id === dipilih.id))
      ? dipilih
      : antrian.menunggu[0]
        ? await muatSurat(konteks, antrian.menunggu[0].id, konfig)
        : null;
  const terpilihId = terpilih?.id;

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <SegarkanBerkala />
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]" aria-hidden="true">
            <ClipboardCheck className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Persuratan</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Antrian approval surat</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Satu persetujuan dari Ketua, Wakil, atau Sekretaris Umum cukup. Nomor surat ditetapkan saat disetujui.
            </p>
          </div>
        </header>

        {batchMenunggu.length > 0 ? (
          <Link
            href="/surat/massal"
            data-testid="surat-antrian-batch"
            className="flex items-center gap-2 rounded-sm border border-default bg-panel px-3 py-2 text-[13px] hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
          >
            <Files aria-hidden="true" className="size-4 text-[var(--primary)]" />
            {batchMenunggu.length} batch Surat Keterangan Aktif massal (
            {batchMenunggu.reduce((n, b) => n + b.menunggu, 0)} surat) menunggu — disetujui per batch di halaman Surat Massal.
          </Link>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section aria-label="Daftar surat menunggu" className="min-w-0 space-y-4">
            <div>
              <h2 className="mb-2 text-[13px] font-semibold text-secondary">
                Menunggu persetujuan <span className="tabular-nums">({antrian.menunggu.length})</span>
              </h2>
              {antrian.menunggu.length === 0 ? (
                <div data-testid="surat-antrian-kosong" className="flex items-center gap-2 rounded-sm border border-dashed border-default px-3 py-4 text-[13px] text-tertiary">
                  <Inbox aria-hidden="true" className="size-4" /> Tidak ada surat yang menunggu.
                </div>
              ) : (
                <ul className="space-y-2" data-testid="surat-antrian">
                  {antrian.menunggu.map((s) => (
                    <ItemAntrian key={s.id} s={s} aktif={s.id === terpilihId} />
                  ))}
                </ul>
              )}
            </div>
            {antrian.gagalTerbit.length > 0 ? (
              <div>
                <h2 className="mb-2 text-[13px] font-semibold text-secondary">
                  Disetujui, dokumen belum terbit <span className="tabular-nums">({antrian.gagalTerbit.length})</span>
                </h2>
                <ul className="space-y-2" data-testid="surat-gagal-terbit">
                  {antrian.gagalTerbit.map((s) => (
                    <ItemAntrian key={s.id} s={s} aktif={s.id === terpilihId} />
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section aria-label="Surat terpilih" className="min-w-0">
            {terpilih && (terpilih.status === 'MENUNGGU_APPROVAL' || terpilih.status === 'DISETUJUI' || terpilih.status === 'TERBIT') ? (
              <Card>
                <CardHeader>
                  <CardTitle>{terpilih.nilai.perihal || namaJenis(terpilih.kode_surat)}</CardTitle>
                  <p className="text-[13px] text-secondary">
                    {namaJenis(terpilih.kode_surat)} · oleh {terpilih.nama_pembuat}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AksiApprovalSurat key={terpilih.id} suratId={terpilih.id} status={terpilih.status} nomor={terpilih.nomor_lengkap} />
                  <SuratPreview nilai={terpilih.nilai} konfig={konfig} ketua={ketua} />
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-sm border border-dashed border-default px-4 py-10 text-center text-[13px] text-tertiary">
                Pilih surat dari daftar untuk meninjaunya.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
