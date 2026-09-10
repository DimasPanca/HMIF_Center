'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatRentangTanggal } from '@/lib/utils/format-tanggal';

export interface KonflikApprovalView {
  proker: string;
  departemen: string;
  mulai: string;
  selesai: string;
}

interface ApprovalActionsProps {
  konflikAwal: KonflikApprovalView[];
  prokerId: string;
}

interface ResponsApi {
  ok: boolean;
  data?: { status?: string; locked?: boolean };
  error?: { code?: string; message?: string; details?: unknown };
}

type Aksi = 'approve' | 'reject' | 'revisi';

function konflikValid(nilai: unknown): KonflikApprovalView[] {
  if (!Array.isArray(nilai)) return [];
  return nilai.filter((item): item is KonflikApprovalView => {
    if (typeof item !== 'object' || item === null) return false;
    return (
      'proker' in item &&
      typeof item.proker === 'string' &&
      'departemen' in item &&
      typeof item.departemen === 'string' &&
      'mulai' in item &&
      typeof item.mulai === 'string' &&
      'selesai' in item &&
      typeof item.selesai === 'string'
    );
  });
}

function PanelKonflik({ konflik }: { konflik: KonflikApprovalView[] }) {
  if (konflik.length === 0) return null;

  return (
    <InlineAlert
      data-testid="approval-konflik"
      title="Konflik jadwal terdeteksi"
      detail={
        <ul className="space-y-2">
          {konflik.map((item, indeks) => (
            <li key={`${item.proker}-${item.mulai}-${indeks}`}>
              <p className="font-semibold text-primary">{item.proker}</p>
              <p className="text-secondary">
                {item.departemen} · {formatRentangTanggal(item.mulai, item.selesai)}
              </p>
            </li>
          ))}
        </ul>
      }
      suggestion="Proker ini perlu direvisi. Kalender dan kepanitiaan tidak dibentuk."
    />
  );
}

export function ApprovalActions({ konflikAwal, prokerId }: ApprovalActionsProps) {
  const router = useRouter();
  const [alasan, setAlasan] = useState('');
  const [aksiAktif, setAksiAktif] = useState<Aksi | null>(null);
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [pesanSukses, setPesanSukses] = useState<string | null>(null);
  const [konflik, setKonflik] = useState(konflikAwal);
  const timerKembali = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerKembali.current) clearTimeout(timerKembali.current);
    },
    [],
  );

  async function kirimAksi(aksi: Aksi) {
    const butuhAlasan = aksi === 'reject' || aksi === 'revisi';
    if (butuhAlasan && !alasan.trim()) {
      setPesanError(
        aksi === 'reject' ? 'Alasan penolakan wajib diisi.' : 'Catatan revisi wajib diisi.',
      );
      return;
    }

    setAksiAktif(aksi);
    setPesanError(null);
    setPesanSukses(null);

    try {
      const response = await fetch(`/api/proker/${prokerId}/${aksi}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:
          aksi === 'approve'
            ? undefined
            : JSON.stringify(aksi === 'reject' ? { alasan } : { catatan: alasan }),
      });
      const body = (await response.json().catch(() => null)) as ResponsApi | null;

      if (!response.ok || body?.ok !== true) {
        if (body?.error?.code === 'KONFLIK') {
          setKonflik(konflikValid(body.error.details));
        }
        throw new Error(body?.error?.message ?? 'Keputusan belum dapat disimpan.');
      }

      setKonflik([]);
      setPesanSukses(
        aksi === 'approve'
          ? body.data?.locked
            ? 'Proker disetujui. Kalender terkunci dan ruang kerja kepanitiaan telah dibentuk.'
            : 'Proker disetujui tanpa mengunci kalender.'
          : aksi === 'reject'
            ? 'Proker ditolak dan telah dikeluarkan dari antrian.'
            : 'Permintaan revisi berhasil dikirim kepada pengusul.',
      );
      timerKembali.current = setTimeout(() => {
        router.push('/proker/approval');
        router.refresh();
      }, 1800);
    } catch (error) {
      setPesanError(error instanceof Error ? error.message : 'Keputusan belum dapat disimpan.');
    } finally {
      setAksiAktif(null);
    }
  }

  return (
    <section aria-labelledby="judul-keputusan" className="space-y-4">
      <header>
        <h2 id="judul-keputusan" className="text-[16px] font-semibold text-primary">
          Keputusan approval
        </h2>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">
          Persetujuan menjalankan pemeriksaan konflik final. Penolakan dan permintaan revisi
          harus disertai alasan.
        </p>
      </header>

      <PanelKonflik konflik={konflik} />

      {pesanError ? (
        <div
          role="alert"
          className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] text-danger"
        >
          {pesanError}
        </div>
      ) : null}

      {pesanSukses ? (
        <div
          data-testid="approval-sukses"
          role="status"
          className="flex items-start gap-2.5 rounded-sm border border-[var(--success)] bg-[var(--success-subtle)] p-3 text-[var(--success)]"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold">Keputusan berhasil disimpan.</p>
            <p className="mt-0.5 text-[12px] leading-4">{pesanSukses}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="approval-alasan" required>
          Alasan penolakan atau catatan revisi
        </Label>
        <Textarea
          id="approval-alasan"
          data-testid="approval-alasan"
          value={alasan}
          maxLength={2000}
          disabled={Boolean(aksiAktif) || Boolean(pesanSukses)}
          placeholder="Tuliskan alasan yang jelas untuk pengusul proker"
          helperText="Wajib untuk Tolak dan Minta Revisi; tidak digunakan saat Setujui."
          onChange={(event) => setAlasan(event.target.value)}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-subtle pt-4 sm:flex-row sm:justify-end">
        <Button
          data-testid="approval-tolak"
          variant="danger"
          disabled={!alasan.trim() || Boolean(aksiAktif) || Boolean(pesanSukses)}
          loading={aksiAktif === 'reject'}
          onClick={() => void kirimAksi('reject')}
        >
          <XCircle aria-hidden="true" />
          Tolak
        </Button>
        <Button
          data-testid="approval-revisi"
          variant="secondary"
          disabled={!alasan.trim() || Boolean(aksiAktif) || Boolean(pesanSukses)}
          loading={aksiAktif === 'revisi'}
          onClick={() => void kirimAksi('revisi')}
        >
          <RotateCcw aria-hidden="true" />
          Minta revisi
        </Button>
        <Button
          data-testid="approval-setujui"
          disabled={Boolean(aksiAktif) || Boolean(pesanSukses)}
          loading={aksiAktif === 'approve'}
          onClick={() => void kirimAksi('approve')}
        >
          <ShieldCheck aria-hidden="true" />
          Setujui
        </Button>
      </div>
    </section>
  );
}
