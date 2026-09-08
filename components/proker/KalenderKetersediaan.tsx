'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, LockKeyhole, Repeat2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { EntriKalender } from '@/lib/proker/service';

import { LegendaKalender } from './LegendaKalender';
import { TanggalTooltip } from './TanggalTooltip';

const NAMA_HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;
const HARI_POLA = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'] as const;

type Bulan = { tahun: number; indeks: number };
type KeadaanTanggal =
  | { jenis: 'terkunci'; entri: EntriKalender }
  | { jenis: 'berkala'; entri: EntriKalender }
  | { jenis: 'tersedia'; entri: null };

type KalenderKetersediaanProps = {
  entriAwal?: EntriKalender[];
  sumber?: string;
  bulanAwal?: string;
  tanggalTerpilih?: string | null;
  onPilihTanggal?: (tanggal: string) => void;
};

type PolaUlang = {
  frekuensi: 'MINGGUAN' | 'BULANAN';
  hari: string[];
  mulai: string;
  selesai: string;
};

const formatBulan = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function bulanSaatIni(): Bulan {
  const hariIni = new Date();
  return { tahun: hariIni.getFullYear(), indeks: hariIni.getMonth() };
}

function bacaBulan(nilai?: string): Bulan {
  const cocok = /^(\d{4})-(\d{2})$/.exec(nilai ?? '');
  if (!cocok) return bulanSaatIni();

  const tahun = Number(cocok[1]);
  const indeks = Number(cocok[2]) - 1;
  return indeks >= 0 && indeks <= 11 ? { tahun, indeks } : bulanSaatIni();
}

function geserBulan(bulan: Bulan, selisih: number): Bulan {
  const tanggal = new Date(Date.UTC(bulan.tahun, bulan.indeks + selisih, 1));
  return { tahun: tanggal.getUTCFullYear(), indeks: tanggal.getUTCMonth() };
}

