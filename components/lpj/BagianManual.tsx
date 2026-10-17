'use client';

/**
 * Bagian MANUAL LPJ (T-105 kontrak 2) — diketik Bendahara/Admin selama DRAFT:
 * pendahuluan, pelaksanaan, narasi per divisi, materi, daftar hadir, foto
 * dokumentasi, pejabat pengesahan. Bagian otomatis tidak ada di sini.
 *
 * Disimpan eksplisit ("Simpan isian") dan otomatis sebelum generate.
 */

import { ImagePlus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { BagianRepeatable } from '@/components/tor/BagianRepeatable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NARASI_KOSONG, type DataManualLpj, type NarasiDivisi } from '@/lib/lpj/schema';

type Status = 'tersimpan' | 'berubah' | 'menyimpan' | 'gagal';

function Panjang({
  id,
  label,
  nilai,
  onChange,
  tulis,
  rows = 4,
}: {
  id: string;
  label: string;
  nilai: string;
  onChange: (v: string) => void;
  tulis: boolean;
  rows?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        rows={rows}
        value={nilai}
        readOnly={!tulis}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Pendek({
  id,
  label,
  nilai,
  onChange,
  tulis,
}: {
  id: string;
  label: string;
  nilai: string;
  onChange: (v: string) => void;
  tulis: boolean;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[12px] text-secondary">
        {label}
      </label>
      <Input id={id} value={nilai} readOnly={!tulis} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const LABEL_NARASI: [keyof NarasiDivisi, string][] = [
  ['narasi', 'Narasi'],
  ['perencanaan', 'Perencanaan'],
  ['pelaksanaan', 'Pelaksanaan'],
  ['pendukung', 'Faktor pendukung'],
  ['penghambat', 'Faktor penghambat'],
  ['saran', 'Saran dan rekomendasi'],
];

export interface BagianManualHandle {
  simpan: () => Promise<boolean>;
}

export const BagianManual = React.forwardRef<
  BagianManualHandle,
  {
    kepanitiaanId: string;
    awal: DataManualLpj;
    divisi: { id: string; nama: string }[];
    tulis: boolean;
    /** URL thumbnail foto dokumentasi yang sudah tersimpan. */
    thumbFoto: Record<string, string>;
  }
>(function BagianManual({ kepanitiaanId, awal, divisi, tulis, thumbFoto }, ref) {
  const [d, setD] = React.useState(awal);
  const [status, setStatus] = React.useState<Status>('tersimpan');
  const [galat, setGalat] = React.useState<string | null>(null);
  const [thumb, setThumb] = React.useState(thumbFoto);
  const [mengunggah, setMengunggah] = React.useState(false);
  const berkas = React.useRef<HTMLInputElement>(null);
  const terbaru = React.useRef(d);
  terbaru.current = d;

  const ubah = (f: (x: DataManualLpj) => DataManualLpj) => {
    setD(f);
    setStatus('berubah');
  };
  const narasi = (id: string) => d.narasi[id] ?? NARASI_KOSONG;

  const simpan = React.useCallback(async (): Promise<boolean> => {
    setStatus('menyimpan');
    try {
      const r = await fetch(`/api/lpj/${kepanitiaanId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manual: terbaru.current }),
      });
      const b = (await r.json().catch(() => null)) as {
        ok: boolean;
        error?: { message?: string };
      } | null;
      if (!r.ok || !b?.ok) throw new Error(b?.error?.message || 'Isian LPJ gagal disimpan.');
      setGalat(null);
      setStatus('tersimpan');
      return true;
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Isian LPJ gagal disimpan.');
      setStatus('gagal');
      return false;
    }
  }, [kepanitiaanId]);

  React.useImperativeHandle(ref, () => ({ simpan }), [simpan]);

  const unggahFoto = async (f: FileList | null) => {
    if (!f?.length) return;
    setMengunggah(true);
    setGalat(null);
    try {
      const { unggahFotoNota } = await import('@/lib/nota/unggah-gambar');
      for (const file of [...f].slice(0, 30 - d.dokumentasi.length)) {
        const h = await unggahFotoNota(file, false, file.name);
        setThumb((t) => ({ ...t, [h.imageId]: h.urlPratinjau }));
        ubah((x) => ({
          ...x,
          dokumentasi: [...x.dokumentasi, { image_id: h.imageId, caption: '' }],
        }));
      }
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Foto gagal diunggah.');
    } finally {
      setMengunggah(false);
      if (berkas.current) berkas.current.value = '';
    }
  };

  return (
    <Card className="space-y-4 p-4" data-testid="lpj-manual" data-status={status}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">Bagian manual</h2>
          <p className="text-[12px] text-secondary">
            Diketik penyusun LPJ. Bagian keuangan, kepanitiaan, dan lampiran nota terisi otomatis.
          </p>
        </div>
        {tulis ? (
          <div className="flex items-center gap-2">
            <span
              className="text-[12px] text-secondary"
              role="status"
              aria-live="polite"
              data-testid="lpj-manual-status"
            >
              {status === 'tersimpan'
                ? 'Tersimpan'
                : status === 'menyimpan'
                  ? 'Menyimpan…'
                  : status === 'gagal'
                    ? 'Gagal menyimpan'
                    : 'Belum disimpan'}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void simpan()}
              disabled={status === 'menyimpan'}
              data-testid="lpj-simpan"
            >
              Simpan isian
            </Button>
          </div>
        ) : null}
      </div>
      {galat ? (
        <p role="alert" className="text-[13px] text-danger" data-testid="lpj-manual-galat">
          {galat}
        </p>
      ) : null}
      {d.catatan_pengembalian ? (
        <p
          role="note"
          className="rounded-sm bg-[var(--warning-subtle)] p-3 text-[13px]"
          data-testid="lpj-catatan-pengembalian"
        >
          Dikembalikan: {d.catatan_pengembalian}
        </p>
      ) : null}

      <Panjang
        id="lpj-pendahuluan"
        label="Pendahuluan *"
        nilai={d.pendahuluan}
        tulis={tulis}
        onChange={(v) => ubah((x) => ({ ...x, pendahuluan: v }))}
      />
      <Panjang
        id="lpj-target"
        label="Target peserta"
        rows={2}
        nilai={d.target_peserta}
        tulis={tulis}
        onChange={(v) => ubah((x) => ({ ...x, target_peserta: v }))}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Pendek
          id="lpj-hari"
          label="Hari, tanggal *"
          nilai={d.waktu.hari_tanggal}
          tulis={tulis}
          onChange={(v) => ubah((x) => ({ ...x, waktu: { ...x.waktu, hari_tanggal: v } }))}
        />
        <Pendek
          id="lpj-waktu"
          label="Waktu"
          nilai={d.waktu.waktu}
          tulis={tulis}
          onChange={(v) => ubah((x) => ({ ...x, waktu: { ...x.waktu, waktu: v } }))}
        />
        <Pendek
          id="lpj-tempat"
          label="Tempat *"
          nilai={d.waktu.tempat}
          tulis={tulis}
          onChange={(v) => ubah((x) => ({ ...x, waktu: { ...x.waktu, tempat: v } }))}
        />
      </div>
      <Panjang
        id="lpj-perencanaan"
        label="Proses perencanaan"
        nilai={d.proses_perencanaan}
        tulis={tulis}
        onChange={(v) => ubah((x) => ({ ...x, proses_perencanaan: v }))}
      />
      <Panjang
        id="lpj-pelaksanaan"
        label="Pelaksanaan kegiatan *"
        nilai={d.pelaksanaan_kegiatan}
        tulis={tulis}
        onChange={(v) => ubah((x) => ({ ...x, pelaksanaan_kegiatan: v }))}
      />
      <Panjang
        id="lpj-output"
        label="Output"
        rows={2}
        nilai={d.output}
        tulis={tulis}
        onChange={(v) => ubah((x) => ({ ...x, output: v }))}
      />
      <Panjang
        id="lpj-penutup"
        label="Penutup *"
        rows={3}
        nilai={d.penutup}
        tulis={tulis}
        onChange={(v) => ubah((x) => ({ ...x, penutup: v }))}
      />

      <section className="space-y-2" aria-label="Narasi per divisi">
        <h3 className="text-[13px] font-semibold">Narasi per divisi</h3>
        {divisi.map((dv) => (
          <details
            key={dv.id}
            className="rounded-sm border border-default p-3"
            data-testid="lpj-narasi-divisi"
          >
            <summary className="cursor-pointer text-[13px] font-medium">{dv.nama}</summary>
            <div className="mt-2 grid gap-2">
              {LABEL_NARASI.map(([k, label]) => (
                <Panjang
                  key={k}
                  id={`lpj-narasi-${dv.id}-${k}`}
                  label={label}
                  rows={2}
                  nilai={narasi(dv.id)[k]}
                  tulis={tulis}
                  onChange={(v) =>
                    ubah((x) => ({
                      ...x,
                      narasi: { ...x.narasi, [dv.id]: { ...narasi(dv.id), [k]: v } },
                    }))
                  }
                />
              ))}
            </div>
          </details>
        ))}
      </section>

      <section className="space-y-2" aria-label="Materi kegiatan">
        <Panjang
          id="lpj-catatan-materi"
          label="Catatan materi"
          rows={2}
          nilai={d.catatan_materi}
          tulis={tulis}
          onChange={(v) => ubah((x) => ({ ...x, catatan_materi: v }))}
        />
        <BagianRepeatable
          id="lpj-materi"
          baris={d.materi}
          onChange={(m) => ubah((x) => ({ ...x, materi: m }))}
          bolehTulis={tulis}
          buat={() => ({ judul: '', pengisi: '', tautan: '' })}
          labelTambah="Tambah materi"
          namaBaris="Materi"
          kosong="Belum ada materi (opsional)."
          kolom={[
            { kunci: 'judul', label: 'Materi', tipe: 'teks', maks: 300 },
            { kunci: 'pengisi', label: 'Pengisi', tipe: 'teks', maks: 200 },
            { kunci: 'tautan', label: 'Tautan', tipe: 'teks', lebar: 'sm:col-span-2', maks: 500 },
          ]}
        />
      </section>

      <Panjang
        id="lpj-hadir"
        label="Daftar hadir panitia dan peserta"
        rows={3}
        nilai={d.daftar_hadir}
        tulis={tulis}
        onChange={(v) => ubah((x) => ({ ...x, daftar_hadir: v }))}
      />

      <section
        className="space-y-2"
        aria-label="Dokumentasi kegiatan"
        data-testid="lpj-dokumentasi"
        data-jumlah={d.dokumentasi.length}
      >
        <h3 className="text-[13px] font-semibold">Foto dokumentasi * </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.dokumentasi.map((f, i) => (
            <li
              key={f.image_id}
              className="flex items-start gap-2 rounded-sm border border-default p-2"
            >
              {thumb[f.image_id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- thumbnail/pratinjau lokal
                <img
                  src={thumb[f.image_id]}
                  alt={f.caption || `Dokumentasi ${i + 1}`}
                  className="size-16 shrink-0 rounded-sm object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <Pendek
                  id={`lpj-caption-${i}`}
                  label="Keterangan foto"
                  nilai={f.caption}
                  tulis={tulis}
                  onChange={(v) =>
                    ubah((x) => ({
                      ...x,
                      dokumentasi: x.dokumentasi.map((y, j) =>
                        j === i ? { ...y, caption: v } : y,
                      ),
                    }))
                  }
                />
              </div>
              {tulis ? (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Hapus foto ${i + 1}`}
                  onClick={() =>
                    ubah((x) => ({ ...x, dokumentasi: x.dokumentasi.filter((_, j) => j !== i) }))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {tulis ? (
          <>
            <input
              ref={berkas}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void unggahFoto(e.target.files)}
              data-testid="lpj-foto-input"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => berkas.current?.click()}
              disabled={mengunggah}
              data-testid="lpj-foto-tambah"
            >
              <ImagePlus aria-hidden="true" /> {mengunggah ? 'Mengunggah…' : 'Tambah foto'}
            </Button>
          </>
        ) : null}
      </section>

      <section className="space-y-2" aria-label="Pejabat lembar pengesahan">
        <h3 className="text-[13px] font-semibold">Lembar pengesahan — pihak fakultas *</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Pendek
            id="lpj-kaprodi-nama"
            label="Ketua Program Studi Informatika"
            nilai={d.pejabat.kaprodi.nama}
            tulis={tulis}
            onChange={(v) =>
              ubah((x) => ({
                ...x,
                pejabat: { ...x.pejabat, kaprodi: { ...x.pejabat.kaprodi, nama: v } },
              }))
            }
          />
          <Pendek
            id="lpj-kaprodi-nip"
            label="NIP"
            nilai={d.pejabat.kaprodi.nomor}
            tulis={tulis}
            onChange={(v) =>
              ubah((x) => ({
                ...x,
                pejabat: { ...x.pejabat, kaprodi: { ...x.pejabat.kaprodi, nomor: v } },
              }))
            }
          />
          <Pendek
            id="lpj-wd3-nama"
            label="Wakil Dekan Bidang III"
            nilai={d.pejabat.wd3.nama}
            tulis={tulis}
            onChange={(v) =>
              ubah((x) => ({ ...x, pejabat: { ...x.pejabat, wd3: { ...x.pejabat.wd3, nama: v } } }))
            }
          />
          <Pendek
            id="lpj-wd3-nip"
            label="NIP"
            nilai={d.pejabat.wd3.nomor}
            tulis={tulis}
            onChange={(v) =>
              ubah((x) => ({
                ...x,
                pejabat: { ...x.pejabat, wd3: { ...x.pejabat.wd3, nomor: v } },
              }))
            }
          />
        </div>
      </section>
    </Card>
  );
});
