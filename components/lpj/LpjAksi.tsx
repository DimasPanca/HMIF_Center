'use client';

/**
 * Isian manual + aksi LPJ (T-105): simpan, generate (simpan dulu), ajukan,
 * setujui (Bendum lalu Ketua — ADR-015), kembalikan (wajib alasan), unduh.
 * Server yang memutuskan hak & transisi; tombol hanya mencerminkan `izin`.
 */

import { CheckCheck, Download, FileText, Send, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { BagianManual, type BagianManualHandle } from '@/components/lpj/BagianManual';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { DataManualLpj } from '@/lib/lpj/schema';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

type Respons =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error?: { message?: string; details?: { kurang?: string[] } } };

export function LpjAksi({
  kepanitiaanId,
  status,
  izin,
  manual,
  divisi,
  thumbFoto,
  dokumenAt,
}: {
  kepanitiaanId: string;
  status: string;
  izin: { tulis: boolean; ajukan: boolean; setujui: boolean; kembalikan: boolean };
  manual: DataManualLpj;
  divisi: { id: string; nama: string }[];
  thumbFoto: Record<string, string>;
  dokumenAt: string | null;
}) {
  const router = useRouter();
  const editor = React.useRef<BagianManualHandle>(null);
  const [proses, setProses] = React.useState<string | null>(null);
  const [hasil, setHasil] = React.useState<{
    galat: boolean;
    pesan: string;
    kurang: string[];
  } | null>(null);
  const [kembalikan, setKembalikan] = React.useState(false);

  const panggil = async (label: string, url: string, body?: unknown) => {
    setProses(label);
    setHasil(null);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const b = (await r.json().catch(() => null)) as Respons | null;
      if (!r.ok || !b?.ok) {
        const e = b && !b.ok ? b.error : undefined;
        setHasil({
          galat: true,
          pesan: e?.message || 'Aksi gagal.',
          kurang: e?.details?.kurang ?? [],
        });
        return false;
      }
      return true;
    } catch {
      setHasil({ galat: true, pesan: 'Tidak dapat menghubungi server. Coba lagi.', kurang: [] });
      return false;
    } finally {
      setProses(null);
    }
  };

  const generate = async () => {
    if (editor.current && !(await editor.current.simpan())) return;
    if (await panggil('generate', `/api/lpj/${kepanitiaanId}/generate`)) {
      setHasil({
        galat: false,
        pesan: 'Dokumen LPJ dibuat — snapshot analisis keuangan tersimpan.',
        kurang: [],
      });
      router.refresh();
    }
  };

  const aksi = async (a: 'ajukan' | 'setujui' | 'kembalikan', alasan?: string) => {
    if (await panggil(a, `/api/lpj/${kepanitiaanId}/approve`, { aksi: a, alasan }))
      router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4" data-testid="lpj-aksi" data-status={status}>
        <div className="flex flex-wrap gap-2">
          {izin.tulis ? (
            <Button
              type="button"
              onClick={() => void generate()}
              disabled={proses !== null}
              loading={proses === 'generate'}
              data-testid="lpj-generate"
            >
              <FileText aria-hidden="true" /> Buat dokumen LPJ
            </Button>
          ) : null}
          {izin.ajukan ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void aksi('ajukan')}
              disabled={proses !== null || !dokumenAt}
              data-testid="lpj-ajukan"
            >
              <Send aria-hidden="true" /> Ajukan
            </Button>
          ) : null}
          {izin.setujui ? (
            <Button
              type="button"
              onClick={() => void aksi('setujui')}
              disabled={proses !== null}
              data-testid="lpj-setujui"
            >
              <CheckCheck aria-hidden="true" />{' '}
              {status === 'DISETUJUI_BENDUM' ? 'Setujui & finalkan' : 'Setujui'}
            </Button>
          ) : null}
          {izin.kembalikan ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => setKembalikan(true)}
              disabled={proses !== null}
              data-testid="lpj-kembalikan"
            >
              <Undo2 aria-hidden="true" /> Kembalikan
            </Button>
          ) : null}
          {dokumenAt ? (
            <a
              href={`/api/lpj/${kepanitiaanId}/generate`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium underline"
              data-testid="lpj-unduh"
            >
              <Download aria-hidden="true" className="size-4" /> Unduh LPJ (
              {formatTanggalWaktu(dokumenAt)})
            </a>
          ) : null}
        </div>
        {status === 'FINAL' ? (
          <p className="text-[13px] text-success" data-testid="lpj-final">
            LPJ FINAL — isi dan angkanya tidak dapat diubah lagi.
          </p>
        ) : null}
        {hasil ? (
          <div
            role={hasil.galat ? 'alert' : 'status'}
            className={`text-[13px] ${hasil.galat ? 'text-danger' : 'text-secondary'}`}
            data-testid="lpj-hasil"
          >
            <p>{hasil.pesan}</p>
            {hasil.kurang.length ? (
              <ul className="mt-1 list-disc pl-5">
                {hasil.kurang.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>

      <BagianManual
        ref={editor}
        kepanitiaanId={kepanitiaanId}
        awal={manual}
        divisi={divisi}
        tulis={izin.tulis}
        thumbFoto={thumbFoto}
      />

      <ConfirmDialog
        level="reason"
        open={kembalikan}
        onOpenChange={setKembalikan}
        title="Kembalikan LPJ ke DRAFT?"
        description="Persetujuan yang sudah ada dihapus; penyusun memperbaiki lalu mengajukan ulang. Catatan Anda ditampilkan kepadanya."
        reasonLabel="Alasan pengembalian (min. 5 karakter)"
        reasonPlaceholder="Contoh: narasi divisi konsumsi belum diisi"
        confirmLabel="Kembalikan"
        confirmVariant="danger"
        onConfirm={(p) => {
          setKembalikan(false);
          if (p.level === 'reason') void aksi('kembalikan', p.reason);
        }}
      />
    </div>
  );
}
