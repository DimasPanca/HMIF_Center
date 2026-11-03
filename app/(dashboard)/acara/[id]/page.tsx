import { CalendarRange, FileText, Receipt } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AcaraHeader } from '@/components/acara/AcaraHeader';
import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { DivisiCard } from '@/components/acara/DivisiCard';
import { DaftarForm } from '@/components/form/DaftarForm';
import { RingkasanAcara } from '@/components/acara/RingkasanAcara';
import { TabNav, tabDari, type TabAcara } from '@/components/acara/TabNav';
import { PemasukanPanel } from '@/components/rab/PemasukanPanel';
import { RabAktualTab } from '@/components/rab/RabAktualTab';
import { RabGrid } from '@/components/rab/RabGrid';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { susunJalur, type IdLangkah, type LangkahJalur, type TugasSaya } from '@/lib/acara/jalur';
import { muatJalur, muatTugasSaya } from '@/lib/acara/jalur-data';
import { muatAcara, type RuangAcara } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { bolehBuat } from '@/lib/form/akses';
import { daftarForm, type RingkasForm } from '@/lib/form/service';
import { muatProposal } from '@/lib/proposal/service';
import { muatPemasukan, type DataPemasukan } from '@/lib/rab/pemasukan';
import { muatRab, muatRabAktual, type DataRab, type DataRabAktual } from '@/lib/rab/service';
import { muatTor, ringkasKelengkapan } from '@/lib/tor/service';
import { tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ringkasan = (id: string) => ({
  label: 'Kembali ke Ikhtisar',
  href: `/acara/${id}?tab=ringkasan`,
});

function IsiTab({
  acara,
  tab,
  rab,
  pemasukan,
  aktual,
  bolehBatal,
  tor,
  proposal,
  formulir,
  ikhtisar,
  aksesNota,
}: {
  acara: RuangAcara;
  tab: TabAcara;
  rab: DataRab | 'TERBATAS' | null;
  pemasukan: DataPemasukan | 'TERBATAS' | null;
  aktual: DataRabAktual | 'TERBATAS' | null;
  bolehBatal: boolean;
  tor: { terisi: number; total: number; kurang: string[]; boleh_tulis: boolean } | null;
  proposal: { persen: number; tersimpan: boolean; boleh_tulis: boolean } | null;
  formulir: { forms: RingkasForm[]; bolehBuat: boolean } | null;
  aksesNota: { upload: boolean; verifikasi: boolean };
  ikhtisar: {
    jalur: { langkah: LangkahJalur[]; berikutnya: IdLangkah | null };
    tugas: TugasSaya[] | null;
    formAktif: RingkasForm[] | null;
    hariIni: string;
  } | null;
}) {
  switch (tab) {
    case 'formulir':
      return formulir ? <DaftarForm forms={formulir.forms} bolehBuat={formulir.bolehBuat} bolehTemplate={false} acaraId={acara.id} /> : null;

    case 'ringkasan':
      return ikhtisar ? <RingkasanAcara acara={acara} {...ikhtisar} /> : null;

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
                <Link
                  href={`/gantt/${c.id}`}
                  className="flex items-center gap-3 rounded-sm border border-default bg-panel p-3 hover:bg-subtle"
                >
                  <CalendarRange aria-hidden="true" className="size-5 shrink-0 text-tertiary" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{c.judul}</span>
                    <span className="block text-[12px] text-secondary">
                      {divisi ? `Divisi ${divisi.nama}` : 'Timeline acara'}
                    </span>
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
      ) : rab && rab !== 'TERBATAS' ? (
        <div data-testid="acara-isi-rab" className="space-y-6">
          <RabGrid awal={rab} />
          {pemasukan && pemasukan !== 'TERBATAS' ? <PemasukanPanel awal={pemasukan} /> : null}
          {aktual && aktual !== 'TERBATAS' ? (
            <RabAktualTab data={aktual} bolehBatal={bolehBatal} />
          ) : null}
        </div>
      ) : null;

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
        <Card className="space-y-3 p-4" data-testid="acara-isi-nota">
          <div className="flex items-start gap-3">
            <Receipt aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-tertiary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Nota belanja</h2>
              <p className="text-[13px] text-secondary">
                {acara.ringkasan.nota.terverifikasi} terverifikasi · {acara.ringkasan.nota.menunggu} menunggu verifikasi ·{' '}
                {acara.ringkasan.nota.ditolak} ditolak. Nota yang terverifikasi otomatis masuk ke RAB Aktual dan LPJ.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {aksesNota.upload ? (
              <Link href="/keuangan/nota/upload" className={buttonVariants({ variant: 'primary' })} data-testid="acara-upload-nota">
                Upload nota
              </Link>
            ) : null}
            {aksesNota.verifikasi ? (
              <Link href="/keuangan/nota/verifikasi" className={buttonVariants({ variant: aksesNota.upload ? 'secondary' : 'primary' })}>
                Verifikasi nota
              </Link>
            ) : null}
            {aksesNota.upload ? (
              <Link href="/keuangan/nota" className={buttonVariants({ variant: 'secondary' })}>
                Nota saya
              </Link>
            ) : null}
            <Link href={`/acara/${acara.id}?tab=divisi`} className={buttonVariants({ variant: 'ghost' })}>
              Nota per divisi
            </Link>
          </div>
        </Card>
      );

    case 'tor':
      return (
        <Card className="space-y-3 p-4" data-testid="acara-isi-tor">
          <div className="flex items-start gap-3">
            <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-tertiary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Term of Reference</h2>
              <p className="text-[13px] text-secondary">
                {tor ? `${tor.terisi} dari ${tor.total} bagian terisi.` : ''} Anggaran ditarik
                otomatis dari RAB dan rundown dipakai bersama Proposal serta Surat Undangan.
              </p>
              {tor && tor.kurang.length ? (
                <p className="mt-1 text-[12px] text-tertiary">
                  Belum terisi: {tor.kurang.join(', ')}
                </p>
              ) : null}
            </div>
          </div>
          <Link
            href={`/acara/${acara.id}/tor`}
            className={buttonVariants({ variant: 'primary' })}
            data-testid="acara-buka-tor"
          >
            {tor?.boleh_tulis ? 'Susun TOR' : 'Lihat TOR'}
          </Link>
        </Card>
      );

    case 'proposal':
      return (
        <Card className="space-y-3 p-4" data-testid="acara-isi-proposal">
          <div className="flex items-start gap-3">
            <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-tertiary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Proposal Kegiatan</h2>
              <p className="text-[13px] text-secondary">
                {proposal
                  ? `${proposal.persen}% field terisi otomatis dari TOR, data panitia, dan RAB.`
                  : ''}{' '}
                Susunan kepanitiaan dan anggaran selalu ditarik dari data acara.
              </p>
            </div>
          </div>
          <Link
            href={`/acara/${acara.id}/proposal`}
            className={buttonVariants({ variant: 'primary' })}
            data-testid="acara-buka-proposal"
          >
            {proposal?.boleh_tulis
              ? proposal.tersimpan
                ? 'Lanjutkan proposal'
                : 'Buat proposal'
              : 'Lihat proposal'}
          </Link>
        </Card>
      );

    case 'lpj':
      return (
        <BelumTersedia
          testid="acara-isi-lpj"
          ikon="dokumen"
          judul="Laporan Pertanggungjawaban"
          penjelasan="LPJ disusun dari RAB, nota terverifikasi, dan pemasukan acara ini - laporan keuangan, kepanitiaan, dan lampiran nota terisi otomatis; disetujui Bendahara lalu Ketua Himpunan."
          aksi={{ label: 'Buka LPJ', href: `/acara/${acara.id}/lpj` }}
        />
      );
  }
}

