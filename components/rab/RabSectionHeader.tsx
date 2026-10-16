'use client';

/**
 * Kepala sub-section RAB (T-087): lipat/buka, nama (dapat diubah di divisi
 * sendiri), subtotal, dan hapus dengan konfirmasi bertingkat — pengguna
 * mengetik ulang nama sub-section, karena seluruh itemnya ikut terhapus.
 * Divisi lain: hanya nama dan subtotal (INV-30).
 *
 * Test id: rab-section (data-section-id), rab-section-nama, rab-section-subtotal,
 * rab-section-toggle, rab-hapus-section.
 */

import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import * as React from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatRupiah } from '@/lib/utils/format-rupiah';

export function RabSectionHeader({
  id,
  nama,
  subtotal,
  jumlahItem,
  terbuka,
  bolehTulis,
  onToggle,
  onGantiNama,
  onHapus,
}: {
  id: string;
  nama: string;
  subtotal: number;
  jumlahItem: number;
  terbuka: boolean;
  bolehTulis: boolean;
  onToggle: () => void;
  onGantiNama: (nama: string) => void;
  onHapus: () => void;
}) {
  const [draf, setDraf] = React.useState(nama);
  const [konfirmasi, setKonfirmasi] = React.useState(false);
  React.useEffect(() => setDraf(nama), [nama]);

  const simpan = () => {
    const bersih = draf.trim();
    if (bersih && bersih.toUpperCase() !== nama) onGantiNama(bersih);
    else setDraf(nama);
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5" data-testid="rab-section" data-section-id={id}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={terbuka}
        aria-label={`${terbuka ? 'Lipat' : 'Buka'} ${nama}`}
        data-testid="rab-section-toggle"
        className="flex size-7 items-center justify-center rounded-sm text-secondary hover:bg-subtle"
      >
        {terbuka ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {bolehTulis ? (
        <input
          value={draf}
          onChange={(e) => setDraf(e.target.value)}
          onBlur={simpan}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraf(nama);
              e.currentTarget.blur();
            }
          }}
          aria-label="Nama sub-section"
          data-testid="rab-section-nama"
          maxLength={100}
          className="h-8 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 text-[13px] font-semibold tracking-wide uppercase outline-none hover:border-default focus:border-[var(--border-focus)] focus:bg-panel"
        />
      ) : (
        <span data-testid="rab-section-nama" className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-semibold tracking-wide uppercase">
          {nama}
        </span>
      )}
      <span data-testid="rab-section-subtotal" className="text-[13px] font-medium tabular-nums">
        {formatRupiah(subtotal)}
      </span>
      {bolehTulis ? (
        <button
          type="button"
          onClick={() => setKonfirmasi(true)}
          aria-label={`Hapus sub-section ${nama}`}
          data-testid="rab-hapus-section"
          className="flex size-7 items-center justify-center rounded-sm text-tertiary hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)]"
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
      <ConfirmDialog
        level="typed"
        confirmationText={nama}
        open={konfirmasi}
        onOpenChange={setKonfirmasi}
        title={`Hapus sub-section ${nama}?`}
        description={`${jumlahItem} item di dalamnya ikut terhapus. Ketik nama sub-section untuk memastikan.`}
        confirmLabel="Hapus sub-section"
        confirmVariant="danger"
        onConfirm={() => {
          setKonfirmasi(false);
          onHapus();
        }}
      />
    </div>
  );
}
