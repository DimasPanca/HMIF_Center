'use client';

/**
 * Lapor bug (ADR-060 §5): form untuk semua pengguna + daftar laporan miliknya beserta status.
 * Halaman asal diambil dari `document.referrer` (sesama situs) supaya Admin tahu letak bug-nya.
 *
 * Test id: bug-deskripsi, bug-lampiran, bug-kirim, bug-terkirim, bug-item.
 */

import { CheckCircle2, ImagePlus, Paperclip, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { LaporanBug, StatusBug } from '@/lib/bug/service';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';
import { cn } from '@/lib/utils';

export const LABEL_STATUS_BUG: Record<StatusBug, { label: string; kelas: string }> = {
  BARU: { label: 'Baru', kelas: 'bg-[var(--info-subtle)] text-[var(--info)]' },
  DITANGANI: { label: 'Ditangani', kelas: 'bg-[var(--warning-subtle)] text-[var(--warning)]' },
  SELESAI: { label: 'Selesai', kelas: 'bg-[var(--success-subtle)] text-[var(--success)]' },
  DITOLAK: { label: 'Ditolak', kelas: 'bg-[var(--neutral-subtle)] text-secondary' },
};

export function LencanaStatusBug({ status }: { status: StatusBug }) {
  const s = LABEL_STATUS_BUG[status];
  return <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium', s.kelas)}>{s.label}</span>;
}

const MAKS = 4 * 1024 * 1024;

export function LaporBug({ laporan }: { laporan: LaporanBug[] }) {
  const router = useRouter();
  const [deskripsi, setDeskripsi] = useState('');
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [terkirim, setTerkirim] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [halaman, setHalaman] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.origin === location.origin && !r.pathname.startsWith('/bantuan')) setHalaman(r.pathname + r.search);
    } catch {
      // Referrer tidak sah — biarkan kosong.
    }
  }, []);

  useEffect(() => () => void (pratinjau && URL.revokeObjectURL(pratinjau)), [pratinjau]);

  function pilihBerkas(f: File | null) {
    setGalat(null);
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setGalat('Lampiran harus gambar JPG, PNG, atau WebP.');
    if (f.size > MAKS) return setGalat('Tangkapan layar maksimal 4 MB.');
    setBerkas(f);
    setPratinjau(URL.createObjectURL(f));
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (deskripsi.trim().length < 10) return setGalat('Ceritakan bug-nya minimal 10 karakter.');
    setMemuat(true);
    setGalat(null);
    const data = new FormData();
    data.set('deskripsi', deskripsi);
    data.set('halaman', halaman);
    data.set('peramban', navigator.userAgent.slice(0, 500));
    if (berkas) data.set('lampiran', berkas);
    try {
      const r = await fetch('/api/bug', { method: 'POST', body: data });
      const d = (await r.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
      if (!d?.ok) throw new Error(d?.error?.message ?? 'Laporan gagal dikirim. Coba lagi.');
      setDeskripsi('');
      setBerkas(null);
      setPratinjau(null);
      setTerkirim(true);
      router.refresh();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : 'Laporan gagal dikirim. Coba lagi.');
    } finally {
      setMemuat(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[64rem] gap-8 px-4 pt-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="lapor-judul" className="space-y-4">
        <div>
          <h1 id="lapor-judul" className="text-[28px] leading-9 font-semibold text-primary">
            Lapor bug
          </h1>
          <p className="mt-1 text-[15px] text-secondary">Ada yang tidak berjalan semestinya? Ceritakan, Admin akan menindaklanjutinya.</p>
        </div>

        {terkirim ? (
          <p data-testid="bug-terkirim" className="flex items-start gap-2 rounded-lg bg-[var(--success-subtle)] px-4 py-3 text-[14px] text-[var(--success)]">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Terima kasih, laporan terkirim. Statusnya bisa dipantau di daftar laporan Anda.
          </p>
        ) : null}

        <form onSubmit={kirim} className="space-y-4 rounded-lg border border-default bg-panel p-4 sm:p-5">
          <div className="space-y-1.5">
            <label htmlFor="bug-deskripsi" className="text-[14px] font-medium text-primary">
              Apa yang terjadi?
            </label>
            <textarea
              id="bug-deskripsi"
              data-testid="bug-deskripsi"
              rows={6}
              maxLength={5000}
              value={deskripsi}
              onChange={(e) => {
                setDeskripsi(e.target.value);
                setTerkirim(false);
              }}
              aria-describedby="bug-deskripsi-bantu"
              placeholder="Contoh: Di halaman RAB acara SYNCHRONIZE, tombol Simpan tidak merespons setelah saya mengubah jumlah item."
              className="w-full resize-y rounded-md border border-default bg-base px-3 py-2 text-[14px] leading-6 text-primary outline-none placeholder:text-tertiary focus:border-[var(--border-focus)]"
            />
            <p id="bug-deskripsi-bantu" className="text-[12px] text-tertiary">
              Sebutkan halaman, apa yang Anda klik, dan apa yang Anda harapkan terjadi.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-[14px] font-medium text-primary">
              Tangkapan layar <span className="font-normal text-tertiary">(opsional)</span>
            </span>
            {pratinjau ? (
              <div className="relative overflow-hidden rounded-md border border-default">
                {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */}
                <img src={pratinjau} alt="Pratinjau tangkapan layar" className="max-h-56 w-full object-contain bg-subtle" />
                <button
                  type="button"
                  onClick={() => {
                    setBerkas(null);
                    setPratinjau(null);
                  }}
                  aria-label="Hapus tangkapan layar"
                  className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-md bg-panel/90 text-secondary hover:text-primary"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-strong px-4 py-6 text-center text-[14px] text-secondary hover:bg-subtle focus-within:border-[var(--border-focus)]">
                <ImagePlus aria-hidden="true" className="size-5 text-tertiary" />
                Pilih gambar
                <span className="text-[12px] text-tertiary">JPG, PNG, atau WebP · maks. 4 MB</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  data-testid="bug-lampiran"
                  className="sr-only"
                  onChange={(e) => pilihBerkas(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {halaman ? (
            <p className="flex items-center gap-1.5 text-[12px] text-tertiary">
              <Paperclip aria-hidden="true" className="size-3.5" /> Halaman asal ikut tercatat: <code className="font-mono">{halaman}</code>
            </p>
          ) : null}

          {galat ? (
            <p role="alert" className="rounded-md bg-[var(--danger-subtle)] px-3 py-2 text-[13px] text-[var(--danger)]">
              {galat}
            </p>
          ) : null}

          <Button type="submit" disabled={memuat} data-testid="bug-kirim">
            {memuat ? 'Mengirim…' : 'Kirim laporan'}
          </Button>
        </form>
      </section>

      <section aria-labelledby="laporan-saya" className="space-y-3 lg:pt-[76px]">
        <h2 id="laporan-saya" className="text-[16px] font-semibold text-primary">
          Laporan Anda <span className="font-normal text-tertiary">({laporan.length})</span>
        </h2>
        {laporan.length === 0 ? (
          <p className="rounded-lg border border-dashed border-default px-4 py-6 text-center text-[14px] text-secondary">Belum ada laporan. Semoga tetap begitu.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-default)] overflow-hidden rounded-lg border border-default bg-panel">
            {laporan.map((l) => (
              <li key={l.id} data-testid="bug-item" className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <LencanaStatusBug status={l.status} />
                  <time dateTime={l.created_at} className="text-[12px] text-tertiary">
                    {formatTanggalWaktu(l.created_at)}
                  </time>
                </div>
                <p className="line-clamp-3 text-[14px] leading-6 whitespace-pre-wrap text-primary">{l.deskripsi}</p>
                {l.catatan_admin ? (
                  <p className="rounded-md bg-subtle px-3 py-2 text-[13px] text-secondary">
                    <span className="font-medium text-primary">Catatan Admin:</span> {l.catatan_admin}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
