'use client';

/**
 * Alokasi satu nota ke beberapa item RAB (T-101 kontrak 3–5, ADR-006/007):
 * nominal per baris, jumlah & harga aktual (opsional), baris "di luar RAB"
 * dengan uraian wajib. Sisa alokasi dihitung real-time terhadap total nota.
 */

import { Plus, Trash2 } from 'lucide-react';

import { CurrencyInput } from '@/components/rab/CurrencyInput';
import { Button } from '@/components/ui/button';
import type { ItemPilihan } from '@/lib/nota/service';
import { selisihAlokasi } from '@/lib/nota/skema';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export interface BarisAlokasi {
  kunci: string;
  rab_item_id: string | null;
  uraian_luar_rab: string;
  jumlah_aktual: number | null;
  harga_aktual: number | null;
  nominal: number;
}

const KOTAK =
  'h-[34px] w-full min-w-0 rounded-sm border border-[var(--text-tertiary)] bg-panel px-2 text-[14px] outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)]';

export function AlokasiEditor({
  baris,
  items,
  totalNota,
  onChange,
}: {
  baris: BarisAlokasi[];
  items: ItemPilihan[];
  totalNota: number;
  onChange: (b: BarisAlokasi[]) => void;
}) {
  const ubah = (kunci: string, p: Partial<BarisAlokasi>) =>
    onChange(baris.map((b) => (b.kunci === kunci ? { ...b, ...p } : b)));
  const selisih = selisihAlokasi(totalNota, baris);
  const totalAlokasi = baris.reduce((s, b) => s + b.nominal, 0);

  return (
    <div className="space-y-2" data-testid="nota-alokasi">
      <ol className="space-y-2">
        {baris.map((b, i) => {
          const item = b.rab_item_id ? items.find((x) => x.id === b.rab_item_id) : null;
          const id = (k: string) => `alokasi-${i}-${k}`;
          return (
            <li
              key={b.kunci}
              className="rounded-sm border border-default p-3"
              data-testid="nota-alokasi-baris"
              aria-label={`Alokasi ${i + 1}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium">
                  {item ? (
                    <>
                      {item.jenis_barang}{' '}
                      <span className="font-normal text-secondary">
                        · {item.section} · RAB {formatRupiah(item.total)}
                      </span>
                    </>
                  ) : (
                    'Pengeluaran di luar RAB'
                  )}
                </p>
                {!item ? (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Hapus alokasi ${i + 1}`}
                    onClick={() => onChange(baris.filter((x) => x.kunci !== b.kunci))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                {!item ? (
                  <div className="sm:col-span-4">
                    <label htmlFor={id('uraian')} className="mb-1 block text-[12px] text-secondary">
                      Uraian pengeluaran <span className="text-danger">*</span>
                    </label>
                    <input
                      id={id('uraian')}
                      className={KOTAK}
                      maxLength={300}
                      value={b.uraian_luar_rab}
                      onChange={(e) => ubah(b.kunci, { uraian_luar_rab: e.target.value })}
                    />
                  </div>
                ) : null}
                <div>
                  <label htmlFor={id('jumlah')} className="mb-1 block text-[12px] text-secondary">
                    Jumlah aktual
                  </label>
                  <input
                    id={id('jumlah')}
                    className={cn(KOTAK, 'text-right tabular-nums')}
                    inputMode="decimal"
                    value={b.jumlah_aktual ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(',', '.');
                      ubah(b.kunci, {
                        jumlah_aktual: v === '' || Number.isNaN(Number(v)) ? null : Number(v),
                      });
                    }}
                  />
                </div>
                <div>
                  <label htmlFor={id('harga')} className="mb-1 block text-[12px] text-secondary">
                    Harga aktual
                  </label>
                  <CurrencyInput
                    id={id('harga')}
                    className={KOTAK}
                    value={b.harga_aktual ?? 0}
                    onNilai={(n) => ubah(b.kunci, { harga_aktual: n || null })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={id('nominal')} className="mb-1 block text-[12px] text-secondary">
                    Nominal dialokasikan <span className="text-danger">*</span>
                  </label>
                  <CurrencyInput
                    id={id('nominal')}
                    className={KOTAK}
                    value={b.nominal}
                    onNilai={(n) => ubah(b.kunci, { nominal: n })}
                    data-testid="nota-alokasi-nominal"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange([
            ...baris,
            {
              kunci: crypto.randomUUID(),
              rab_item_id: null,
              uraian_luar_rab: '',
              jumlah_aktual: null,
              harga_aktual: null,
              nominal: 0,
            },
          ])
        }
        data-testid="nota-tambah-luar-rab"
      >
        <Plus aria-hidden="true" /> Tambah pengeluaran di luar RAB
      </Button>
      <p
        className={cn(
          'rounded-sm px-3 py-2 text-[13px] tabular-nums',
          selisih === 0 ? 'bg-[var(--success-subtle)] text-success' : 'bg-[var(--warning-subtle)]',
        )}
        role="status"
        aria-live="polite"
        data-testid="nota-sisa"
        data-selisih={selisih}
      >
        Total alokasi {formatRupiah(totalAlokasi)} dari {formatRupiah(totalNota)} ·{' '}
        {selisih === 0
          ? 'seimbang'
          : selisih < 0
            ? `sisa ${formatRupiah(-selisih)} belum dialokasikan`
            : `lebih ${formatRupiah(selisih)}`}
      </p>
    </div>
  );
}
