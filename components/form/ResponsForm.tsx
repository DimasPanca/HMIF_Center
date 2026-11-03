'use client';

/**
 * ResponsForm — hasil form. "Ringkasan" menjawab "bagaimana hasilnya?"
 * (batang satu warna per pertanyaan, rerata skala sebagai angka utama),
 * "Tabel" menjawab "siapa menjawab apa?" (sekaligus tampilan tabel untuk
 * aksesibilitas grafik) dan memuat tindakan integrasi per kategori.
 */

import { ArrowLeft, Download, FileText, PencilLine, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ToastProvider, useToast } from '@/components/ui/toast';
import type { DataRespons, RingkasPertanyaan } from '@/lib/form/respons';
import { INFO_KATEGORI } from '@/lib/form/skema';
import { cn } from '@/lib/utils';

type Seleksi = DataRespons['respons'][number]['status_seleksi'];
const LABEL_SELEKSI: Record<Seleksi, { label: string; tone: 'neutral' | 'success' | 'danger' }> = {
  BARU: { label: 'Baru', tone: 'neutral' },
  LOLOS: { label: 'Lolos', tone: 'success' },
  TIDAK_LOLOS: { label: 'Tidak lolos', tone: 'danger' },
};

export function ResponsForm(props: { data: DataRespons; bolehTerapkan: boolean; kembali: string }) {
  return (
    <ToastProvider>
      <Isi {...props} />
    </ToastProvider>
  );
}

