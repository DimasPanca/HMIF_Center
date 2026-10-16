'use client';

/**
 * Job desk divisi (T-093, PRD F-8.2): tampilan baca + editor TipTap.
 *
 *   - Tampilan baca merender JSON tersanitasi lewat `KontenProsa` — TANPA TipTap.
 *   - TipTap (lewat NotulensiEditor) dimuat dinamis hanya setelah penulis
 *     menekan "Ubah job desk", jadi bundel halaman divisi tidak memuatnya.
 *   - Auto-save tiap 10 detik bila ada perubahan, dengan indikator
 *     "Tersimpan ✓"; tombol "Selesai" menyimpan seketika.
 *   - Divisi lain (INV-30): tombol ubah tidak dirender sama sekali; server
 *     tetap menolak 403 (lib/acara/job-desk.ts).
 */

import type { JSONContent } from '@tiptap/react';
import { Check, Pencil } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';

import { KontenProsa, kontenKosong } from '@/components/acara/KontenProsa';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { NodeProseMirror } from '@/lib/notulensi/sanitasi';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

const NotulensiEditor = dynamic(
  () => import('@/components/notulensi/NotulensiEditor').then((m) => m.NotulensiEditor),
  {
    ssr: false,
    loading: () => (
      <Skeleton
        variant="text"
        rows={5}
        loadingLabel="Memuat editor…"
        data-testid="job-desk-memuat"
      />
    ),
  },
);

/** Selang auto-save (kontrak T-093). */
export const SELANG_AUTOSAVE_MS = 10_000;

type Status = 'tersimpan' | 'berubah' | 'menyimpan' | 'gagal';

interface Props {
  divisiId: string;
  konten: NodeProseMirror;
  bolehTulis: boolean;
  diperbaruiAt: string | null;
  diperbaruiOleh: string | null;
}

type Respons =
  | { ok: true; data: { diperbarui_at: string; konten: NodeProseMirror } }
  | { ok: false; error?: { message?: string } };

export function JobDeskEditor({
  divisiId,
  konten: awal,
  bolehTulis,
  diperbaruiAt,
  diperbaruiOleh,
}: Props) {
  const [konten, setKonten] = React.useState(awal);
  const [mengubah, setMengubah] = React.useState(false);
  const [status, setStatus] = React.useState<Status>('tersimpan');
  const [galat, setGalat] = React.useState<string | null>(null);
  const [jejak, setJejak] = React.useState({ at: diperbaruiAt, oleh: diperbaruiOleh });
  const draf = React.useRef<JSONContent | null>(null);
  const sedangSimpan = React.useRef<Promise<boolean> | null>(null);

  const simpan = React.useCallback(async (): Promise<boolean> => {
    if (sedangSimpan.current) await sedangSimpan.current;
    const isi = draf.current;
    if (!isi) return true;
    draf.current = null;
    setStatus('menyimpan');
    const kerja = (async () => {
      try {
        const r = await fetch(`/api/divisi/${divisiId}/job-desk`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ konten: isi }),
        });
        const b = (await r.json().catch(() => null)) as Respons | null;
        if (!r.ok || !b?.ok)
          throw new Error((b && !b.ok && b.error?.message) || 'Job desk gagal disimpan.');
        setKonten(b.data.konten);
        setJejak({ at: b.data.diperbarui_at, oleh: null });
        setGalat(null);
        // Perubahan baru selama permintaan berjalan tetap menunggu siklus berikutnya.
        setStatus(draf.current ? 'berubah' : 'tersimpan');
        return true;
      } catch (e) {
        draf.current ??= isi;
        setGalat(e instanceof Error ? e.message : 'Job desk gagal disimpan.');
        setStatus('gagal');
        return false;
      }
    })();
    sedangSimpan.current = kerja;
    try {
      return await kerja;
    } finally {
      sedangSimpan.current = null;
    }
  }, [divisiId]);

  // Auto-save: tiap 10 detik, hanya bila ada draf yang belum terkirim.
  React.useEffect(() => {
    if (!mengubah) return;
    const id = window.setInterval(() => {
      if (draf.current) void simpan();
    }, SELANG_AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [mengubah, simpan]);

  // Peringatkan bila tab ditutup dengan perubahan yang belum tersimpan.
  React.useEffect(() => {
    if (!mengubah) return;
    const tahan = (e: BeforeUnloadEvent) => {
      if (draf.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', tahan);
    return () => window.removeEventListener('beforeunload', tahan);
  }, [mengubah]);

  const selesai = async () => {
    if (await simpan()) setMengubah(false);
  };

  return (
    <div data-testid="job-desk" data-mode={mengubah ? 'ubah' : 'baca'}>
      {mengubah ? (
        <div className="space-y-2">
          <NotulensiEditor
            konten={konten as JSONContent}
            editable
            label="Isi job desk"
            onChange={(isi) => {
              draf.current = isi;
              setStatus('berubah');
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className="text-[12px] text-secondary"
              role="status"
              aria-live="polite"
              data-testid="job-desk-status"
              data-status={status}
            >
              {status === 'tersimpan' ? (
                <span className="inline-flex items-center gap-1 text-success">
                  Tersimpan <Check aria-hidden="true" className="size-3.5" />
                </span>
              ) : status === 'menyimpan' ? (
                'Menyimpan…'
              ) : status === 'gagal' ? (
                <span className="text-danger">{galat}</span>
              ) : (
                'Perubahan disimpan otomatis tiap 10 detik.'
              )}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void selesai()}
              disabled={status === 'menyimpan'}
              data-testid="job-desk-selesai"
            >
              Selesai
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {kontenKosong(konten) ? (
            <p className="text-[13px] text-secondary" data-testid="job-desk-kosong">
              Job desk belum disusun.
            </p>
          ) : (
            <KontenProsa konten={konten} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-tertiary">
              {jejak.at
                ? `Diperbarui ${formatTanggalPendek(jejak.at)}${jejak.oleh ? ` oleh ${jejak.oleh}` : ''}`
                : null}
            </p>
            {/* Divisi lain: tombol tidak dirender (INV-30), bukan disabled. */}
            {bolehTulis ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMengubah(true)}
                data-testid="job-desk-ubah"
              >
                <Pencil aria-hidden="true" /> Ubah job desk
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
