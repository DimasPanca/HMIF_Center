'use client';

/**
 * Pemilih item RAB sebelum kamera (T-101 kontrak 1, PRD F-11.1): dropdown
 * berisi item RAB divisi terpilih saja, dikelompokkan per sub-section, plus
 * opsi "Pengeluaran di luar RAB" (ADR-006). Satu nota boleh mencakup beberapa
 * item — setiap pilihan masuk daftar dan dapat dilepas.
 */

import { X } from 'lucide-react';

import type { ItemPilihan } from '@/lib/nota/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export const PILIHAN_LUAR_RAB = '__luar_rab__';

export function ItemRabSelector({
  items,
  terpilih,
  luarRab,
  onChange,
  nonaktif = false,
}: {
  items: ItemPilihan[];
  terpilih: string[];
  luarRab: boolean;
  onChange: (terpilih: string[], luarRab: boolean) => void;
  nonaktif?: boolean;
}) {
  const sisa = items.filter((i) => !terpilih.includes(i.id));
  const perSection = [...new Set(sisa.map((i) => i.section))].map((s) => ({
    section: s,
    items: sisa.filter((i) => i.section === s),
  }));
  const pilih = (v: string) => {
    if (!v) return;
    if (v === PILIHAN_LUAR_RAB) onChange(terpilih, true);
    else onChange([...terpilih, v], luarRab);
  };

  return (
    <div className="space-y-2" data-testid="nota-item-rab">
      <label htmlFor="nota-pilih-item" className="block text-[13px] font-medium">
        Item RAB yang dibelanjakan <span className="text-danger">*</span>
      </label>
      <select
        id="nota-pilih-item"
        value=""
        disabled={nonaktif}
        onChange={(e) => pilih(e.target.value)}
        className="h-[34px] w-full rounded-sm border border-[var(--text-tertiary)] bg-panel px-2 text-[14px] outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] disabled:opacity-50"
      >
        <option value="">
          {terpilih.length || luarRab ? 'Tambah item lain…' : 'Pilih item RAB…'}
        </option>
        {perSection.map((g) => (
          <optgroup key={g.section} label={g.section}>
            {g.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.jenis_barang} — RAB {formatRupiah(i.total)}
              </option>
            ))}
          </optgroup>
        ))}
        {luarRab ? null : <option value={PILIHAN_LUAR_RAB}>Pengeluaran di luar RAB</option>}
      </select>
      {items.length === 0 ? (
        <p className="text-[12px] text-secondary">
          Divisi ini belum punya item RAB — hanya pengeluaran di luar RAB yang dapat dicatat.
        </p>
      ) : null}
      {terpilih.length || luarRab ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Item terpilih">
          {terpilih.map((id) => {
            const i = items.find((x) => x.id === id);
            return (
              <li
                key={id}
                className="inline-flex items-center gap-1 rounded-sm bg-subtle px-2 py-1 text-[13px]"
                data-testid="nota-item-terpilih"
              >
                {i?.jenis_barang ?? 'Item'}
                <button
                  type="button"
                  aria-label={`Lepas ${i?.jenis_barang ?? 'item'}`}
                  disabled={nonaktif}
                  onClick={() =>
                    onChange(
                      terpilih.filter((x) => x !== id),
                      luarRab,
                    )
                  }
                  className="rounded-sm p-0.5 hover:bg-muted"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            );
          })}
          {luarRab ? (
            <li
              className="inline-flex items-center gap-1 rounded-sm bg-[var(--warning-subtle)] px-2 py-1 text-[13px]"
              data-testid="nota-item-terpilih"
            >
              Di luar RAB
              <button
                type="button"
                aria-label="Lepas pengeluaran di luar RAB"
                disabled={nonaktif}
                onClick={() => onChange(terpilih, false)}
                className="rounded-sm p-0.5 hover:bg-muted"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
