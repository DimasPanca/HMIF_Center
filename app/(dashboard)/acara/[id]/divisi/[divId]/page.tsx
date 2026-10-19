import { CalendarRange } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AcaraHeader } from '@/components/acara/AcaraHeader';
import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { BilahProgres } from '@/components/acara/DivisiCard';
import { BuatTimelineDivisi, DivisiGantt } from '@/components/acara/DivisiGantt';
import { JobDeskEditor } from '@/components/acara/JobDeskEditor';
import { ModeBacaSajaBanner } from '@/components/acara/ModeBacaSajaBanner';
import { RabGrid } from '@/components/rab/RabGrid';
import { Card } from '@/components/ui/card';
import { STATUS_VALUES, StatusPill, type DomainStatus } from '@/components/ui/status-pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { muatJobDesk } from '@/lib/acara/job-desk';
import { muatDivisi } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { bolehBuatChartDivisi, muatChart } from '@/lib/gantt/service';
import { muatRab, type DataRab } from '@/lib/rab/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string; divId: string }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enam bagian PRD F-8.2, dalam urutan PRD. */
const BAGIAN = [
  { id: 'job-desk', label: 'Job Desk' },
  { id: 'gantt', label: 'Gantt Divisi' },
  { id: 'rab', label: 'RAB Divisi' },
  { id: 'progres', label: 'Progres' },
  { id: 'dokumen', label: 'Dokumen' },
  { id: 'nota', label: 'Nota' },
] as const;

const LABEL_KOLOM: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'Dikerjakan',
  REVIEW: 'Review',
  DONE: 'Selesai',
};

