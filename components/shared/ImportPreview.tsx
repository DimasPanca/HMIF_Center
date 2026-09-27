'use client';

import { AlertTriangle, CheckCircle2, Download, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import type { DefinisiKolom, Masalah, StatusBaris } from '@/lib/import/parse-tabel';
import { cn } from '@/lib/utils';

/**
 * Pratinjau import generik (T-048; dipakai ulang T-092 & T-107): pemetaan kolom,
 * ringkasan valid/peringatan/error, tabel baris dengan alasannya, dan centang
 * "lewati" per baris. Tidak mengenal domain — hanya definisi kolom dan sel mentah.
 */

export interface BarisImport {
  nomor: number;
  status: StatusBaris;
  masalah: Masalah[];
  sel: string[];
}

interface ImportPreviewProps {
  kolom: DefinisiKolom[];
  header: string[];
  peta: Record<string, number>;
  hilang: string[];
  baris: BarisImport[];
  lewati: ReadonlySet<number>;
  onUbahPeta: (kunci: string, indeks: number) => void;
  onUbahLewati: (nomor: number, lewat: boolean) => void;
  memuat?: boolean;
  /** Nama berkas laporan masalah yang diunduh. */
  namaLaporan?: string;
}

const TAMPILAN: Record<StatusBaris, { label: string; ikon: typeof CheckCircle2; kelas: string }> = {
  VALID: { label: 'Valid', ikon: CheckCircle2, kelas: 'text-[var(--success)]' },
  PERINGATAN: { label: 'Peringatan', ikon: AlertTriangle, kelas: 'text-[var(--warning)]' },
  ERROR: { label: 'Error', ikon: XCircle, kelas: 'text-danger' },
};

function unduhLaporan(baris: BarisImport[], nama: string) {
  const kutip = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const isi = [['baris', 'status', 'kolom', 'pesan'].join(',')];
  for (const b of baris) {
    for (const m of b.masalah) isi.push([String(b.nomor), m.tingkat, kutip(m.kolom ?? ''), kutip(m.pesan)].join(','));
  }
  // BOM supaya Excel membaca huruf non-ASCII dengan benar.
  const url = URL.createObjectURL(new Blob(['﻿' + isi.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPreview({
  kolom,
  header,
  peta,
  hilang,
  baris,
  lewati,
  onUbahPeta,
  onUbahLewati,
  memuat = false,
  namaLaporan = 'laporan-import.csv',
}: ImportPreviewProps) {
  const [hanyaBermasalah, setHanyaBermasalah] = useState(false);
  const ringkas = useMemo(
    () => ({
      valid: baris.filter((b) => b.status === 'VALID').length,
      peringatan: baris.filter((b) => b.status === 'PERINGATAN').length,
      error: baris.filter((b) => b.status === 'ERROR').length,
    }),
    [baris],
  );
  const bermasalah = baris.filter((b) => b.status !== 'VALID');
  const tampil = hanyaBermasalah ? bermasalah : baris;

  return (
    <div className="space-y-4" aria-busy={memuat}>
      <details open={hilang.length > 0} className="rounded-sm border border-default">
        <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-primary">
          Pemetaan kolom
          {hilang.length ? (
            <span className="ml-2 text-danger">— {hilang.length} kolom wajib belum dipetakan</span>
          ) : (
            <span className="ml-2 text-secondary">— terdeteksi otomatis, ubah bila keliru</span>
          )}
        </summary>
        <div className="grid gap-3 border-t border-subtle p-3 sm:grid-cols-2 lg:grid-cols-3">
          {kolom.map((k) => (
            <label key={k.kunci} className="space-y-1 text-[13px]">
              <span className="font-medium text-primary">
                {k.label}
                {k.wajib ? <span className="text-danger"> *</span> : null}
              </span>
              <Select
                placeholder={null}
                value={String(peta[k.kunci] ?? -1)}
                disabled={memuat}
                error={hilang.includes(k.kunci) ? 'Wajib dipetakan.' : undefined}
                onChange={(e) => onUbahPeta(k.kunci, Number(e.target.value))}
              >
                <option value="-1">— tidak dipakai —</option>
                {header.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `(kolom ${i + 1} tanpa judul)`}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums">
          {(['VALID', 'PERINGATAN', 'ERROR'] as const).map((s) => {
            const t = TAMPILAN[s];
            const Ikon = t.ikon;
            const n = s === 'VALID' ? ringkas.valid : s === 'PERINGATAN' ? ringkas.peringatan : ringkas.error;
            return (
              <span key={s} className="inline-flex items-center gap-1">
                <Ikon className={cn('size-4', t.kelas)} aria-hidden="true" />
                {n} baris {t.label.toLowerCase()}
              </span>
            );
          })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-[13px] text-secondary">
            <Checkbox checked={hanyaBermasalah} onChange={(e) => setHanyaBermasalah(e.target.checked)} />
            Hanya baris bermasalah
          </label>
          {bermasalah.length ? (
            <Button variant="secondary" onClick={() => unduhLaporan(bermasalah, namaLaporan)}>
              <Download aria-hidden="true" />
              Unduh laporan masalah
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-[50vh] overflow-auto rounded-sm border border-default">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-subtle text-left text-[12px] text-secondary">
            <tr>
              <th className="px-2 py-2 font-medium">Lewati</th>
              <th className="px-2 py-2 font-medium">Baris</th>
              <th className="px-2 py-2 font-medium">Status</th>
              {kolom.map((k) => (
                <th key={k.kunci} className="px-2 py-2 font-medium whitespace-nowrap">
                  {k.label}
                </th>
              ))}
              <th className="px-2 py-2 font-medium">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => {
              const t = TAMPILAN[b.status];
              const Ikon = t.ikon;
              const error = b.status === 'ERROR';
              return (
                <tr key={b.nomor} className={cn('h-9 border-t border-subtle align-top', lewati.has(b.nomor) && 'opacity-60')}>
                  <td className="px-2 py-1.5">
                    <Checkbox
                      aria-label={`Lewati baris ${b.nomor}`}
                      checked={error || lewati.has(b.nomor)}
                      disabled={error || memuat}
                      onChange={(e) => onUbahLewati(b.nomor, e.target.checked)}
                    />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-secondary">{b.nomor}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={cn('inline-flex items-center gap-1', t.kelas)}>
                      <Ikon className="size-3.5" aria-hidden="true" />
                      {t.label}
                    </span>
                  </td>
                  {kolom.map((k) => {
                    const i = peta[k.kunci] ?? -1;
                    return (
                      <td key={k.kunci} className="max-w-[14rem] truncate px-2 py-1.5 text-primary">
                        {i >= 0 ? b.sel[i] : ''}
                      </td>
                    );
                  })}
                  <td className="min-w-[16rem] px-2 py-1.5 text-secondary">
                    {b.masalah.map((m, j) => (
                      <p key={j} className={m.tingkat === 'ERROR' ? 'text-danger' : undefined}>
                        {m.pesan}
                      </p>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
