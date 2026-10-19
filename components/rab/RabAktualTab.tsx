/**
 * Tab RAB Aktual (T-103 kontrak 6): rencana vs realisasi per item
 * berdampingan dengan penanda selisih, lalu buku PENGELUARAN dengan saldo
 * berjalan. Semua angka dihitung ulang penuh dari nota TERVERIFIKASI
 * (lib/rab/realisasi.ts) — tidak ada angka tersimpan yang bisa basi.
 */

import { BatalkanVerifikasi } from '@/components/rab/BatalkanVerifikasi';
import { Card } from '@/components/ui/card';
import { LabelKolomOtomatis } from '@/components/ui/table-label';
import type { PenandaSelisih } from '@/lib/rab/realisasi';
import type { DataRabAktual } from '@/lib/rab/service';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

const LABEL: Record<PenandaSelisih, { teks: string; kelas: string }> = {
  BELUM: { teks: 'Belum', kelas: 'bg-subtle text-secondary' },
  SESUAI: { teks: 'Sesuai', kelas: 'bg-[var(--success-subtle)] text-success' },
  HEMAT: { teks: 'Hemat', kelas: 'bg-[var(--info-subtle)] text-[var(--info)]' },
  LEBIH: { teks: 'Lebih', kelas: 'bg-[var(--danger-subtle)] text-danger' },
};

export function RabAktualTab({
  data,
  bolehBatal = false,
}: {
  data: DataRabAktual;
  bolehBatal?: boolean;
}) {
  const sisaRencana = data.total_rencana - data.total_realisasi_item;
  return (
    <section aria-labelledby="rab-aktual-judul" className="space-y-4" data-testid="rab-aktual">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rab-aktual-judul" className="text-[15px] font-semibold">
            RAB Aktual
          </h2>
          <p className="text-[13px] text-secondary">
            Rencana {formatRupiah(data.total_rencana)} · Realisasi item{' '}
            <span className="font-semibold tabular-nums" data-testid="rab-aktual-total">
              {formatRupiah(data.total_realisasi_item)}
            </span>{' '}
            ·{' '}
            {sisaRencana >= 0
              ? `sisa ${formatRupiah(sisaRencana)}`
              : `lebih ${formatRupiah(-sisaRencana)}`}
            {data.luar_rab ? ` · di luar RAB ${formatRupiah(data.luar_rab)}` : ''}
          </p>
        </div>
        <div data-kartu-hp="" className="md:overflow-x-auto">
          <LabelKolomOtomatis />
          <table className="w-full text-[13px] md:min-w-[36rem]">
            <thead>
              <tr className="border-b border-default text-left text-secondary">
                <th className="py-1 font-medium">Item</th>
                <th className="py-1 text-right font-medium">Rencana</th>
                <th className="py-1 text-right font-medium">Realisasi</th>
                <th className="py-1 text-right font-medium">Selisih</th>
                <th className="py-1 pl-2 font-medium">Status</th>
              </tr>
            </thead>
            {data.divisi.map((d) => (
              <tbody key={d.id}>
                <tr className="bg-subtle">
                  <th colSpan={5} className="px-1 py-1 text-left font-semibold">
                    {d.nama}{' '}
                    <span className="font-normal text-secondary tabular-nums">
                      · {formatRupiah(d.realisasi)} dari {formatRupiah(d.rencana)}
                    </span>
                  </th>
                </tr>
                {d.items.map((i) => (
                  <tr
                    key={i.id}
                    className="border-b border-default"
                    data-testid="rab-aktual-item"
                    data-penanda={i.penanda}
                    data-item-id={i.id}
                  >
                    <td className="py-1">
                      {i.jenis_barang}{' '}
                      <span className="text-[11px] text-tertiary">· {i.section}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums">{formatRupiah(i.rencana)}</td>
                    <td className="py-1 text-right tabular-nums" data-testid="rab-aktual-realisasi">
                      {formatRupiah(i.realisasi)}
                    </td>
                    <td
                      className={cn(
                        'py-1 text-right tabular-nums',
                        i.realisasi > i.rencana && 'text-danger',
                      )}
                    >
                      {i.realisasi ? formatRupiah(i.realisasi - i.rencana) : '–'}
                    </td>
                    <td className="py-1 pl-2">
                      <span
                        className={cn(
                          'rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
                          LABEL[i.penanda].kelas,
                        )}
                      >
                        {LABEL[i.penanda].teks}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-semibold">Pengeluaran</h3>
          <p className="text-[13px] text-secondary tabular-nums">
            Saldo awal {formatRupiah(data.buku.saldo_awal)} · keluar{' '}
            {formatRupiah(data.buku.total_pengeluaran)} · sisa{' '}
            <span className="font-semibold" data-testid="rab-aktual-sisa">
              {formatRupiah(data.buku.sisa)}
            </span>
          </p>
        </div>
        {data.buku.baris.length ? (
          <div data-kartu-hp="" className="md:overflow-x-auto">
            <LabelKolomOtomatis />
            <table className="w-full text-[13px] md:min-w-[36rem]" data-testid="rab-pengeluaran">
              <thead>
                <tr className="border-b border-default text-left text-secondary">
                  <th className="py-1 font-medium">No</th>
                  <th className="py-1 font-medium">Tanggal</th>
                  <th className="py-1 font-medium">Uraian</th>
                  <th className="py-1 font-medium">Divisi</th>
                  <th className="py-1 text-right font-medium">Pengeluaran</th>
                  <th className="py-1 text-right font-medium">Saldo</th>
                  {bolehBatal ? <th className="py-1" aria-label="Aksi" /> : null}
                </tr>
              </thead>
              <tbody>
                {data.buku.baris.map((b) => (
                  <tr
                    key={`${b.nota_id}-${b.no}`}
                    className={cn(
                      'border-b border-default',
                      b.luar_rab && 'bg-[var(--warning-subtle)]',
                    )}
                    data-testid="rab-pengeluaran-baris"
                    data-luar-rab={b.luar_rab ? '1' : '0'}
                  >
                    <td className="py-1 tabular-nums">{b.no}</td>
                    <td className="py-1">{formatTanggalPendek(b.tanggal)}</td>
                    <td className="py-1">{b.uraian}</td>
                    <td className="py-1 text-secondary">{b.divisi}</td>
                    <td className="py-1 text-right tabular-nums">{formatRupiah(b.nominal)}</td>
                    <td
                      className="py-1 text-right tabular-nums"
                      data-testid="rab-pengeluaran-saldo"
                    >
                      {formatRupiah(b.saldo)}
                    </td>
                    {bolehBatal ? (
                      <td className="py-1 text-right">
                        {/* Satu tombol per nota (baris pertama nota itu). */}
                        {data.buku.baris.find((x) => x.nota_id === b.nota_id) === b ? (
                          <BatalkanVerifikasi notaId={b.nota_id} />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-secondary">Belum ada nota terverifikasi.</p>
        )}
      </Card>
    </section>
  );
}
