'use client';

/**
 * Tiga aksi Bendahara (T-102 kontrak 4): Setujui · Tolak (wajib alasan) ·
 * Minta Perbaikan (wajib catatan). Alasan juga diwajibkan server (422).
 * Selesai → nota berikutnya di antrian.
 */

import { Check, MessageSquareWarning, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Aksi = 'verify' | 'reject' | 'minta-perbaikan';

export function VerifikasiAksi({
  notaId,
  berikutnya,
  bolehSetujui,
}: {
  notaId: string;
  berikutnya: string | null;
  bolehSetujui: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<null | 'reject' | 'minta-perbaikan'>(null);
  const [proses, setProses] = React.useState<Aksi | null>(null);
  const [galat, setGalat] = React.useState<string | null>(null);

  const jalankan = async (aksi: Aksi, alasan?: string) => {
    setProses(aksi);
    setGalat(null);
    try {
      const r = await fetch(`/api/nota/${notaId}/${aksi}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(alasan === undefined ? {} : { alasan }),
      });
      const b = (await r.json().catch(() => null)) as {
        ok: boolean;
        error?: { message?: string };
      } | null;
      if (!r.ok || !b?.ok) {
        setGalat(b?.error?.message || 'Aksi gagal. Coba lagi.');
        return;
      }
      router.push(
        berikutnya ? `/keuangan/nota/verifikasi?nota=${berikutnya}` : '/keuangan/nota/verifikasi',
        { scroll: false },
      );
      router.refresh();
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(null);
    }
  };

  return (
    <div className="space-y-2 border-t border-default pt-3" data-testid="verifikasi-aksi">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void jalankan('verify')}
          disabled={!bolehSetujui || proses !== null}
          loading={proses === 'verify'}
          data-testid="verifikasi-setujui"
        >
          <Check aria-hidden="true" /> Setujui
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDialog('minta-perbaikan')}
          disabled={proses !== null}
          data-testid="verifikasi-minta-perbaikan"
        >
          <MessageSquareWarning aria-hidden="true" /> Minta perbaikan
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => setDialog('reject')}
          disabled={proses !== null}
          data-testid="verifikasi-tolak"
        >
          <X aria-hidden="true" /> Tolak
        </Button>
      </div>
      {galat ? (
        <p role="alert" className="text-[13px] text-danger" data-testid="verifikasi-galat">
          {galat}
        </p>
      ) : null}
      <ConfirmDialog
        level="reason"
        open={dialog !== null}
        onOpenChange={(b) => !b && setDialog(null)}
        title={dialog === 'reject' ? 'Tolak nota ini?' : 'Minta perbaikan nota?'}
        description={
          dialog === 'reject'
            ? 'Nota kembali ke pengunggah berstatus DITOLAK beserta alasan Anda; ia dapat memperbaiki dan mengunggah ulang.'
            : 'Nota kembali ke pengunggah untuk diperbaiki (mis. nominal alokasi atau foto buram). Catatan Anda ditampilkan kepadanya.'
        }
        reasonLabel={
          dialog === 'reject'
            ? 'Alasan penolakan (min. 5 karakter)'
            : 'Catatan perbaikan (min. 5 karakter)'
        }
        reasonPlaceholder={
          dialog === 'reject'
            ? 'Contoh: nota bukan untuk kegiatan ini'
            : 'Contoh: foto buram, total tidak terbaca'
        }
        confirmLabel={dialog === 'reject' ? 'Tolak nota' : 'Kirim permintaan'}
        confirmVariant={dialog === 'reject' ? 'danger' : 'primary'}
        onConfirm={(p) => {
          const a = dialog;
          setDialog(null);
          if (a && p.level === 'reason') void jalankan(a, p.reason);
        }}
      />
    </div>
  );
}
