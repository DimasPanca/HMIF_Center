import Link from 'next/link';
import {
  ArrowLeft,
  CalendarRange,
  ClipboardCheck,
  FileText,
  Target,
  Users,
  WalletCards,
} from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import {
  ApprovalActions,
  type KonflikApprovalView,
} from '@/components/proker/ApprovalActions';
import { GanttChart } from '@/components/gantt/GanttChart';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { transformGanttRows } from '@/lib/gantt/transform';
import { cekKonflik, detailProker } from '@/lib/proker/service';
import { ambilRencana, type RencanaTersimpan } from '@/lib/proker/rencana-store';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatRentangTanggal, formatTanggalPendek } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

type DetailApprovalPageProps = { params: Promise<{ id: string }> };

const LABEL_KATEGORI = {
  TERJADWAL: 'Terjadwal',
  BERKALA: 'Berkala',
  RESPONSIF: 'Responsif',
} as const;

const LABEL_SUMBER: Record<string, string> = {
  KAS_HIMPUNAN: 'Kas himpunan',
  IURAN_PESERTA: 'Iuran peserta',
  SPONSOR: 'Sponsor',
  DANA_FAKULTAS: 'Dana fakultas',
};

const WARNA_FASE = [
  'var(--dept-kaderisasi)',
  'var(--dept-mikat)',
  'var(--dept-internal)',
  'var(--dept-eksternal)',
  'var(--dept-kominfo)',
  'var(--dept-rnd)',
] as const;

function Info({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="border-b border-subtle py-3 last:border-b-0">
      <dt className="text-[12px] font-medium text-secondary">{label}</dt>
      <dd className="mt-1 text-[13px] leading-[18px] text-primary">{nilai || '—'}</dd>
    </div>
  );
}

function kumpulkanPengurus(rencana: RencanaTersimpan | null): string[] {
  if (!rencana) return [];
  const kepanitiaan = rencana.kepanitiaan;
  const ids = new Set<string>();
  [
    kepanitiaan.ketua_pelaksana,
    kepanitiaan.wakil_pelaksana,
    kepanitiaan.sekretaris,
    kepanitiaan.bendahara,
  ].forEach((id) => {
    if (id) ids.add(id);
  });
  kepanitiaan.divisi.forEach((divisi) => {
    if (divisi.koordinator_id) ids.add(divisi.koordinator_id);
    divisi.anggota.forEach((id) => ids.add(id));
  });
  rencana.gantt.groups.forEach((group) => {
    group.tasks.forEach((task) => {
      if (task.assignee_id) ids.add(task.assignee_id);
    });
  });
  return [...ids];
}

function buatModelGantt(rencana: RencanaTersimpan | null, nama: Map<string, string>) {
  if (!rencana || !rencana.gantt.groups.some((group) => group.tasks.length > 0)) return null;

  const groupRows = rencana.gantt.groups.map((group, indeks) => ({
    id: `fase-${indeks}`,
    nama: group.nama,
    warna: WARNA_FASE[indeks % WARNA_FASE.length]!,
    pj_nama: group.pj_nama,
    urutan: indeks,
  }));
  const taskRows = rencana.gantt.groups.flatMap((group, indeksGroup) =>
    group.tasks.map((task, indeksTask) => ({
      id: `task-${indeksGroup}-${indeksTask}`,
      group_id: `fase-${indeksGroup}`,
      nama: task.nama,
      tanggal_mulai: task.tanggal_mulai,
      tanggal_selesai: task.tanggal_selesai,
      progres: task.progres,
      urutan: indeksTask,
      assignee_name: task.assignee_id ? nama.get(task.assignee_id) : undefined,
      status: task.is_milestone ? 'Milestone' : 'Rencana',
    })),
  );

  return transformGanttRows({
    groupRows,
    taskRows,
    scale: 'week',
    today: new Date(),
  });
}

