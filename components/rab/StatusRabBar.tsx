'use client';

/**
 * Bilah status RAB (T-089, PRD F-9.5, USER_FLOW §11.3): status, siapa yang
 * mengunci dan kapan, alasan pembukaan kunci terakhir, dan tombol aksi —
 * HANYA yang boleh dijalankan pengguna ini sekarang (`izin_status` dari
 * server). Tombol yang tidak berhak tidak dirender.
 *
 * Kembali ke DRAFT (kembalikan / buka kunci) memakai konfirmasi beralasan;
 * server menolak alasan < 10 karakter atau alasan lama yang dipakai ulang.
 *
 * Test id: status-rab (data-status), status-rab-terkunci-oleh,
 * status-rab-alasan, rab-ajukan, rab-kunci, rab-kembalikan, rab-buka-kunci.
 */

import { Lock, LockOpen, RotateCcw, Send } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { STATUS_VALUES, StatusPill, type DomainStatus } from '@/components/ui/status-pill';
import type { DataRab } from '@/lib/rab/service';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

type Aksi = 'submit' | 'lock' | 'unlock';
type Dialog = null | 'kunci' | 'kembalikan' | 'buka';

const PENJELASAN: Record<string, string> = {
  DRAFT: 'RAB sedang disusun panitia.',
  DIAJUKAN: 'Menunggu persetujuan Ketua Pelaksana dan Bendahara.',
  DISETUJUI: 'RAB disetujui dan dikunci — item tidak dapat diubah.',
  REALISASI: 'Belanja berjalan; RAB tetap terkunci.',
  SELESAI: 'LPJ sudah dibuat.',
};

export function StatusRabBar({
  rab,
  onBerubah,
  onGalat,
}: {
  rab: DataRab;
  onBerubah: (rab: DataRab) => void;
  onGalat: (pesan: string) => void;
}) {
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [sibuk, setSibuk] = React.useState(false);
  const izin = rab.izin_status;
  const status = (STATUS_VALUES as readonly string[]).includes(rab.status) ? (rab.status as DomainStatus) : null;

  async function jalankan(aksi: Aksi, body?: unknown) {
    setSibuk(true);
    try {
      const r = await fetch(`/api/rab/${rab.kepanitiaan_id}/${aksi}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; data?: { rab: DataRab | null }; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok || !isi.data?.rab) throw new Error(isi?.error?.message ?? 'Status RAB gagal diubah.');
      onBerubah(isi.data.rab);
    } catch (e) {
      onGalat(e instanceof Error ? e.message : 'Status RAB gagal diubah.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div data-testid="status-rab" data-status={rab.status} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-default bg-panel px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12px] font-semibold tracking-wide text-tertiary uppercase">Status RAB</span>
        {status ? <StatusPill status={status} /> : <span className="text-[13px]">{rab.status}</span>}
        <span className="text-[13px] text-secondary">{PENJELASAN[rab.status] ?? ''}</span>
        {rab.meta.disetujui_oleh && rab.meta.disetujui_at ? (
          <span data-testid="status-rab-terkunci-oleh" className="text-[12px] text-secondary">
            Dikunci {rab.meta.disetujui_oleh} · {formatTanggalWaktu(rab.meta.disetujui_at)}
          </span>
        ) : null}
        {rab.status === 'DRAFT' && rab.meta.alasan_buka_kunci ? (
          <span data-testid="status-rab-alasan" className="text-[12px] text-secondary">
            Terakhir dikembalikan/dibuka: “{rab.meta.alasan_buka_kunci}”
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {izin.ajukan ? (
          <Button loading={sibuk} onClick={() => void jalankan('submit')} data-testid="rab-ajukan">
            <Send aria-hidden="true" /> Ajukan RAB
          </Button>
        ) : null}
        {izin.kembalikan ? (
          <Button variant="secondary" disabled={sibuk} onClick={() => setDialog('kembalikan')} data-testid="rab-kembalikan">
            <RotateCcw aria-hidden="true" /> Kembalikan
          </Button>
        ) : null}
        {izin.kunci ? (
          <Button disabled={sibuk} onClick={() => setDialog('kunci')} data-testid="rab-kunci">
            <Lock aria-hidden="true" /> Setujui &amp; kunci
          </Button>
        ) : null}
        {izin.buka ? (
          <Button variant="secondary" disabled={sibuk} onClick={() => setDialog('buka')} data-testid="rab-buka-kunci">
            <LockOpen aria-hidden="true" /> Buka kunci
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        level="simple"
        open={dialog === 'kunci'}
        onOpenChange={(b) => !b && setDialog(null)}
        title="Setujui dan kunci RAB?"
        description="Setelah dikunci, item RAB seluruh divisi tidak dapat diubah. Membuka kunci kembali wajib beralasan dan tercatat di audit log."
        confirmLabel="Setujui & kunci"
        onConfirm={() => {
          setDialog(null);
          void jalankan('lock');
        }}
      />
      <ConfirmDialog
        level="reason"
        open={dialog === 'kembalikan' || dialog === 'buka'}
        onOpenChange={(b) => !b && setDialog(null)}
        title={dialog === 'buka' ? 'Buka kunci RAB?' : 'Kembalikan RAB ke panitia?'}
        description={
          dialog === 'buka'
            ? 'RAB kembali ke DRAFT dan dapat diubah lagi. Alasannya disimpan dan tercatat di audit log (PRD F-9.5).'
            : 'RAB kembali ke DRAFT untuk diperbaiki panitia. Catatan Anda disimpan dan tercatat di audit log.'
        }
        reasonLabel={dialog === 'buka' ? 'Alasan membuka kunci (min. 10 karakter)' : 'Catatan perbaikan (min. 10 karakter)'}
        reasonPlaceholder="Contoh: tambahan kebutuhan sewa sound system untuk hari kedua"
        confirmLabel={dialog === 'buka' ? 'Buka kunci' : 'Kembalikan'}
        confirmVariant="danger"
        onConfirm={(p) => {
          setDialog(null);
          if (p.level === 'reason') void jalankan('unlock', { alasan: p.reason });
        }}
      />
    </div>
  );
}
