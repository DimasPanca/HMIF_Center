/**
 * Tab Ringkasan ruang kerja acara (T-084): angka pokok acara dalam satu layar.
 * Angka anggaran hanya tampil bagi yang berhak membaca RAB (lib/acara/service.ts).
 *
 * Test id: ringkasan-acara, ringkasan-{total-rab|panitia|divisi|nota}.
 */

import { BilahProgres } from '@/components/acara/DivisiCard';
import { Card } from '@/components/ui/card';
import type { RuangAcara } from '@/lib/acara/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';

const LABEL_RAB: Record<string, string> = {
  DRAFT: 'Draft',
  DIAJUKAN: 'Diajukan',
  DISETUJUI: 'Disetujui (terkunci)',
  REALISASI: 'Realisasi',
  SELESAI: 'Selesai',
};

function Angka({ label, nilai, keterangan, testid }: { label: string; nilai: string; keterangan?: string; testid: string }) {
  return (
    <Card className="p-4" data-testid={testid}>
      <p className="text-[12px] text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{nilai}</p>
      {keterangan ? <p className="mt-0.5 text-[12px] text-tertiary">{keterangan}</p> : null}
    </Card>
  );
}

export function RingkasanAcara({ acara }: { acara: RuangAcara }) {
  const r = acara.ringkasan;
  const keteranganRab =
    r.total_rab === null
      ? 'Hanya pimpinan, Kadept PIC, dan panitia acara ini.'
      : [r.status_rab ? `Status ${LABEL_RAB[r.status_rab] ?? r.status_rab}` : null, acara.target_anggaran ? `target ${formatRupiah(acara.target_anggaran)}` : null]
          .filter(Boolean)
          .join(' · ') || undefined;

  return (
    <div className="space-y-4" data-testid="ringkasan-acara">
      {acara.tema ? <p className="text-[14px] text-secondary">{acara.tema}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Angka testid="ringkasan-total-rab" label="Total RAB" nilai={r.total_rab === null ? 'Terbatas' : formatRupiah(r.total_rab)} keterangan={keteranganRab} />
        <Angka testid="ringkasan-panitia" label="Panitia" nilai={`${r.jumlah_panitia} orang`} keterangan="Termasuk ketua pelaksana dan koordinator." />
        <Angka testid="ringkasan-divisi" label="Divisi" nilai={`${acara.divisi.length} divisi`} />
        <Angka
          testid="ringkasan-nota"
          label="Nota"
          nilai={r.nota ? `${r.nota.terverifikasi} terverifikasi` : 'Terbatas'}
          keterangan={r.nota ? `${r.nota.menunggu} menunggu · ${r.nota.ditolak} ditolak` : undefined}
        />
      </div>
      <Card className="p-4">
        <BilahProgres progres={r.progres} label="Progres seluruh divisi" />
      </Card>
    </div>
  );
}
