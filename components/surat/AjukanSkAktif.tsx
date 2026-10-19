'use client';

import { Download, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Textarea } from '@/components/ui/textarea';
import { KEPERLUAN_UMUM, SkemaAjukanSkAktif } from '@/lib/surat/keterangan-aktif-skema';
import { cn } from '@/lib/utils';

interface Identitas {
  nama: string;
  nim: string;
  jabatan: string;
  tercatat: boolean;
}

interface Pengajuan {
  id: string;
  status: 'DRAFT' | 'MENUNGGU_APPROVAL' | 'DISETUJUI' | 'TERBIT' | 'DITOLAK' | 'DIBATALKAN';
  keperluan: string;
  nomor: string | null;
  tanggal_surat: string;
  alasan_penolakan: string | null;
  dapat_diunduh: boolean;
}

const tanggal = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export function AjukanSkAktif({ identitas, pengajuan }: { identitas: Identitas; pengajuan: Pengajuan[] }) {
  const router = useRouter();
  const [keperluan, setKeperluan] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [, mulai] = useTransition();

  async function ajukan(e: React.FormEvent) {
    e.preventDefault();
    setPesan(null);
    const p = SkemaAjukanSkAktif.safeParse({ keperluan });
    if (!p.success) {
      setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
      return;
    }
    setGalat(null);
    setMengirim(true);
    try {
      const r = await fetch('/api/surat/keterangan-aktif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p.data),
      });
      const body = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !body?.ok) {
        setGalat(body?.error?.message ?? 'Pengajuan gagal dikirim. Coba lagi.');
        return;
      }
      setKeperluan('');
      setPesan('Pengajuan terkirim. Anda akan melihat statusnya berubah di bawah setelah diproses pimpinan.');
      mulai(() => router.refresh());
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4 sm:p-5">
        <dl className="grid grid-cols-1 gap-3 text-[14px] sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-[12px] text-tertiary">Nama</dt>
            <dd className="font-medium break-words">{identitas.nama || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-tertiary">NIM</dt>
            <dd className="font-medium tabular-nums">{identitas.nim || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-tertiary">Jabatan</dt>
            <dd className="font-medium break-words">{identitas.jabatan || '—'}</dd>
          </div>
        </dl>
        {identitas.tercatat ? (
          <p className="text-[12px] text-tertiary">Data diambil dari Data Pengurus. Bila ada yang salah, hubungi Sekretaris Umum.</p>
        ) : (
          <p role="alert" className="rounded-sm border border-[var(--warning)] bg-[var(--warning-subtle)] px-3 py-2 text-[13px]">
            Nama Anda belum tercatat di Data Pengurus periode ini, jadi surat belum dapat diajukan. Hubungi Sekretaris Umum.
          </p>
        )}

        <form onSubmit={ajukan} className="space-y-3" noValidate>
          <label htmlFor="sk-keperluan" className="block text-[14px] font-medium">
            Keperluan surat
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pilihan cepat keperluan">
            {KEPERLUAN_UMUM.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKeperluan(k)}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                  keperluan === k ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)]' : 'border-default text-secondary hover:bg-muted',
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <Textarea
            id="sk-keperluan"
            value={keperluan}
            onChange={(e) => setKeperluan(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="Mis. Persyaratan pendaftaran Beasiswa Bank Indonesia 2026"
            error={galat ?? undefined}
            disabled={!identitas.tercatat || mengirim}
          />
          {pesan ? (
            <p role="status" className="text-[13px] text-[var(--success)]">
              {pesan}
            </p>
          ) : null}
          <Button type="submit" loading={mengirim} disabled={!identitas.tercatat} className="w-full sm:w-auto">
            <Send aria-hidden="true" /> Ajukan surat
          </Button>
        </form>
      </Card>

      <section aria-labelledby="sk-riwayat" className="space-y-3">
        <h2 id="sk-riwayat" className="text-[15px] font-semibold">
          Pengajuan saya <span className="text-tertiary tabular-nums">({pengajuan.length})</span>
        </h2>
        {pengajuan.length === 0 ? (
          <p className="rounded-sm border border-dashed border-default px-3 py-4 text-[13px] text-tertiary">
            Belum ada pengajuan di periode ini.
          </p>
        ) : (
          <ul className="space-y-3">
            {pengajuan.map((s) => (
              <li key={s.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusPill status={s.status} />
                    <span className="text-[12px] text-tertiary">{tanggal(s.tanggal_surat)}</span>
                  </div>
                  <p className="text-[14px] font-medium break-words">{s.keperluan || 'Surat Keterangan Aktif'}</p>
                  {s.nomor ? <p className="font-mono text-[12px] break-all text-secondary">No. {s.nomor}</p> : null}
                  {s.status === 'DITOLAK' && s.alasan_penolakan ? (
                    <p className="text-[13px] text-[var(--danger)]">Alasan ditolak: {s.alasan_penolakan}</p>
                  ) : null}
                  {s.status === 'MENUNGGU_APPROVAL' ? (
                    <p className="text-[13px] text-secondary">Menunggu persetujuan Ketua, Wakil, atau Sekretaris Umum.</p>
                  ) : null}
                  {s.dapat_diunduh ? (
                    <a href={`/api/surat/${s.id}/download`} className={cn(buttonVariants({ variant: 'secondary' }), 'w-full sm:w-auto')}>
                      <Download aria-hidden="true" /> Unduh surat (DOCX)
                    </a>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
