'use client';

/**
 * Panel chat Dhana (ADR-060) — Digital Helper and Network Assistant, "Your Knowledge Companion".
 * Muncul di pojok kiri bawah (desktop: di samping sidebar; HP: lembar di bawah). Percakapan hanya
 * hidup di state komponen ini — tidak disimpan di server maupun browser.
 *
 * Test id: dhana-panel, dhana-input, dhana-kirim, dhana-pesan, dhana-tutup.
 */

import { ArrowUp, BookOpen, RotateCcw, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Inline } from '@/components/guide/IsiMarkdown';
import { cn } from '@/lib/utils';

interface Sumber {
  dokId: string;
  id: string;
  judul: string;
  dokJudul: string;
}
interface Pesan {
  peran: 'pengguna' | 'dhana';
  teks: string;
  sumber?: Sumber[];
  galat?: boolean;
}

const SARAN = ['Bagaimana cara upload nota?', 'Cara membuat form pendaftaran acara', 'Apa itu Dhana?'];

export function DhanaPanel({ buka, onTutup, sidebarDilipat }: { buka: boolean; onTutup: () => void; sidebarDilipat: boolean }) {
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [teks, setTeks] = useState('');
  const [memuat, setMemuat] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const daftar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buka) return;
    input.current?.focus();
    const tekan = (e: KeyboardEvent) => e.key === 'Escape' && onTutup();
    window.addEventListener('keydown', tekan);
    return () => window.removeEventListener('keydown', tekan);
  }, [buka, onTutup]);

  useEffect(() => {
    daftar.current?.scrollTo({ top: daftar.current.scrollHeight, behavior: 'smooth' });
  }, [pesan, memuat]);

  async function kirim(isi: string) {
    const tanya = isi.trim();
    if (!tanya || memuat) return;
    const riwayat: Pesan[] = [...pesan.filter((p) => !p.galat), { peran: 'pengguna', teks: tanya }];
    setPesan((p) => [...p, { peran: 'pengguna', teks: tanya }]);
    setTeks('');
    setMemuat(true);
    try {
      const r = await fetch('/api/dhana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pesan: riwayat.slice(-16).map(({ peran, teks: t }) => ({ peran, teks: t })) }),
      });
      const d = (await r.json().catch(() => null)) as
        | { ok: true; data: { jawaban: string; sumber: Sumber[] } }
        | { ok: false; error: { message: string } }
        | null;
      if (d?.ok) setPesan((p) => [...p, { peran: 'dhana', teks: d.data.jawaban, sumber: d.data.sumber }]);
      else setPesan((p) => [...p, { peran: 'dhana', teks: d && !d.ok ? d.error.message : 'Dhana belum bisa menjawab. Coba lagi.', galat: true }]);
    } catch {
      setPesan((p) => [...p, { peran: 'dhana', teks: 'Koneksi terputus. Periksa internet lalu coba lagi.', galat: true }]);
    } finally {
      setMemuat(false);
      input.current?.focus();
    }
  }

  if (!buka) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="dhana-judul"
      data-testid="dhana-panel"
      className={cn(
        'fixed inset-x-2 bottom-2 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-xl border border-default bg-panel shadow-[var(--shadow-lg)]',
        'md:inset-x-auto md:bottom-4 md:h-[min(620px,calc(100dvh-6rem))] md:max-h-none md:w-[400px]',
        sidebarDilipat ? 'md:left-[72px]' : 'md:left-[256px]',
      )}
    >
      <header className="flex items-center gap-3 border-b border-default px-4 py-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-text)]">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="dhana-judul" className="text-[15px] leading-5 font-semibold text-primary">
            Dhana
          </h2>
          <p className="truncate text-[12px] text-tertiary">Your Knowledge Companion</p>
        </div>
        {pesan.length ? (
          <button type="button" onClick={() => setPesan([])} aria-label="Percakapan baru" title="Percakapan baru" className="flex size-8 items-center justify-center rounded-md text-secondary hover:bg-muted hover:text-primary">
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" onClick={onTutup} aria-label="Tutup Dhana" data-testid="dhana-tutup" className="flex size-8 items-center justify-center rounded-md text-secondary hover:bg-muted hover:text-primary">
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>

      <div ref={daftar} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {pesan.length === 0 ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-2 text-[14px] leading-6 text-secondary">
              <p className="text-[16px] font-semibold text-primary">Halo! Aku Dhana.</p>
              <p>
                <strong className="font-semibold text-primary">Digital Helper and Network Assistant</strong> HMIF Center. Namaku diambil dari Vardhana — dalam bahasa
                Sanskerta, <em>dhana</em> berarti kekayaan: pengetahuan adalah kekayaan yang dapat dibagikan.
              </p>
              <p>Tanyakan cara memakai HMIF Center; aku menjawab dari isi Guide.</p>
            </div>
            <ul className="space-y-2">
              {SARAN.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => kirim(s)} className="w-full rounded-lg border border-default px-3 py-2 text-left text-[14px] text-primary hover:border-strong hover:bg-subtle">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          pesan.map((p, i) =>
            p.peran === 'pengguna' ? (
              <div key={i} className="flex justify-end" data-testid="dhana-pesan" data-peran="pengguna">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--primary)] px-3.5 py-2 text-[14px] leading-6 whitespace-pre-wrap text-[var(--primary-text)]">{p.teks}</p>
              </div>
            ) : (
              <div key={i} className="space-y-2" data-testid="dhana-pesan" data-peran="dhana">
                <div className={cn('text-[14px] leading-6 whitespace-pre-wrap', p.galat ? 'rounded-lg bg-[var(--danger-subtle)] px-3 py-2 text-[var(--danger)]' : 'text-primary')}>
                  <Inline teks={p.teks} />
                </div>
                {p.sumber?.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {p.sumber.map((s) => (
                      <li key={`${s.dokId}-${s.id}`}>
                        <Link
                          href={`/guide/${s.dokId}${s.id ? `#${s.id}` : ''}`}
                          onClick={onTutup}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-default px-2.5 py-1 text-[12px] text-secondary hover:border-strong hover:text-primary"
                        >
                          <BookOpen className="size-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{s.judul}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ),
          )
        )}
        {memuat ? (
          <p className="flex items-center gap-2 text-[13px] text-tertiary">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
            Dhana sedang menyusun jawaban…
          </p>
        ) : null}
      </div>

      <form
        className="border-t border-default p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void kirim(teks);
        }}
      >
        <div className="flex items-end gap-2 rounded-lg border border-default bg-base px-3 py-2 focus-within:border-[var(--border-focus)]">
          <label htmlFor="dhana-input" className="sr-only">
            Pertanyaan untuk Dhana
          </label>
          <textarea
            id="dhana-input"
            ref={input}
            data-testid="dhana-input"
            rows={1}
            value={teks}
            maxLength={1500}
            onChange={(e) => {
              setTeks(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void kirim(teks);
              }
            }}
            placeholder="Tanya Dhana…"
            className="max-h-[120px] min-h-6 flex-1 resize-none bg-transparent text-[14px] leading-6 text-primary outline-none placeholder:text-tertiary"
          />
          <button
            type="submit"
            data-testid="dhana-kirim"
            disabled={!teks.trim() || memuat}
            aria-label="Kirim pertanyaan"
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-text)] disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-tertiary">Dhana bisa keliru — untuk hal penting, cek kembali di Guide.</p>
      </form>
    </section>
  );
}
