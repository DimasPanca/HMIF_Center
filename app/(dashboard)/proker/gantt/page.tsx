import Link from 'next/link';

import { konteksSaatIni } from '@/lib/auth/guard';
import { can, lingkupUntuk } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { LABEL_LEVEL, LEVEL } from '@/lib/gantt/skema';
import { daftarChart } from '@/lib/gantt/service';

export const dynamic = 'force-dynamic';

/** Indeks Gantt periode berjalan, per level (T-078 #1). */
export default async function IndeksGanttPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'gantt.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka Gantt.</main>;
  }
  const lingkup = lingkupUntuk(konteks.roles, 'gantt.read');
  const [chart, departemen] = await Promise.all([
    daftarChart(konteks),
    db.departemen.findMany({
      where: { is_active: true, ...(lingkup === 'DEPARTEMEN' ? { id: { in: konteks.departemenIds } } : {}) },
      orderBy: { urutan: 'asc' },
      select: { kode: true, nama: true },
    }),
  ]);

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-primary">Gantt</h1>
        <p className="text-[13px] text-secondary">
          Timeline per departemen, proker, ketua pelaksana, dan divisi. Master Gantt ada di Beranda.
        </p>
      </header>

      <section aria-labelledby="gantt-departemen" className="space-y-2">
        <h2 id="gantt-departemen" className="text-base font-semibold text-primary">
          {LABEL_LEVEL.departemen}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {departemen.map((d) => (
            <li key={d.kode}>
              <Link
                href={`/departemen/${encodeURIComponent(d.kode)}/gantt`}
                className="block rounded-sm border border-default bg-panel p-3 text-[13px] font-medium text-primary hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {d.nama}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {LEVEL.filter((l) => l !== 'departemen').map((l) => {
        const isi = chart.filter((c) => c.level === l);
        return (
          <section key={l} aria-labelledby={`gantt-${l}`} className="space-y-2">
            <h2 id={`gantt-${l}`} className="text-base font-semibold text-primary">
              {LABEL_LEVEL[l]}
            </h2>
            {isi.length ? (
              <ul className="divide-y divide-[var(--border-subtle)] rounded-sm border border-default bg-panel">
                {isi.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/gantt/${c.id}`}
                      className="flex items-center justify-between gap-3 p-3 text-[13px] hover:bg-subtle"
                      data-testid={`gantt-indeks-${c.id}`}
                    >
                      <span className="min-w-0 truncate font-medium text-primary">{c.judul}</span>
                      <span className="shrink-0 text-xs text-secondary">
                        {c.departemen ?? '—'} · {c.jumlah_task} task
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-secondary">
                Belum ada chart pada level ini. Chart proker, ketua pelaksana, dan divisi dibuat otomatis saat proker disetujui.
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}
