'use client';

/**
 * Daftar berulang generik untuk bagian TOR (T-094): tujuan, sub-bagian bentuk
 * acara, waktu & tempat, kondisi, parameter kelulusan, rangkaian acara.
 *
 * Setiap baris = sekumpulan kolom berlabel. Pembaca melihat nilai yang sama
 * dalam input read-only TANPA tombol tambah/hapus/geser.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface KolomRepeatable<T> {
  kunci: keyof T & string;
  label: string;
  tipe: 'teks' | 'panjang' | 'tanggal' | 'angka';
  /** Kelas grid kolom pada layar lebar, mis. 'sm:col-span-2'. */
  lebar?: string;
  placeholder?: string;
  maks?: number;
}

interface Props<T> {
  id: string;
  baris: T[];
  kolom: KolomRepeatable<T>[];
  bolehTulis: boolean;
  onChange: (baris: T[]) => void;
  buat: () => T;
  labelTambah: string;
  /** Kata benda untuk aria-label tiap baris, mis. "Sesi". */
  namaBaris: string;
  kosong?: string;
}

function nilaiInput(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function BagianRepeatable<T extends Record<string, unknown>>({
  id,
  baris,
  kolom,
  bolehTulis,
  onChange,
  buat,
  labelTambah,
  namaBaris,
  kosong = 'Belum ada isian.',
}: Props<T>) {
  const ubah = (i: number, kunci: keyof T & string, nilai: unknown) =>
    onChange(baris.map((b, j) => (j === i ? { ...b, [kunci]: nilai } : b)));
  const pindah = (i: number, arah: -1 | 1) => {
    const j = i + arah;
    if (j < 0 || j >= baris.length) return;
    const salin = [...baris];
    [salin[i], salin[j]] = [salin[j]!, salin[i]!];
    onChange(salin);
  };

  return (
    <div className="space-y-2" data-testid={`tor-daftar-${id}`}>
      {baris.length === 0 ? <p className="text-[13px] text-secondary">{kosong}</p> : null}
      <ol className="space-y-2">
        {baris.map((b, i) => (
          <li
            key={i}
            className="rounded-sm border border-default p-3"
            aria-label={`${namaBaris} ${i + 1}`}
            data-testid={`tor-baris-${id}`}
          >
            <div className="grid gap-2 sm:grid-cols-4">
              {kolom.map((k) => {
                const idInput = `${id}-${i}-${k.kunci}`;
                const umum = {
                  id: idInput,
                  value: nilaiInput(b[k.kunci]),
                  readOnly: !bolehTulis,
                  placeholder: bolehTulis ? k.placeholder : undefined,
                  'data-kolom': k.kunci,
                };
                return (
                  <div key={k.kunci} className={cn('min-w-0', k.lebar ?? 'sm:col-span-1')}>
                    <label htmlFor={idInput} className="mb-1 block text-[12px] text-secondary">
                      {k.label}
                    </label>
                    {k.tipe === 'panjang' ? (
                      <Textarea
                        {...umum}
                        rows={3}
                        maxLength={k.maks}
                        onChange={(e) => ubah(i, k.kunci, e.target.value)}
                      />
                    ) : k.tipe === 'angka' ? (
                      <Input
                        {...umum}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        onChange={(e) =>
                          ubah(i, k.kunci, e.target.value === '' ? null : Number(e.target.value))
                        }
                      />
                    ) : (
                      <Input
                        {...umum}
                        type={k.tipe === 'tanggal' ? 'date' : 'text'}
                        maxLength={k.maks}
                        onChange={(e) => ubah(i, k.kunci, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {bolehTulis ? (
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Naikkan ${namaBaris} ${i + 1}`}
                  disabled={i === 0}
                  onClick={() => pindah(i, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Turunkan ${namaBaris} ${i + 1}`}
                  disabled={i === baris.length - 1}
                  onClick={() => pindah(i, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Hapus ${namaBaris} ${i + 1}`}
                  onClick={() => onChange(baris.filter((_, j) => j !== i))}
                  data-testid={`tor-hapus-${id}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {bolehTulis ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...baris, buat()])}
          data-testid={`tor-tambah-${id}`}
        >
          <Plus aria-hidden="true" /> {labelTambah}
        </Button>
      ) : null}
    </div>
  );
}
