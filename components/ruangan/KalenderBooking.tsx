'use client';

/**
 * Kalender booking ruangan (T-108, PRD F-14.2): kisi bulan + agenda bulan itu.
 *
 * Kisi hanya memberi gambaran kepadatan; seluruh detail dan aksi ada di agenda,
 * yang juga satu-satunya tampilan di layar sempit. Memilih tanggal di kisi
 * menyaring agenda dan menjadi tanggal awal form peminjaman.
 *
 * Test id: kalender-booking, kalender-bulan, kalender-sebelum, kalender-sesudah,
 * kalender-hari-{YYYY-MM-DD}, booking-catat, booking-item, booking-surat,
 * booking-nomor-surat, booking-hapus.
 */

import { CalendarPlus, ChevronLeft, ChevronRight, FileSignature, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { FormPeminjaman } from '@/components/ruangan/FormPeminjaman';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ToastProvider, useToast } from '@/components/ui/toast';
import type { BarisBooking, BarisRuangan } from '@/lib/ruangan/service';
import { cn } from '@/lib/utils';
import { formatTanggalPanjang, tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

const NAMA_HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const NAMA_BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const LABEL_STATUS: Record<string, string> = {
  DRAFT: 'Draft surat',
  MENUNGGU_APPROVAL: 'Surat menunggu approval',
  DISETUJUI: 'Surat disetujui',
  DITOLAK: 'Surat ditolak',
};

function geserBulan(bulan: string, n: number): string {
  const [y, m] = bulan.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Sel kisi Senin-awal; null = sel kosong sebelum tanggal 1 / sesudah akhir bulan. */
function selBulan(bulan: string): (string | null)[] {
  const [y, m] = bulan.split('-').map(Number) as [number, number];
  const jumlah = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const geser = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const sel: (string | null)[] = Array.from({ length: geser }, () => null);
  for (let d = 1; d <= jumlah; d++) sel.push(`${bulan}-${String(d).padStart(2, '0')}`);
  while (sel.length % 7) sel.push(null);
  return sel;
}

function Kalender({
  bulan,
  booking,
  ruangan,
  izin,
}: {
  bulan: string;
  booking: BarisBooking[];
  ruangan: BarisRuangan[];
  izin: { userId: string; catat: boolean; hapus: boolean; kelola: boolean; buatSurat: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [pilih, setPilih] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(false);
  const [sibuk, setSibuk] = React.useState<string | null>(null);
  const hariIni = tanggalHariIniJakarta();

  const perTanggal = React.useMemo(() => {
    const m = new Map<string, BarisBooking[]>();
    for (const b of booking) m.set(b.tanggal, [...(m.get(b.tanggal) ?? []), b]);
    return m;
  }, [booking]);

  const agenda = pilih ? (perTanggal.get(pilih) ?? []) : booking;
  const [y, mo] = bulan.split('-').map(Number) as [number, number];
  const pindah = (n: number) => {
    setPilih(null);
    router.push(`${pathname}?bulan=${geserBulan(bulan, n)}`);
  };

  const bolehSurat = (b: BarisBooking) => izin.buatSurat && (b.dibuat_oleh === izin.userId || izin.kelola);

  async function bukaSurat(id: string) {
    setSibuk(id);
    try {
      const r = await fetch(`/api/ruangan/booking/${id}/surat`, { method: 'POST' });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; data?: { tujuan: string }; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok || !isi.data) {
        toast.error({ description: isi?.error?.message ?? 'Surat tidak dapat dibuat.', suggestion: 'Muat ulang halaman lalu coba lagi.' });
        return;
      }
      router.push(isi.data.tujuan);
    } catch {
      toast.error({ description: 'Tidak dapat menghubungi server.', suggestion: 'Periksa koneksi lalu coba lagi.' });
    } finally {
      setSibuk(null);
    }
  }

  const [akanDihapus, setAkanDihapus] = React.useState<BarisBooking | null>(null);

  async function hapus(b: BarisBooking) {
    setAkanDihapus(null);
    setSibuk(b.id);
    try {
      const r = await fetch(`/api/ruangan/booking/${b.id}`, { method: 'DELETE' });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok) {
        toast.error({ description: isi?.error?.message ?? 'Peminjaman gagal dihapus.', suggestion: 'Muat ulang halaman lalu coba lagi.' });
        return;
      }
      toast.success({ description: 'Peminjaman dihapus.' });
      router.refresh();
    } finally {
      setSibuk(null);
    }
  }

  return (
    <Card className="p-4" data-testid="kalender-booking">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" aria-label="Bulan sebelumnya" onClick={() => pindah(-1)} data-testid="kalender-sebelum">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h2 className="min-w-36 text-center text-[15px] font-semibold capitalize" data-testid="kalender-bulan">
            {NAMA_BULAN.format(new Date(Date.UTC(y, mo - 1, 1)))}
          </h2>
          <Button variant="ghost" aria-label="Bulan berikutnya" onClick={() => pindah(1)} data-testid="kalender-sesudah">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {izin.catat ? (
          <Button onClick={() => setForm(true)} disabled={ruangan.length === 0} data-testid="booking-catat">
            <CalendarPlus aria-hidden="true" /> Catat peminjaman
          </Button>
        ) : null}
      </div>

      <div role="grid" aria-label="Kalender booking" className="mt-3 hidden grid-cols-7 gap-px overflow-hidden rounded-sm border border-default bg-[var(--border-default)] sm:grid">
        {NAMA_HARI.map((h) => (
          <div key={h} role="columnheader" className="bg-subtle px-2 py-1 text-[11px] font-semibold text-tertiary uppercase">
            {h}
          </div>
        ))}
        {selBulan(bulan).map((t, i) => {
          const isi = t ? (perTanggal.get(t) ?? []) : [];
          return t ? (
            <button
              key={t}
              type="button"
              role="gridcell"
              aria-selected={pilih === t}
              aria-label={`${formatTanggalPanjang(t)}, ${isi.length} peminjaman`}
              onClick={() => setPilih((p) => (p === t ? null : t))}
              data-testid={`kalender-hari-${t}`}
              className={cn(
                'min-h-20 bg-panel p-1.5 text-left align-top outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-inset',
                pilih === t && 'bg-[var(--primary-subtle)] hover:bg-[var(--primary-subtle)]',
              )}
            >
              <span className={cn('text-[12px] tabular-nums', t === hariIni ? 'font-bold text-[var(--primary)]' : 'text-secondary')}>{Number(t.slice(8))}</span>
              <span className="mt-1 grid gap-0.5">
                {isi.slice(0, 2).map((b) => (
                  <span key={b.id} className="truncate rounded-[2px] bg-[var(--info-subtle)] px-1 text-[11px] leading-4">
                    {b.kegiatan}
                  </span>
                ))}
                {isi.length > 2 ? <span className="text-[11px] text-tertiary">+{isi.length - 2} lagi</span> : null}
              </span>
            </button>
          ) : (
            <div key={`kosong-${i}`} className="bg-app" aria-hidden="true" />
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{pilih ? formatTanggalPanjang(pilih) : 'Semua peminjaman bulan ini'}</h3>
        {pilih ? (
          <Button variant="ghost" onClick={() => setPilih(null)}>
            Tampilkan semua
          </Button>
        ) : null}
      </div>

      {agenda.length === 0 ? (
        <p className="mt-2 text-[13px] text-secondary">Belum ada peminjaman tercatat.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {agenda.map((b) => (
            <li key={b.id} data-testid="booking-item" className="rounded-sm border border-default p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">{b.kegiatan}</p>
                  <p className="mt-0.5 text-[13px] text-secondary">
                    {b.nama_ruangan} · {formatTanggalPanjang(b.tanggal)} · {b.label_waktu}
                    {b.jumlah_peserta ? ` · ${b.jumlah_peserta} peserta` : ''}
                  </p>
                  {b.keperluan ? <p className="mt-0.5 text-[12px] text-tertiary">{b.keperluan}</p> : null}
                  <p className="mt-0.5 text-[12px] text-tertiary">Dicatat {b.nama_pembuat}</p>
                  {b.surat ? (
                    <p className="mt-1.5">
                      {b.surat.nomor_lengkap ? (
                        <Badge tone="success" data-testid="booking-nomor-surat">
                          Surat {b.surat.nomor_lengkap}
                        </Badge>
                      ) : (
                        <Badge tone="info">{LABEL_STATUS[b.surat.status] ?? b.surat.status}</Badge>
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {bolehSurat(b) ? (
                    <Button variant="secondary" loading={sibuk === b.id} onClick={() => void bukaSurat(b.id)} data-testid="booking-surat">
                      <FileSignature aria-hidden="true" /> {b.surat ? 'Buka surat' : 'Buat Surat Peminjaman Ruangan'}
                    </Button>
                  ) : null}
                  {izin.hapus ? (
                    <Button variant="ghost" aria-label={`Hapus peminjaman ${b.kegiatan}`} disabled={sibuk === b.id} onClick={() => setAkanDihapus(b)} data-testid="booking-hapus">
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        level="simple"
        open={akanDihapus !== null}
        onOpenChange={(buka) => !buka && setAkanDihapus(null)}
        title={`Hapus peminjaman ${akanDihapus?.kegiatan ?? ''}?`}
        description="Jadwal ini hilang dari kalender. Surat yang sudah dibuat darinya tetap tersimpan di arsip surat."
        confirmLabel="Hapus"
        confirmVariant="danger"
        onConfirm={() => {
          if (akanDihapus) void hapus(akanDihapus);
        }}
      />

      <FormPeminjaman
        open={form}
        onOpenChange={setForm}
        ruangan={ruangan}
        tanggalAwal={pilih ?? (hariIni.startsWith(bulan) ? hariIni : `${bulan}-01`)}
        bolehSurat={izin.buatSurat}
        onTersimpan={() => router.refresh()}
        onBuatSurat={bukaSurat}
      />
    </Card>
  );
}

export function KalenderBooking(props: React.ComponentProps<typeof Kalender>) {
  return (
    <ToastProvider>
      <Kalender {...props} />
    </ToastProvider>
  );
}
