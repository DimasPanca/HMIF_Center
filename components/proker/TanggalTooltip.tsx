import type { EntriKalender } from '@/lib/proker/service';
import { formatRentangTanggal } from '@/lib/utils/format-tanggal';

type TanggalTooltipProps = {
  entri: EntriKalender;
};

function geserHari(tanggal: string, jumlah: number): string {
  const [tahun, bulan, hari] = tanggal.split('-').map(Number) as [number, number, number];
  const hasil = new Date(Date.UTC(tahun, bulan - 1, hari + jumlah));
  return hasil.toISOString().slice(0, 10);
}

function rentangPersiapan(entri: EntriKalender): string {
  const akhir = entri.hari_h_mulai ? geserHari(entri.hari_h_mulai, -1) : entri.selesai;
  return formatRentangTanggal(entri.mulai, akhir < entri.mulai ? entri.mulai : akhir);
}

function rentangHariH(entri: EntriKalender): string {
  if (!entri.hari_h_mulai || !entri.hari_h_selesai) return '—';
  return formatRentangTanggal(entri.hari_h_mulai, entri.hari_h_selesai);
}

export function TanggalTooltip({ entri }: TanggalTooltipProps) {
  const baris = [
    ['Program kerja', entri.nama_proker],
    ['Departemen', entri.nama_departemen],
    ['Persiapan', rentangPersiapan(entri)],
    ['Hari-H', rentangHariH(entri)],
    ['Penanggung jawab', entri.penanggung_jawab ?? 'Belum ditetapkan'],
  ] as const;

  return (
    <div
      role="tooltip"
      data-testid="kalender-tooltip"
      className="pointer-events-none absolute top-[calc(100%+6px)] left-1/2 z-30 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border border-strong bg-panel p-3 text-left shadow-lg"
    >
      <dl className="space-y-2">
        {baris.map(([label, nilai]) => (
          <div key={label} data-testid="kalender-tooltip-baris">
            <dt className="text-[10px] font-semibold tracking-wide text-tertiary uppercase">
              {label}
            </dt>
            <dd className="mt-0.5 text-[12px] leading-4 font-medium text-primary">{nilai}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
