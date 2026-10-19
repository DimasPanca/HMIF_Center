'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarRange, Filter, Layers3, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GanttChart } from '@/components/gantt/GanttChart';
import { KoneksiBanner } from '@/components/shared/KoneksiBanner';
import { aturStatusRealtime } from '@/components/shared/realtime-status';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PanelFilterHp } from '@/components/ui/panel-filter-hp';
import { useTampilanHp } from '@/components/ui/use-layar-hp';
import { transformGanttRows, type MasterGanttRow } from '@/lib/gantt/transform';
import type { GanttScale } from '@/lib/gantt/geometry';
import { muatKlienRealtime } from '@/lib/realtime/klien-browser';
import {
  useMasterGanttRealtime,
  type StatusKoneksiRealtime,
} from '@/lib/realtime/use-master-gantt-realtime';

type BarisMasterApi = Omit<
  MasterGanttRow,
  'tanggal_mulai_persiapan' | 'tanggal_hari_h_mulai' | 'tanggal_hari_h_selesai'
> & {
  tanggal_mulai_persiapan: string | null;
  tanggal_hari_h_mulai: string | null;
  tanggal_hari_h_selesai: string | null;
};

interface ResponsMaster {
  data?: BarisMasterApi[];
  error?: { message?: string };
  ok: boolean;
}

const SEMUA = 'SEMUA';
const OPSI_SKALA: Array<{ label: string; value: GanttScale }> = [
  { label: 'Minggu', value: 'week' },
  { label: 'Bulan', value: 'month' },
  { label: 'Kuartal', value: 'quarter' },
];

function awalHariUtc(tanggal: Date): Date {
  return new Date(Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), tanggal.getUTCDate()));
}

function geserBulan(tanggal: Date, jumlah: number): Date {
  return new Date(Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth() + jumlah, 1));
}

function akhirBulan(tanggal: Date, jumlah: number): Date {
  return new Date(Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth() + jumlah + 1, 0));
}

function labelStatus(status: string): string {
  return status === 'DISETUJUI' ? 'Disetujui' : status === 'BERJALAN' ? 'Berjalan' : status;
}

function LanggananMaster({
  klien,
  periodeId,
  onPerubahan,
  onStatus,
}: {
  klien: SupabaseClient;
  periodeId: string;
  onPerubahan: () => void;
  onStatus: (status: StatusKoneksiRealtime) => void;
}) {
  useMasterGanttRealtime({ klien, periodeId, onPerubahan, onStatus });
  return null;
}

