'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  LANGKAH,
  bolehLanjut,
  langkahUntuk,
  permintaanCekKonflik,
  terapkanLangkah,
  type NomorLangkah,
  type WizardDraft,
} from '@/lib/proker/wizard-state';

import { Langkah1Informasi } from './Langkah1Informasi';
import { Langkah2Jadwal } from './Langkah2Jadwal';
import { Langkah3Anggaran } from './Langkah3Anggaran';
import { Langkah4Kepanitiaan } from './Langkah4Kepanitiaan';
import { Langkah5Gantt } from './Langkah5Gantt';
import { Langkah6Tinjau } from './Langkah6Tinjau';
import type { KonflikWizard, OpsiPilihan, PatchWizard } from './types';

interface WizardShellProps {
  departemen: OpsiPilihan[];
  divisiPreset: string[];
  pengurus: OpsiPilihan[];
  departemenAwal?: string;
}

interface ResponsApi<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

interface DraftDariServer {
  data: WizardDraft;
  langkah: NomorLangkah;
}

type StatusSimpan = 'diam' | 'menyimpan' | 'tersimpan' | 'gagal';

export function WizardShell({
  departemen,
  departemenAwal,
  divisiPreset,
  pengurus,
}: WizardShellProps) {
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    departemen_id: departemenAwal,
  }));
  const [langkahAktif, setLangkahAktif] = useState<NomorLangkah>(1);
  const [sudahMemuat, setSudahMemuat] = useState(false);
  const [pesanMuat, setPesanMuat] = useState<string | null>(null);
  const [statusSimpan, setStatusSimpan] = useState<StatusSimpan>('diam');
  const [pesanSimpan, setPesanSimpan] = useState<string | null>(null);
  const [konflik, setKonflik] = useState<KonflikWizard[]>([]);
  const [sedangCek, setSedangCek] = useState(false);
  const [pesanCek, setPesanCek] = useState<string | null>(null);
  const timerSimpan = useRef<ReturnType<typeof setTimeout> | null>(null);

  const langkahBerlaku = useMemo(() => langkahUntuk(draft.kategori), [draft.kategori]);
  const nomorBerlaku = useMemo(
    () => new Set(langkahBerlaku.map((langkah) => langkah.nomor)),
    [langkahBerlaku],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function pulihkanDraft() {
      try {
        const response = await fetch('/api/proker/draft', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json()) as ResponsApi<DraftDariServer | null>;
        if (!response.ok || body.ok !== true) {
          throw new Error(body.error?.message ?? 'Draft belum dapat dimuat.');
        }
        if (body.data) {
          const pulih = { ...body.data.data };
          pulih.departemen_id ||= departemenAwal;
          const langkahPulih = langkahUntuk(pulih.kategori);
          const langkahTersimpan = body.data.langkah;
          const langkahFallback =
            langkahPulih.filter((langkah) => langkah.nomor < langkahTersimpan).at(-1)?.nomor ?? 1;
          setDraft(pulih);
          setLangkahAktif(
            langkahPulih.some((langkah) => langkah.nomor === langkahTersimpan)
              ? langkahTersimpan
              : langkahFallback,
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPesanMuat(error instanceof Error ? error.message : 'Draft belum dapat dimuat.');
      } finally {
        if (!controller.signal.aborted) setSudahMemuat(true);
      }
    }

    void pulihkanDraft();
    return () => controller.abort();
  }, [departemenAwal]);

  const simpan = useCallback(async (data: WizardDraft, langkah: NomorLangkah) => {
    setStatusSimpan('menyimpan');
    setPesanSimpan(null);
    try {
      const response = await fetch('/api/proker/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, langkah }),
      });
      const body = (await response.json()) as ResponsApi<{ id: string }>;
      if (!response.ok || body.ok !== true) {
        throw new Error(body.error?.message ?? 'Draft belum dapat disimpan.');
      }
      setStatusSimpan('tersimpan');
      return true;
    } catch (error) {
      setStatusSimpan('gagal');
      setPesanSimpan(error instanceof Error ? error.message : 'Draft belum dapat disimpan.');
      return false;
    }
  }, []);

  useEffect(() => {
    if (!sudahMemuat) return;
    if (timerSimpan.current) clearTimeout(timerSimpan.current);
    setStatusSimpan('diam');
    timerSimpan.current = setTimeout(() => {
      void simpan(draft, langkahAktif);
    }, 400);

    return () => {
      if (timerSimpan.current) clearTimeout(timerSimpan.current);
    };
  }, [draft, langkahAktif, simpan, sudahMemuat]);

  useEffect(() => {
    const badan = permintaanCekKonflik(draft);
    if (!badan) {
      setKonflik([]);
      setPesanCek(null);
      setSedangCek(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
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
          throw new Error(body.error?.message ?? 'Jadwal belum dapat diperiksa.');
        }
        setKonflik(body.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setKonflik([]);
        setPesanCek(error instanceof Error ? error.message : 'Jadwal belum dapat diperiksa.');
      } finally {
        if (!controller.signal.aborted) setSedangCek(false);
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft]);

  function ubah(patch: PatchWizard) {
    setDraft((nilai) => terapkanLangkah(nilai, patch as Partial<WizardDraft>));
  }

  const indeksAktif = langkahBerlaku.findIndex((langkah) => langkah.nomor === langkahAktif);
  const langkahBerikut = langkahBerlaku[indeksAktif + 1]?.nomor;
  const langkahSebelum = langkahBerlaku[indeksAktif - 1]?.nomor;
  const bisaLanjut =
    bolehLanjut(draft, langkahAktif) &&
    !sedangCek &&
    konflik.length === 0 &&
    !pesanCek;

  async function lanjut() {
    if (!bisaLanjut || !langkahBerikut) return;
    if (timerSimpan.current) clearTimeout(timerSimpan.current);
    const berhasil = await simpan(draft, langkahBerikut);
    if (berhasil) setLangkahAktif(langkahBerikut);
  }

  function kembali() {
    if (langkahSebelum) setLangkahAktif(langkahSebelum);
  }

  return (
    <div data-testid="wizard-root" className="space-y-5">
      {/* HP (ADR-037): enam bulatan bernomor selebar layar + judul langkah aktif,
          bukan deretan kartu yang harus digeser ke samping. */}
      <nav aria-label="Langkah tambah proker" className="pb-1 md:overflow-x-auto">
        <ol className="grid grid-cols-6 gap-1.5 md:min-w-[46rem] md:gap-2">
          {LANGKAH.map((langkah) => {
            const aktif = langkah.nomor === langkahAktif;
            const berlaku = nomorBerlaku.has(langkah.nomor);
            const selesai = berlaku && langkah.nomor < langkahAktif;
            return (
              <li key={langkah.nomor}>
                <button
                  type="button"
                  disabled={!berlaku || langkah.nomor >= langkahAktif}
                  onClick={() => setLangkahAktif(langkah.nomor)}
                  aria-current={aktif ? 'step' : undefined}
                  aria-label={`Langkah ${langkah.nomor}: ${langkah.judul}`}
                  className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border px-1 text-left text-[12px] leading-4 transition-[border-color,background-color,color] duration-fast motion-reduce:transition-none md:min-h-[58px] md:justify-start md:px-3 ${
                    aktif
                      ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-primary'
                      : berlaku
                        ? 'border-default bg-panel text-secondary hover:border-strong'
                        : 'border-subtle bg-muted text-disabled'
                  }`}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current font-semibold tabular-nums"
                    aria-hidden="true"
                  >
                    {selesai ? <Check className="size-3.5" /> : langkah.nomor}
                  </span>
                  <span className="hidden md:inline">{langkah.judul}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[14px] font-medium text-primary md:hidden" aria-hidden="true">
          Langkah {langkahAktif} dari {LANGKAH.length} · {LANGKAH.find((l) => l.nomor === langkahAktif)?.judul}
        </p>
      </nav>

      {pesanMuat ? (
        <p role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] text-danger">
          {pesanMuat} Anda tetap dapat mengisi form; perubahan berikutnya akan dicoba disimpan.
        </p>
      ) : null}

      <Card className="p-5 sm:p-6">
        <div
          data-testid="wizard-langkah-aktif"
          data-langkah={langkahAktif}
          className="sr-only"
        >
          Langkah {langkahAktif}
        </div>

        {!sudahMemuat ? (
          <p role="status" className="py-14 text-center text-[13px] text-secondary">
            Memulihkan draft…
          </p>
        ) : langkahAktif === 1 ? (
          <Langkah1Informasi
            departemen={departemen}
            draft={draft}
            onUbah={ubah}
            pengurus={pengurus}
          />
        ) : langkahAktif === 2 ? (
          <Langkah2Jadwal
            draft={draft}
            konflik={konflik}
            onUbah={ubah}
            pesanCek={pesanCek}
            sedangCek={sedangCek}
          />
        ) : langkahAktif === 3 ? (
          <Langkah3Anggaran draft={draft} onUbah={ubah} />
        ) : langkahAktif === 4 ? (
          <Langkah4Kepanitiaan
            divisiPreset={divisiPreset}
            draft={draft}
            onUbah={ubah}
            pengurus={pengurus}
          />
        ) : langkahAktif === 5 ? (
          <Langkah5Gantt draft={draft} onUbah={ubah} pengurus={pengurus} />
        ) : (
          <Langkah6Tinjau departemen={departemen} draft={draft} pengurus={pengurus} />
        )}

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-4">
          <div className="flex min-h-5 items-center gap-1.5 text-[12px] text-secondary" aria-live="polite">
            <Save className="size-3.5" aria-hidden="true" />
            {statusSimpan === 'menyimpan'
              ? 'Menyimpan draft…'
              : statusSimpan === 'tersimpan'
                ? 'Draft tersimpan di server.'
                : statusSimpan === 'gagal'
                  ? (pesanSimpan ?? 'Draft belum dapat disimpan.')
                  : 'Perubahan disimpan otomatis.'}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={kembali} disabled={!langkahSebelum}>
              <ChevronLeft aria-hidden="true" />
              Kembali
            </Button>
            {langkahBerikut ? (
              <Button
                data-testid="wizard-lanjut"
                onClick={() => void lanjut()}
                disabled={!bisaLanjut}
                loading={statusSimpan === 'menyimpan'}
              >
                Lanjut
                <ChevronRight aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </footer>
      </Card>
    </div>
  );
}

export type { OpsiPilihan } from './types';
