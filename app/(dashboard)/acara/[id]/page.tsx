import { CalendarRange, Info } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AcaraHeader } from '@/components/acara/AcaraHeader';
import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { DivisiCard } from '@/components/acara/DivisiCard';
import { RingkasanAcara } from '@/components/acara/RingkasanAcara';
import { TabNav, tabDari, type TabAcara } from '@/components/acara/TabNav';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { muatAcara, type RuangAcara } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function PeranSaya({ acara }: { acara: RuangAcara }) {
  const { ketua_pelaksana, divisi } = acara.peran_saya;
  if (!ketua_pelaksana && divisi.length === 0) return null;
  const kalimat = ketua_pelaksana
    ? 'Anda adalah Ketua Pelaksana acara ini dan dapat mengelola seluruh divisi.'
    : `Anda adalah ${divisi.map((d) => `${d.peran === 'KOORDINATOR' ? 'Koordinator' : 'Anggota'} Divisi ${d.nama}`).join(', ')}. Divisi lain dapat dilihat namun tidak dapat diubah.`;
  return (
    <p data-testid="acara-peran-saya" className="flex items-start gap-2 rounded-sm bg-[var(--info-subtle)] p-3 text-[13px]">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--info)]" />
      {kalimat}
    </p>
  );
}

const ringkasan = (id: string) => ({ label: 'Kembali ke Ringkasan', href: `/acara/${id}?tab=ringkasan` });

function IsiTab({ acara, tab }: { acara: RuangAcara; tab: TabAcara }) {
  switch (tab) {
    case 'ringkasan':
      return <RingkasanAcara acara={acara} />;

    case 'gantt':
      return acara.chart.length === 0 ? (
        <BelumTersedia
          testid="acara-isi-gantt"
          ikon="gantt"
          judul="Belum ada timeline"
          penjelasan="Timeline acara terbentuk bersama kepanitiaan. Acara ini belum punya chart Gantt."
          aksi={ringkasan(acara.id)}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="acara-isi-gantt">
          {acara.chart.map((c) => {
            const divisi = acara.divisi.find((d) => d.id === c.divisi_id);
            return (
              <li key={c.id}>
                <Link href={`/gantt/${c.id}`} className="flex items-center gap-3 rounded-sm border border-default bg-panel p-3 hover:bg-subtle">
                  <CalendarRange aria-hidden="true" className="size-5 shrink-0 text-tertiary" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{c.judul}</span>
                    <span className="block text-[12px] text-secondary">{divisi ? `Divisi ${divisi.nama}` : 'Timeline acara'}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      );

    case 'divisi':
      return acara.divisi.length === 0 ? (
        <BelumTersedia
          testid="acara-isi-divisi"
          ikon="tugas"
          judul="Belum ada divisi"
          penjelasan="Divisi kepanitiaan dibentuk dari rencana proker saat disetujui."
          aksi={ringkasan(acara.id)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="acara-isi-divisi">
          {acara.divisi.map((d) => (
            <DivisiCard key={d.id} acaraId={acara.id} divisi={d} />
          ))}
        </div>
      );

    case 'rab':
      return !acara.boleh_rab ? (
        <BelumTersedia
          testid="acara-isi-rab"
          ikon="uang"
          judul="RAB acara ini terbatas"
          penjelasan="Rincian anggaran hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia acara ini."
          aksi={ringkasan(acara.id)}
        />
      ) : (
        <Card className="p-0" data-testid="acara-isi-rab">
          <p className="p-4 pb-2 text-[13px] text-secondary">
            Total per divisi. Rincian item tampil di ruang kerja masing-masing divisi; penyuntingan RAB per sel belum tersedia di versi ini.
          </p>
          <Table aria-label="Total RAB per divisi" rowCount={acara.divisi.length + 1} emptyState={null}>
            <TableHeader>
              <TableRow>
                <TableHead>Divisi</TableHead>
                <TableHead className="text-right">Total RAB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acara.divisi.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/acara/${acara.id}/divisi/${d.id}#rab`} className="hover:underline">
                      {d.nama}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(d.total_rab ?? 0)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatRupiah(acara.ringkasan.total_rab ?? 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      );

    case 'nota':
      return !acara.ringkasan.nota ? (
        <BelumTersedia
          testid="acara-isi-nota"
          ikon="nota"
          judul="Nota acara ini terbatas"
          penjelasan="Nota belanja hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia acara ini."
          aksi={ringkasan(acara.id)}
        />
      ) : (
        <BelumTersedia
          testid="acara-isi-nota"
          ikon="nota"
          judul={`${acara.ringkasan.nota.terverifikasi} nota terverifikasi · ${acara.ringkasan.nota.menunggu} menunggu`}
          penjelasan="Unggah dan verifikasi nota belum tersedia di versi ini. Daftar nota per divisi ada di ruang kerja divisi."
          aksi={{ label: 'Lihat divisi', href: `/acara/${acara.id}?tab=divisi` }}
        />
      );

    case 'tor':
      return (
        <BelumTersedia
          testid="acara-isi-tor"
          ikon="dokumen"
          judul="Editor TOR belum tersedia"
          penjelasan="Term of Reference akan disusun di sini dari data acara dan RAB, lalu dibuat menjadi dokumen resmi."
          aksi={ringkasan(acara.id)}
        />
      );

    case 'proposal':
      return (
        <BelumTersedia
          testid="acara-isi-proposal"
          ikon="dokumen"
          judul="Editor proposal belum tersedia"
          penjelasan="Proposal kegiatan akan dibuat dari TOR dan RAB acara ini setelah keduanya tersusun."
          aksi={ringkasan(acara.id)}
        />
      );

    case 'lpj':
      return (
        <BelumTersedia
          testid="acara-isi-lpj"
          ikon="dokumen"
          judul="Generator LPJ belum tersedia"
          penjelasan="Laporan pertanggungjawaban akan dibuat dari RAB, nota terverifikasi, dan pemasukan setelah acara selesai."
          aksi={ringkasan(acara.id)}
        />
      );
  }
}

/**
 * Ruang kerja acara besar (T-084, USER_FLOW §6.2): delapan tab. Tab yang belum
 * punya fitur menjelaskan dirinya dengan EmptyState, bukan halaman kosong.
 */
export default async function RuangAcaraPage({ params, searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'kepanitiaan.read')) notFound();

  const { id } = await params;
  if (!POLA_UUID.test(id)) notFound();
  const acara = await muatAcara(konteks, id);
  if (!acara) notFound();

  const sp = await searchParams;
  const tab = tabDari(Array.isArray(sp.tab) ? sp.tab[0] : sp.tab);

  return (
    <main className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <AcaraHeader acara={acara} bolehSurat={can(konteks.roles, 'surat.create')} />
        <PeranSaya acara={acara} />
        <TabNav acaraId={acara.id} aktif={tab} />
        <section aria-label={`Tab ${tab}`} data-testid={`acara-panel-${tab}`}>
          <IsiTab acara={acara} tab={tab} />
        </section>
      </div>
    </main>
  );
}
