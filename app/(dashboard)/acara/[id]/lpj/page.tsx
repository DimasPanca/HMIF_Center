import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { LampiranNota } from '@/components/lpj/LampiranNota';
import { LpjAksi } from '@/components/lpj/LpjAksi';
import { PrasyaratChecklist } from '@/components/lpj/PrasyaratChecklist';
import { Card } from '@/components/ui/card';
import { konteksSaatIni } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { AnalisisLpj } from '@/lib/lpj/analyze';
import { bolehBacaLpj, dokumenLpjTerakhir, muatLpj } from '@/lib/lpj/generate';
import { storage } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABEL_STATUS: Record<string, string> = {
  DRAFT: 'Draft',
  DIAJUKAN: 'Diajukan — menunggu Bendahara',
  DISETUJUI_BENDUM: 'Disetujui Bendahara — menunggu Ketua',
  FINAL: 'Final',
};

/** Bagian OTOMATIS (kontrak 2): laporan keuangan dari analisis T-104. */
function LaporanKeuangan({ a, snapshot }: { a: AnalisisLpj; snapshot: boolean }) {
  return (
    <Card className="space-y-3 p-4" data-testid="lpj-keuangan" data-snapshot={snapshot ? '1' : '0'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Laporan keuangan (otomatis)</h2>
        <span className="rounded-sm bg-subtle px-1.5 py-0.5 text-[11px] text-secondary">
          {snapshot
            ? `Snapshot ${formatTanggalWaktu(a.dihitungAt)}`
            : 'Dihitung langsung dari RAB & nota'}
        </span>
      </div>
      <dl className="grid gap-2 text-[13px] sm:grid-cols-4">
        {(
          [
            ['Total pemasukan', a.totalPemasukan, 'lpj-total-pemasukan'],
            ['Total pengeluaran', a.totalAktual, 'lpj-total-pengeluaran'],
            ['Total rencana RAB', a.totalRencana, 'lpj-total-rencana'],
            ['Sisa dana', a.sisaDana, 'lpj-sisa-dana'],
          ] as const
        ).map(([label, n, id]) => (
          <div key={id} className="rounded-sm bg-subtle p-2">
            <dt className="text-secondary">{label}</dt>
            <dd className="font-semibold tabular-nums" data-testid={id}>
              {formatRupiah(n)}
            </dd>
          </div>
        ))}
      </dl>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-default text-left text-secondary">
            <th className="py-1 font-medium">Divisi</th>
            <th className="py-1 text-right font-medium">Rencana</th>
            <th className="py-1 text-right font-medium">Aktual</th>
            <th className="py-1 text-right font-medium">Selisih</th>
          </tr>
        </thead>
        <tbody>
          {a.perDivisi.map((d) => (
            <tr key={d.id} className="border-b border-default">
              <td className="py-1">{d.nama}</td>
              <td className="py-1 text-right tabular-nums">{formatRupiah(d.rencana)}</td>
              <td className="py-1 text-right tabular-nums">{formatRupiah(d.aktual)}</td>
              <td className={cn('py-1 text-right tabular-nums', d.selisih > 0 && 'text-danger')}>
                {formatRupiah(d.selisih)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-3 text-[13px] sm:grid-cols-3">
        <div data-testid="lpj-over-budget">
          <h3 className="font-semibold text-danger">Melebihi anggaran ({a.overBudget.length})</h3>
          <ul className="text-secondary">
            {a.overBudget.map((i) => (
              <li key={i.id}>
                {i.jenis_barang} · lebih {formatRupiah(i.selisih)}
              </li>
            ))}
          </ul>
        </div>
        <div data-testid="lpj-belum-realisasi">
          <h3 className="font-semibold">Belum direalisasikan ({a.belumRealisasi.length})</h3>
          <ul className="text-secondary">
            {a.belumRealisasi.map((i) => (
              <li key={i.id}>
                {i.divisi} · {i.jenis_barang}
              </li>
            ))}
          </ul>
        </div>
        <div data-testid="lpj-luar-rab">
          <h3 className="font-semibold text-warning">
            Di luar RAB — temuan ({a.diLuarRab.length})
          </h3>
          <ul className="text-secondary">
            {a.diLuarRab.map((x, i) => (
              <li key={`${x.nota_id}-${i}`}>
                {x.uraian} · {formatRupiah(x.nominal)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-[12px] text-secondary">
        Dana tak terduga {formatRupiah(a.danaTakTerduga)} · terpakai{' '}
        {formatRupiah(a.danaTakTerdugaTerpakai)}
        {a.kekuranganDanaTakTerduga
          ? ` · kekurangan ${formatRupiah(a.kekuranganDanaTakTerduga)}`
          : ''}
      </p>
    </Card>
  );
}

/** LPJ acara (T-105, PRD F-12.1): prasyarat, bagian otomatis vs manual, lampiran nota, persetujuan. */
export default async function LpjPage({ params }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!bolehBacaLpj(konteks.roles)) notFound();
  const { id } = await params;
  if (!POLA_UUID.test(id)) notFound();
  const [lpj, dokumen] = await Promise.all([muatLpj(konteks, id), dokumenLpjTerakhir(konteks, id)]);
  if (lpj === null) notFound();
  if (lpj === 'TERBATAS') {
    return (
      <main className="min-h-dvh bg-app p-6">
        <BelumTersedia
          ikon="dokumen"
          judul="LPJ acara ini terbatas"
          penjelasan="Laporan keuangan hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia acara ini."
          aksi={{ label: 'Kembali ke acara', href: `/acara/${id}` }}
        />
      </main>
    );
  }
  const foto = lpj.manual.dokumentasi.length
    ? await db.image.findMany({
        where: { id: { in: lpj.manual.dokumentasi.map((x) => x.image_id) } },
        select: { id: true, thumbnail_path: true },
      })
    : [];
  const thumbFoto = Object.fromEntries(
    foto.map((f) => [f.id, storage.getPublicUrl(f.thumbnail_path)]),
  );

  return (
    <main
      className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6"
      data-testid="halaman-lpj"
      data-status={lpj.status}
    >
      <div className="mx-auto max-w-[92rem] space-y-4">
        <header className="pt-4">
          <nav aria-label="Breadcrumb" className="text-[12px] text-secondary">
            <Link href="/acara" className="hover:underline">
              Acara
            </Link>
            {' / '}
            <Link href={`/acara/${id}?tab=lpj`} className="hover:underline">
              {lpj.nama_acara}
            </Link>
            {' / LPJ'}
          </nav>
          <h1 className="mt-1 text-2xl font-semibold">Laporan Pertanggungjawaban</h1>
          <p className="text-[13px] text-secondary">
            Status:{' '}
            <span className="font-medium text-primary" data-testid="lpj-status">
              {LABEL_STATUS[lpj.status] ?? lpj.status}
            </span>
            {lpj.persetujuan.bendum ? ` · Bendahara: ${lpj.persetujuan.bendum.oleh}` : ''}
            {lpj.persetujuan.ketua ? ` · Ketua: ${lpj.persetujuan.ketua.oleh}` : ''}
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-4">
            <PrasyaratChecklist butir={lpj.prasyarat} />
            <LampiranNota
              nota={lpj.lampiran.map((n) => ({
                id: n.id,
                divisi: n.divisi,
                keterangan: n.keterangan,
                thumbUrl: storage.getPublicUrl(n.thumbnail_path),
              }))}
            />
          </div>
          <div className="min-w-0 space-y-4">
            <LaporanKeuangan a={lpj.analisis} snapshot={lpj.analisis_snapshot} />
            <LpjAksi
              kepanitiaanId={id}
              status={lpj.status}
              izin={lpj.izin}
              manual={lpj.manual}
              divisi={lpj.divisi}
              thumbFoto={thumbFoto}
              dokumenAt={dokumen?.created_at.toISOString() ?? null}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
