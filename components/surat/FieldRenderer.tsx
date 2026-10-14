'use client';

/**
 * FieldRenderer — merender satu field khusus surat dari deskripsinya
 * (`serialisasiFieldSchema`, isi `surat_template.field_schema`).
 *
 * Form tidak mengenal nama field satu per satu: jenis surat baru, atau field
 * baru di template, otomatis muncul tanpa mengubah komponen ini. Urutan ulang
 * memakai tombol naik/turun, bukan seret — dapat dijangkau keyboard dan tidak
 * butuh target sentuh kecil di ponsel.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-058 butir 6 · DESIGN_SYSTEM §8
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DeskripsiField } from '@/lib/surat/field-schemas';

export type CariGalat = (path: string) => string | undefined;

type SubField = NonNullable<DeskripsiField['item']>[string];

export interface FieldRendererProps {
  deskripsi: DeskripsiField;
  nilai: unknown;
  onChange: (nilai: unknown) => void;
  /** Path dasar untuk pencarian galat, mis. `data_dinamis.items`. */
  path: string;
  galat: CariGalat;
}

function Bantuan({ id, teks }: { id: string; teks?: string }) {
  return teks ? (
    <p id={id} className="mt-1 text-[12px] leading-4 text-tertiary">
      {teks}
    </p>
  ) : null;
}