/**
 * Ruang kerja acara besar (T-084, USER_FLOW §6.2): delapan tab + Formulir (ADR-038), dikelompokkan
 * per fase kerja (ADR-039). Tab yang belum punya fitur menjelaskan dirinya dengan EmptyState.
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
  const rab = tab === 'rab' && acara.boleh_rab ? await muatRab(konteks, acara.id) : null;
  const pemasukan =
    tab === 'rab' && acara.boleh_rab ? await muatPemasukan(konteks, acara.id) : null;
  const aktual = tab === 'rab' && acara.boleh_rab ? await muatRabAktual(konteks, acara.id) : null;
  const torLengkap = tab === 'tor' ? await muatTor(konteks, acara.id) : null;
  const tor = torLengkap
    ? { ...ringkasKelengkapan(torLengkap), boleh_tulis: torLengkap.boleh_tulis }
    : null;
  const formulir =
    tab === 'formulir' && can(konteks.roles, 'form.read')
      ? { forms: await daftarForm(konteks, { kepanitiaanId: acara.id }), bolehBuat: can(konteks.roles, 'form.create') && (await bolehBuat(konteks, acara.id)) }
      : null;
  const hariIni = tanggalHariIniJakarta();
  const panitia = acara.peran_saya.ketua_pelaksana || acara.peran_saya.divisi.length > 0;
  const ikhtisar =
    tab === 'ringkasan'
      ? await Promise.all([
          muatJalur(konteks, acara),
          panitia ? muatTugasSaya(konteks, acara) : Promise.resolve(null),
          can(konteks.roles, 'form.read')
            ? daftarForm(konteks, { kepanitiaanId: acara.id }).then((f) => f.filter((x) => x.status === 'DIBUKA'))
            : Promise.resolve(null),
        ]).then(([fakta, tugas, formAktif]) => ({ jalur: susunJalur(fakta, hariIni), tugas, formAktif, hariIni }))
      : null;
  const propLengkap = tab === 'proposal' ? await muatProposal(konteks, acara.id) : null;
  const proposal = propLengkap
    ? {
        persen: propLengkap.ukuran.persen_otomatis,
        tersimpan: propLengkap.tersimpan,
        boleh_tulis: propLengkap.boleh_tulis,
      }
    : null;

  return (
    <main className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <AcaraHeader acara={acara} bolehSurat={can(konteks.roles, 'surat.create')} tampilPeran />
        <TabNav acaraId={acara.id} aktif={tab} />
        <section aria-label={`Tab ${tab}`} data-testid={`acara-panel-${tab}`}>
          <IsiTab
            acara={acara}
            tab={tab}
            rab={rab}
            pemasukan={pemasukan}
            aktual={aktual}
            bolehBatal={can(konteks.roles, 'nota.verify')}
            tor={tor}
            proposal={proposal}
            formulir={formulir}
            ikhtisar={ikhtisar}
            aksesNota={{
              // Upload nota hanya untuk panitia acara ini (halaman upload memilih divisi pengguna).
              upload: can(konteks.roles, 'nota.create') && panitia,
              verifikasi: can(konteks.roles, 'nota.verify'),
            }}
          />
        </section>
      </div>
    </main>
  );
}
