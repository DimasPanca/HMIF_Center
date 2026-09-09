'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatRentangTanggal, formatTanggalPendek } from '@/lib/utils/format-tanggal';
import { permintaanCekKonflik, type WizardDraft } from '@/lib/proker/wizard-state';

import type { KonflikWizard, OpsiPilihan } from './types';

interface Langkah6TinjauProps {
  departemen: OpsiPilihan[];
  draft: WizardDraft;
  pengurus: OpsiPilihan[];
}

interface ResponsApi<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string; details?: { path?: string; pesan?: string }[] };
}

interface HasilSubmit {
  proker_id: string;
  status: 'MENUNGGU_APPROVAL' | 'DISETUJUI';
}

const LABEL_KATEGORI = {
  TERJADWAL: 'Terjadwal',
  BERKALA: 'Berkala',
  RESPONSIF: 'Responsif',
} as const;

function namaDari(daftar: OpsiPilihan[], id?: string) {
  return daftar.find((item) => item.id === id)?.nama ?? 'Belum ditentukan';
}

function BarisRingkasan({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-subtle py-2.5 last:border-b-0 sm:grid-cols-[180px_1fr]">
      <dt className="text-[12px] font-medium text-secondary">{label}</dt>
      <dd className="text-[13px] text-primary">{nilai}</dd>
    </div>
  );
}