export function MasterGantt({
  periodeId,
  supabaseUrl,
  supabaseKey,
}: {
  periodeId: string;
  supabaseUrl: string | null;
  supabaseKey: string | null;
}) {
  const [baris, setBaris] = useState<BarisMasterApi[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [pesanPembaruanError, setPesanPembaruanError] = useState<string | null>(null);
  const [koneksi, setKoneksi] = useState<StatusKoneksiRealtime>('menghubungkan');
  const [klien, setKlien] = useState<SupabaseClient | null>(null);
  const [highlightedTaskIds, setHighlightedTaskIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const barisRef = useRef<BarisMasterApi[]>([]);
  const pernahDimuatRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aktifRef = useRef(true);
  const [skala, setSkala] = useState<GanttScale>('week');
  // Di HP mode Daftar (ADR-037) skala & lipat tidak berarti — disembunyikan.
  const [tampilanGantt, , layarHp] = useTampilanHp('hmif-gantt-tampilan', 'daftar', 'grafik');
  const modeDaftarHp = layarHp && tampilanGantt === 'daftar';
  const [departemenId, setDepartemenId] = useState(SEMUA);
  const [kategori, setKategori] = useState(SEMUA);
  const [status, setStatus] = useState(SEMUA);
  const [semuaTerlipat, setSemuaTerlipat] = useState(false);
  const [versiPelipatan, setVersiPelipatan] = useState(0);
  const [hariIni] = useState(() => awalHariUtc(new Date()));

  const ubahKoneksi = useCallback((baru: StatusKoneksiRealtime) => {
    if (!aktifRef.current) return;
    const statusBaru = baru === 'terhubung' && !navigator.onLine ? 'terputus' : baru;
    setKoneksi(statusBaru);
    aturStatusRealtime(statusBaru);
  }, []);

  const muat = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!pernahDimuatRef.current) {
      setMemuat(true);
      setPesanError(null);
    }
    setPesanPembaruanError(null);

    try {
      const response = await fetch('/api/gantt/master', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as ResponsMaster | null;
      if (!response.ok || body?.ok !== true || !Array.isArray(body.data)) {
        throw new Error(body?.error?.message ?? 'Master Gantt belum dapat dimuat.');
      }

      if (pernahDimuatRef.current) {
        const idSebelum = new Set(barisRef.current.map((item) => item.proker_id));
        const idBaru = body.data
          .map((item) => item.proker_id)
          .filter((id): id is string => Boolean(id) && !idSebelum.has(id));
        if (idBaru.length > 0) {
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          setHighlightedTaskIds(new Set(idBaru));
          flashTimerRef.current = setTimeout(() => {
            setHighlightedTaskIds(new Set());
            flashTimerRef.current = null;
          }, 400);
        }
      }

      barisRef.current = body.data;
      pernahDimuatRef.current = true;
      setBaris(body.data);
      setPesanError(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      const pesan = error instanceof Error ? error.message : 'Master Gantt belum dapat dimuat.';
      if (pernahDimuatRef.current) setPesanPembaruanError(pesan);
      else setPesanError(pesan);
    } finally {
      if (!controller.signal.aborted) setMemuat(false);
    }
  }, []);

  useEffect(() => {
    aktifRef.current = true;
    void muat();
    return () => {
      aktifRef.current = false;
      requestRef.current?.abort();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      aturStatusRealtime('menghubungkan');
    };
  }, [muat]);

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) {
      ubahKoneksi('terputus');
      return;
    }
    let batal = false;
    muatKlienRealtime(supabaseUrl, supabaseKey).then(
      (baru) => {
        if (!batal) setKlien(baru);
      },
      () => {
        if (!batal) ubahKoneksi('terputus');
      },
    );
    return () => {
      batal = true;
    };
  }, [supabaseKey, supabaseUrl, ubahKoneksi]);

  useEffect(() => {
    const terputus = () => ubahKoneksi('terputus');
    const kembali = () => ubahKoneksi('menghubungkan');
    window.addEventListener('offline', terputus);
    window.addEventListener('online', kembali);
    return () => {
      window.removeEventListener('offline', terputus);
      window.removeEventListener('online', kembali);
    };
  }, [ubahKoneksi]);

  const departemen = useMemo(() => {
    const unik = new Map<string, string>();
    for (const item of baris) {
      if (item.departemen_id && item.departemen_nama) {
        unik.set(item.departemen_id, item.departemen_nama);
      }
    }
    return [...unik.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id-ID'));
  }, [baris]);

  const barisTersaring = useMemo(
    () =>
      baris.filter(
        (item) =>
          (departemenId === SEMUA || item.departemen_id === departemenId) &&
          (kategori === SEMUA || item.kategori === kategori) &&
          (status === SEMUA || item.status === status),
      ),
    [baris, departemenId, kategori, status],
  );

  const model = useMemo(() => {
    const hasil = transformGanttRows({
      masterRows: barisTersaring,
      scale: skala,
      range: {
        start: geserBulan(hariIni, -3),
        end: akhirBulan(hariIni, 6),
      },
      today: hariIni,
    });

    return {
      ...hasil,
      groups: hasil.groups.map((grup) => ({ ...grup, collapsed: semuaTerlipat })),
    };
  }, [barisTersaring, hariIni, semuaTerlipat, skala]);

  function resetFilter() {
    setDepartemenId(SEMUA);
    setKategori(SEMUA);
    setStatus(SEMUA);
  }

  function ubahPelipatan() {
    setSemuaTerlipat((nilai) => !nilai);
    setVersiPelipatan((nilai) => nilai + 1);
  }

  return (
    <section data-testid="master-gantt" aria-labelledby="master-gantt-title" className="space-y-3">
      {klien ? (
        <LanggananMaster
          klien={klien}
          periodeId={periodeId}
          onPerubahan={() => void muat()}
          onStatus={ubahKoneksi}
        />
      ) : null}
      <span
        data-testid="master-gantt-realtime-status"
        data-state={koneksi}
        className="sr-only"
        role="status"
      >
        Status pembaruan langsung: {koneksi}
      </span>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <CalendarRange className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
              Kalender bersama
            </p>
            <h1 id="master-gantt-title" className="mt-0.5 text-2xl font-semibold text-primary">
              Timeline program kerja HMIF
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-[18px] text-secondary">
              Seluruh proker yang disetujui dan berjalan pada periode aktif.
            </p>
          </div>
        </div>

        {modeDaftarHp ? null : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32 space-y-1">
            <Label htmlFor="master-gantt-skala">Skala</Label>
            <Select
              id="master-gantt-skala"
              data-testid="master-gantt-skala"
              value={skala}
              placeholder={null}
              onChange={(event) => setSkala(event.target.value as GanttScale)}
            >
              {OPSI_SKALA.map((opsi) => (
                <option key={opsi.value} value={opsi.value}>
                  {opsi.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            data-testid="master-gantt-lipat-semua"
            aria-pressed={semuaTerlipat}
            onClick={ubahPelipatan}
          >
            <Layers3 aria-hidden="true" />
            {semuaTerlipat ? 'Bentangkan semua' : 'Lipat semua'}
          </Button>
        </div>
        )}
      </div>

      <KoneksiBanner terputus={koneksi === 'terputus'} />
      {pesanPembaruanError ? (
        <p role="alert" className="text-[12px] text-danger">
          Pembaruan belum dapat dimuat: {pesanPembaruanError}
        </p>
      ) : null}

      <PanelFilterHp jumlahAktif={[departemenId, kategori, status].filter((v) => v !== SEMUA).length}>
      <div
        data-testid="master-gantt-filter"
        className="grid gap-2 rounded-md border border-default bg-panel p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"
      >
        <div className="space-y-1">
          <Label htmlFor="master-gantt-departemen">Departemen</Label>
          <Select
            id="master-gantt-departemen"
            data-testid="master-gantt-departemen"
            value={departemenId}
            placeholder={null}
            onChange={(event) => setDepartemenId(event.target.value)}
          >
            <option value={SEMUA}>Semua departemen</option>
            {departemen.map(([id, nama]) => (
              <option key={id} value={id}>
                {nama}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="master-gantt-kategori">Kategori</Label>
          <Select
            id="master-gantt-kategori"
            data-testid="master-gantt-kategori"
            value={kategori}
            placeholder={null}
            onChange={(event) => setKategori(event.target.value)}
          >
            <option value={SEMUA}>Semua kategori</option>
            <option value="TERJADWAL">Terjadwal</option>
            <option value="BERKALA">Berkala</option>
            <option value="RESPONSIF">Responsif</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="master-gantt-status">Status</Label>
          <Select
            id="master-gantt-status"
            data-testid="master-gantt-status"
            value={status}
            placeholder={null}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value={SEMUA}>Semua status</option>
            {['DISETUJUI', 'BERJALAN'].map((nilai) => (
              <option key={nilai} value={nilai}>
                {labelStatus(nilai)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="ghost"
          disabled={departemenId === SEMUA && kategori === SEMUA && status === SEMUA}
          onClick={resetFilter}
        >
          <RotateCcw aria-hidden="true" />
          Reset filter
        </Button>
      </div>
      </PanelFilterHp>

      {memuat ? (
        <div
          data-testid="master-gantt-loading"
          role="status"
          aria-busy="true"
          className="min-h-72 rounded-md border border-default bg-panel p-4"
        >
          <div className="h-[34px] w-56 rounded-sm bg-muted" />
          <div className="mt-4 h-52 rounded-sm bg-subtle" />
          <span className="sr-only">Memuat Master Gantt…</span>
        </div>
      ) : pesanError ? (
        <div
          data-testid="master-gantt-error"
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-subtle)] p-4 text-[13px] text-danger"
        >
          {pesanError}
        </div>
      ) : (
        <>
          <GanttChart
            key={`${skala}-${departemenId}-${kategori}-${status}-${versiPelipatan}`}
            model={model}
            highlightedTaskIds={highlightedTaskIds}
            maxHeight="calc(100vh - 320px)"
            ariaLabel="Master Gantt program kerja HMIF"
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-6 rounded-xs bg-[var(--primary)]" aria-hidden="true" />
              Masa persiapan
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-1.5 rounded-xs bg-[var(--text-primary)]" aria-hidden="true" />
              Hari-H
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <Filter className="size-3.5" aria-hidden="true" />
              {barisTersaring.length} dari {baris.length} proker
            </span>
          </div>
        </>
      )}
    </section>
  );
}
