/**
 * Jalur dokumen acara (ADR-039): enam langkah dari TOR sampai LPJ dengan status
 * nyata. Satu langkah ditandai "berikutnya" dan mendapat tombol utama, sehingga
 * pengguna tidak perlu menebak harus membuka tab mana.
 *
 * Status tidak hanya dibedakan warna: setiap langkah membawa ikon dan teks.
 * HP: kisi 3×2 (tanpa geser, ADR-037); layar lebar: satu baris enam kolom.
 *
 * Test id: jalur-dokumen, jalur-{id}, jalur-berikutnya.
 */

import { ArrowRight, Check, Circle, CircleDot, Lock } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import type { IdLangkah, LangkahJalur, StatusLangkah } from '@/lib/acara/jalur';
import { cn } from '@/lib/utils';

const GAYA: Record<StatusLangkah, { ikon: typeof Check; kelas: string; label: string }> = {
  SELESAI: { ikon: Check, kelas: 'border-[var(--success)]/40 bg-[var(--success-subtle)] text-[var(--success)]', label: 'Selesai' },
  BERJALAN: { ikon: CircleDot, kelas: 'border-[var(--warning)]/40 bg-[var(--warning-subtle)] text-[var(--warning)]', label: 'Berjalan' },
  BELUM: { ikon: Circle, kelas: 'border-default bg-panel text-secondary', label: 'Belum' },
  TERBATAS: { ikon: Lock, kelas: 'border-default bg-subtle text-tertiary', label: 'Terbatas' },
};

const AJAKAN: Record<IdLangkah, string> = {
  tor: 'Lengkapi TOR',
  rab: 'Buka RAB',
  proposal: 'Susun proposal',
  hari_h: 'Lihat timeline',
  nota: 'Periksa nota',
  lpj: 'Susun LPJ',
};

export function JalurDokumen({
  langkah,
  berikutnya,
  dibatalkan = false,
}: {
  langkah: LangkahJalur[];
  berikutnya: IdLangkah | null;
  dibatalkan?: boolean;
}) {
  const lanjut = langkah.find((l) => l.id === berikutnya);
  return (
    <section aria-labelledby="jalur-judul" data-testid="jalur-dokumen" className="space-y-3 rounded-md border border-default bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="jalur-judul" className="text-[15px] font-semibold">
            Jalur dokumen
          </h2>
          <p className="text-[13px] text-secondary">
            {dibatalkan
              ? 'Acara ini dibatalkan; dokumen tetap dapat dibuka sebagai arsip.'
              : lanjut
                ? `Langkah berikutnya: ${lanjut.label} — ${lanjut.keterangan.toLowerCase()}.`
                : 'Semua langkah yang dapat Anda lihat sudah selesai.'}
          </p>
        </div>
        {lanjut ? (
          <Link href={lanjut.href} className={buttonVariants({ variant: 'primary' })} data-testid="jalur-berikutnya">
            {AJAKAN[lanjut.id]} <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <ol className="grid grid-cols-3 gap-1.5 lg:grid-cols-6">
        {langkah.map((l, i) => {
          const g = GAYA[l.status];
          const Ikon = g.ikon;
          const isi = (
            <>
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Ikon aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  <span className="sr-only">Langkah {i + 1}: </span>
                  {l.label}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-secondary">
                <span className="sr-only">{g.label}, </span>
                {l.keterangan}
              </span>
            </>
          );
          const kelas = cn(
            'block min-w-0 rounded-sm border px-2.5 py-2',
            g.kelas,
            l.id === berikutnya && 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--bg-panel)]',
          );
          return (
            <li key={l.id} data-testid={`jalur-${l.id}`} data-status={l.status} aria-current={l.id === berikutnya ? 'step' : undefined}>
              {l.status === 'TERBATAS' ? (
                <span className={kelas}>{isi}</span>
              ) : (
                <Link href={l.href} className={cn(kelas, 'hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2')}>
                  {isi}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
