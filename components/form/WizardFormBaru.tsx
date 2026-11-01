'use client';

/**
 * WizardFormBaru — tiga langkah, satu keputusan per layar:
 *   1. Untuk apa?   (kategori menentukan integrasi & aturan acara)
 *   2. Mulai dari   (template yang cocok di depan, "kosong" selalu ada)
 *   3. Judul        (+ acara bila kategorinya terikat acara)
 * Pengguna tidak perlu paham semua pengaturan di depan — sisanya ada di editor.
 */

import { ArrowLeft, ArrowRight, Check, ClipboardCheck, FilePlus2, MessageSquareHeart, MoreHorizontal, UserPlus, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { INFO_KATEGORI, KATEGORI, type Kategori } from '@/lib/form/skema';
import type { RingkasTemplate } from '@/lib/form/template';
import { cn } from '@/lib/utils';

const IKON: Record<Kategori, React.ComponentType<{ className?: string }>> = {
  PENDAFTARAN: UserPlus,
  EVALUASI: MessageSquareHeart,
  OPEN_RECRUITMENT: UsersRound,
  PENDATAAN_PENGURUS: ClipboardCheck,
  LAINNYA: MoreHorizontal,
};

const LANGKAH = ['Untuk apa?', 'Mulai dari', 'Judul & acara'] as const;

export function WizardFormBaru({
  templates,
  acara,
  bolehOrganisasi,
  acaraAwal,
}: {
  templates: RingkasTemplate[];
  acara: { id: string; nama: string }[];
  bolehOrganisasi: boolean;
  acaraAwal: string | null;
}) {
  const router = useRouter();
  const [langkah, setLangkah] = React.useState(0);
  const [kategori, setKategori] = React.useState<Kategori | null>(null);
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [semuaTemplate, setSemuaTemplate] = React.useState(false);
  const [judul, setJudul] = React.useState('');
  const [deskripsi, setDeskripsi] = React.useState('');
  const [acaraId, setAcaraId] = React.useState<string>(acaraAwal && acara.some((a) => a.id === acaraAwal) ? acaraAwal : '');
  const [galat, setGalat] = React.useState<string | null>(null);
  const [menyimpan, setMenyimpan] = React.useState(false);

  const tersedia = (k: Kategori): string | null => {
    const a = INFO_KATEGORI[k].acara;
    if (a === 'wajib' && acara.length === 0) return 'Anda belum menjadi panitia acara mana pun.';
    if (a === 'tidak' && !bolehOrganisasi) return 'Hanya Sekum atau pimpinan.';
    if (a === 'opsional' && !bolehOrganisasi && acara.length === 0) return 'Belum ada acara.';
    return null;
  };

  const pilihKategori = (k: Kategori) => {
    setKategori(k);
    const cocok = templates.filter((t) => t.kategori === k);
    setTemplateId(cocok[0]?.id ?? null);
    setSemuaTemplate(false);
    setLangkah(1);
  };

  const info = kategori ? INFO_KATEGORI[kategori] : null;
  const perluAcara = info?.acara === 'wajib' || (info?.acara === 'opsional' && !bolehOrganisasi);
  const daftarTemplate = semuaTemplate ? templates : templates.filter((t) => t.kategori === kategori);

  const buat = async () => {
    if (!kategori) return;
    if (judul.trim().length < 3) return setGalat('Judul minimal 3 karakter.');
    if (perluAcara && !acaraId) return setGalat('Pilih acaranya.');
    setGalat(null);
    setMenyimpan(true);
    try {
      const r = await fetch('/api/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kategori, judul: judul.trim(), deskripsi: deskripsi.trim(), kepanitiaan_id: info?.acara === 'tidak' ? null : acaraId || null, template_id: templateId }),
      });
      const d = (await r.json().catch(() => null)) as { ok: true; data: { id: string } } | { ok: false; error: { message: string } } | null;
      if (d?.ok) router.push(`/form/${d.data.id}`);
      else setGalat(d && !d.ok ? d.error.message : 'Gagal membuat form.');
    } catch {
      setGalat('Gagal membuat form. Periksa koneksi.');
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex items-center gap-2 text-[13px]" aria-label="Langkah">
        {LANGKAH.map((l, i) => (
          <li key={l} className="flex items-center gap-2" aria-current={i === langkah ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-[12px] font-semibold',
                i < langkah ? 'bg-[var(--success)] text-[var(--text-inverse)]' : i === langkah ? 'bg-[var(--primary)] text-[var(--primary-text)]' : 'bg-muted text-tertiary',
              )}
            >
              {i < langkah ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(i === langkah ? 'font-semibold text-primary' : 'text-tertiary', 'hidden sm:inline')}>{l}</span>
            {i < LANGKAH.length - 1 && <span className="h-px w-6 bg-[var(--border-default)] sm:w-10" />}
          </li>
        ))}
      </ol>

      {langkah === 0 && (
        <section>
          <h1 className="text-[22px] leading-8 font-semibold">Form ini untuk apa?</h1>
          <p className="mt-1 text-[14px] text-secondary">Kategori menentukan ke mana data jawaban mengalir dan tidak dapat diubah setelah form dibuat.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {KATEGORI.map((k) => {
              const Ikon = IKON[k];
              const alasan = tersedia(k);
              const i = INFO_KATEGORI[k];
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!!alasan}
                  onClick={() => pilihKategori(k)}
                  data-testid={`kategori-${k}`}
                  className={cn(
                    'group flex gap-3 rounded-md border bg-panel p-4 text-left transition-colors focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] focus-visible:outline-none',
                    kategori === k ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]' : 'border-default hover:border-strong hover:bg-subtle',
                    alasan && 'cursor-not-allowed opacity-55 hover:bg-panel',
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]">
                    <Ikon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-primary">{i.label}</span>
                      <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-secondary">
                        {i.acara === 'wajib' ? 'Untuk acara' : i.acara === 'tidak' ? 'Organisasi' : 'Bebas'}
                      </span>
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-secondary">{i.penjelasan}</span>
                    {alasan && <span className="mt-1 block text-[12px] text-tertiary">{alasan}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {langkah === 1 && info && (
        <section>
          <h1 className="text-[22px] leading-8 font-semibold">Mulai dari mana?</h1>
          <p className="mt-1 text-[14px] text-secondary">Template berisi pertanyaan yang lazim untuk {info.label.toLowerCase()}. Semua tetap bisa diubah di editor.</p>
          <div className="mt-5 grid gap-2" role="radiogroup" aria-label="Template">
            {daftarTemplate.map((t) => (
              <PilihanTemplate key={t.id} aktif={templateId === t.id} onPilih={() => setTemplateId(t.id)} judul={t.nama} isi={t.deskripsi} rinci={`${t.jumlah_pertanyaan} pertanyaan · ${t.jumlah_bagian} bagian${semuaTemplate ? ` · ${INFO_KATEGORI[t.kategori].label}` : ''}`} />
            ))}
            <PilihanTemplate aktif={templateId === null} onPilih={() => setTemplateId(null)} judul="Form kosong" isi="Mulai dari satu pertanyaan dan susun sendiri." rinci="" ikon={<FilePlus2 className="size-4" />} />
          </div>
          {!semuaTemplate && templates.some((t) => t.kategori !== kategori) && (
            <button type="button" onClick={() => setSemuaTemplate(true)} className="mt-3 text-[13px] text-link hover:underline">
              Tampilkan template kategori lain
            </button>
          )}
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setLangkah(0)}>
              <ArrowLeft /> Kembali
            </Button>
            <Button onClick={() => setLangkah(2)} data-testid="wizard-lanjut">
              Lanjut <ArrowRight />
            </Button>
          </div>
        </section>
      )}

      {langkah === 2 && info && (
        <section>
          <h1 className="text-[22px] leading-8 font-semibold">Beri judul</h1>
          <p className="mt-1 text-[14px] text-secondary">Judul dan deskripsi tampil paling atas di halaman yang dibuka pengisi.</p>
          <div className="mt-5 grid gap-4 rounded-md border border-default bg-panel p-5">
            {info.acara !== 'tidak' && (
              <label className="grid gap-1.5">
                <span className="text-[14px] font-medium">
                  Acara {perluAcara ? <span className="text-danger">*</span> : <span className="font-normal text-tertiary">(opsional)</span>}
                </span>
                <select value={acaraId} onChange={(e) => setAcaraId(e.target.value)} className="h-[34px] rounded-sm border border-default bg-panel px-2 text-[14px]" data-testid="wizard-acara">
                  <option value="">{perluAcara ? 'Pilih acara…' : 'Tidak terikat acara'}</option>
                  {acara.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="grid gap-1.5">
              <span className="text-[14px] font-medium">
                Judul form <span className="text-danger">*</span>
              </span>
              <input
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                maxLength={200}
                placeholder={`Mis. ${info.contoh}`}
                className="h-[34px] rounded-sm border border-default bg-panel px-3 text-[14px] outline-none focus:border-[var(--border-focus)]"
                data-testid="wizard-judul"
                autoFocus
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[14px] font-medium">
                Deskripsi <span className="font-normal text-tertiary">(opsional)</span>
              </span>
              <textarea
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Jelaskan tujuan form, siapa yang perlu mengisi, dan batas waktunya."
                className="rounded-sm border border-default bg-panel px-3 py-2 text-[14px] outline-none focus:border-[var(--border-focus)]"
              />
            </label>
            {galat && (
              <p role="alert" className="text-[13px] text-danger">
                {galat}
              </p>
            )}
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setLangkah(1)}>
              <ArrowLeft /> Kembali
            </Button>
            <Button onClick={() => void buat()} loading={menyimpan} data-testid="wizard-buat">
              Buat &amp; buka editor
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function PilihanTemplate({ aktif, onPilih, judul, isi, rinci, ikon }: { aktif: boolean; onPilih: () => void; judul: string; isi: string; rinci: string; ikon?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={aktif}
      onClick={onPilih}
      className={cn(
        'flex items-start gap-3 rounded-md border bg-panel p-4 text-left transition-colors',
        aktif ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]' : 'border-default hover:bg-subtle',
      )}
    >
      <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border', aktif ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)]' : 'border-strong')}>
        {aktif && <Check className="size-3" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-primary">
          {ikon}
          {judul}
        </span>
        {isi && <span className="mt-0.5 block text-[13px] leading-5 text-secondary">{isi}</span>}
        {rinci && <span className="mt-1 block text-[12px] text-tertiary tabular-nums">{rinci}</span>}
      </span>
    </button>
  );
}