function Bagian({ id, judul, children }: { id: string; judul: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-judul`}
      data-testid={`divisi-bagian-${id}`}
      className="scroll-mt-14"
    >
      <Card className="p-4">
        <h2 id={`${id}-judul`} className="mb-3 text-[15px] font-semibold">
          {judul}
        </h2>
        {children}
      </Card>
    </section>
  );
}

/** RAB divisi: grid T-087 terfokus pada divisi ini, atau penjelasan bila angkanya bukan hak pengguna. */
function Rab({
  rab,
  divisiId,
  acaraId,
}: {
  rab: DataRab | 'TERBATAS' | null;
  divisiId: string;
  acaraId: string;
}) {
  if (!rab || rab === 'TERBATAS') {
    return (
      <BelumTersedia
        ikon="uang"
        judul="RAB divisi ini terbatas"
        penjelasan="Rincian anggaran hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia acara ini."
        aksi={{ label: 'Kembali ke acara', href: `/acara/${acaraId}` }}
      />
    );
  }
  return <RabGrid awal={rab} fokusDivisi={divisiId} />;
}

/**
 * Ruang kerja satu divisi (T-084, PRD F-8.2): enam bagian dalam satu halaman
 * dengan navigasi lompat, di rute USER_FLOW §12 `/acara/[id]/divisi/[divId]`.
 * Divisi lain dalam acara yang sama tetap dapat dibaca (PRD F-8.3); mode baca
 * saja dan penjagaan tulisnya dipasang T-085.
 */
export default async function RuangDivisiPage({ params }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'kepanitiaan.read')) notFound();

  const { id, divId } = await params;
  if (!POLA_UUID.test(id) || !POLA_UUID.test(divId)) notFound();
  const r = await muatDivisi(konteks, id, divId);
  if (!r) notFound();
  const [rab, jobDesk, gantt] = await Promise.all([
    r.rab ? muatRab(konteks, id) : null,
    muatJobDesk(konteks, divId),
    // Chart DIVISI tertua = timeline utama divisi; chart tambahan tampil sebagai tautan.
    r.chart[0] && can(konteks.roles, 'gantt.read') ? muatChart(konteks, r.chart[0].id) : null,
  ]);
  // Hak membuat chart = hak menulis chart divisi (punyaHak gantt.update), bukan sekadar mode tulis divisi.
  const bolehBuatGantt =
    !gantt && r.chart.length === 0 && (await bolehBuatChartDivisi(konteks, divId));

  return (
    <main
      className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6"
      data-testid="ruang-divisi"
      data-mode={r.boleh_tulis ? 'tulis' : 'baca'}
    >
      <div className="mx-auto max-w-[92rem] space-y-4">
        <AcaraHeader
          acara={r.acara}
          divisi={r.divisi}
          bolehSurat={can(konteks.roles, 'surat.create')}
        />
        {/* Divisi lain: banner + tombol tulis TIDAK dirender (INV-30, T-085). */}
        {r.boleh_tulis ? null : <ModeBacaSajaBanner namaDivisi={r.divisi.nama} />}

        <div className="grid gap-3 sm:grid-cols-3" data-testid="divisi-metrik">
          <Card className="p-4">
            <p className="text-[12px] text-secondary">Koordinator</p>
            <p className="mt-1 font-semibold">{r.divisi.koordinator ?? 'Belum ditetapkan'}</p>
            <p className="mt-0.5 text-[12px] text-tertiary">{r.divisi.jumlah_anggota} anggota</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-secondary">RAB divisi</p>
            <p className="mt-1 font-semibold tabular-nums">
              {r.divisi.total_rab === null ? 'Terbatas' : formatRupiah(r.divisi.total_rab)}
            </p>
          </Card>
          <Card className="p-4">
            <BilahProgres progres={r.divisi.progres} label="Progres Kanban" />
          </Card>
        </div>

        <nav aria-label="Bagian ruang kerja divisi">
          <ul className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-1">
            {BAGIAN.map((b) => (
              <li key={b.id} className="min-w-0">
                <a
                  href={`#${b.id}`}
                  className="flex h-10 items-center justify-center rounded-md border border-default px-2 text-[13.5px] font-medium text-secondary hover:bg-subtle hover:text-primary sm:inline-flex sm:h-8 sm:border-0 sm:px-3 sm:text-[13px]"
                >
                  {b.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Bagian id="job-desk" judul="Job Desk">
              {jobDesk ? (
                <JobDeskEditor
                  divisiId={divId}
                  konten={jobDesk.konten}
                  bolehTulis={jobDesk.boleh_tulis}
                  diperbaruiAt={jobDesk.diperbarui_at}
                  diperbaruiOleh={jobDesk.diperbarui_oleh}
                />
              ) : null}
              {r.anggota.length ? (
                <ul className="mt-2 grid gap-1 text-[13px]" data-testid="divisi-anggota">
                  {r.anggota.map((a, i) => (
                    <li
                      key={`${a.nama}-${i}`}
                      className="flex justify-between gap-2 border-t border-default pt-1"
                    >
                      <span>{a.nama}</span>
                      <span className="text-secondary">
                        {a.koordinator ? 'Koordinator' : (a.peran ?? 'Anggota')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Bagian>
          </div>

          <div className="lg:col-span-2">
            <Bagian id="gantt" judul="Gantt Divisi">
              {gantt ? (
                <DivisiGantt
                  data={gantt}
                  supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
                  supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null}
                />
              ) : (
                <BelumTersedia
                  ikon="gantt"
                  judul="Belum ada timeline divisi"
                  penjelasan="Timeline internal divisi belum dibuat. Timeline acara tetap dapat dibuka dari tab Gantt."
                  aksi={{ label: 'Buka tab Gantt acara', href: `/acara/${r.acara.id}?tab=gantt` }}
                />
              )}
              {bolehBuatGantt ? (
                <div className="mt-3">
                  <BuatTimelineDivisi divisiId={divId} />
                </div>
              ) : null}
              {r.chart.length > 1 ? (
                <ul className="mt-3 grid gap-2" aria-label="Timeline divisi lainnya">
                  {r.chart.slice(1).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/gantt/${c.id}`}
                        className="flex min-w-0 items-center gap-3 rounded-sm border border-default p-3 hover:bg-subtle"
                      >
                        <CalendarRange
                          aria-hidden="true"
                          className="size-5 shrink-0 text-tertiary"
                        />
                        <span className="truncate text-[14px] font-medium">{c.judul}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Bagian>
          </div>

          <div className="lg:col-span-2">
            <Bagian id="rab" judul="RAB Divisi">
              <Rab rab={rab} divisiId={divId} acaraId={r.acara.id} />
            </Bagian>
          </div>

          <Bagian id="progres" judul="Progres">
            <dl className="grid grid-cols-4 gap-2 text-center" data-testid="divisi-kanban">
              {r.kanban.map((k) => (
                <div key={k.kolom} className="rounded-sm bg-subtle p-2">
                  <dt className="text-[11px] text-secondary">{LABEL_KOLOM[k.kolom] ?? k.kolom}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{k.jumlah}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3">
              <BilahProgres progres={r.divisi.progres} label="Kartu selesai" />
            </div>
          </Bagian>

          <Bagian id="dokumen" judul="Dokumen">
            <BelumTersedia
              ikon="folder"
              judul="Belum ada dokumen divisi"
              penjelasan="Unggah dokumen divisi belum tersedia di versi ini. Surat untuk acara ini dapat dibuat dari tombol di atas."
              aksi={{ label: 'Kembali ke acara', href: `/acara/${r.acara.id}` }}
            />
          </Bagian>

          <div className="lg:col-span-2">
            <Bagian id="nota" judul="Nota">
              {r.nota && r.nota.length ? (
                <div className="overflow-x-auto">
                  <Table aria-label="Nota divisi" rowCount={r.nota.length} emptyState={null}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal belanja</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Keterangan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.nota.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell>{formatTanggalPendek(n.tanggal_belanja)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatRupiah(n.total_nota)}
                          </TableCell>
                          <TableCell>
                            {(STATUS_VALUES as readonly string[]).includes(n.status) ? (
                              <StatusPill status={n.status as DomainStatus} />
                            ) : (
                              n.status
                            )}
                          </TableCell>
                          <TableCell className="text-secondary">{n.keterangan ?? ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <BelumTersedia
                  ikon="nota"
                  judul={r.nota ? 'Belum ada nota' : 'Nota divisi ini terbatas'}
                  penjelasan={
                    r.nota
                      ? 'Unggah nota belanja belum tersedia di versi ini. Nota yang sudah tercatat akan tampil di sini.'
                      : 'Nota belanja hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia acara ini.'
                  }
                  aksi={{ label: 'Kembali ke acara', href: `/acara/${r.acara.id}` }}
                />
              )}
            </Bagian>
          </div>
        </div>
      </div>
    </main>
  );
}
