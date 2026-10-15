import { ArrowLeft, Download, FilePenLine } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BatalkanSurat } from '@/components/surat/BatalkanSurat';
import { BuatPdf } from '@/components/surat/BuatPdf';
import { NomorSuratBadge } from '@/components/surat/NomorSuratBadge';
import { SuratPreview } from '@/components/surat/SuratPreview';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { StatusPill } from '@/components/ui/status-pill';
import { ToastProvider } from '@/components/ui/toast';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { bacaKonfigPdf } from '@/lib/documents/pdf-converter';
import { detailArsip } from '@/lib/surat/arsip';
import { muatSurat } from '@/lib/surat/draft';
import { bacaKetuaHimpunan, bacaKonfigSurat } from '@/lib/surat/konfig';
import { formatTanggalSurat, formatTanggalWaktu } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detail surat di arsip (T-063): metadata, unduh ulang DOCX/PDF, pratinjau
 * isi, dan pembatalan surat TERBIT oleh Ketua/Wakil/Sekum. Surat periode lain
 * dapat dibuka (baca saja, INV-08) — tanpa pratinjau dan tanpa tombol batal.
 */
export default async function DetailSuratPage({ params }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'surat.read')) notFound();

  const { id } = await params;
  if (!POLA_UUID.test(id)) notFound();
  const s = await detailArsip(konteks, id);
  if (!s) notFound();

  const periodeAktif = s.periode_id === konteks.periodeId;
  const [konfig, ketua, isian] = periodeAktif
    ? await Promise.all([bacaKonfigSurat(), bacaKetuaHimpunan(konteks.periodeId), muatSurat(konteks, id)])
    : [null, null, null];
  const milikSaya = s.dibuat_oleh === konteks.sesi.userId;
  const pdfAktif = bacaKonfigPdf().aktif && (milikSaya || can(konteks.roles, 'surat.approve'));
  const bolehBatal = s.status === 'TERBIT' && periodeAktif && can(konteks.roles, 'surat.approve') && s.nomor_lengkap;
  const bolehSunting = milikSaya && periodeAktif && (s.status === 'DRAFT' || s.status === 'DITOLAK');

  const rincian: [string, React.ReactNode][] = [
    ['Jenis', s.nama_jenis],
    ['Perihal', s.perihal || '—'],
    ['Tujuan', s.tujuan_nama === '-' ? '—' : `${s.tujuan_nama}${s.tujuan_alamat && s.tujuan_alamat !== '-' ? `, ${s.tujuan_alamat}` : ''}`],
    ['Tanggal surat', formatTanggalSurat(s.tanggal_surat)],
    ['Kegiatan', s.kode_kegiatan || '—'],
    ['Departemen', s.nama_departemen ?? '—'],
    ['Pembuat', s.nama_pembuat],
    ['Approver', s.nama_penyetuju ? `${s.nama_penyetuju}${s.disetujui_at ? ` · ${formatTanggalWaktu(s.disetujui_at)}` : ''}` : '—'],
    ['Periode', s.nama_periode],
  ];

  return (
    <ToastProvider>
      <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <Link href="/surat" className={buttonVariants({ variant: 'ghost' })}>
            <ArrowLeft aria-hidden="true" /> Arsip surat
          </Link>

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={s.status} />
              {s.nomor_lengkap ? (
                <span data-testid="surat-detail-nomor">
                  <NomorSuratBadge nomor={s.nomor_lengkap} />
                </span>
              ) : (
                <span className="text-[13px] text-tertiary">Belum bernomor</span>
              )}
            </div>
            <h1 className="text-2xl font-semibold">{s.perihal || s.nama_jenis}</h1>
          </header>

          {s.status === 'DIBATALKAN' ? (
            <InlineAlert
              data-testid="surat-detail-batal"
              title="Surat ini dibatalkan"
              detail={`${s.alasan_pembatalan ?? 'Tanpa alasan tercatat.'}${s.nama_pembatal ? ` — ${s.nama_pembatal}` : ''}${
                s.dibatalkan_at ? `, ${formatTanggalWaktu(s.dibatalkan_at)}` : ''
              }. Nomornya tetap tercatat dan tidak dipakai ulang.`}
            />
          ) : null}
          {s.status === 'DITOLAK' && s.alasan_penolakan ? (
            <InlineAlert title="Surat ditolak" detail={s.alasan_penolakan} />
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div className="min-w-0 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Rincian</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]" data-testid="surat-detail-rincian">
                    {rincian.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-secondary">{k}</dt>
                        <dd className="min-w-0 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dokumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {s.ada_docx || s.ada_pdf ? (
                    <div className="flex flex-wrap gap-2">
                      {s.ada_docx ? (
                        <a href={`/api/surat/${s.id}/download`} className={buttonVariants({})} data-testid="surat-detail-unduh-docx" download>
                          <Download aria-hidden="true" /> Unduh DOCX
                        </a>
                      ) : null}
                      {s.ada_pdf ? (
                        <a href={`/api/surat/${s.id}/download?format=pdf`} className={buttonVariants({ variant: 'secondary' })} download>
                          <Download aria-hidden="true" /> Unduh PDF
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[13px] text-secondary">Dokumen tersedia setelah surat disetujui dan terbit.</p>
                  )}
                  {s.status === 'TERBIT' && s.ada_docx && !s.ada_pdf && pdfAktif && periodeAktif ? <BuatPdf suratId={s.id} /> : null}
                  {bolehSunting ? (
                    <Link href={`/surat/baru?id=${s.id}`} className={buttonVariants({ variant: 'secondary' })}>
                      <FilePenLine aria-hidden="true" /> Lanjutkan menyunting
                    </Link>
                  ) : null}
                  {bolehBatal ? <BatalkanSurat suratId={s.id} nomor={s.nomor_lengkap!} /> : null}
                </CardContent>
              </Card>
            </div>

            <section aria-label="Pratinjau isi surat" className="min-w-0">
              {isian && konfig ? (
                <SuratPreview nilai={isian.nilai} konfig={konfig} ketua={ketua} nomorFinal={s.nomor_lengkap} />
              ) : (
                <div className="rounded-sm border border-dashed border-default px-4 py-10 text-center text-[13px] text-tertiary">
                  Pratinjau hanya tersedia untuk surat periode aktif. Unduh dokumennya untuk melihat isi.
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </ToastProvider>
  );
}
