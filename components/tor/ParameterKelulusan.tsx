'use client';

/**
 * Bagian 9 TOR — Parameter Kelulusan (T-094 kontrak 4): kriteria, bobot (%),
 * KKM. Total bobot harus tepat 100%; selisihnya tampil sebagai peringatan
 * inline (tidak memblokir auto-save — draf boleh belum seimbang).
 */

import { AlertTriangle } from 'lucide-react';

import { BagianRepeatable } from '@/components/tor/BagianRepeatable';
import { peringatanBobot, totalBobot, type DataTor } from '@/lib/tor/schema';

type Parameter = DataTor['parameter'][number];

export function ParameterKelulusan({
  baris,
  bolehTulis,
  onChange,
}: {
  baris: Parameter[];
  bolehTulis: boolean;
  onChange: (b: Parameter[]) => void;
}) {
  const peringatan = peringatanBobot(baris);
  return (
    <div className="space-y-2">
      <BagianRepeatable<Parameter>
        id="parameter"
        baris={baris}
        bolehTulis={bolehTulis}
        onChange={onChange}
        buat={() => ({ kriteria: '', bobot: null, kkm: null })}
        labelTambah="Tambah kriteria"
        namaBaris="Kriteria"
        kolom={[
          { kunci: 'kriteria', label: 'Kriteria', tipe: 'teks', lebar: 'sm:col-span-2', maks: 200 },
          { kunci: 'bobot', label: 'Bobot (%)', tipe: 'angka' },
          { kunci: 'kkm', label: 'KKM', tipe: 'angka' },
        ]}
      />
      {baris.length ? (
        <p
          className="text-[13px] tabular-nums"
          data-testid="tor-bobot-total"
          data-total={totalBobot(baris)}
        >
          Total bobot:{' '}
          <strong>
            {totalBobot(baris).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%
          </strong>
        </p>
      ) : null}
      {peringatan ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-[13px] text-warning"
          data-testid="tor-bobot-peringatan"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" /> {peringatan}
        </p>
      ) : null}
    </div>
  );
}
