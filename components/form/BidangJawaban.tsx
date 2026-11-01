'use client';

/**
 * BidangJawaban — satu pertanyaan dalam bentuk isian (halaman isi publik dan
 * pratinjau editor). Tidak menyimpan state sendiri: nilai & galat datang dari
 * induk supaya validasi "Berikutnya" dapat menandai semua bidang sekaligus.
 */

import { FileUp, X } from 'lucide-react';
import * as React from 'react';

import type { NilaiMasukan } from '@/lib/form/jawaban';
import type { Pertanyaan } from '@/lib/form/skema';
import { cn } from '@/lib/utils';

export interface BidangJawabanProps {
  p: Pertanyaan;
  nilai: NilaiMasukan;
  galat?: string;
  /** Berkas terpilih (khusus UNGGAH_BERKAS). */
  berkas?: File | null;
  onUbah: (v: NilaiMasukan) => void;
  onBerkas?: (f: File | null) => void;
  nonaktif?: boolean;
}

const KELAS_TEKS =
  'w-full rounded-sm border border-default bg-panel px-3 py-2 text-[14px] leading-5 text-primary outline-none transition-colors placeholder:text-tertiary focus:border-[var(--border-focus)] focus:ring-3 focus:ring-[var(--border-focus)]/25 disabled:opacity-60 aria-[invalid=true]:border-[var(--danger)]';

