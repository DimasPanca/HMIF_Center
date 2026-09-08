'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { WizardDraft } from '@/lib/proker/wizard-state';

import type { OpsiPilihan, PatchWizard } from './types';

interface Langkah1InformasiProps {
  draft: WizardDraft;
  departemen: OpsiPilihan[];
  pengurus: OpsiPilihan[];
  onUbah: (patch: PatchWizard) => void;
}

const KATEGORI = [
  { nilai: 'TERJADWAL', label: 'Terjadwal' },
  { nilai: 'BERKALA', label: 'Berkala' },
  { nilai: 'RESPONSIF', label: 'Responsif' },
] as const;

export function Langkah1Informasi({
  departemen,
  draft,
  onUbah,
  pengurus,
}: Langkah1InformasiProps) {
  return (
    <section aria-labelledby="judul-langkah-1" className="space-y-5">
      <header>
        <h2 id="judul-langkah-1" className="text-lg font-semibold text-primary">
          Informasi dasar
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">
          Tentukan identitas, kategori, dan penanggung jawab program kerja.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-departemen" required>
            Departemen
          </Label>
          <Select
            id="wizard-departemen"
            value={draft.departemen_id ?? ''}
            onChange={(event) => onUbah({ departemen_id: event.target.value })}
            disabled={departemen.length === 1}
          >
            {departemen.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </Select>
          {departemen.length === 0 ? (
            <p role="alert" className="text-[12px] leading-4 text-danger">
              Tidak ada departemen aktif yang dapat dipilih.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wizard-kategori" required>
            Kategori
          </Label>
          <Select
            id="wizard-kategori"
            data-testid="wizard-field-kategori"
            value={draft.kategori ?? ''}
            onChange={(event) => {
              const kategori = event.target.value as WizardDraft['kategori'];
              onUbah(
                kategori === 'BERKALA'
                  ? {
                      kategori,
                      tanggal_mulai_persiapan: null,
                      tanggal_hari_h_mulai: null,
                      tanggal_hari_h_selesai: null,
                    }
                  : { kategori, pola_ulang: null },
              );
            }}
          >
            {KATEGORI.map((item) => (
              <option key={item.nilai} value={item.nilai}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wizard-nama" required>
          Nama program kerja
        </Label>
        <Input
          id="wizard-nama"
          data-testid="wizard-field-nama"
          maxLength={200}
          placeholder="Contoh: HMIF Mengajar"
          value={draft.nama ?? ''}
          onChange={(event) => onUbah({ nama: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wizard-deskripsi">Deskripsi</Label>
        <Textarea
          id="wizard-deskripsi"
          maxLength={4000}
          placeholder="Ringkasan pelaksanaan program kerja"
          value={draft.deskripsi ?? ''}
          onChange={(event) => onUbah({ deskripsi: event.target.value })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-tujuan">Tujuan</Label>
          <Textarea
            id="wizard-tujuan"
            maxLength={4000}
            placeholder="Hasil yang ingin dicapai"
            value={draft.tujuan ?? ''}
            onChange={(event) => onUbah({ tujuan: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-sasaran">Sasaran</Label>
          <Textarea
            id="wizard-sasaran"
            maxLength={4000}
            placeholder="Peserta atau penerima manfaat"
            value={draft.sasaran ?? ''}
            onChange={(event) => onUbah({ sasaran: event.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-peserta">Estimasi peserta</Label>
          <Input
            id="wizard-peserta"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="0"
            value={draft.estimasi_peserta ?? ''}
            onChange={(event) =>
              onUbah({
                estimasi_peserta:
                  event.target.value === '' ? null : Number.parseInt(event.target.value, 10),
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-penanggung-jawab">Penanggung jawab</Label>
          <Select
            id="wizard-penanggung-jawab"
            value={draft.penanggung_jawab ?? ''}
            onChange={(event) =>
              onUbah({ penanggung_jawab: event.target.value === '' ? null : event.target.value })
            }
            placeholder="Belum ditentukan"
          >
            {pengurus.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </section>
  );
}
