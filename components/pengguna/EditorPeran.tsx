'use client';

import { Plus, X } from 'lucide-react';

import { LABEL_PERAN, PERAN_BERDEPARTEMEN } from '@/components/pengguna/peran';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ROLES, type RoleCode } from '@/lib/auth/permissions';

export interface PeranDraf {
  role: RoleCode | '';
  departemen_id: string;
}

export interface OpsiDepartemen {
  id: string;
  nama: string;
}

/** Bentuk yang dikirim ke API: departemen hanya untuk peran yang memerlukannya. */
export function peranKeInput(daftar: PeranDraf[]) {
  return daftar
    .filter((p) => p.role !== '')
    .map((p) =>
      PERAN_BERDEPARTEMEN.includes(p.role as RoleCode)
        ? { role: p.role as RoleCode, departemen_id: p.departemen_id || undefined }
        : { role: p.role as RoleCode },
    );
}

/** Isu `roles.<i>...` → pesan per baris; isu `roles` → pesan umum. */
export function galatPeran(isu: { path: string; pesan: string }[]): {
  perBaris: Record<number, string>;
  umum?: string;
} {
  const perBaris: Record<number, string> = {};
  let umum: string | undefined;
  for (const i of isu) {
    const [akar, indeks] = i.path.split('.');
    if (akar !== 'roles') continue;
    if (indeks === undefined) umum ??= i.pesan;
    else perBaris[Number(indeks)] ??= i.pesan;
  }
  return { perBaris, umum };
}

interface EditorPeranProps {
  nilai: PeranDraf[];
  onUbah: (nilai: PeranDraf[]) => void;
  departemen: OpsiDepartemen[];
  galatPerBaris?: Record<number, string>;
  galatUmum?: string;
  disabled?: boolean;
}

export function EditorPeran({ nilai, onUbah, departemen, galatPerBaris = {}, galatUmum, disabled }: EditorPeranProps) {
  const ubahBaris = (i: number, ubah: Partial<PeranDraf>) =>
    onUbah(nilai.map((p, j) => (j === i ? { ...p, ...ubah } : p)));

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-1.5 text-[13px] leading-[18px] font-medium text-primary">
        Peran <span aria-hidden="true" className="text-[var(--danger)]">*</span>
        <span className="sr-only"> (wajib)</span>
      </legend>
      {nilai.map((p, i) => {
        const butuhDept = p.role !== '' && PERAN_BERDEPARTEMEN.includes(p.role);
        return (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <Select
                aria-label={`Peran ${i + 1}`}
                placeholder="Pilih peran"
                className="flex-1"
                value={p.role}
                onChange={(e) =>
                  ubahBaris(i, { role: e.target.value as RoleCode, departemen_id: '' })
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {LABEL_PERAN[r]}
                  </option>
                ))}
              </Select>
              {butuhDept ? (
                <Select
                  aria-label={`Departemen untuk peran ${i + 1}`}
                  placeholder="Pilih departemen"
                  className="flex-1"
                  value={p.departemen_id}
                  onChange={(e) => ubahBaris(i, { departemen_id: e.target.value })}
                >
                  {departemen.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nama}
                    </option>
                  ))}
                </Select>
              ) : null}
              {nilai.length > 1 ? (
                <Button
                  variant="ghost"
                  className="w-[34px] px-0"
                  aria-label={`Hapus peran ${i + 1}`}
                  onClick={() => onUbah(nilai.filter((_, j) => j !== i))}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            {galatPerBaris[i] ? (
              <p role="alert" className="text-[12px] leading-4 text-danger">
                {galatPerBaris[i]}
              </p>
            ) : null}
          </div>
        );
      })}
      {galatUmum ? (
        <p role="alert" className="text-[12px] leading-4 text-danger">
          {galatUmum}
        </p>
      ) : null}
      <Button variant="secondary" onClick={() => onUbah([...nilai, { role: '', departemen_id: '' }])}>
        <Plus aria-hidden="true" />
        Tambah peran
      </Button>
    </fieldset>
  );
}
