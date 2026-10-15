'use client';

/**
 * Peringatan bentrok peminjaman (T-108) — PERINGATAN, bukan blokir.
 *
 * Sengaja tidak memakai `InlineAlert`: komponen itu bernada bahaya dan berkata
 * "pilih tanggal lain untuk melanjutkan" (bentrok proker yang memang memblokir).
 * Di sini keputusan akhir ada di Dekanat (PRD F-14.2), jadi nadanya kuning dan
 * tombol "Tetap simpan" selalu tersedia.
 *
 * Test id: peringatan-bentrok, peringatan-bentrok-item, peringatan-bentrok-lanjut.
 */

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DetailBentrok } from '@/lib/ruangan/bentrok';
import { formatTanggalPanjang } from '@/lib/utils/format-tanggal';

export function PeringatanBentrok({
  bentrok,
  proses,
  onLanjut,
  onBatal,
}: {
  bentrok: DetailBentrok[];
  proses: boolean;
  onLanjut: () => void;
  onBatal: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="peringatan-bentrok"
      className="rounded-sm border-l-[3px] border-l-[var(--warning)] bg-[var(--warning-subtle)] p-3 text-primary"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-[var(--warning)]" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] leading-5 font-semibold">Ruangan ini sudah tercatat dipinjam</h3>
          <ul className="mt-2 grid gap-1.5 border-t border-[var(--warning)] pt-2 text-[13px] leading-[18px]">
            {bentrok.map((b) => (
              <li key={b.id} data-testid="peringatan-bentrok-item">
                <span className="font-medium">{b.kegiatan}</span> — {b.nama_ruangan}, {formatTanggalPanjang(b.tanggal)}, {b.label_waktu}
                <span className="text-secondary"> · dicatat {b.nama_pembuat}</span>
                {b.tumpang_jam ? <span className="ml-1 font-medium text-[var(--warning)]">(jam beririsan)</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] leading-[18px] text-secondary">
            Keputusan akhir tetap di Dekanat. Simpan bila peminjaman ini memang tetap diajukan.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={proses} onClick={onBatal}>
              Ubah jadwal
            </Button>
            <Button type="button" loading={proses} onClick={onLanjut} data-testid="peringatan-bentrok-lanjut">
              Tetap simpan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
