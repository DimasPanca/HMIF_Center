'use client';

/**
 * Bagian 11 TOR — Susunan Acara / Rundown (T-094 kontrak 3).
 *
 * Baris ini BUKAN bagian `tor.data`: disinkronkan ke tabel `rundown`, satu
 * sumber untuk TOR, Proposal (T-096), dan Surat Undangan (T-058). `id` tiap
 * baris dibuat di klien sehingga auto-save berulang tidak menggandakan baris.
 *
 * Baris yang belum lengkap ditandai di tempat; selama masih ada baris tidak
 * valid, rundown tidak ikut terkirim (baris lama tidak terhapus diam-diam).
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkemaBarisRundown, type BarisRundown } from '@/lib/tor/schema';

/** Pesan galat per baris (index → pesan), kosong bila semua valid. */
export function galatRundown(baris: readonly BarisRundown[]): Map<number, string> {
  const m = new Map<number, string>();
  baris.forEach((b, i) => {
    const p = SkemaBarisRundown.safeParse(b);
    if (!p.success) m.set(i, p.error.issues[0]?.message ?? 'Baris belum lengkap.');
  });
  return m;
}

const KOLOM = [
  { kunci: 'tanggal', label: 'Hari/Tanggal', tipe: 'date', lebar: 'sm:col-span-2' },
  { kunci: 'waktu_mulai', label: 'Mulai', tipe: 'time', lebar: 'sm:col-span-1' },
  { kunci: 'waktu_selesai', label: 'Selesai', tipe: 'time', lebar: 'sm:col-span-1' },
  { kunci: 'acara', label: 'Acara', tipe: 'text', lebar: 'sm:col-span-3' },
  { kunci: 'keterangan', label: 'Keterangan/PIC', tipe: 'text', lebar: 'sm:col-span-2' },
] as const;

export function RundownEditor({
  baris,
  bolehTulis,
  onChange,
  tanggalAwal,
}: {
  baris: BarisRundown[];
  bolehTulis: boolean;
  onChange: (b: BarisRundown[]) => void;
  /** Tanggal hari-H acara — isian awal baris pertama. */
  tanggalAwal: string | null;
}) {
  const galat = galatRundown(baris);
  const ubah = (i: number, kunci: keyof BarisRundown, nilai: string) =>
    onChange(baris.map((b, j) => (j === i ? { ...b, [kunci]: nilai } : b)));
  const pindah = (i: number, arah: -1 | 1) => {
    const j = i + arah;
    if (j < 0 || j >= baris.length) return;
    const salin = [...baris];
    [salin[i], salin[j]] = [salin[j]!, salin[i]!];
    onChange(salin);
  };
  const tambah = () => {
    const akhir = baris.at(-1);
    onChange([
      ...baris,
      {
        id: crypto.randomUUID(),
        tanggal: akhir?.tanggal || tanggalAwal || '',
        waktu_mulai: akhir?.waktu_selesai ?? '',
        waktu_selesai: '',
        acara: '',
        keterangan: '',
      },
    ]);
  };

  return (
    <div className="space-y-2" data-testid="tor-rundown">
      {baris.length === 0 ? (
        <p className="text-[13px] text-secondary">Rundown belum disusun.</p>
      ) : null}
      <ol className="space-y-2">
        {baris.map((b, i) => (
          <li
            key={b.id}
            className="rounded-sm border border-default p-3"
            aria-label={`Baris rundown ${i + 1}`}
            data-testid="tor-baris-rundown"
            data-valid={galat.has(i) ? '0' : '1'}
          >
            <div className="grid gap-2 sm:grid-cols-9">
              {KOLOM.map((k) => {
                const idInput = `rundown-${b.id}-${k.kunci}`;
                return (
                  <div key={k.kunci} className={`min-w-0 ${k.lebar}`}>
                    <label htmlFor={idInput} className="mb-1 block text-[12px] text-secondary">
                      {k.label}
                    </label>
                    <Input
                      id={idInput}
                      type={k.tipe}
                      value={b[k.kunci]}
                      readOnly={!bolehTulis}
                      maxLength={k.tipe === 'text' ? 300 : undefined}
                      data-kolom={k.kunci}
                      onChange={(e) => ubah(i, k.kunci, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
            {bolehTulis && galat.has(i) ? (
              <p className="mt-1 text-[12px] text-danger" data-testid="tor-rundown-galat">
                {galat.get(i)}
              </p>
            ) : null}
            {bolehTulis ? (
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Naikkan baris rundown ${i + 1}`}
                  disabled={i === 0}
                  onClick={() => pindah(i, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Turunkan baris rundown ${i + 1}`}
                  disabled={i === baris.length - 1}
                  onClick={() => pindah(i, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Hapus baris rundown ${i + 1}`}
                  onClick={() => onChange(baris.filter((_, j) => j !== i))}
                  data-testid="tor-hapus-rundown"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {bolehTulis ? (
        <Button type="button" variant="secondary" onClick={tambah} data-testid="tor-tambah-rundown">
          <Plus aria-hidden="true" /> Tambah baris rundown
        </Button>
      ) : null}
    </div>
  );
}
