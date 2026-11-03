/**
 * Tab Ikhtisar ruang kerja acara (T-084, ADR-039). Urutan mengikuti pertanyaan
 * pengguna saat membuka acara:
 *   1. "Apa yang harus dikerjakan berikutnya?" → jalur dokumen.
 *   2. "Apa tugas saya?" → kartu kanban yang ditugaskan ke saya (panitia saja).
 *   3. "Bagaimana keadaannya?" → angka pokok + form yang sedang dibuka.
 * Angka anggaran hanya tampil bagi yang berhak membaca RAB (lib/acara/service.ts).
 *
 * Test id: ringkasan-acara, ringkasan-{total-rab|panitia|divisi|nota}, tugas-saya, ikhtisar-form.
 */

import { ClipboardList, ListChecks } from 'lucide-react';
import Link from 'next/link';

import { BilahProgres } from '@/components/acara/DivisiCard';
import { JalurDokumen } from '@/components/acara/JalurDokumen';
import { Card } from '@/components/ui/card';
import type { IdLangkah, LangkahJalur, TugasSaya } from '@/lib/acara/jalur';
import type { RuangAcara } from '@/lib/acara/service';
import type { RingkasForm } from '@/lib/form/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

const LABEL_RAB: Record<string, string> = {
  DRAFT: 'Draft',
  DIAJUKAN: 'Diajukan',
  DISETUJUI: 'Disetujui (terkunci)',
  REALISASI: 'Realisasi',
  SELESAI: 'Selesai',
};

const LABEL_KOLOM: Record<TugasSaya['kolom'], string> = { TODO: 'Belum mulai', IN_PROGRESS: 'Dikerjakan', REVIEW: 'Ditinjau' };

function Angka({ label, nilai, keterangan, testid }: { label: string; nilai: string; keterangan?: string; testid: string }) {
  return (
    <div className="min-w-0 rounded-sm bg-subtle p-3" data-testid={testid}>
      <p className="text-[12px] text-secondary">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{nilai}</p>
      {keterangan ? <p className="mt-0.5 text-[12px] text-tertiary">{keterangan}</p> : null}
    </div>
  );
}

function DaftarTugas({ acaraId, tugas, hariIni }: { acaraId: string; tugas: TugasSaya[]; hariIni: string }) {
  return (
    <Card className="p-4" data-testid="tugas-saya">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <ListChecks aria-hidden="true" className="size-4 text-tertiary" /> Tugas saya
      </h2>
      {tugas.length === 0 ? (
        <p className="mt-2 text-[13px] text-secondary">
          Tidak ada kartu yang ditugaskan kepada Anda dan belum selesai.{' '}
          <Link href={`/acara/${acaraId}?tab=divisi`} className="text-[var(--text-link)] hover:underline">
            Lihat divisi
          </Link>
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
          {tugas.map((t) => {
            const telat = !!t.deadline && t.deadline < hariIni;
            return (
              <li key={t.id}>
                <Link
                  href={`/acara/${acaraId}/divisi/${t.divisi.id}`}
                  className="flex items-start justify-between gap-3 py-2 hover:bg-subtle focus-visible:outline-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{t.judul}</span>
                    <span className="block text-[12px] text-secondary">
                      Divisi {t.divisi.nama} · {LABEL_KOLOM[t.kolom]}
                    </span>
                  </span>
                  <span className={telat ? 'shrink-0 text-[12px] font-medium text-[var(--danger)]' : 'shrink-0 text-[12px] text-secondary'}>
                    {t.deadline ? `${telat ? 'Lewat · ' : ''}${formatTanggalPendek(t.deadline)}` : 'Tanpa tenggat'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function RingkasanAcara({
  acara,
  jalur,
  tugas,
  formAktif,
  hariIni,
}: {
  acara: RuangAcara;
  jalur: { langkah: LangkahJalur[]; berikutnya: IdLangkah | null };
  /** null = pengguna bukan panitia acara ini. */
  tugas: TugasSaya[] | null;
  /** null = pengguna tidak dapat membaca form. */
  formAktif: RingkasForm[] | null;
  hariIni: string;
}) {
  const r = acara.ringkasan;
  const keteranganRab =
    r.total_rab === null
      ? 'Hanya pimpinan, Kadept PIC, dan panitia acara ini.'
      : [r.status_rab ? `Status ${LABEL_RAB[r.status_rab] ?? r.status_rab}` : null, acara.target_anggaran ? `target ${formatRupiah(acara.target_anggaran)}` : null]
          .filter(Boolean)
          .join(' · ') || undefined;

  const lebar = !tugas && !formAktif?.length;
  const keadaan = (
    <Card className="space-y-3 p-4">
      <h2 className="text-[15px] font-semibold">Keadaan acara</h2>
      <div className={lebar ? 'grid grid-cols-2 gap-2 lg:grid-cols-4' : 'grid grid-cols-2 gap-2'}>
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
      <BilahProgres progres={r.progres} label="Progres seluruh divisi" />
    </Card>
  );

  const form =
    formAktif && formAktif.length ? (
      <Card className="p-4" data-testid="ikhtisar-form">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <ClipboardList aria-hidden="true" className="size-4 text-tertiary" /> Form sedang dibuka
        </h2>
        <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
          {formAktif.map((f) => (
            <li key={f.id}>
              <Link href={f.boleh_kelola ? `/form/${f.id}/respons` : `/f/${f.token}`} className="flex items-center justify-between gap-3 py-2 hover:bg-subtle">
                <span className="truncate text-[14px] font-medium">{f.judul}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-secondary">
                  {f.jumlah_respons}
                  {f.kuota ? `/${f.kuota}` : ''} respons
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    ) : null;

  return (
    <div className="space-y-4" data-testid="ringkasan-acara">
      <JalurDokumen langkah={jalur.langkah} berikutnya={jalur.berikutnya} dibatalkan={acara.status === 'DIBATALKAN'} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {tugas ? (
          <div className="space-y-4">
            <DaftarTugas acaraId={acara.id} tugas={tugas} hariIni={hariIni} />
            {form}
          </div>
        ) : form ? (
          <div className="space-y-4">{form}</div>
        ) : null}
        <div className={tugas || form ? '' : 'lg:col-span-2'}>{keadaan}</div>
      </div>
    </div>
  );
}
