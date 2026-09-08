'use client';

import { KalenderKetersediaan } from '@/components/proker/KalenderKetersediaan';
import { Checkbox } from '@/components/ui/checkbox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatRentangTanggal } from '@/lib/utils/format-tanggal';
import {
  HARI,
  durasiPersiapan,
  pesanDurasi,
  type WizardDraft,
} from '@/lib/proker/wizard-state';

import type { KonflikWizard, PatchWizard } from './types';

interface Langkah2JadwalProps {
  draft: WizardDraft;
  konflik: KonflikWizard[];
  pesanCek: string | null;
  sedangCek: boolean;
  onUbah: (patch: PatchWizard) => void;
}

const NAMA_HARI: Record<(typeof HARI)[number], string> = {
  SENIN: 'Senin',
  SELASA: 'Selasa',
  RABU: 'Rabu',
  KAMIS: 'Kamis',
  JUMAT: 'Jumat',
  SABTU: 'Sabtu',
  MINGGU: 'Minggu',
};

function FormPolaUlang({ draft, onUbah }: Pick<Langkah2JadwalProps, 'draft' | 'onUbah'>) {
  const pola = draft.pola_ulang ?? {
    frekuensi: 'MINGGUAN' as const,
    hari: [],
    mulai: '',
    selesai: '',
  };

  function ubahPola(patch: Partial<typeof pola>) {
    onUbah({ pola_ulang: { ...pola, ...patch } });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-frekuensi" required>
            Frekuensi
          </Label>
          <Select
            id="wizard-frekuensi"
            value={pola.frekuensi}
            placeholder={null}
            onChange={(event) =>
              ubahPola({ frekuensi: event.target.value as 'MINGGUAN' | 'BULANAN' })
            }
          >
            <option value="MINGGUAN">Setiap minggu</option>
            <option value="BULANAN">Setiap bulan</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-pola-mulai" required>
            Mulai
          </Label>
          <Input
            id="wizard-pola-mulai"
            type="date"
            value={pola.mulai}
            onChange={(event) => ubahPola({ mulai: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-pola-selesai" required>
            Selesai
          </Label>
          <Input
            id="wizard-pola-selesai"
            type="date"
            value={pola.selesai}
            onChange={(event) => ubahPola({ selesai: event.target.value })}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-[13px] leading-[18px] font-medium text-primary">
          Hari pelaksanaan <span className="text-danger">*</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {HARI.map((hari) => {
            const terpilih = pola.hari.includes(hari);
            return (
              <label
                key={hari}
                className="inline-flex min-h-[34px] items-center gap-2 rounded-sm border border-default px-3 text-[13px] text-secondary"
              >
                <Checkbox
                  checked={terpilih}
                  onChange={() =>
                    ubahPola({
                      hari: terpilih
                        ? pola.hari.filter((nilai) => nilai !== hari)
                        : [...pola.hari, hari],
                    })
                  }
                />
                {NAMA_HARI[hari]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="rounded-sm border border-[var(--info)] bg-[var(--info-subtle)] p-3 text-[13px] leading-[18px] text-primary">
        Proker berkala tidak mengunci kalender dan tidak diperiksa sebagai bentrok.
      </p>
    </div>
  );
}

export function Langkah2Jadwal({
  draft,
  konflik,
  onUbah,
  pesanCek,
  sedangCek,
}: Langkah2JadwalProps) {
  const durasi = durasiPersiapan(draft);

  function pilihDariKalender(tanggal: string) {
    if (!draft.tanggal_hari_h_mulai || draft.tanggal_hari_h_selesai) {
      onUbah({ tanggal_hari_h_mulai: tanggal, tanggal_hari_h_selesai: tanggal });
      return;
    }
    onUbah({ tanggal_hari_h_selesai: tanggal });
  }

  return (
    <section aria-labelledby="judul-langkah-2" className="space-y-5">
      <header>
        <h2 id="judul-langkah-2" className="text-lg font-semibold text-primary">
          Penjadwalan
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">
          {draft.kategori === 'BERKALA'
            ? 'Atur pola kegiatan yang berulang.'
            : 'Pilih rentang persiapan dan hari pelaksanaan setelah memeriksa kalender.'}
        </p>
      </header>

      {draft.kategori === 'BERKALA' ? (
        <FormPolaUlang draft={draft} onUbah={onUbah} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="wizard-persiapan" required={draft.kategori === 'TERJADWAL'}>
                Mulai persiapan
              </Label>
              <Input
                id="wizard-persiapan"
                data-testid="wizard-field-persiapan"
                type="date"
                value={draft.tanggal_mulai_persiapan ?? ''}
                onChange={(event) =>
                  onUbah({ tanggal_mulai_persiapan: event.target.value || null })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-harih-mulai" required>
                Hari-H mulai
              </Label>
              <Input
                id="wizard-harih-mulai"
                data-testid="wizard-field-harih-mulai"
                type="date"
                value={draft.tanggal_hari_h_mulai ?? ''}
                onChange={(event) => onUbah({ tanggal_hari_h_mulai: event.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-harih-selesai" required>
                Hari-H selesai
              </Label>
              <Input
                id="wizard-harih-selesai"
                data-testid="wizard-field-harih-selesai"
                type="date"
                value={draft.tanggal_hari_h_selesai ?? ''}
                onChange={(event) =>
                  onUbah({ tanggal_hari_h_selesai: event.target.value || null })
                }
              />
            </div>
          </div>

          {durasi !== null ? (
            <p
              data-testid="wizard-durasi"
              className={`rounded-sm border p-3 text-[13px] font-medium tabular-nums ${
                durasi >= 15 && durasi <= 45
                  ? 'border-[var(--success)] bg-[var(--success-subtle)] text-[var(--success)]'
                  : 'border-[var(--danger)] bg-[var(--danger-subtle)] text-[var(--danger)]'
              }`}
            >
              {pesanDurasi(durasi)}
            </p>
          ) : null}

          {sedangCek ? (
            <p role="status" className="text-[12px] text-secondary">
              Memeriksa bentrok jadwal…
            </p>
          ) : null}

          {pesanCek ? (
            <InlineAlert
              title="Pemeriksaan jadwal belum berhasil"
              detail={pesanCek}
              suggestion="Periksa koneksi lalu ubah salah satu tanggal untuk mencoba kembali."
            />
          ) : null}

          {konflik.length > 0 ? (
            <InlineAlert
              data-testid="wizard-konflik"
              detail={
                <ul className="space-y-1.5">
                  {konflik.map((item) => (
                    <li key={item.proker_id}>
                      <strong>{item.nama_proker}</strong> · {item.nama_departemen} ·{' '}
                      {formatRentangTanggal(item.mulai, item.selesai)}
                    </li>
                  ))}
                </ul>
              }
            />
          ) : null}

          <KalenderKetersediaan
            sumber="/api/proker/kalender"
            tanggalTerpilih={draft.tanggal_hari_h_mulai ?? null}
            onPilihTanggal={pilihDariKalender}
          />
        </>
      )}
    </section>
  );
}
