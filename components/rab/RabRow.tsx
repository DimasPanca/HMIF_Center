'use client';

/**
 * Satu baris item RAB (T-087). Divisi yang boleh ditulis: setiap sel adalah
 * input inline (bukan modal). Divisi lain: teks biasa — TIDAK ADA input atau
 * tombol di DOM (INV-30).
 *
 * Keyboard (DESIGN_SYSTEM §9.3): Tab → sel berikutnya (urutan DOM),
 * Enter → baris berikutnya kolom sama, Esc → batal (kembali ke nilai tersimpan).
 * Perubahan disimpan saat sel ditinggalkan (blur) atau Enter.
 *
 * Kolom Total: read-only berlatar inset; ikon gembok membuka override manual
 * yang ditandai visual (`total_manual`, kontrak 5).
 *
 * Test id: rab-item (data-item-id), rab-no, rab-jenis, rab-harga, rab-total,
 * rab-total-manual (toggle), rab-ket, rab-hapus-item.
 */

import { Lock, LockOpen, Trash2 } from 'lucide-react';
import * as React from 'react';

import { CurrencyInput } from '@/components/rab/CurrencyInput';
import { JumlahInput } from '@/components/rab/JumlahInput';
import type { ItemRab, UbahItem } from '@/lib/rab/item';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export type Kolom = 'jenis' | 'jumlah' | 'harga' | 'total' | 'ket';

const SEL =
  'h-8 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-[13px] text-primary outline-none hover:border-default focus:border-[var(--border-focus)] focus:bg-panel';

export function RabRow({
  item,
  baris,
  bolehTulis,
  baru,
  onUbah,
  onSimpan,
  onBatal,
  onHapus,
  onPindah,
}: {
  item: ItemRab;
  baris: number;
  bolehTulis: boolean;
  baru: boolean;
  onUbah: (u: UbahItem) => void;
  onSimpan: () => void;
  onBatal: () => void;
  onHapus: () => void;
  onPindah: (baris: number, kolom: Kolom) => void;
}) {
  const sel = (kolom: Kolom): React.ComponentProps<'input'> => ({
    'data-baris': baris,
    'data-kolom': kolom,
    'aria-label': `${{ jenis: 'Jenis barang', jumlah: 'Jumlah', harga: 'Harga satuan', total: 'Total', ket: 'Keterangan' }[kolom]} baris ${item.no_urut}`,
    onBlur: onSimpan,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSimpan();
        onPindah(baris + 1, kolom);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBatal();
        e.currentTarget.blur();
      }
    },
  } as React.ComponentProps<'input'>);

  const totalTampil = (
    <span data-testid="rab-total" className={cn('block px-1.5 text-right tabular-nums transition-opacity duration-150', item.total_manual && 'font-medium text-[var(--warning)]')}>
      {formatRupiah(item.total)}
    </span>
  );

  return (
    <tr
      data-testid="rab-item"
      data-item-id={item.id}
      className={cn('border-t border-default align-top transition-colors duration-400', baru && 'bg-[var(--primary-subtle)]')}
    >
      <td data-testid="rab-no" className="w-10 px-2 py-1.5 text-[13px] text-secondary tabular-nums">
        {item.no_urut}
      </td>
      {bolehTulis ? (
        <>
          <td className="min-w-40 py-1">
            <input {...sel('jenis')} type="text" value={item.jenis_barang} onChange={(e) => onUbah({ jenis_barang: e.target.value })} data-testid="rab-jenis" className={SEL} maxLength={200} />
          </td>
          <td className="w-40 py-1">
            <JumlahInput
              teks={item.jumlah_teks}
              numerik={item.jumlah_numerik}
              onTeks={(t) => onUbah({ jumlah_teks: t })}
              onNumerik={(n) => onUbah({ jumlah_numerik: n })}
              inputProps={sel('jumlah')}
              kelasSel={SEL}
            />
          </td>
          <td className="w-36 py-1">
            <CurrencyInput {...sel('harga')} value={item.harga_satuan} onNilai={(n) => onUbah({ harga_satuan: n })} data-testid="rab-harga" className={SEL} />
          </td>
          <td className={cn('w-40 py-1', !item.total_manual && 'bg-[var(--bg-inset)]')}>
            <div className="flex items-center gap-0.5">
              {item.total_manual ? (
                <CurrencyInput
                  {...sel('total')}
                  value={item.total}
                  onNilai={(n) => onUbah({ total: n })}
                  data-testid="rab-total"
                  className={cn(SEL, 'border-[var(--warning)] font-medium text-[var(--warning)]')}
                />
              ) : (
                <span className="min-w-0 flex-1 py-1.5">{totalTampil}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  onUbah(item.total_manual ? { total_manual: false } : { total_manual: true, total: item.total });
                  queueMicrotask(onSimpan);
                }}
                aria-pressed={item.total_manual}
                aria-label={item.total_manual ? 'Kembalikan total ke hitungan otomatis' : 'Isi total secara manual'}
                title={item.total_manual ? 'Total diisi manual — klik untuk menghitung otomatis' : 'Override total manual'}
                data-testid="rab-total-manual"
                className="flex size-7 shrink-0 items-center justify-center rounded-sm text-tertiary hover:bg-subtle hover:text-primary"
              >
                {item.total_manual ? <LockOpen className="size-3.5 text-[var(--warning)]" /> : <Lock className="size-3.5" />}
              </button>
            </div>
          </td>
          <td className="min-w-32 py-1">
            <input {...sel('ket')} type="text" value={item.keterangan ?? ''} onChange={(e) => onUbah({ keterangan: e.target.value })} data-testid="rab-ket" className={SEL} maxLength={500} />
          </td>
          <td className="w-9 py-1">
            <button
              type="button"
              onClick={onHapus}
              aria-label={`Hapus item ${item.jenis_barang || item.no_urut}`}
              data-testid="rab-hapus-item"
              className="flex size-8 items-center justify-center rounded-sm text-tertiary hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)]"
            >
              <Trash2 className="size-4" />
            </button>
          </td>
        </>
      ) : (
        <>
          <td className="px-1.5 py-1.5 text-[13px]" data-testid="rab-jenis">{item.jenis_barang}</td>
          <td className="px-1.5 py-1.5 text-[13px]" data-testid="rab-jumlah">{item.jumlah_teks}</td>
          <td className="px-1.5 py-1.5 text-right text-[13px] tabular-nums" data-testid="rab-harga">{formatRupiah(item.harga_satuan)}</td>
          <td className="bg-[var(--bg-inset)] py-1.5 text-[13px]">{totalTampil}</td>
          <td className="px-1.5 py-1.5 text-[13px] text-secondary" data-testid="rab-ket">{item.keterangan ?? ''}</td>
          <td />
        </>
      )}
    </tr>
  );
}
