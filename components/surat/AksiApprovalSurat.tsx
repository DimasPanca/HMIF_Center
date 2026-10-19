'use client';

/**
 * AksiApprovalSurat — Setujui atau Tolak satu surat (T-060).
 *
 * Penolakan wajib beralasan; tombol kirim nonaktif selama alasannya kosong,
 * dan server menolaknya juga (kontrak butir 4). Persetujuan menampilkan nomor
 * final. Bila dokumen belum dapat di-generate, peringatannya ditampilkan apa
 * adanya: nomor sudah sah dan surat dapat diterbitkan ulang.
 */

import { CheckCircle2, Download, RotateCcw, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { NomorSuratBadge } from '@/components/surat/NomorSuratBadge';
import { Button, buttonVariants } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToastProvider } from '@/components/ui/toast';

interface Respons {
  ok: boolean;
  data?: { nomor?: string; status?: string; peringatan?: string | null; pdf?: boolean };
  error?: { message?: string };
}

async function kirim(url: string, body: unknown): Promise<Respons> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return ((await res.json().catch(() => null)) as Respons | null) ?? { ok: false, error: { message: `Server menjawab ${res.status}.` } };
}

export interface AksiApprovalSuratProps {
  suratId: string;
  /**
   * DISETUJUI = sudah bernomor, gagal terbit: hanya tombol terbitkan ulang.
   * TERBIT = baru saja diterbitkan dari antrian ini; hasilnya tetap tampil
   * setelah halaman disegarkan (surat sudah keluar dari antrian).
   */
  status: 'MENUNGGU_APPROVAL' | 'DISETUJUI' | 'TERBIT';
  /** Nomor final; dipakai untuk status TERBIT. */
  nomor?: string | null;
}

function Aksi({ suratId, status, nomor }: AksiApprovalSuratProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'awal' | 'tolak'>('awal');
  const [alasan, setAlasan] = React.useState('');
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [hasil, setHasil] = React.useState<{ nomor: string; status: string; peringatan: string | null; pdf: boolean } | null>(
    status === 'TERBIT' && nomor ? { nomor, status, peringatan: null, pdf: false } : null,
  );

  async function setujui(terbitkanUlang = false) {
    setProses(true);
    setGalat(null);
    const r = await kirim(`/api/surat/${suratId}/approve`, terbitkanUlang ? { terbitkanUlang: true } : {});
    setProses(false);
    if (!r.ok || !r.data?.nomor) {
      setGalat(r.error?.message ?? 'Persetujuan gagal.');
      router.refresh();
      return;
    }
    setHasil({
      nomor: r.data.nomor,
      status: r.data.status ?? 'DISETUJUI',
      peringatan: r.data.peringatan ?? null,
      pdf: r.data.pdf === true,
    });
    router.refresh();
  }

  async function tolak() {
    setProses(true);
    setGalat(null);
    const r = await kirim(`/api/surat/${suratId}/reject`, { alasan });
    setProses(false);
    if (!r.ok) {
      setGalat(r.error?.message ?? 'Penolakan gagal.');
      return;
    }
    router.push('/surat/approval');
    router.refresh();
  }

  if (hasil) {
    return (
      <div className="space-y-3" data-testid="surat-hasil-approve" data-status={hasil.status}>
        <p className="flex items-center gap-1.5 text-[14px] font-medium text-primary">
          <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--success)]" />
          {hasil.status === 'TERBIT' ? 'Surat disetujui dan diterbitkan' : 'Surat disetujui'}
        </p>
        <NomorSuratBadge nomor={hasil.nomor} />
        {hasil.peringatan ? (
          <InlineAlert
            data-testid="surat-peringatan-terbit"
            // TERBIT + peringatan = DOCX terbit, PDF yang diminta tidak dibuat (T-062).
            title={hasil.status === 'TERBIT' ? 'PDF belum tersedia' : 'Dokumen belum diterbitkan'}
            detail={hasil.peringatan}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {hasil.status === 'TERBIT' ? (
            <a href={`/api/surat/${suratId}/download`} className={buttonVariants({})} data-testid="surat-unduh-docx" download>
              <Download aria-hidden="true" /> Unduh DOCX
            </a>
          ) : null}
          {hasil.status === 'TERBIT' && hasil.pdf ? (
            <a
              href={`/api/surat/${suratId}/download?format=pdf`}
              className={buttonVariants({ variant: 'secondary' })}
              data-testid="surat-unduh-pdf"
              download
            >
              <Download aria-hidden="true" /> Unduh PDF
            </a>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => router.push('/surat/approval')}>
            Kembali ke antrian
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'DISETUJUI') {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-secondary">Surat ini sudah bernomor, tetapi dokumennya belum berhasil di-generate.</p>
        {galat ? <InlineAlert title="Gagal" detail={galat} /> : null}
        <Button type="button" onClick={() => void setujui(true)} disabled={proses} data-testid="surat-terbitkan-ulang">
          <RotateCcw aria-hidden="true" /> {proses ? 'Memproses…' : 'Terbitkan ulang'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {galat ? <InlineAlert data-testid="surat-aksi-galat" title="Tidak dapat diproses" detail={galat} /> : null}
      {mode === 'awal' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void setujui()} disabled={proses} data-testid="surat-approve">
            <CheckCircle2 aria-hidden="true" /> {proses ? 'Memproses…' : 'Setujui'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('tolak')} disabled={proses} data-testid="surat-reject">
            <XCircle aria-hidden="true" /> Tolak
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="surat-alasan" required>
            Alasan penolakan
          </Label>
          <Textarea
            id="surat-alasan"
            data-testid="surat-alasan"
            value={alasan}
            rows={3}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="Tuliskan apa yang perlu diperbaiki pembuat surat"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              onClick={() => void tolak()}
              disabled={alasan.trim().length < 5 || proses}
              data-testid="surat-reject-kirim"
            >
              <XCircle aria-hidden="true" /> {proses ? 'Memproses…' : 'Kirim penolakan'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('awal')} disabled={proses}>
              Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AksiApprovalSurat(props: AksiApprovalSuratProps) {
  return (
    <ToastProvider>
      <Aksi {...props} />
    </ToastProvider>
  );
}