function Isi({ data, bolehTerapkan, kembali }: { data: DataRespons; bolehTerapkan: boolean; kembali: string }) {
  const [tab, setTab] = React.useState<'ringkasan' | 'tabel'>('ringkasan');
  const [respons, setRespons] = React.useState(data.respons);
  const [buka, setBuka] = React.useState<string | null>(null);
  const [saring, setSaring] = React.useState<Seleksi | 'SEMUA'>('SEMUA');
  const toast = useToast();
  const router = useRouter();
  const oprec = data.form.kategori === 'OPEN_RECRUITMENT';
  const pendataan = data.form.kategori === 'PENDATAAN_PENGURUS';
  const aktif = data.pertanyaan.filter((p) => !p.diarsipkan);
  const tampil = oprec && saring !== 'SEMUA' ? respons.filter((r) => r.status_seleksi === saring) : respons;

  const ubahSeleksi = async (rid: string, s: Seleksi) => {
    const lama = respons;
    setRespons((rs) => rs.map((r) => (r.id === rid ? { ...r, status_seleksi: s } : r)));
    const r = await fetch(`/api/form/${data.form.id}/respons/${rid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status_seleksi: s }) });
    if (!r.ok) {
      setRespons(lama);
      toast.error({ description: 'Status seleksi gagal disimpan.', suggestion: 'Muat ulang halaman lalu coba lagi.' });
    }
  };

  const terapkan = async (rid: string) => {
    const r = await fetch(`/api/form/${data.form.id}/respons/${rid}/terapkan`, { method: 'POST' });
    const d = (await r.json().catch(() => null)) as { ok: true; data: { pengurus_id: string; aksi: string } } | { ok: false; error: { message: string } } | null;
    if (d?.ok) {
      setRespons((rs) => rs.map((x) => (x.id === rid ? { ...x, integrasi: { ...x.integrasi, pengurus_id: d.data.pengurus_id } } : x)));
      toast.success({ description: d.data.aksi === 'BARU' ? 'Pengurus baru ditambahkan ke Data Pengurus.' : 'Data pengurus diperbarui.' });
      router.refresh();
    } else toast.error({ description: d && !d.ok ? d.error.message : 'Gagal menerapkan.', suggestion: 'Periksa NIM & jabatan pada jawaban.' });
  };

  return (
    <div className="mx-auto max-w-[72rem] space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <Link href={kembali} className="mt-1 flex size-8 items-center justify-center rounded-sm text-secondary hover:bg-subtle" aria-label="Kembali">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-tertiary">{INFO_KATEGORI[data.form.kategori].label} · Respons</p>
          <h1 className="truncate text-2xl font-semibold">{data.form.judul}</h1>
          <p className="mt-1 text-[14px] text-secondary">
            <b className="text-primary tabular-nums">{respons.length}</b> respons{data.form.anonim ? ' · anonim' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/form/${data.form.id}`} className={buttonVariants({ variant: 'ghost' })}>
            <PencilLine /> Edit form
          </Link>
          <a href={`/api/form/${data.form.id}/respons/ekspor`} className={buttonVariants({ variant: 'secondary', className: respons.length ? '' : 'pointer-events-none opacity-50' })} aria-disabled={!respons.length}>
            <Download /> Unduh Excel
          </a>
        </div>
      </header>

      <div role="tablist" className="flex gap-1 border-b border-default">
        {(['ringkasan', 'tabel'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('border-b-2 px-3 pb-2.5 text-[14px] font-medium', tab === t ? 'border-[var(--primary)] text-primary' : 'border-transparent text-secondary hover:text-primary')}
          >
            {t === 'ringkasan' ? 'Ringkasan' : `Daftar respons (${respons.length})`}
          </button>
        ))}
      </div>

      {respons.length === 0 ? (
        <p className="rounded-md border border-dashed border-strong bg-panel px-4 py-10 text-center text-[14px] text-secondary">Belum ada yang mengisi. Bagikan tautan form dari halaman editor.</p>
      ) : tab === 'ringkasan' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {oprec && (
            <section className="rounded-md border border-default bg-panel p-4 lg:col-span-2">
              <h2 className="text-[15px] font-semibold">Seleksi</h2>
              <div className="mt-2 flex flex-wrap gap-6">
                {(Object.keys(LABEL_SELEKSI) as Seleksi[]).map((s) => (
                  <p key={s}>
                    <span className="text-[24px] font-semibold tabular-nums">{respons.filter((r) => r.status_seleksi === s).length}</span>{' '}
                    <span className="text-[13px] text-secondary">{LABEL_SELEKSI[s].label}</span>
                  </p>
                ))}
              </div>
            </section>
          )}
          {data.ringkasan.filter((r) => !r.diarsipkan).map((r) => (
            <KartuRingkasan key={r.id} r={r} total={respons.length} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {oprec && (
            <div className="flex flex-wrap gap-1">
              {(['SEMUA', 'BARU', 'LOLOS', 'TIDAK_LOLOS'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSaring(s)}
                  className={cn('h-8 rounded-full border px-3 text-[13px]', saring === s ? 'border-transparent bg-[var(--primary)] text-[var(--primary-text)]' : 'border-default bg-panel text-secondary')}
                >
                  {s === 'SEMUA' ? 'Semua' : LABEL_SELEKSI[s].label}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto rounded-md border border-default bg-panel">
            <table className="w-full min-w-max text-[13px] leading-5">
              <thead className="bg-subtle text-left text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Waktu</th>
                  {!data.form.anonim && <th scope="col" className="px-3 py-2 font-medium">Akun</th>}
                  {oprec && <th scope="col" className="px-3 py-2 font-medium">Seleksi</th>}
                  {pendataan && <th scope="col" className="px-3 py-2 font-medium">Data Pengurus</th>}
                  {aktif.slice(0, 6).map((p) => (
                    <th key={p.id} scope="col" className="max-w-[16rem] truncate px-3 py-2 font-medium" title={p.judul}>
                      {p.judul}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tampil.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className={cn('cursor-pointer border-t border-subtle hover:bg-subtle', buka === r.id && 'bg-subtle')} onClick={() => setBuka(buka === r.id ? null : r.id)}>
                      <td className="px-3 py-2 whitespace-nowrap text-secondary tabular-nums">{new Date(r.dikirim_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      {!data.form.anonim && <td className="px-3 py-2">{r.responden ?? <span className="text-tertiary">publik</span>}</td>}
                      {oprec && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <select
                            aria-label="Status seleksi"
                            value={r.status_seleksi}
                            onChange={(e) => void ubahSeleksi(r.id, e.target.value as Seleksi)}
                            className="h-7 rounded-sm border border-default bg-panel px-1.5 text-[12px]"
                          >
                            {(Object.keys(LABEL_SELEKSI) as Seleksi[]).map((s) => (
                              <option key={s} value={s}>
                                {LABEL_SELEKSI[s].label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {pendataan && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {r.integrasi.pengurus_id ? (
                            <Badge tone="success">Diterapkan</Badge>
                          ) : bolehTerapkan ? (
                            <Button variant="secondary" className="h-7 px-2 text-[12px]" onClick={() => void terapkan(r.id)}>
                              <UserCheck /> Terapkan
                            </Button>
                          ) : (
                            <span className="text-tertiary">menunggu Sekum</span>
                          )}
                        </td>
                      )}
                      {aktif.slice(0, 6).map((p) => (
                        <td key={p.id} className="max-w-[16rem] truncate px-3 py-2" title={r.jawaban[p.id]?.teks}>
                          {r.jawaban[p.id]?.teks || <span className="text-tertiary">-</span>}
                        </td>
                      ))}
                    </tr>
                    {buka === r.id && (
                      <tr className="bg-subtle">
                        <td colSpan={99} className="px-4 pt-1 pb-4">
                          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                            {data.pertanyaan.map((p) => (
                              <div key={p.id} className="min-w-0">
                                <dt className="text-[12px] text-tertiary">
                                  {p.judul}
                                  {p.diarsipkan ? ' (diarsipkan)' : ''}
                                </dt>
                                <dd className="text-[14px] whitespace-pre-wrap text-primary">
                                  {r.jawaban[p.id]?.berkas_id ? (
                                    <a href={`/api/form/${data.form.id}/berkas/${r.jawaban[p.id]!.berkas_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                                      <FileText className="size-3.5" /> {r.jawaban[p.id]!.teks}
                                    </a>
                                  ) : (
                                    r.jawaban[p.id]?.teks || <span className="text-tertiary">-</span>
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {typeof r.integrasi.peserta_id === 'string' && <p className="mt-3 text-[12px] text-[var(--success)]">Tercatat sebagai peserta acara.</p>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-tertiary">Klik baris untuk melihat semua jawaban. Tabel menampilkan 6 pertanyaan pertama; Excel memuat semuanya.</p>
        </div>
      )}
    </div>
  );
}

function KartuRingkasan({ r, total }: { r: RingkasPertanyaan; total: number }) {
  const maks = Math.max(1, ...(r.distribusi ?? []).map((d) => d.jumlah));
  return (
    <section className="rounded-md border border-default bg-panel p-4" aria-label={r.judul}>
      <h2 className="text-[15px] leading-6 font-semibold">{r.judul}</h2>
      <p className="text-[12px] text-tertiary tabular-nums">
        {r.label_tipe} · {r.dijawab} dari {total} menjawab
      </p>
      {r.rerata !== undefined && (
        <p className="mt-3">
          <span className="text-[32px] leading-9 font-semibold tabular-nums">{r.rerata.toLocaleString('id-ID')}</span>
          <span className="ml-1 text-[13px] text-secondary">rata-rata</span>
        </p>
      )}
      {r.distribusi && (
        <ul className="mt-3 grid gap-2">
          {r.distribusi.map((d) => {
            const persen = r.dijawab ? Math.round((d.jumlah / r.dijawab) * 100) : 0;
            return (
              <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]" title={`${d.label}: ${d.jumlah} (${persen}%)`}>
                <span className="truncate text-primary">{d.label}</span>
                <span className="h-3 rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${(d.jumlah / maks) * 100}%` }} />
                </span>
                <span className="w-16 text-right text-secondary tabular-nums">
                  {d.jumlah} · {persen}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {r.kisi && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-secondary">
                <th />
                {r.kisi[0]?.kolom.map((k) => (
                  <th key={k.label} className="px-2 py-1 text-center font-medium">
                    {k.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.kisi.map((b) => (
                <tr key={b.baris} className="border-t border-subtle">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {b.baris}
                  </th>
                  {b.kolom.map((k) => (
                    <td key={k.label} className="px-2 py-1.5 text-center tabular-nums">
                      {k.jumlah}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.contoh && (
        <ul className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto">
          {r.contoh.length === 0 && <li className="text-[13px] text-tertiary">Belum ada jawaban.</li>}
          {r.contoh.map((c, i) => (
            <li key={i} className="rounded-sm bg-subtle px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap">
              {c}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
