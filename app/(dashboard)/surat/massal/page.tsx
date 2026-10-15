import { Files } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { AksiBatch, BuatBatch } from '@/components/surat/SuratMassal';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { daftarBatch, daftarPengurus } from '@/lib/surat/batch';

export const dynamic = 'force-dynamic';

/** Hari ini menurut WIB — tanggal surat bawaan, sama dengan form surat satuan. */
function hariIniWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

/**
 * Generate massal Surat Keterangan Aktif Organisasi (T-064). Pembuat surat
 * (Sekum) memilih pengurus; Ketua/Wakil/Sekum menyetujui per batch.
 */
export default async function SuratMassalPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  const bolehBuat = can(konteks.roles, 'surat.create');
  const bolehSetujui = can(konteks.roles, 'surat.approve');
  if (!bolehBuat && !bolehSetujui) notFound();

  const [pengurus, batch] = await Promise.all([bolehBuat ? daftarPengurus(konteks) : Promise.resolve([]), daftarBatch(konteks)]);
  const menunggu = batch.filter((b) => b.menunggu > 0);
  const selesai = batch.filter((b) => b.menunggu === 0);

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <Files className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">Persuratan</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Surat Keterangan Aktif massal</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              Satu batch disetujui sekaligus: nomornya berurutan tanpa disela surat lain, lalu seluruh dokumen dibundel menjadi
              satu ZIP.
            </p>
          </div>
        </header>

        {bolehBuat ? <BuatBatch pengurus={pengurus} tanggalAwal={hariIniWib()} /> : null}

        <section aria-label="Batch menunggu persetujuan" className="space-y-3">
          <h2 className="text-[13px] font-semibold text-secondary">
            Menunggu persetujuan <span className="tabular-nums">({menunggu.length})</span>
          </h2>
          {menunggu.length === 0 ? (
            <p className="rounded-sm border border-dashed border-default px-3 py-4 text-[13px] text-tertiary">Tidak ada batch yang menunggu.</p>
          ) : (
            menunggu.map((b) => <AksiBatch key={b.batch_id} batch={b} bolehSetujui={bolehSetujui} />)
          )}
        </section>

        {selesai.length > 0 ? (
          <section aria-label="Batch diproses" className="space-y-3">
            <h2 className="text-[13px] font-semibold text-secondary">Sudah diproses</h2>
            {selesai.map((b) => (
              <AksiBatch key={b.batch_id} batch={b} bolehSetujui={bolehSetujui} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
