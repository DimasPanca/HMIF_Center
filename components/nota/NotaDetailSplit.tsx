/**
 * Detail nota berdampingan (T-102 kontrak 3): PREVIEW gambar (≤1280px) di
 * kiri, data yang diinput pengunggah di kanan — Bendahara membandingkan tanpa
 * berpindah layar. Unduh = master lewat endpoint berhak, bukan URL langsung.
 */

import { NotaImage } from '@/components/nota/NotaImage';
import { Card } from '@/components/ui/card';
import type { DetailNota } from '@/lib/nota/verifikasi';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPanjang } from '@/lib/utils/format-tanggal';

export function NotaDetailSplit({ nota, aksi }: { nota: DetailNota; aksi: React.ReactNode }) {
  const seimbang = nota.total_alokasi === nota.total_nota;
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-testid="nota-detail" data-nota-id={nota.id}>
      <Card className="p-3">
        <a
          href={nota.gambar.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Buka pratinjau penuh"
          className="block"
        >
          <NotaImage gambar={nota.gambar} varian="preview" tombolUnduh={false} />
        </a>
        <a
          href={`/api/images/${nota.gambar.id}/download`}
          className="mt-2 inline-flex text-[13px] font-medium text-[var(--primary)] hover:underline"
          data-testid="nota-unduh-master"
        >
          Unduh berkas asli (master)
        </a>
      </Card>
      <Card className="space-y-3 p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <dt className="text-secondary">Acara · Divisi</dt>
            <dd className="font-medium">
              {nota.acara} · {nota.divisi}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">Pengunggah</dt>
            <dd className="font-medium">{nota.pengunggah}</dd>
          </div>
          <div>
            <dt className="text-secondary">Tanggal belanja</dt>
            <dd className="font-medium">{formatTanggalPanjang(nota.tanggal_belanja)}</dd>
          </div>
          <div>
            <dt className="text-secondary">Total nota</dt>
            <dd className="text-[16px] font-semibold tabular-nums" data-testid="nota-detail-total">
              {formatRupiah(nota.total_nota)}
            </dd>
          </div>
        </dl>
        {nota.keterangan ? (
          <p className="text-[13px] text-secondary">Keterangan: {nota.keterangan}</p>
        ) : null}
        <table className="w-full text-[13px]" data-testid="nota-detail-alokasi">
          <thead>
            <tr className="border-b border-default text-left text-secondary">
              <th className="py-1 font-medium">Alokasi</th>
              <th className="py-1 font-medium">Aktual</th>
              <th className="py-1 text-right font-medium">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {nota.alokasi.map((a) => (
              <tr key={a.id} className="border-b border-default align-top">
                <td className="py-1">
                  {a.item ? (
                    <>
                      {a.item.jenis_barang}
                      <span className="block text-[11px] text-tertiary">
                        {a.item.section} · RAB {a.item.jumlah_teks} ×{' '}
                        {formatRupiah(a.item.harga_satuan)} = {formatRupiah(a.item.total_rab)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="rounded-sm bg-[var(--warning-subtle)] px-1 text-[11px]">
                        Di luar RAB
                      </span>{' '}
                      {a.uraian_luar_rab}
                    </>
                  )}
                </td>
                <td className="py-1 tabular-nums text-secondary">
                  {a.jumlah_aktual !== null ? a.jumlah_aktual.toLocaleString('id-ID') : '–'}
                  {a.harga_aktual !== null ? ` × ${formatRupiah(a.harga_aktual)}` : ''}
                </td>
                <td className="py-1 text-right tabular-nums">{formatRupiah(a.nominal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="py-1 text-left" colSpan={2}>
                Total alokasi
              </th>
              <td
                className={cn(
                  'py-1 text-right font-semibold tabular-nums',
                  !seimbang && 'text-danger',
                )}
                data-testid="nota-detail-total-alokasi"
                data-seimbang={seimbang ? '1' : '0'}
              >
                {formatRupiah(nota.total_alokasi)}
              </td>
            </tr>
          </tfoot>
        </table>
        {!seimbang ? (
          <p role="alert" className="text-[12px] text-danger">
            Alokasi tidak sama dengan total nota (selisih{' '}
            {formatRupiah(Math.abs(nota.total_alokasi - nota.total_nota))}) — nota ini tidak dapat
            disetujui.
          </p>
        ) : null}
        {aksi}
      </Card>
    </div>
  );
}