function teks(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function larik<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Menukar posisi dua elemen tanpa mengubah larik asli. */
function pindah<T>(isi: T[], dari: number, ke: number): T[] {
  if (ke < 0 || ke >= isi.length) return isi;
  const salin = [...isi];
  const [x] = salin.splice(dari, 1);
  salin.splice(ke, 0, x as T);
  return salin;
}

function AksiBaris({
  indeks,
  jumlah,
  label,
  testid,
  onPindah,
  onHapus,
}: {
  indeks: number;
  jumlah: number;
  label: string;
  testid: string;
  onPindah: (ke: number) => void;
  onHapus: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        className="w-[34px] px-0"
        aria-label={`Naikkan ${label} #${indeks + 1}`}
        disabled={indeks === 0}
        onClick={() => onPindah(indeks - 1)}
        data-testid={`${testid}-naik-${indeks}`}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-[34px] px-0"
        aria-label={`Turunkan ${label} #${indeks + 1}`}
        disabled={indeks === jumlah - 1}
        onClick={() => onPindah(indeks + 1)}
        data-testid={`${testid}-turun-${indeks}`}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-[34px] px-0 text-danger"
        aria-label={`Hapus ${label} #${indeks + 1}`}
        onClick={onHapus}
        data-testid={`${testid}-hapus-${indeks}`}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Daftar paragraf berulang — dipakai uraian poin aspirasi. */
function DaftarTeks({
  label,
  nilai,
  onChange,
  path,
  galat,
  testid,
}: {
  label: string;
  nilai: string[];
  onChange: (v: string[]) => void;
  path: string;
  galat: CariGalat;
  testid: string;
}) {
  return (
    <div className="space-y-2" data-testid={testid}>
      {nilai.map((p, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <Textarea
            aria-label={`${label} paragraf ${i + 1}`}
            value={p}
            rows={3}
            onChange={(e) => onChange(nilai.map((x, j) => (j === i ? e.target.value : x)))}
            error={galat(`${path}.${i}`)}
            className="flex-1"
          />
          <AksiBaris
            indeks={i}
            jumlah={nilai.length}
            label={`paragraf ${label}`}
            testid={testid}
            onPindah={(ke) => onChange(pindah(nilai, i, ke))}
            onHapus={() => onChange(nilai.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...nilai, ''])} data-testid={`${testid}-tambah`}>
        <Plus aria-hidden="true" /> Tambah paragraf
      </Button>
      {galat(path) ? (
        <p role="alert" className="text-[12px] leading-4 text-danger">
          {galat(path)}
        </p>
      ) : null}
    </div>
  );
}

function nilaiAwalItem(item: Record<string, SubField>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).map(([k, d]) => [k, d.default ?? (d.type === 'text[]' ? [''] : '')]),
  );
}

function DaftarObjek({ deskripsi, nilai, onChange, path, galat }: FieldRendererProps & { nilai: Record<string, unknown>[] }) {
  const item = deskripsi.item ?? {};
  const testid = `surat-dinamis-${deskripsi.key}`;
  const ubahBaris = (i: number, k: string, v: unknown) =>
    onChange(nilai.map((baris, j) => (j === i ? { ...baris, [k]: v } : baris)));

  return (
    <fieldset className="space-y-3" data-testid={testid}>
      <legend className="text-[13px] font-medium text-primary">
        {deskripsi.label}
        {deskripsi.required ? <span className="text-danger"> *</span> : null}
      </legend>
      {deskripsi.bantuan ? <p className="text-[12px] leading-4 text-tertiary">{deskripsi.bantuan}</p> : null}

      {nilai.length === 0 ? (
        <p className="rounded-sm border border-dashed border-default px-3 py-2 text-[13px] text-tertiary">
          Belum ada baris. Tambahkan minimal satu.
        </p>
      ) : null}

      {nilai.map((baris, i) => (
        <div key={i} className="rounded-sm border border-default p-3" data-testid={`${testid}-${i}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-secondary tabular-nums">#{i + 1}</span>
            <AksiBaris
              indeks={i}
              jumlah={nilai.length}
              label={deskripsi.label}
              testid={testid}
              onPindah={(ke) => onChange(pindah(nilai, i, ke))}
              onHapus={() => onChange(nilai.filter((_, j) => j !== i))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(item).map(([k, sub]) => {
              const id = `${testid}-${i}-${k}`;
              const subPath = `${path}.${i}.${k}`;
              if (sub.type === 'text[]') {
                return (
                  <div key={k} className="sm:col-span-2">
                    <Label required={sub.required}>{sub.label}</Label>
                    <DaftarTeks
                      label={sub.label}
                      nilai={larik<string>(baris[k])}
                      onChange={(v) => ubahBaris(i, k, v)}
                      path={subPath}
                      galat={galat}
                      testid={id}
                    />
                  </div>
                );
              }
              return (
                <div key={k}>
                  <Label htmlFor={id} required={sub.required}>
                    {sub.label}
                  </Label>
                  <Input
                    id={id}
                    data-testid={id}
                    value={teks(baris[k])}
                    onChange={(e) => ubahBaris(i, k, e.target.value)}
                    error={galat(subPath)}
                    aria-describedby={sub.bantuan ? `${id}-bantuan` : undefined}
                  />
                  <Bantuan id={`${id}-bantuan`} teks={sub.bantuan} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...nilai, nilaiAwalItem(item)])}
        data-testid={`surat-tambah-${deskripsi.key}`}
      >
        <Plus aria-hidden="true" /> Tambah baris
      </Button>
      {galat(path) ? (
        <p role="alert" className="text-[12px] leading-4 text-danger">
          {galat(path)}
        </p>
      ) : null}
    </fieldset>
  );
}

export function FieldRenderer(props: FieldRendererProps) {
  const { deskripsi, nilai, onChange, path, galat } = props;
  const id = `surat-dinamis-${deskripsi.key}`;

  if (deskripsi.type === 'list' && deskripsi.item) {
    return <DaftarObjek {...props} nilai={larik<Record<string, unknown>>(nilai)} />;
  }

  if (deskripsi.type === 'boolean') {
    return (
      <div>
        <label className="inline-flex items-center gap-2 text-[14px] text-primary">
          <Checkbox
            id={id}
            data-testid={id}
            checked={nilai === true}
            onChange={(e) => onChange(e.target.checked)}
            aria-describedby={deskripsi.bantuan ? `${id}-bantuan` : undefined}
          />
          {deskripsi.label}
        </label>
        <Bantuan id={`${id}-bantuan`} teks={deskripsi.bantuan} />
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={id} required={deskripsi.required}>
        {deskripsi.label}
      </Label>
      <Input
        id={id}
        data-testid={id}
        value={teks(nilai)}
        onChange={(e) => onChange(e.target.value)}
        error={galat(path)}
        aria-describedby={deskripsi.bantuan ? `${id}-bantuan` : undefined}
      />
      <Bantuan id={`${id}-bantuan`} teks={deskripsi.bantuan} />
    </div>
  );
}