function keTanggal(tahun: number, bulan: number, hari: number): string {
  return `${tahun}-${String(bulan + 1).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
}

function hariDalamBulan({ tahun, indeks }: Bulan): Array<string | null> {
  const hariPertama = new Date(Date.UTC(tahun, indeks, 1)).getUTCDay();
  const awalanSenin = (hariPertama + 6) % 7;
  const jumlahHari = new Date(Date.UTC(tahun, indeks + 1, 0)).getUTCDate();

  return [
    ...Array.from<null>({ length: awalanSenin }).fill(null),
    ...Array.from({ length: jumlahHari }, (_, indeksHari) =>
      keTanggal(tahun, indeks, indeksHari + 1),
    ),
  ];
}

function polaUlangDari(nilai: unknown): PolaUlang | null {
  if (!nilai || typeof nilai !== 'object') return null;
  const kandidat = nilai as Partial<PolaUlang>;
  if (
    (kandidat.frekuensi !== 'MINGGUAN' && kandidat.frekuensi !== 'BULANAN') ||
    !Array.isArray(kandidat.hari) ||
    typeof kandidat.mulai !== 'string' ||
    typeof kandidat.selesai !== 'string'
  ) {
    return null;
  }
  return kandidat as PolaUlang;
}

function tanggalMemenuhiPola(tanggal: string, entri: EntriKalender): boolean {
  const pola = polaUlangDari(entri.pola_ulang);
  if (!pola || tanggal < pola.mulai || tanggal > pola.selesai) return false;

  const [tahun, bulan, hari] = tanggal.split('-').map(Number) as [number, number, number];
  const namaHari = HARI_POLA[new Date(Date.UTC(tahun, bulan - 1, hari)).getUTCDay()]!;
  return pola.hari.includes(namaHari);
}

function keadaanTanggal(tanggal: string, entri: EntriKalender[]): KeadaanTanggal {
  const terkunci = entri.find(
    (item) => item.jenis === 'TERKUNCI' && tanggal >= item.mulai && tanggal <= item.selesai,
  );
  if (terkunci) return { jenis: 'terkunci', entri: terkunci };

  const berkala = entri.find(
    (item) => item.jenis === 'BERKALA' && tanggalMemenuhiPola(tanggal, item),
  );
  if (berkala) return { jenis: 'berkala', entri: berkala };

  return { jenis: 'tersedia', entri: null };
}

function warnaDepartemen(entri: EntriKalender): string {
  const penanda = `${entri.departemen_id} ${entri.nama_departemen}`.toLocaleLowerCase('id-ID');
  if (penanda.includes('kader')) return 'var(--dept-kaderisasi)';
  if (penanda.includes('minat') || penanda.includes('mikat')) return 'var(--dept-mikat)';
  if (penanda.includes('kominfo')) return 'var(--dept-kominfo)';
  if (penanda.includes('eksternal')) return 'var(--dept-eksternal)';
  if (penanda.includes('internal') || penanda.includes('akademik')) return 'var(--dept-internal)';
  if (penanda.includes('rnd') || penanda.includes('riset')) return 'var(--dept-rnd)';
  return 'var(--primary)';
}

function namaBulan(bulan: Bulan): string {
  return formatBulan.format(new Date(Date.UTC(bulan.tahun, bulan.indeks, 1)));
}

function PanelBulan({
  bulan,
  entri,
  tanggalTerpilih,
  tooltipAktif,
  setTooltipAktif,
  onPilihTanggal,
}: {
  bulan: Bulan;
  entri: EntriKalender[];
  tanggalTerpilih?: string | null;
  tooltipAktif: string | null;
  setTooltipAktif: (tanggal: string | null) => void;
  onPilihTanggal?: (tanggal: string) => void;
}) {
  return (
    <section aria-label={`Kalender ${namaBulan(bulan)}`} className="min-w-[20rem] flex-1">
      <h3 className="mb-3 text-center text-[14px] font-semibold capitalize text-primary">
        {namaBulan(bulan)}
      </h3>
      <div className="grid grid-cols-7 gap-1" aria-hidden="true">
        {NAMA_HARI.map((hari) => (
          <span
            key={hari}
            className="py-1 text-center text-[11px] font-semibold tracking-wide text-tertiary uppercase"
          >
            {hari}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {hariDalamBulan(bulan).map((tanggal, indeks) => {
          if (!tanggal) return <span key={`kosong-${indeks}`} aria-hidden="true" />;

          const keadaan = keadaanTanggal(tanggal, entri);
          const terkunci = keadaan.jenis === 'terkunci';
          const berkala = keadaan.jenis === 'berkala';
          const terpilih = tanggalTerpilih === tanggal;
          const style = terkunci
            ? ({ '--warna-departemen': warnaDepartemen(keadaan.entri) } as CSSProperties)
            : undefined;

          return (
            <div key={tanggal} className="relative" onPointerLeave={() => setTooltipAktif(null)}>
              <button
                type="button"
                data-testid={`kalender-tanggal-${tanggal}`}
                data-keadaan={keadaan.jenis}
                aria-label={`${tanggal}, ${terkunci ? `terkunci oleh ${keadaan.entri.nama_proker}` : berkala ? `kegiatan berkala ${keadaan.entri.nama_proker}` : 'tersedia'}`}
                aria-pressed={terpilih}
                onClick={() => onPilihTanggal?.(tanggal)}
                onPointerEnter={() => setTooltipAktif(terkunci ? tanggal : null)}
                onFocus={() => setTooltipAktif(terkunci ? tanggal : null)}
                onBlur={() => setTooltipAktif(null)}
                style={style}
                className={`flex min-h-14 w-full flex-col items-center justify-center rounded-sm border p-1 text-[12px] tabular-nums outline-none transition-[background-color,border-color,box-shadow] duration-fast focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] motion-reduce:transition-none ${
                  terkunci
                    ? 'border-[var(--warna-departemen)] bg-[color-mix(in_srgb,var(--warna-departemen)_18%,var(--bg-panel))] font-semibold text-primary'
                    : berkala
                      ? 'border-dashed border-[var(--info)] bg-[var(--info-subtle)] text-primary'
                      : 'border-subtle bg-panel text-secondary hover:border-strong hover:bg-subtle'
                } ${terpilih ? 'ring-3 ring-[var(--border-focus)]' : ''}`}
              >
                <span>{Number(tanggal.slice(-2))}</span>
                {terkunci ? (
                  <LockKeyhole
                    className="mt-1 size-3 text-[var(--warna-departemen)]"
                    aria-hidden="true"
                  />
                ) : berkala ? (
                  <Repeat2 className="mt-1 size-3 text-[var(--info)]" aria-hidden="true" />
                ) : null}
              </button>
              {terkunci && tooltipAktif === tanggal ? (
                <TanggalTooltip entri={keadaan.entri} />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function KalenderKetersediaan({
  entriAwal = [],
  sumber,
  bulanAwal,
  tanggalTerpilih,
  onPilihTanggal,
}: KalenderKetersediaanProps) {
  const [entri, setEntri] = useState(entriAwal);
  const [bulan, setBulan] = useState(() => bacaBulan(bulanAwal));
  const [tooltipAktif, setTooltipAktif] = useState<string | null>(null);
  const [sedangMemuat, setSedangMemuat] = useState(Boolean(sumber));
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);
  const sudahMengambil = useRef(false);

  useEffect(() => {
    if (!sumber || sudahMengambil.current) return;
    sudahMengambil.current = true;
    const controller = new AbortController();

    async function ambilKalender() {
      try {
        const response = await fetch(sumber!, { cache: 'no-store', signal: controller.signal });
        const body = (await response.json()) as {
          ok?: boolean;
          data?: unknown;
          error?: { message?: string };
        };
        if (!response.ok || body.ok !== true || !Array.isArray(body.data)) {
          throw new Error(body.error?.message ?? 'Kalender belum dapat dimuat.');
        }
        setEntri(body.data as EntriKalender[]);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPesanGagal(error instanceof Error ? error.message : 'Kalender belum dapat dimuat.');
      } finally {
        if (!controller.signal.aborted) setSedangMemuat(false);
      }
    }

    void ambilKalender();
    return () => controller.abort();
  }, [sumber]);

  const bulanBerikutnya = geserBulan(bulan, 1);

  return (
    <section
      data-testid="kalender-root"
      className="rounded-sm border border-default bg-panel p-4 shadow-sm sm:p-5"
      aria-busy={sedangMemuat}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
            Ketersediaan dua bulan
          </p>
          <h2 data-testid="kalender-bulan" className="mt-0.5 text-lg font-semibold capitalize">
            {namaBulan(bulan)} – {namaBulan(bulanBerikutnya)}
          </h2>
        </div>
        <div className="flex items-center gap-2" aria-label="Navigasi bulan">
          <Button
            variant="secondary"
            data-testid="kalender-bulan-sebelumnya"
            aria-label="Bulan sebelumnya"
            className="w-[34px] px-0"
            onClick={() => setBulan((nilai) => geserBulan(nilai, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            data-testid="kalender-bulan-berikutnya"
            aria-label="Bulan berikutnya"
            className="w-[34px] px-0"
            onClick={() => setBulan((nilai) => geserBulan(nilai, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </header>

      <LegendaKalender />

      {pesanGagal ? (
        <p
          role="alert"
          className="mt-4 rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] text-[var(--danger)]"
        >
          {pesanGagal}
        </p>
      ) : null}

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-[20rem] flex-col gap-6 md:min-w-[41rem] md:flex-row">
          <PanelBulan
            bulan={bulan}
            entri={entri}
            tanggalTerpilih={tanggalTerpilih}
            tooltipAktif={tooltipAktif}
            setTooltipAktif={setTooltipAktif}
            onPilihTanggal={onPilihTanggal}
          />
          <PanelBulan
            bulan={bulanBerikutnya}
            entri={entri}
            tanggalTerpilih={tanggalTerpilih}
            tooltipAktif={tooltipAktif}
            setTooltipAktif={setTooltipAktif}
            onPilihTanggal={onPilihTanggal}
          />
        </div>
      </div>

      {sedangMemuat ? (
        <p role="status" className="mt-3 text-[12px] text-tertiary">
          Memuat ketersediaan tanggal…
        </p>
      ) : null}
    </section>
  );
}

export type { KalenderKetersediaanProps };