function ukuranManusia(b: number): string {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export function BidangJawaban({ p, nilai, galat, berkas, onUbah, onBerkas, nonaktif }: BidangJawabanProps) {
  const idDasar = `q-${p.id}`;
  const idGalat = `${idDasar}-galat`;
  const o = p.opsi;
  const aria = { 'aria-invalid': galat ? true : undefined, 'aria-describedby': galat ? idGalat : undefined } as const;
  const teks = typeof nilai === 'string' ? nilai : '';

  let isian: React.ReactNode;
  switch (p.tipe) {
    case 'TEKS_SINGKAT':
    case 'EMAIL':
    case 'ANGKA':
      isian = (
        <input
          id={idDasar}
          type={p.tipe === 'EMAIL' ? 'email' : 'text'}
          inputMode={p.tipe === 'ANGKA' ? 'decimal' : p.tipe === 'EMAIL' ? 'email' : undefined}
          autoComplete={p.peran === 'email' ? 'email' : p.peran === 'nama_lengkap' ? 'name' : p.peran === 'no_hp' ? 'tel' : 'off'}
          maxLength={p.tipe === 'TEKS_SINGKAT' ? (o.maks ?? 500) : 254}
          value={typeof nilai === 'number' ? String(nilai) : teks}
          onChange={(e) => onUbah(e.target.value)}
          disabled={nonaktif}
          placeholder={p.tipe === 'EMAIL' ? 'nama@contoh.com' : 'Jawaban Anda'}
          className={cn(KELAS_TEKS, 'max-w-md')}
          {...aria}
        />
      );
      break;
    case 'PARAGRAF':
      isian = (
        <div>
          <textarea
            id={idDasar}
            rows={4}
            maxLength={o.maks ?? 5000}
            value={teks}
            onChange={(e) => onUbah(e.target.value)}
            disabled={nonaktif}
            placeholder="Jawaban Anda"
            className={cn(KELAS_TEKS, 'min-h-24 resize-y')}
            {...aria}
          />
          <p className="mt-1 text-right text-[12px] leading-4 text-tertiary tabular-nums">
            {teks.length}/{o.maks ?? 5000}
          </p>
        </div>
      );
      break;
    case 'TANGGAL':
    case 'WAKTU':
      isian = (
        <input
          id={idDasar}
          type={p.tipe === 'TANGGAL' ? 'date' : 'time'}
          value={teks}
          onChange={(e) => onUbah(e.target.value)}
          disabled={nonaktif}
          className={cn(KELAS_TEKS, 'w-auto min-w-44')}
          {...aria}
        />
      );
      break;
    case 'DROPDOWN':
      isian = (
        <select id={idDasar} value={teks} onChange={(e) => onUbah(e.target.value)} disabled={nonaktif} className={cn(KELAS_TEKS, 'max-w-md')} {...aria}>
          <option value="">Pilih…</option>
          {(o.pilihan ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'PILIHAN_GANDA': {
      const lain = nilai && typeof nilai === 'object' && !Array.isArray(nilai) && 'lainnya' in nilai;
      const teksLain = lain ? String((nilai as Record<string, unknown>).lainnya ?? '') : '';
      isian = (
        <div role="radiogroup" aria-labelledby={`${idDasar}-judul`} {...aria} className="grid gap-1">
          {(o.pilihan ?? []).map((x) => (
            <PilihanBaris key={x.id} jenis="radio" nama={idDasar} terpilih={nilai === x.id} label={x.label} onPilih={() => onUbah(x.id)} nonaktif={nonaktif} />
          ))}
          {o.lainnya && (
            <div className="flex flex-wrap items-center gap-2">
              <PilihanBaris jenis="radio" nama={idDasar} terpilih={!!lain} label="Lainnya:" onPilih={() => onUbah({ lainnya: teksLain })} nonaktif={nonaktif} />
              <input
                aria-label="Jawaban lainnya"
                value={teksLain}
                onFocus={() => !lain && onUbah({ lainnya: teksLain })}
                onChange={(e) => onUbah({ lainnya: e.target.value })}
                disabled={nonaktif}
                maxLength={500}
                className={cn(KELAS_TEKS, 'max-w-xs flex-1 py-1.5')}
              />
            </div>
          )}
          {!p.wajib && typeof nilai === 'string' && nilai && (
            <button type="button" onClick={() => onUbah(null)} className="mt-1 w-fit text-[12px] leading-4 text-link hover:underline">
              Hapus pilihan
            </button>
          )}
        </div>
      );
      break;
    }
    case 'KOTAK_CENTANG': {
      const pilih = Array.isArray(nilai) ? nilai : [];
      isian = (
        <div role="group" aria-labelledby={`${idDasar}-judul`} {...aria} className="grid gap-1">
          {(o.pilihan ?? []).map((x) => (
            <PilihanBaris
              key={x.id}
              jenis="checkbox"
              nama={idDasar}
              terpilih={pilih.includes(x.id)}
              label={x.label}
              onPilih={() => onUbah(pilih.includes(x.id) ? pilih.filter((y) => y !== x.id) : [...pilih, x.id])}
              nonaktif={nonaktif}
            />
          ))}
        </div>
      );
      break;
    }
    case 'SKALA': {
      const min = o.skala_min ?? 1;
      const maks = o.skala_maks ?? 5;
      const angka = Array.from({ length: maks - min + 1 }, (_, i) => min + i);
      isian = (
        <div {...aria}>
          <div role="radiogroup" aria-labelledby={`${idDasar}-judul`} className="flex flex-wrap gap-1.5">
            {angka.map((n) => {
              const aktif = nilai === n || nilai === String(n);
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  aria-label={`${n}${n === min && o.label_min ? ` — ${o.label_min}` : n === maks && o.label_maks ? ` — ${o.label_maks}` : ''}`}
                  disabled={nonaktif}
                  onClick={() => onUbah(n)}
                  className={cn(
                    'size-11 rounded-sm border text-[15px] font-semibold tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] focus-visible:outline-none',
                    aktif ? 'border-transparent bg-[var(--primary)] text-[var(--primary-text)]' : 'border-default bg-panel text-primary hover:bg-subtle',
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {(o.label_min || o.label_maks) && (
            <div className="mt-1.5 flex justify-between gap-4 text-[12px] leading-4 text-secondary" style={{ maxWidth: `${angka.length * 3.125}rem` }}>
              <span>{o.label_min}</span>
              <span className="text-right">{o.label_maks}</span>
            </div>
          )}
        </div>
      );
      break;
    }
    case 'KISI_PILIHAN':
    case 'KISI_CENTANG': {
      const peta = nilai && typeof nilai === 'object' && !Array.isArray(nilai) && !('berkas' in nilai) ? (nilai as Record<string, string | string[]>) : {};
      const ganda = p.tipe === 'KISI_CENTANG';
      isian = (
        <div className="overflow-x-auto" {...aria}>
          <table className="w-full min-w-max border-separate border-spacing-0 text-[13px] leading-5">
            <thead>
              <tr>
                <th className="sticky left-0 bg-panel" />
                {(o.kolom ?? []).map((k) => (
                  <th key={k.id} scope="col" className="px-2 pb-2 text-center font-medium text-secondary">
                    {k.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(o.baris ?? []).map((b) => (
                <tr key={b.id} className="odd:bg-subtle">
                  <th scope="row" className="sticky left-0 bg-inherit py-2 pr-3 pl-2 text-left font-normal text-primary">
                    {b.label}
                  </th>
                  {(o.kolom ?? []).map((k) => {
                    const isi = peta[b.id];
                    const aktif = ganda ? Array.isArray(isi) && isi.includes(k.id) : isi === k.id;
                    return (
                      <td key={k.id} className="px-2 py-2 text-center">
                        <input
                          type={ganda ? 'checkbox' : 'radio'}
                          name={`${idDasar}-${b.id}`}
                          aria-label={`${b.label}: ${k.label}`}
                          checked={aktif}
                          disabled={nonaktif}
                          onChange={() => {
                            const lama = Array.isArray(isi) ? isi : [];
                            const baru = ganda ? (aktif ? lama.filter((x) => x !== k.id) : [...lama, k.id]) : k.id;
                            onUbah({ ...peta, [b.id]: baru });
                          }}
                          className="size-[18px] accent-[var(--primary)]"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    }
    case 'UNGGAH_BERKAS': {
      const jenis = o.jenis ?? ['gambar', 'pdf'];
      const terima = [...(jenis.includes('gambar') ? ['image/jpeg', 'image/png', 'image/webp'] : []), ...(jenis.includes('pdf') ? ['application/pdf'] : [])].join(',');
      isian = berkas ? (
        <div className="flex max-w-md items-center gap-3 rounded-sm border border-default bg-subtle px-3 py-2">
          <FileUp aria-hidden className="size-4 shrink-0 text-secondary" />
          <span className="min-w-0 flex-1 truncate text-[14px] leading-5">{berkas.name}</span>
          <span className="text-[12px] text-tertiary tabular-nums">{ukuranManusia(berkas.size)}</span>
          {!nonaktif && (
            <button type="button" aria-label="Hapus berkas" onClick={() => onBerkas?.(null)} className="rounded-sm p-1 text-secondary hover:bg-muted">
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <label
          className={cn(
            'flex max-w-md cursor-pointer flex-col items-center gap-1 rounded-sm border border-dashed border-strong bg-panel px-4 py-5 text-center transition-colors hover:bg-subtle',
            galat && 'border-[var(--danger)]',
            nonaktif && 'pointer-events-none opacity-60',
          )}
        >
          <FileUp aria-hidden className="size-5 text-secondary" />
          <span className="text-[14px] leading-5 font-medium text-link">Pilih berkas</span>
          <span className="text-[12px] leading-4 text-tertiary">
            {jenis.map((j) => (j === 'gambar' ? 'JPG/PNG/WebP' : 'PDF')).join(' atau ')} · maks {o.maks_mb ?? 4} MB
          </span>
          <input
            id={idDasar}
            type="file"
            accept={terima}
            className="sr-only"
            disabled={nonaktif}
            onChange={(e) => {
              onBerkas?.(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
            {...aria}
          />
        </label>
      );
      break;
    }
  }

  return (
    <fieldset
      data-pertanyaan={p.id}
      className={cn('rounded-md border bg-panel p-5 transition-colors', galat ? 'border-[var(--danger)]' : 'border-default')}
    >
      <legend className="sr-only">{p.judul}</legend>
      <label id={`${idDasar}-judul`} htmlFor={idDasar} className="block text-[15px] leading-6 font-medium text-primary">
        {p.judul}
        {p.wajib && (
          <span className="ml-1 text-danger" aria-label="wajib">
            *
          </span>
        )}
      </label>
      {p.deskripsi && <p className="mt-0.5 text-[13px] leading-5 whitespace-pre-line text-secondary">{p.deskripsi}</p>}
      <div className="mt-3">{isian}</div>
      {galat && (
        <p id={idGalat} role="alert" className="mt-2 text-[13px] leading-5 text-danger">
          {galat}
        </p>
      )}
    </fieldset>
  );
}

function PilihanBaris({
  jenis,
  nama,
  terpilih,
  label,
  onPilih,
  nonaktif,
}: {
  jenis: 'radio' | 'checkbox';
  nama: string;
  terpilih: boolean;
  label: string;
  onPilih: () => void;
  nonaktif?: boolean;
}) {
  return (
    <label className={cn('flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-subtle', nonaktif && 'pointer-events-none opacity-60')}>
      <input type={jenis} name={nama} checked={terpilih} onChange={onPilih} disabled={nonaktif} className="size-[18px] shrink-0 accent-[var(--primary)]" />
      <span className="text-[14px] leading-5 text-primary">{label}</span>
    </label>
  );
}
