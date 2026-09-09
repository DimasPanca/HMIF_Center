'use client';

import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  validasiLangkah,
  type DraftDivisi,
  type DraftKepanitiaan,
  type WizardDraft,
} from '@/lib/proker/wizard-state';

import type { OpsiPilihan, PatchWizard } from './types';

interface Langkah4KepanitiaanProps {
  divisiPreset: string[];
  draft: WizardDraft;
  pengurus: OpsiPilihan[];
  onUbah: (patch: PatchWizard) => void;
}

interface PilihPengurusProps {
  id: string;
  label: string;
  pengurus: OpsiPilihan[];
  required?: boolean;
  testId?: string;
  value?: string;
  onChange: (value: string | null) => void;
}

function PilihPengurus({
  id,
  label,
  onChange,
  pengurus,
  required = false,
  testId,
  value,
}: PilihPengurusProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Select
        id={id}
        data-testid={testId}
        value={value ?? ''}
        placeholder="Belum ditentukan"
        onChange={(event) => onChange(event.target.value || null)}
      >
        {pengurus.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nama}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function Langkah4Kepanitiaan({
  divisiPreset,
  draft,
  onUbah,
  pengurus,
}: Langkah4KepanitiaanProps) {
  const [presetAktif, setPresetAktif] = useState('');
  const kepanitiaan = draft.kepanitiaan ?? {};
  const divisi = kepanitiaan.divisi ?? [];
  const hasilValidasi = validasiLangkah(draft, 4);

  function ubahKepanitiaan(patch: Partial<DraftKepanitiaan>) {
    onUbah({ kepanitiaan: { ...kepanitiaan, ...patch } });
  }

  function ubahDivisi(indeks: number, patch: Partial<DraftDivisi>) {
    ubahKepanitiaan({
      divisi: divisi.map((item, posisi) => (posisi === indeks ? { ...item, ...patch } : item)),
    });
  }

  function tambahDivisi(nama = '') {
    ubahKepanitiaan({ divisi: [...divisi, { nama, anggota: [] }] });
  }

  function hapusDivisi(indeks: number) {
    ubahKepanitiaan({ divisi: divisi.filter((_, posisi) => posisi !== indeks) });
  }

  return (
    <section aria-labelledby="judul-langkah-4" className="space-y-6">
      <header>
        <h2 id="judul-langkah-4" className="text-lg font-semibold text-primary">
          Rencana kepanitiaan
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">
          Susunan ini baru menjadi kepanitiaan setelah proker disetujui. Semua pengurus aktif
          dapat dipilih tanpa batas departemen.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <PilihPengurus
          id="wizard-ketua-pelaksana"
          label="Ketua Pelaksana"
          pengurus={pengurus}
          required
          testId="wizard-field-ketua-pelaksana"
          value={kepanitiaan.ketua_pelaksana}
          onChange={(value) => ubahKepanitiaan({ ketua_pelaksana: value ?? undefined })}
        />
        <PilihPengurus
          id="wizard-wakil-pelaksana"
          label="Wakil Pelaksana"
          pengurus={pengurus}
          value={kepanitiaan.wakil_pelaksana}
          onChange={(value) => ubahKepanitiaan({ wakil_pelaksana: value ?? undefined })}
        />
        <PilihPengurus
          id="wizard-sekretaris-panitia"
          label="Sekretaris"
          pengurus={pengurus}
          value={kepanitiaan.sekretaris}
          onChange={(value) => ubahKepanitiaan({ sekretaris: value ?? undefined })}
        />
        <PilihPengurus
          id="wizard-bendahara-panitia"
          label="Bendahara"
          pengurus={pengurus}
          value={kepanitiaan.bendahara}
          onChange={(value) => ubahKepanitiaan({ bendahara: value ?? undefined })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-nama-acara">Nama acara</Label>
          <Input
            id="wizard-nama-acara"
            maxLength={200}
            placeholder={draft.nama || 'Mengikuti nama proker'}
            value={kepanitiaan.nama_acara ?? ''}
            onChange={(event) => ubahKepanitiaan({ nama_acara: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-target-anggaran">Target anggaran acara</Label>
          <Input
            id="wizard-target-anggaran"
            min={0}
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={kepanitiaan.target_anggaran ?? ''}
            onChange={(event) =>
              ubahKepanitiaan({
                target_anggaran: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wizard-tema-acara">Tema acara</Label>
        <Textarea
          id="wizard-tema-acara"
          maxLength={200}
          placeholder="Tema atau gagasan utama acara"
          value={kepanitiaan.tema ?? ''}
          onChange={(event) => ubahKepanitiaan({ tema: event.target.value })}
        />
      </div>

      <div className="rounded-sm border border-default bg-subtle p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-primary">Divisi kepanitiaan</h3>
            <p className="mt-1 text-[12px] leading-4 text-secondary">
              Tambahkan dari preset atau buat divisi manual. Nama divisi harus unik.
            </p>
          </div>
          <Button data-testid="wizard-divisi-tambah" onClick={() => tambahDivisi()}>
            <Plus aria-hidden="true" />
            Tambah divisi manual
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Select
            aria-label="Preset divisi"
            value={presetAktif}
            onChange={(event) => setPresetAktif(event.target.value)}
          >
            {divisiPreset.map((nama) => (
              <option key={nama} value={nama}>
                {nama}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!presetAktif}
            onClick={() => {
              tambahDivisi(presetAktif);
              setPresetAktif('');
            }}
          >
            Tambahkan preset
          </Button>
        </div>
      </div>

      {divisi.length === 0 ? (
        <div className="rounded-sm border border-dashed border-default p-8 text-center">
          <Users className="mx-auto size-6 text-tertiary" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-medium text-primary">Belum ada divisi</p>
          <p className="mt-1 text-[12px] text-secondary">
            Tambahkan minimal satu divisi untuk melanjutkan.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {divisi.map((item, indeks) => (
            <article key={indeks} className="rounded-sm border border-default bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-primary">Divisi {indeks + 1}</h3>
                <Button
                  variant="ghost"
                  className="text-danger"
                  aria-label={`Hapus divisi ${item.nama || indeks + 1}`}
                  onClick={() => hapusDivisi(indeks)}
                >
                  <Trash2 aria-hidden="true" />
                  Hapus
                </Button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`wizard-divisi-${indeks}`} required>
                    Nama divisi
                  </Label>
                  <Input
                    id={`wizard-divisi-${indeks}`}
                    data-testid="wizard-field-divisi-nama"
                    maxLength={100}
                    placeholder="Contoh: Acara"
                    value={item.nama ?? ''}
                    onChange={(event) => ubahDivisi(indeks, { nama: event.target.value })}
                  />
                </div>
                <PilihPengurus
                  id={`wizard-koordinator-${indeks}`}
                  label="Koordinator"
                  pengurus={pengurus}
                  value={item.koordinator_id}
                  onChange={(value) =>
                    ubahDivisi(indeks, { koordinator_id: value ?? undefined })
                  }
                />
              </div>

              <div className="mt-4 space-y-1.5">
                <Label htmlFor={`wizard-anggota-${indeks}`}>Anggota divisi</Label>
                <Select
                  id={`wizard-anggota-${indeks}`}
                  multiple
                  placeholder={null}
                  className="h-28 py-2"
                  value={item.anggota ?? []}
                  onChange={(event) =>
                    ubahDivisi(indeks, {
                      anggota: Array.from(event.target.selectedOptions, (opsi) => opsi.value),
                    })
                  }
                >
                  {pengurus.map((pengurusItem) => (
                    <option key={pengurusItem.id} value={pengurusItem.id}>
                      {pengurusItem.nama}
                    </option>
                  ))}
                </Select>
                <p className="text-[12px] leading-4 text-secondary">
                  Gunakan Ctrl atau Command untuk memilih lebih dari satu anggota.
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {!hasilValidasi.ok ? (
        <div role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3">
          <p className="text-[13px] font-semibold text-danger">Lengkapi rencana kepanitiaan:</p>
          <ul className="mt-1 list-disc pl-5 text-[12px] leading-5 text-danger">
            {hasilValidasi.isu.map((isu, indeks) => (
              <li key={`${isu.path}-${indeks}`}>{isu.pesan}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