export default async function DetailApprovalPage({ params }: DetailApprovalPageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'proker.approve')) notFound();

  const { id } = await params;
  const proker = await detailProker(id);
  if (!proker || proker.periode_id !== konteks.periodeId) notFound();

  const [rencana, konflikMentah] = await Promise.all([
    ambilRencana(id),
    proker.kategori === 'TERJADWAL' &&
    proker.tanggal_mulai_persiapan &&
    proker.tanggal_hari_h_selesai
      ? cekKonflik(proker.periode_id, {
          mulai: proker.tanggal_mulai_persiapan,
          selesai: proker.tanggal_hari_h_selesai,
          exclude_id: proker.id,
        })
      : [],
  ]);

  const idsPengurus = kumpulkanPengurus(rencana);
  const pengurus = idsPengurus.length
    ? await db.app_user.findMany({
        where: { id: { in: idsPengurus } },
        select: { id: true, nama_lengkap: true },
      })
    : [];
  const namaPengurus = new Map(pengurus.map((item) => [item.id, item.nama_lengkap]));
  const modelGantt = buatModelGantt(rencana, namaPengurus);
  const konflikAwal: KonflikApprovalView[] = konflikMentah.map((item) => ({
    proker: item.nama_proker,
    departemen: item.nama_departemen,
    mulai: item.mulai,
    selesai: item.selesai,
  }));
  const kepanitiaan = rencana?.kepanitiaan;

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <div>
          <Link
            href="/proker/approval"
            className={cn(buttonVariants({ variant: 'ghost' }), '-ml-3')}
          >
            <ArrowLeft aria-hidden="true" />
            Kembali ke antrian
          </Link>
        </div>

        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
              aria-hidden="true"
            >
              <ClipboardCheck className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
                Detail approval proker
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold">{proker.nama}</h1>
              <p className="mt-1 text-[14px] text-secondary">
                {proker.nama_departemen} · {LABEL_KATEGORI[proker.kategori]}
              </p>
            </div>
          </div>
          <StatusPill status={proker.status} className="self-start" />
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <div className="space-y-5">
            <Card>
              <div className="flex items-center gap-2 border-b border-subtle pb-3">
                <CalendarRange className="size-4 text-tertiary" aria-hidden="true" />
                <h2 className="text-[16px] font-semibold">Informasi dan jadwal</h2>
              </div>
              <dl className="mt-1 grid gap-x-6 md:grid-cols-2">
                <Info label="Departemen pengusul" nilai={proker.nama_departemen} />
                <Info label="Kategori" nilai={LABEL_KATEGORI[proker.kategori]} />
                <Info
                  label="Masa persiapan"
                  nilai={
                    proker.tanggal_mulai_persiapan && proker.tanggal_hari_h_mulai
                      ? formatRentangTanggal(
                          proker.tanggal_mulai_persiapan,
                          proker.tanggal_hari_h_mulai,
                        )
                      : 'Tidak ditentukan'
                  }
                />
                <Info
                  label="Hari pelaksanaan"
                  nilai={
                    proker.tanggal_hari_h_mulai && proker.tanggal_hari_h_selesai
                      ? formatRentangTanggal(
                          proker.tanggal_hari_h_mulai,
                          proker.tanggal_hari_h_selesai,
                        )
                      : 'Tidak ditentukan'
                  }
                />
                <Info
                  label="Penanggung jawab"
                  nilai={proker.nama_penanggung_jawab ?? 'Belum ditentukan'}
                />
                <Info
                  label="Diajukan"
                  nilai={
                    proker.diajukan_at
                      ? formatTanggalPendek(proker.diajukan_at.slice(0, 10))
                      : '—'
                  }
                />
                <Info
                  label="Estimasi peserta"
                  nilai={proker.estimasi_peserta ? `${proker.estimasi_peserta} orang` : '—'}
                />
                <Info
                  label="Estimasi anggaran"
                  nilai={formatRupiah(Number(proker.estimasi_anggaran ?? 0))}
                />
                <Info
                  label="Sumber dana"
                  nilai={
                    proker.sumber_dana.map((item) => LABEL_SUMBER[item] ?? item).join(', ') || '—'
                  }
                />
                <Info
                  label="Kunci kalender"
                  nilai={proker.terkunci ? 'Sudah terkunci' : 'Belum terkunci'}
                />
              </dl>
            </Card>

            <Card>
              <div className="flex items-center gap-2 border-b border-subtle pb-3">
                <FileText className="size-4 text-tertiary" aria-hidden="true" />
                <h2 className="text-[16px] font-semibold">Uraian program kerja</h2>
              </div>
              <dl className="mt-1">
                <Info label="Deskripsi" nilai={proker.deskripsi ?? 'Belum diisi'} />
                <Info label="Tujuan" nilai={proker.tujuan ?? 'Belum diisi'} />
                <Info label="Sasaran" nilai={proker.sasaran ?? 'Belum diisi'} />
              </dl>
            </Card>

            <Card>
              <div className="flex items-center gap-2 border-b border-subtle pb-3">
                <Target className="size-4 text-tertiary" aria-hidden="true" />
                <div>
                  <h2 className="text-[16px] font-semibold">Pratinjau Gantt</h2>
                  <p className="mt-0.5 text-[12px] text-secondary">
                    Rencana task yang diajukan sebelum kepanitiaan dibentuk.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                {modelGantt ? (
                  <GanttChart
                    model={modelGantt}
                    maxHeight={360}
                    ariaLabel={`Pratinjau Gantt ${proker.nama}`}
                  />
                ) : (
                  <p className="rounded-sm border border-dashed border-default p-5 text-center text-[13px] text-secondary">
                    Kategori ini tidak memiliki rencana Gantt.
                  </p>
                )}
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card>
              <div className="flex items-center gap-2 border-b border-subtle pb-3">
                <Users className="size-4 text-tertiary" aria-hidden="true" />
                <h2 className="text-[16px] font-semibold">Rencana kepanitiaan</h2>
              </div>
              {kepanitiaan ? (
                <div className="mt-1">
                  <dl>
                    <Info label="Nama acara" nilai={kepanitiaan.nama_acara ?? proker.nama} />
                    <Info label="Tema" nilai={kepanitiaan.tema ?? 'Belum diisi'} />
                    <Info
                      label="Ketua Pelaksana"
                      nilai={namaPengurus.get(kepanitiaan.ketua_pelaksana) ?? 'Tidak ditemukan'}
                    />
                    <Info
                      label="Target anggaran"
                      nilai={formatRupiah(kepanitiaan.target_anggaran ?? 0)}
                    />
                  </dl>
                  <div className="pt-3">
                    <p className="text-[12px] font-medium text-secondary">Divisi</p>
                    <ul className="mt-2 space-y-2">
                      {kepanitiaan.divisi.map((divisi) => (
                        <li key={divisi.nama} className="rounded-sm border border-subtle p-2.5">
                          <p className="text-[13px] font-semibold text-primary">{divisi.nama}</p>
                          <p className="mt-0.5 text-[12px] text-secondary">
                            Koordinator:{' '}
                            {divisi.koordinator_id
                              ? (namaPengurus.get(divisi.koordinator_id) ?? 'Tidak ditemukan')
                              : 'Belum ditentukan'}
                          </p>
                          <p className="mt-0.5 text-[12px] text-secondary">
                            {divisi.anggota.length} anggota
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-[13px] text-secondary">
                  Kategori ini tidak membentuk kepanitiaan otomatis.
                </p>
              )}
            </Card>

            <Card>
              <div className="flex items-center gap-2 border-b border-subtle pb-3">
                <WalletCards className="size-4 text-tertiary" aria-hidden="true" />
                <h2 className="text-[16px] font-semibold">Tindakan</h2>
              </div>
              <div className="mt-4">
                <ApprovalActions prokerId={proker.id} konflikAwal={konflikAwal} />
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