export function Langkah6Tinjau({ departemen, draft, pengurus }: Langkah6TinjauProps) {
  const router = useRouter();
  const [konflik, setKonflik] = useState<KonflikWizard[]>([]);
  const [sedangCek, setSedangCek] = useState(true);
  const [pesanCek, setPesanCek] = useState<string | null>(null);
  const [sedangSubmit, setSedangSubmit] = useState(false);
  const [pesanSubmit, setPesanSubmit] = useState<string | null>(null);
  const [detailSubmit, setDetailSubmit] = useState<string[]>([]);
  const [hasilSubmit, setHasilSubmit] = useState<HasilSubmit | null>(null);
  const timerArahkan = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const badan = permintaanCekKonflik(draft);
    if (!badan) {
      setKonflik([]);
      setPesanCek(null);
      setSedangCek(false);
      return;
    }

    const controller = new AbortController();
    async function cekFinal() {
      setSedangCek(true);
      setPesanCek(null);
      try {
        const response = await fetch('/api/proker/cek-konflik', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(badan),
          signal: controller.signal,
        });
        const body = (await response.json()) as ResponsApi<KonflikWizard[]>;
        if (!response.ok || body.ok !== true || !Array.isArray(body.data)) {
          throw new Error(body.error?.message ?? 'Pemeriksaan konflik final belum berhasil.');
        }
        setKonflik(body.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setKonflik([]);
        setPesanCek(
          error instanceof Error ? error.message : 'Pemeriksaan konflik final belum berhasil.',
        );
      } finally {
        if (!controller.signal.aborted) setSedangCek(false);
      }
    }

    void cekFinal();
    return () => controller.abort();
  }, [draft]);

  useEffect(
    () => () => {
      if (timerArahkan.current) clearTimeout(timerArahkan.current);
    },
    [],
  );

  async function ajukan() {
    setSedangSubmit(true);
    setPesanSubmit(null);
    setDetailSubmit([]);
    try {
      const response = await fetch('/api/proker/submit', { method: 'POST' });
      const body = (await response.json()) as ResponsApi<HasilSubmit>;
      if (!response.ok || body.ok !== true || !body.data) {
        const details =
          body.error?.details
            ?.map((detail) => detail.pesan)
            .filter((pesan): pesan is string => Boolean(pesan)) ?? [];
        setDetailSubmit(details);
        throw new Error(body.error?.message ?? 'Proker belum dapat diajukan.');
      }
      setHasilSubmit(body.data);
      timerArahkan.current = setTimeout(() => router.push('/proker'), 1800);
    } catch (error) {
      setPesanSubmit(error instanceof Error ? error.message : 'Proker belum dapat diajukan.');
    } finally {
      setSedangSubmit(false);
    }
  }

  const kepanitiaan = draft.kepanitiaan;
  const groups = draft.gantt?.groups ?? [];
  const jumlahTask = groups.reduce((jumlah, group) => jumlah + (group.tasks?.length ?? 0), 0);
  const tanggalAcara =
    draft.tanggal_hari_h_mulai && draft.tanggal_hari_h_selesai
      ? formatRentangTanggal(draft.tanggal_hari_h_mulai, draft.tanggal_hari_h_selesai)
      : 'Mengikuti pola kegiatan';

  return (
    <section aria-labelledby="judul-langkah-6" className="space-y-6">
      <header>
        <h2 id="judul-langkah-6" className="text-lg font-semibold text-primary">
          Tinjau dan ajukan
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">
          Periksa kembali seluruh isian. Pengajuan belum mengunci kalender sebelum disetujui.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-sm border border-default bg-panel p-4">
          <h3 className="text-[14px] font-semibold text-primary">Informasi proker</h3>
          <dl className="mt-2">
            <BarisRingkasan label="Nama" nilai={draft.nama || '—'} />
            <BarisRingkasan
              label="Kategori"
              nilai={draft.kategori ? LABEL_KATEGORI[draft.kategori] : '—'}
            />
            <BarisRingkasan
              label="Departemen"
              nilai={namaDari(departemen, draft.departemen_id)}
            />
            <BarisRingkasan label="Pelaksanaan" nilai={tanggalAcara} />
            {draft.tanggal_mulai_persiapan ? (
              <BarisRingkasan
                label="Mulai persiapan"
                nilai={formatTanggalPendek(draft.tanggal_mulai_persiapan)}
              />
            ) : null}
            <BarisRingkasan
              label="Anggaran"
              nilai={formatRupiah(draft.estimasi_anggaran ?? 0)}
            />
          </dl>
        </article>

        {draft.kategori === 'TERJADWAL' ? (
          <article className="rounded-sm border border-default bg-panel p-4">
            <h3 className="text-[14px] font-semibold text-primary">Rencana pelaksanaan</h3>
            <dl className="mt-2">
              <BarisRingkasan
                label="Ketua Pelaksana"
                nilai={namaDari(pengurus, kepanitiaan?.ketua_pelaksana)}
              />
              <BarisRingkasan
                label="Divisi"
                nilai={(kepanitiaan?.divisi ?? []).map((item) => item.nama).join(', ') || '—'}
              />
              <BarisRingkasan label="Fase Gantt" nilai={`${groups.length} fase`} />
              <BarisRingkasan label="Task Gantt" nilai={`${jumlahTask} task`} />
            </dl>
          </article>
        ) : (
          <article className="rounded-sm border border-[var(--info)] bg-[var(--info-subtle)] p-4">
            <h3 className="text-[14px] font-semibold text-primary">Alur kategori</h3>
            <p className="mt-2 text-[13px] leading-[18px] text-secondary">
              {draft.kategori === 'BERKALA'
                ? 'Proker berkala langsung berstatus Disetujui dan tidak mengunci kalender.'
                : 'Proker responsif dikirim untuk persetujuan tanpa membentuk kepanitiaan.'}
            </p>
          </article>
        )}
      </div>

      {sedangCek ? (
        <p role="status" className="text-[12px] text-secondary">
          Menjalankan pemeriksaan konflik final…
        </p>
      ) : null}

      {pesanCek ? (
        <InlineAlert
          title="Pemeriksaan konflik final belum berhasil"
          detail={pesanCek}
          suggestion="Kembali ke langkah penjadwalan, periksa koneksi, lalu coba lagi."
        />
      ) : null}

      {konflik.length > 0 ? (
        <InlineAlert
          title="Konflik jadwal masih terdeteksi"
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
          suggestion="Pengajuan tetap belum mengunci kalender. Konflik diputuskan saat approval."
        />
      ) : null}

      {pesanSubmit ? (
        <div role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-danger">
          <p className="text-[13px] font-semibold">{pesanSubmit}</p>
          {detailSubmit.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-[12px] leading-5">
              {detailSubmit.map((detail, indeks) => (
                <li key={`${detail}-${indeks}`}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {hasilSubmit ? (
        <div
          data-testid="wizard-submit-sukses"
          role="status"
          className="flex items-start gap-3 rounded-sm border border-[var(--success)] bg-[var(--success-subtle)] p-4 text-[var(--success)]"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-semibold">Proker berhasil diajukan.</p>
            <p className="mt-1 text-[12px] leading-4">
              Status: {hasilSubmit.status === 'DISETUJUI' ? 'Disetujui' : 'Menunggu persetujuan'}.
              Kalender belum terkunci. Mengarahkan ke daftar proker…
            </p>
          </div>
        </div>
      ) : (
        <div className="flex justify-end border-t border-subtle pt-4">
          <Button
            data-testid="wizard-ajukan"
            onClick={() => void ajukan()}
            disabled={sedangCek || Boolean(pesanCek)}
            loading={sedangSubmit}
          >
            <Send aria-hidden="true" />
            Ajukan proker
          </Button>
        </div>
      )}
    </section>
  );
}
