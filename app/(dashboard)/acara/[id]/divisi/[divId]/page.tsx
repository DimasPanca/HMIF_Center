import { CalendarRange } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AcaraHeader } from '@/components/acara/AcaraHeader';
import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { BilahProgres } from '@/components/acara/DivisiCard';
import { Card } from '@/components/ui/card';
import { STATUS_VALUES, StatusPill, type DomainStatus } from '@/components/ui/status-pill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { muatDivisi, type RuangDivisi } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
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

const LABEL_KOLOM: Record<string, string> = { TODO: 'To Do', IN_PROGRESS: 'Dikerjakan', REVIEW: 'Review', DONE: 'Selesai' };

function Bagian({ id, judul, children }: { id: string; judul: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-judul`} data-testid={`divisi-bagian-${id}`} className="scroll-mt-14">
      <Card className="p-4">
        <h2 id={`${id}-judul`} className="mb-3 text-[15px] font-semibold">
          {judul}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Rab({ r, acaraId }: { r: RuangDivisi; acaraId: string }) {
  if (!r.rab) {
    return (
      <BelumTersedia
        ikon="uang"
        judul="RAB divisi ini terbatas"
        penjelasan="Rincian anggaran hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia acara ini."
        aksi={{ label: 'Kembali ke acara', href: `/acara/${acaraId}` }}
      />
    );
  }
  if (r.rab.length === 0) {
    return (
      <BelumTersedia
        ikon="uang"
        judul="Belum ada item RAB"
        penjelasan="Penyusunan RAB per sel belum tersedia di versi ini. Item yang sudah tercatat akan tampil di sini."
        aksi={{ label: 'Lihat RAB acara', href: `/acara/${acaraId}?tab=rab` }}
      />
    );
  }
  return (
    <div className="space-y-4">
      {r.rab.map((s) => (
        <div key={s.id}>
          <h3 className="mb-1 text-[13px] font-semibold tracking-wide uppercase">{s.nama}</h3>
          <div className="overflow-x-auto">
            <Table aria-label={`RAB ${s.nama}`} rowCount={s.item.length + 1} emptyState={null}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Jenis barang</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead className="text-right">Harga satuan</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.item.map((i) => (
                  <TableRow key={i.id} data-testid="divisi-rab-item">
                    <TableCell className="tabular-nums">{i.no_urut}</TableCell>
                    <TableCell>{i.jenis_barang}</TableCell>
                    <TableCell>{i.jumlah_teks}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(i.harga_satuan)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(i.total)}</TableCell>
                    <TableCell className="text-secondary">{i.keterangan ?? ''}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="font-medium">
                    Subtotal {s.nama}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatRupiah(s.subtotal)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
      <p className="text-right text-[14px] font-semibold tabular-nums" data-testid="divisi-rab-total">
        Total RAB divisi: {formatRupiah(r.divisi.total_rab ?? 0)}
      </p>
    </div>
  );
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

  return (
    <main className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <AcaraHeader acara={r.acara} divisi={r.divisi} bolehSurat={can(konteks.roles, 'surat.create')} />

        <div className="grid gap-3 sm:grid-cols-3" data-testid="divisi-metrik">
          <Card className="p-4">
            <p className="text-[12px] text-secondary">Koordinator</p>
            <p className="mt-1 font-semibold">{r.divisi.koordinator ?? 'Belum ditetapkan'}</p>
            <p className="mt-0.5 text-[12px] text-tertiary">{r.divisi.jumlah_anggota} anggota</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-secondary">RAB divisi</p>
            <p className="mt-1 font-semibold tabular-nums">{r.divisi.total_rab === null ? 'Terbatas' : formatRupiah(r.divisi.total_rab)}</p>
          </Card>
          <Card className="p-4">
            <BilahProgres progres={r.divisi.progres} label="Progres Kanban" />
          </Card>
        </div>

        <nav aria-label="Bagian ruang kerja divisi" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1">
            {BAGIAN.map((b) => (
              <li key={b.id}>
                <a href={`#${b.id}`} className="inline-flex h-8 items-center rounded-sm px-3 text-[13px] font-medium text-secondary hover:bg-subtle hover:text-primary">
                  {b.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-4 lg:grid-cols-2">
          <Bagian id="job-desk" judul="Job Desk">
            <BelumTersedia
              ikon="tugas"
              judul={r.job_desk_ada ? 'Job desk sudah tercatat' : 'Job desk belum disusun'}
              penjelasan="Editor job desk (teks + checklist) belum tersedia di versi ini. Anggota divisi tercantum di bawah."
              aksi={{ label: 'Lihat progres', href: '#progres' }}
            />
            {r.anggota.length ? (
              <ul className="mt-2 grid gap-1 text-[13px]" data-testid="divisi-anggota">
                {r.anggota.map((a, i) => (
                  <li key={`${a.nama}-${i}`} className="flex justify-between gap-2 border-t border-default pt-1">
                    <span>{a.nama}</span>
                    <span className="text-secondary">{a.koordinator ? 'Koordinator' : (a.peran ?? 'Anggota')}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Bagian>

          <Bagian id="gantt" judul="Gantt Divisi">
            {r.chart.length ? (
              <ul className="grid gap-2">
                {r.chart.map((c) => (
                  <li key={c.id}>
                    <Link href={`/gantt/${c.id}`} className="flex items-center gap-3 rounded-sm border border-default p-3 hover:bg-subtle">
                      <CalendarRange aria-hidden="true" className="size-5 shrink-0 text-tertiary" />
                      <span className="text-[14px] font-medium">{c.judul}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <BelumTersedia
                ikon="gantt"
                judul="Belum ada timeline divisi"
                penjelasan="Timeline internal divisi belum dibuat. Timeline acara tetap dapat dibuka dari tab Gantt."
                aksi={{ label: 'Buka tab Gantt acara', href: `/acara/${r.acara.id}?tab=gantt` }}
              />
            )}
          </Bagian>

          <div className="lg:col-span-2">
            <Bagian id="rab" judul="RAB Divisi">
              <Rab r={r} acaraId={r.acara.id} />
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
                          <TableCell className="text-right tabular-nums">{formatRupiah(n.total_nota)}</TableCell>
                          <TableCell>
                            {(STATUS_VALUES as readonly string[]).includes(n.status) ? <StatusPill status={n.status as DomainStatus} /> : n.status}
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
