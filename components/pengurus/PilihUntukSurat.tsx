'use client';

/**
 * Pemilih pengurus untuk Surat Keterangan Aktif massal (T-107 ↔ T-064).
 * Terkontrol: induk memegang himpunan terpilih. Pencarian hanya menyaring
 * tampilan — pilihan yang tersembunyi oleh pencarian tetap terpilih.
 *
 * Test id: massal-pengurus, massal-cari, massal-pilih-{id}, massal-pilih-semua, massal-terpilih.
 */

import * as React from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

export interface PengurusUntukSurat {
  id: string;
  nama_lengkap: string;
  nim: string;
  jabatan: string;
  nama_departemen: string | null;
}

export function PilihUntukSurat({
  pengurus,
  terpilih,
  onUbah,
  maks,
}: {
  pengurus: PengurusUntukSurat[];
  terpilih: ReadonlySet<string>;
  onUbah: (baru: Set<string>) => void;
  maks: number;
}) {
  const [cari, setCari] = React.useState('');
  const q = cari.trim().toLowerCase();
  const tampil = q
    ? pengurus.filter((p) => `${p.nama_lengkap} ${p.nim} ${p.jabatan} ${p.nama_departemen ?? ''}`.toLowerCase().includes(q))
    : pengurus;
  const semuaTampilTerpilih = tampil.length > 0 && tampil.every((p) => terpilih.has(p.id));
  const kebanyakan = terpilih.size > maks;

  const ubahSatu = (id: string) => {
    const n = new Set(terpilih);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onUbah(n);
  };
  const ubahTampil = (pilih: boolean) => {
    const n = new Set(terpilih);
    for (const p of tampil) {
      if (pilih) n.add(p.id);
      else n.delete(p.id);
    }
    onUbah(n);
  };

  return (
    <div className="space-y-2">
      <Input
        type="search"
        aria-label="Cari pengurus"
        placeholder="Cari nama, NIM, jabatan, atau departemen…"
        value={cari}
        onChange={(e) => setCari(e.target.value)}
        data-testid="massal-cari"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <label className="flex items-center gap-2">
          <Checkbox checked={semuaTampilTerpilih} onChange={(e) => ubahTampil(e.target.checked)} data-testid="massal-pilih-semua" />
          {q ? `Pilih semua hasil pencarian (${tampil.length})` : `Pilih semua (${pengurus.length})`}
        </label>
        <span data-testid="massal-terpilih" className={kebanyakan ? 'font-semibold text-danger' : 'text-secondary'}>
          Terpilih: <span className="tabular-nums">{terpilih.size}</span> orang
          {kebanyakan ? ` — lebih dari ${maks}, pecah menjadi beberapa batch` : ''}
        </span>
      </div>
      <ul className="max-h-80 divide-y divide-[var(--border-subtle)] overflow-y-auto rounded-sm border border-default" data-testid="massal-pengurus">
        {tampil.length === 0 ? <li className="px-3 py-4 text-center text-[13px] text-tertiary">Tidak ada pengurus yang cocok.</li> : null}
        {tampil.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-subtle">
              <Checkbox checked={terpilih.has(p.id)} onChange={() => ubahSatu(p.id)} data-testid={`massal-pilih-${p.id}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{p.nama_lengkap}</span>
                <span className="ml-2 font-mono text-[12px] text-secondary">{p.nim}</span>
                <span className="block text-[12px] text-secondary">
                  {p.jabatan}
                  {p.nama_departemen ? ` · ${p.nama_departemen}` : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
