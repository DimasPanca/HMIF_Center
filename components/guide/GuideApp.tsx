'use client';

/**
 * Guide HMIF Center (ADR-060): daftar panduan + isi panduan terpilih + pencarian di seluruh panduan.
 * Pencarian berjalan di browser atas indeks bagian (`lib/guide/cari.ts`); tekan "/" untuk fokus,
 * ↑/↓ untuk memilih hasil, Enter untuk membuka.
 *
 * Test id: guide-cari, guide-hasil, guide-dok-{id}, guide-isi.
 */

import { BookOpen, Search, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { IsiMarkdown } from '@/components/guide/IsiMarkdown';
import { cari, indeksBagian, kataKunci, varian, type DokumenGuide } from '@/lib/guide/cari';
import { cn } from '@/lib/utils';

function Sorot({ teks, kata }: { teks: string; kata: string[] }) {
  if (!kata.length) return <>{teks}</>;
  // Sorot per kata kunci tanpa regex dari input pengguna (kata sudah dinormalisasi a–z0–9).
  const hasil: ReactNode[] = [];
  let sisa = teks;
  let kunci = 0;
  while (sisa) {
    const kecil = sisa.toLowerCase();
    let pos = -1;
    let panjang = 0;
    for (const k of kata) {
      const p = kecil.indexOf(k);
      if (p >= 0 && (pos < 0 || p < pos)) {
        pos = p;
        panjang = k.length;
      }
    }
    if (pos < 0) {
      hasil.push(sisa);
      break;
    }
    if (pos > 0) hasil.push(sisa.slice(0, pos));
    hasil.push(
      <mark key={kunci++} className="rounded-[2px] bg-[var(--primary-subtle)] text-primary">
        {sisa.slice(pos, pos + panjang)}
      </mark>,
    );
    sisa = sisa.slice(pos + panjang);
  }
  return <>{hasil}</>;
}

export function GuideApp({
  dokumen,
  aktifId,
  untukAnda,
}: {
  dokumen: DokumenGuide[];
  aktifId: string;
  untukAnda: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [pilih, setPilih] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const indeks = useMemo(() => indeksBagian(dokumen), [dokumen]);
  const hasil = useMemo(() => (q.trim().length >= 2 ? cari(indeks, q, 30) : []), [indeks, q]);
  const kata = useMemo(() => kataKunci(q).flatMap(varian), [q]);
  const aktif = dokumen.find((d) => d.id === aktifId) ?? dokumen[0]!;
  const toc = aktif.blok.filter((b) => b.jenis === 'judul' && b.level === 2);

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', tekan);
    return () => window.removeEventListener('keydown', tekan);
  }, []);

  useEffect(() => setPilih(0), [q]);

  const buka = (i: number) => {
    const h = hasil[i];
    if (!h) return;
    setQ('');
    router.push(`/guide/${h.dokId}${h.id ? `#${h.id}` : ''}`);
  };

  const urut = [...dokumen].sort((a, b) => Number(untukAnda.includes(b.id)) - Number(untukAnda.includes(a.id)));

  return (
    <div className="mx-auto max-w-[76rem] px-4 pt-6 pb-24 sm:px-6">
      <header className="mb-6 space-y-4">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold text-primary">Guide</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-secondary">
            Panduan lengkap HMIF Center: mekanisme, tata cara, dan menu setiap peran. Cari apa saja, atau tanya Dhana di pojok kiri bawah.
          </p>
        </div>
        <div className="relative max-w-2xl">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tertiary" />
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setPilih((p) => Math.min(p + 1, hasil.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setPilih((p) => Math.max(p - 1, 0));
              } else if (e.key === 'Enter' && hasil.length) {
                e.preventDefault();
                buka(pilih);
              } else if (e.key === 'Escape') setQ('');
            }}
            placeholder="Cari di Guide - mis. upload nota, approval surat, kuota form…"
            name="cari-guide"
            autoComplete="off"
            spellCheck={false}
            aria-label="Cari di Guide"
            aria-controls="guide-hasil"
            aria-expanded={hasil.length > 0}
            role="combobox"
            aria-activedescendant={hasil.length ? `guide-hasil-${pilih}` : undefined}
            data-testid="guide-cari"
            className="h-12 w-full rounded-lg border border-default bg-panel pr-20 pl-10 text-[15px] text-primary outline-none placeholder:text-tertiary focus:border-[var(--border-focus)] focus:ring-3 focus:ring-[var(--border-focus)]/20 [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ('');
                input.current?.focus();
              }}
              aria-label="Hapus pencarian"
              className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-tertiary hover:bg-muted hover:text-primary"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-[4px] border border-default bg-subtle px-1.5 py-0.5 text-[12px] text-tertiary sm:block">/</kbd>
          )}
        </div>
      </header>

      {q.trim().length >= 2 ? (
        <section aria-label="Hasil pencarian" className="max-w-3xl">
          <p className="mb-3 text-[13px] text-tertiary" aria-live="polite">
            {hasil.length ? `${hasil.length} bagian cocok dengan “${q.trim()}”` : `Tidak ada bagian yang cocok dengan “${q.trim()}”. Coba kata yang lebih pendek, atau tanya Dhana.`}
          </p>
          <ul id="guide-hasil" role="listbox" data-testid="guide-hasil" className="divide-y divide-[var(--border-default)] overflow-hidden rounded-lg border border-default bg-panel">
            {hasil.map((h, i) => (
              <li key={`${h.dokId}-${h.id}`} id={`guide-hasil-${i}`} role="option" aria-selected={i === pilih}>
                <Link
                  href={`/guide/${h.dokId}${h.id ? `#${h.id}` : ''}`}
                  onClick={() => setQ('')}
                  onMouseEnter={() => setPilih(i)}
                  className={cn('block px-4 py-3 outline-none focus-visible:bg-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-focus)]', i === pilih ? 'bg-subtle' : 'hover:bg-subtle')}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[15px] font-medium text-primary">
                      <Sorot teks={h.judul} kata={kata} />
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] text-secondary">{h.dokJudul}</span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-secondary">
                    <Sorot teks={h.cuplikan} kata={kata} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(0,1fr)_12rem]">
          <nav aria-label="Daftar panduan" className="lg:sticky lg:top-[68px] lg:self-start">
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1 lg:gap-0.5">
              {urut.map((d) => {
                const nyala = d.id === aktif.id;
                return (
                  <li key={d.id} className="min-w-0">
                    <Link
                      href={`/guide/${d.id}`}
                      aria-current={nyala ? 'page' : undefined}
                      data-testid={`guide-dok-${d.id}`}
                      className={cn(
                        'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-[14px] leading-5 lg:min-h-9 lg:border-0',
                        nyala ? 'border-[var(--primary)] bg-[var(--primary-subtle)] font-medium text-primary' : 'border-default text-secondary hover:bg-subtle hover:text-primary',
                      )}
                    >
                      <span className="min-w-0 break-words">{d.judul.replace(/^Panduan\s+/, '')}</span>
                      {untukAnda.includes(d.id) ? (
                        <span className="shrink-0 rounded-full bg-[var(--primary)] px-1.5 text-[11px] leading-5 font-medium text-[var(--primary-text)]">untuk Anda</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article data-testid="guide-isi" className="min-w-0 max-w-3xl">
            <div className="mb-6 flex items-start gap-3 border-b border-default pb-5">
              <BookOpen aria-hidden="true" className="mt-1 size-5 shrink-0 text-[var(--primary)]" />
              <div className="min-w-0">
                <h2 className="text-[22px] leading-8 font-semibold text-primary">{aktif.judul}</h2>
                {aktif.ringkas ? <p className="mt-1 text-[14px] text-secondary">{aktif.ringkas}</p> : null}
              </div>
            </div>
            <IsiMarkdown blok={aktif.blok.filter((b, i) => !(i === aktif.blok.findIndex((x) => x.jenis === 'paragraf') && b.jenis === 'paragraf'))} />
            <aside className="mt-10 flex flex-wrap items-center gap-3 rounded-lg border border-default bg-subtle px-4 py-3 text-[14px] text-secondary">
              <Sparkles aria-hidden="true" className="size-4 text-[var(--primary)]" />
              Belum menemukan jawabannya? Tanya Dhana lewat tombol di pojok kiri bawah, atau{' '}
              <Link href="/bantuan/lapor-bug" className="text-link hover:underline">
                laporkan bug
              </Link>
              .
            </aside>
          </article>

          {toc.length ? (
            <nav aria-label="Di halaman ini" className="hidden xl:sticky xl:top-[68px] xl:block xl:self-start">
              <p className="mb-2 text-[12px] font-medium text-tertiary">Di halaman ini</p>
              <ul className="space-y-1 border-l border-default">
                {toc.map((b) =>
                  b.jenis === 'judul' ? (
                    <li key={b.id}>
                      <a href={`#${b.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-[13px] leading-5 text-secondary hover:border-[var(--primary)] hover:text-primary">
                        {b.teks.replace(/\*\*/g, '')}
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}
