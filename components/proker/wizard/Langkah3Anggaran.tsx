'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { SUMBER_DANA, type WizardDraft } from '@/lib/proker/wizard-state';

import type { PatchWizard } from './types';

interface Langkah3AnggaranProps {
  draft: WizardDraft;
  onUbah: (patch: PatchWizard) => void;
}

const LABEL_SUMBER: Record<(typeof SUMBER_DANA)[number], string> = {
  KAS_HIMPUNAN: 'Kas himpunan',
  IURAN_PESERTA: 'Iuran peserta',
  SPONSOR: 'Sponsor',
  DANA_FAKULTAS: 'Dana fakultas',
};

export function Langkah3Anggaran({ draft, onUbah }: Langkah3AnggaranProps) {
  const sumber = draft.sumber_dana ?? [];

  return (
    <section aria-labelledby="judul-langkah-3" className="space-y-5">
      <header>
        <h2 id="judul-langkah-3" className="text-lg font-semibold text-primary">
          Anggaran dan kebutuhan
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">
          Catat estimasi biaya, sumber dana, ruangan, dan barang yang diperlukan.
        </p>
      </header>

      <div className="space-y-1.5">
        <Label htmlFor="wizard-anggaran">Estimasi anggaran</Label>
        <Input
          id="wizard-anggaran"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="0"
          value={draft.estimasi_anggaran ?? ''}
          helperText={
            draft.estimasi_anggaran === undefined
              ? 'Masukkan estimasi dalam rupiah.'
              : formatRupiah(draft.estimasi_anggaran)
          }
          onChange={(event) =>
            onUbah({
              estimasi_anggaran: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>

      <fieldset>
        <legend className="text-[13px] leading-[18px] font-medium text-primary">
          Sumber dana
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SUMBER_DANA.map((nilai) => {
            const terpilih = sumber.includes(nilai);
            return (
              <label
                key={nilai}
                className="inline-flex min-h-[34px] items-center gap-2 rounded-sm border border-default px-3 text-[13px] text-secondary"
              >
                <Checkbox
                  checked={terpilih}
                  onChange={() =>
                    onUbah({
                      sumber_dana: terpilih
                        ? sumber.filter((item) => item !== nilai)
                        : [...sumber, nilai],
                    })
                  }
                />
                {LABEL_SUMBER[nilai]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-ruangan">Kebutuhan ruangan</Label>
          <Textarea
            id="wizard-ruangan"
            maxLength={2000}
            placeholder="Contoh: Aula kapasitas 100 orang"
            value={draft.kebutuhan_ruangan ?? ''}
            onChange={(event) => onUbah({ kebutuhan_ruangan: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-barang">Kebutuhan barang</Label>
          <Textarea
            id="wizard-barang"
            maxLength={2000}
            placeholder="Contoh: Proyektor, mikrofon, dan meja registrasi"
            value={draft.kebutuhan_barang ?? ''}
            onChange={(event) => onUbah({ kebutuhan_barang: event.target.value })}
          />
        </div>
      </div>
    </section>
  );
}
