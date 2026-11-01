'use client';

/**
 * EditorForm — layar kerja satu form: Pertanyaan · Pengaturan · Pratinjau.
 *
 * Simpan otomatis 1 detik setelah berhenti mengetik (tidak ada tombol
 * "Simpan" yang bisa terlupa); status simpanan selalu terlihat di kepala.
 * Tindakan utama berubah mengikuti status: DRAF → "Buka form", DIBUKA →
 * "Salin tautan". Syarat buka yang belum terpenuhi ditulis apa adanya.
 */

import { ArrowLeft, BarChart3, Check, CircleAlert, Copy, Eye, Globe2, Loader2, Lock, Send, Settings2, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { LABEL_STATUS } from '@/components/form/DaftarForm';
import { EditorStruktur } from '@/components/form/EditorStruktur';
import { IsiForm } from '@/components/form/IsiForm';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { INFO_KATEGORI, SkemaSimpanForm, syaratBuka, type Struktur } from '@/lib/form/skema';
import type { DetailForm } from '@/lib/form/service';
import { cn } from '@/lib/utils';

type Tab = 'pertanyaan' | 'pengaturan' | 'pratinjau';
type StatusSimpan = 'tersimpan' | 'menunggu' | 'menyimpan' | 'gagal';

interface Pengaturan {
  judul: string;
  deskripsi: string;
  akses: 'PUBLIK' | 'INTERNAL';
  anonim: boolean;
  satu_respons: boolean;
  ditutup_pada: string | null;
  kuota: number | null;
  pesan_selesai: string;
}

const buatId = () => crypto.randomUUID();

/** Judul/label kosong diberi nama bawaan saat disimpan, supaya kartu baru tidak menahan simpanan. */
export function lengkapiStruktur(s: Struktur): Struktur {
  return {
    bagian: s.bagian.map((b) => ({
      ...b,
      pertanyaan: b.pertanyaan.map((p) => ({
        ...p,
        judul: p.judul.trim() || 'Pertanyaan tanpa judul',
        opsi: {
          ...p.opsi,
          pilihan: p.opsi.pilihan?.map((o, i) => ({ ...o, label: o.label.trim() || `Opsi ${i + 1}` })),
          baris: p.opsi.baris?.map((o, i) => ({ ...o, label: o.label.trim() || `Baris ${i + 1}` })),
          kolom: p.opsi.kolom?.map((o, i) => ({ ...o, label: o.label.trim() || `Kolom ${i + 1}` })),
        },
      })),
    })),
  };
}

/** `datetime-local` ↔ ISO. */
const keLokal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function EditorForm(props: { form: DetailForm }) {
  return (
    <ToastProvider>
      <Isi {...props} />
    </ToastProvider>
  );
}

function Isi({ form }: { form: DetailForm }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>('pertanyaan');
  const [struktur, setStruktur] = React.useState<Struktur>(form.struktur);
  const [atur, setAtur] = React.useState<Pengaturan>({
    judul: form.judul,
    deskripsi: form.deskripsi,
    akses: form.akses,
    anonim: form.anonim,
    satu_respons: form.satu_respons,
    ditutup_pada: form.ditutup_pada,
    kuota: form.kuota,
    pesan_selesai: form.pesan_selesai,
  });
  const [status, setStatus] = React.useState(form.status);
  const [simpan, setSimpan] = React.useState<StatusSimpan>('tersimpan');
  const [galatSimpan, setGalatSimpan] = React.useState<string | null>(null);
  const [mengubahStatus, setMengubahStatus] = React.useState(false);
  const versi = React.useRef(0);
  const tersimpan = React.useRef(0);
  const sedang = React.useRef<Promise<boolean> | null>(null);
  const terjawab = React.useMemo(() => new Set(form.terjawab), [form.terjawab]);
  const nonaktif = !form.boleh_kelola;

  const kirimSimpan = React.useCallback(async (): Promise<boolean> => {
    if (sedang.current) await sedang.current;
    const v = versi.current;
    if (v === tersimpan.current) return true;
    const badan = { ...atur, struktur: lengkapiStruktur(struktur) };
    const cek = SkemaSimpanForm.safeParse(badan);
    if (!cek.success) {
      setSimpan('gagal');
      setGalatSimpan(cek.error.issues[0]?.message ?? 'Isian belum valid.');
      return false;
    }
    setSimpan('menyimpan');
    const janji = (async () => {
      try {
        const r = await fetch(`/api/form/${form.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cek.data) });
        const d = (await r.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
        if (!d?.ok) {
          setSimpan('gagal');
          setGalatSimpan(d?.error?.message ?? 'Gagal menyimpan.');
          return false;
        }
        tersimpan.current = v;
        setGalatSimpan(null);
        setSimpan(versi.current === v ? 'tersimpan' : 'menunggu');
        return true;
      } catch {
        setSimpan('gagal');
        setGalatSimpan('Koneksi terputus. Perubahan belum tersimpan.');
        return false;
      }
    })();
    sedang.current = janji;
    const hasil = await janji;
    sedang.current = null;
    return hasil;
  }, [atur, struktur, form.id]);

  // Tandai perubahan → simpan 1 detik kemudian.
  const awal = React.useRef(true);
  React.useEffect(() => {
    if (awal.current) {
      awal.current = false;
      return;
    }
    versi.current += 1;
    setSimpan('menunggu');
    const t = setTimeout(() => void kirimSimpan(), 1000);
    return () => clearTimeout(t);
  }, [struktur, atur, kirimSimpan]);

  React.useEffect(() => {
    const cegah = (e: BeforeUnloadEvent) => {
      if (versi.current !== tersimpan.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', cegah);
    return () => window.removeEventListener('beforeunload', cegah);
  }, []);

  const masalahBuka = syaratBuka(form.kategori, struktur);
  const tautan = typeof window === 'undefined' ? `/f/${form.token}` : `${window.location.origin}/f/${form.token}`;

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(tautan);
      toast.success({ description: 'Tautan disalin. Bagikan ke calon pengisi.' });
    } catch {
      toast.info({ description: tautan });
    }
  };

  const ubahStatus = async (aksi: 'buka' | 'tutup') => {
    setMengubahStatus(true);
    try {
      if (!(await kirimSimpan())) return;
      const r = await fetch(`/api/form/${form.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aksi }) });
      const d = (await r.json().catch(() => null)) as { ok: true; data: { status: DetailForm['status'] } } | { ok: false; error: { message: string } } | null;
      if (d?.ok) {
        setStatus(d.data.status);
        if (aksi === 'buka') {
          toast.success({ title: 'Form dibuka', description: 'Salin tautannya lalu bagikan.' });
        } else toast.info({ description: 'Form ditutup. Tidak ada jawaban baru yang diterima.' });
        router.refresh();
      } else toast.error({ description: d && !d.ok ? d.error.message : 'Gagal mengubah status.', suggestion: 'Periksa syarat di bawah lalu coba lagi.' });
    } finally {
      setMengubahStatus(false);
    }
  };

  const hapus = async () => {
    const pesan = form.jumlah_respons ? `Hapus form beserta ${form.jumlah_respons} responsnya? Tindakan ini tidak dapat dibatalkan.` : 'Hapus form ini?';
    if (!window.confirm(pesan)) return;
    const r = await fetch(`/api/form/${form.id}`, { method: 'DELETE' });
    const d = (await r.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
    if (d?.ok) {
      versi.current = tersimpan.current;
      router.push(form.acara ? `/acara/${form.acara.id}?tab=formulir` : '/form');
    } else toast.error({ description: d?.error?.message ?? 'Gagal menghapus.', suggestion: 'Tutup form bila tidak boleh dihapus.' });
  };

  const info = INFO_KATEGORI[form.kategori];

  return (
    <div className="mx-auto max-w-[52rem]">
      {/* Kepala lengket: konteks + status simpanan + tindakan utama */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-default bg-[var(--bg-base)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={form.acara ? `/acara/${form.acara.id}?tab=formulir` : '/form'} className="flex size-8 items-center justify-center rounded-sm text-secondary hover:bg-subtle" aria-label="Kembali ke daftar form">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone={LABEL_STATUS[status].tone} data-testid="status-form">
                {LABEL_STATUS[status].label}
              </Badge>
              <span className="truncate text-[12px] text-tertiary">
                {info.label}
                {form.acara ? ` · ${form.acara.nama}` : ''}
              </span>
            </div>
            <p className="truncate text-[15px] font-semibold">{atur.judul || 'Tanpa judul'}</p>
          </div>
          <IndikatorSimpan status={simpan} galat={galatSimpan} />
          <Link href={`/form/${form.id}/respons`} className={buttonVariants({ variant: 'ghost', className: 'h-8 px-2.5' })}>
            <BarChart3 /> <span className="tabular-nums">{form.jumlah_respons}</span>
            <span className="hidden sm:inline">respons</span>
          </Link>
          {!nonaktif &&
            (status === 'DIBUKA' ? (
              <>
                <Button variant="secondary" onClick={() => void ubahStatus('tutup')} loading={mengubahStatus} className="h-8">
                  <X /> Tutup
                </Button>
                <Button onClick={() => void salin()} className="h-8" data-testid="salin-tautan">
                  <Copy /> Salin tautan
                </Button>
              </>
            ) : (
              <Button onClick={() => void ubahStatus('buka')} loading={mengubahStatus} disabled={masalahBuka.length > 0} className="h-8" data-testid="buka-form" title={masalahBuka[0]}>
                <Send /> {status === 'DITUTUP' ? 'Buka lagi' : 'Buka form'}
              </Button>
            ))}
        </div>
        {status !== 'DIBUKA' && masalahBuka.length > 0 && !nonaktif && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-4 text-[var(--warning)]">
            <CircleAlert className="mt-px size-3.5 shrink-0" /> Belum bisa dibuka: {masalahBuka.join(' ')}
          </p>
        )}
        {status === 'DIBUKA' && (
          <p className="mt-2 flex items-center gap-2 truncate text-[12px] text-secondary">
            {atur.akses === 'PUBLIK' ? <Globe2 className="size-3.5 shrink-0" /> : <Lock className="size-3.5 shrink-0" />}
            <span className="truncate font-mono">{tautan}</span>
          </p>
        )}
        <div role="tablist" className="mt-3 -mb-3 flex gap-1">
          {(
            [
              ['pertanyaan', 'Pertanyaan', null],
              ['pengaturan', 'Pengaturan', Settings2],
              ['pratinjau', 'Pratinjau', Eye],
            ] as const
          ).map(([id, label, Ikon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[14px] font-medium transition-colors',
                tab === id ? 'border-[var(--primary)] text-primary' : 'border-transparent text-secondary hover:text-primary',
              )}
            >
              {Ikon && <Ikon className="size-4" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {nonaktif && (
        <p className="mb-4 rounded-sm border border-default bg-subtle px-3 py-2 text-[13px] text-secondary">Anda hanya dapat melihat form ini. Perubahan dilakukan oleh pembuat atau panitia acaranya.</p>
      )}

      {tab === 'pertanyaan' && (
        <div className="grid gap-4">
          <div className="grid gap-2 rounded-md border border-default border-t-[6px] border-t-[var(--primary)] bg-panel p-5">
            <input
              aria-label="Judul form"
              value={atur.judul}
              onChange={(e) => setAtur((a) => ({ ...a, judul: e.target.value }))}
              maxLength={200}
              disabled={nonaktif}
              className="border-b border-transparent bg-transparent pb-1 text-[24px] leading-8 font-semibold outline-none hover:border-default focus:border-[var(--border-focus)]"
            />
            <textarea
              aria-label="Deskripsi form"
              value={atur.deskripsi}
              onChange={(e) => setAtur((a) => ({ ...a, deskripsi: e.target.value }))}
              placeholder="Deskripsi form: tujuan, siapa yang mengisi, batas waktu"
              rows={3}
              maxLength={5000}
              disabled={nonaktif}
              className="resize-y border-b border-transparent bg-transparent text-[14px] leading-6 text-secondary outline-none hover:border-default focus:border-[var(--border-focus)]"
            />
          </div>
          <EditorStruktur struktur={struktur} onUbah={setStruktur} kategori={form.kategori} terjawab={terjawab} buatId={buatId} nonaktif={nonaktif} />
        </div>
      )}

      {tab === 'pengaturan' && (
        <div className="grid gap-4">
          <Kotak judul="Siapa yang mengisi?">
            <div className="grid gap-2 sm:grid-cols-2">
              <PilihanKartu
                aktif={atur.akses === 'PUBLIK'}
                onPilih={() => setAtur((a) => ({ ...a, akses: 'PUBLIK', satu_respons: false }))}
                ikon={<Globe2 className="size-4" />}
                judul="Siapa pun yang punya tautan"
                isi="Tanpa login. Cocok untuk calon peserta atau pendaftar dari luar HMIF."
                nonaktif={nonaktif}
              />
              <PilihanKartu
                aktif={atur.akses === 'INTERNAL'}
                onPilih={() => setAtur((a) => ({ ...a, akses: 'INTERNAL' }))}
                ikon={<Lock className="size-4" />}
                judul="Hanya pengguna HMIF Center"
                isi="Wajib login. Cocok untuk pendataan pengurus atau survei internal."
                nonaktif={nonaktif}
              />
            </div>
            <Saklar
              label="Anonim"
              isi={atur.akses === 'PUBLIK' ? 'Form publik memang tidak mencatat akun; identitas hanya dari jawaban.' : 'Akun pengisi tidak disimpan bersama jawaban.'}
              nilai={atur.anonim}
              onUbah={(v) => setAtur((a) => ({ ...a, anonim: v }))}
              nonaktif={nonaktif}
            />
            {atur.akses === 'INTERNAL' && (
              <Saklar label="Satu jawaban per akun" isi="Pengisi yang sudah mengirim tidak dapat mengisi lagi." nilai={atur.satu_respons} onUbah={(v) => setAtur((a) => ({ ...a, satu_respons: v }))} nonaktif={nonaktif} />
            )}
          </Kotak>

          <Kotak judul="Batas pengisian">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[14px]">
                <span className="font-medium">Ditutup otomatis pada</span>
                <input
                  type="datetime-local"
                  value={keLokal(atur.ditutup_pada)}
                  onChange={(e) => setAtur((a) => ({ ...a, ditutup_pada: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                  disabled={nonaktif}
                  className="h-[34px] rounded-sm border border-default bg-panel px-2"
                />
                <span className="text-[12px] text-tertiary">Kosongkan bila ditutup manual.</span>
              </label>
              <label className="grid gap-1.5 text-[14px]">
                <span className="font-medium">Kuota respons</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={atur.kuota ?? ''}
                  placeholder="Tanpa batas"
                  onChange={(e) => setAtur((a) => ({ ...a, kuota: e.target.value ? Math.max(1, Math.trunc(Number(e.target.value))) : null }))}
                  disabled={nonaktif}
                  className="h-[34px] rounded-sm border border-default bg-panel px-2"
                />
                <span className="text-[12px] text-tertiary">Form tertutup sendiri bila kuota penuh (mis. kursi seminar).</span>
              </label>
            </div>
          </Kotak>

          <Kotak judul="Setelah mengirim">
            <label className="grid gap-1.5 text-[14px]">
              <span className="font-medium">Pesan untuk pengisi</span>
              <textarea
                value={atur.pesan_selesai}
                onChange={(e) => setAtur((a) => ({ ...a, pesan_selesai: e.target.value }))}
                rows={3}
                maxLength={1000}
                disabled={nonaktif}
                className="rounded-sm border border-default bg-panel px-3 py-2"
              />
              <span className="text-[12px] text-tertiary">Mis. tautan grup WhatsApp peserta atau info pembayaran.</span>
            </label>
          </Kotak>

          <Kotak judul="Kategori & aliran data">
            <p className="text-[14px] leading-6 text-secondary">
              <b className="text-primary">{info.label}</b>
              {form.acara ? ` untuk ${form.acara.nama}` : ''}. {info.penjelasan}
            </p>
          </Kotak>

          {!nonaktif && (
            <Kotak judul="Hapus form" bahaya>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-secondary">{form.jumlah_respons ? `Form ini punya ${form.jumlah_respons} respons. Menghapus juga menghapus semua jawaban & berkasnya.` : 'Form belum punya respons.'}</p>
                <Button variant="danger" onClick={() => void hapus()}>
                  <Trash2 /> Hapus form
                </Button>
              </div>
            </Kotak>
          )}
        </div>
      )}

      {tab === 'pratinjau' && (
        <div className="rounded-md bg-subtle p-4 sm:p-6">
          <p className="mb-3 text-center text-[12px] text-tertiary">Pratinjau — tampilan yang dilihat pengisi. Jawaban di sini tidak dikirim.</p>
          <div className="mx-auto max-w-[42rem]">
            <IsiForm
              key={JSON.stringify(struktur).length}
              pratinjau
              form={{
                token: form.token,
                judul: atur.judul,
                deskripsi: atur.deskripsi,
                akses: atur.akses,
                anonim: atur.anonim,
                acara: form.acara?.nama ?? null,
                struktur: lengkapiStruktur(struktur),
                pesan_selesai: atur.pesan_selesai,
                tertutup: null,
                perlu_login: false,
                sudah_mengisi: false,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function IndikatorSimpan({ status, galat }: { status: StatusSimpan; galat: string | null }) {
  const isi = {
    tersimpan: [<Check key="i" className="size-3.5" />, 'Tersimpan'],
    menunggu: [<Loader2 key="i" className="size-3.5 opacity-50" />, 'Belum tersimpan'],
    menyimpan: [<Loader2 key="i" className="size-3.5 animate-spin" />, 'Menyimpan…'],
    gagal: [<CircleAlert key="i" className="size-3.5" />, galat ?? 'Gagal menyimpan'],
  }[status];
  return (
    <span
      aria-live="polite"
      data-testid="indikator-simpan"
      data-status={status}
      title={galat ?? undefined}
      className={cn('flex max-w-[16rem] items-center gap-1 truncate text-[12px]', status === 'gagal' ? 'text-danger' : 'text-tertiary')}
    >
      {isi[0]}
      <span className="truncate">{isi[1]}</span>
    </span>
  );
}

function Kotak({ judul, children, bahaya }: { judul: string; children: React.ReactNode; bahaya?: boolean }) {
  return (
    <section className={cn('grid gap-3 rounded-md border bg-panel p-5', bahaya ? 'border-[var(--danger)]/40' : 'border-default')}>
      <h2 className={cn('text-[15px] font-semibold', bahaya && 'text-danger')}>{judul}</h2>
      {children}
    </section>
  );
}

function PilihanKartu({ aktif, onPilih, ikon, judul, isi, nonaktif }: { aktif: boolean; onPilih: () => void; ikon: React.ReactNode; judul: string; isi: string; nonaktif?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={aktif}
      onClick={onPilih}
      disabled={nonaktif}
      className={cn('rounded-md border p-3 text-left transition-colors disabled:opacity-60', aktif ? 'border-[var(--primary)] bg-[var(--primary-subtle)] ring-1 ring-[var(--primary)]' : 'border-default hover:bg-subtle')}
    >
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        {ikon}
        {judul}
      </span>
      <span className="mt-1 block text-[13px] leading-5 text-secondary">{isi}</span>
    </button>
  );
}

function Saklar({ label, isi, nilai, onUbah, nonaktif }: { label: string; isi: string; nilai: boolean; onUbah: (v: boolean) => void; nonaktif?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-subtle pt-3">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[13px] leading-5 text-secondary">{isi}</span>
      </span>
      <input type="checkbox" role="switch" checked={nilai} onChange={(e) => onUbah(e.target.checked)} disabled={nonaktif} className="peer sr-only" />
      <span aria-hidden className="relative mt-1 h-5 w-9 shrink-0 rounded-full bg-muted transition-colors peer-checked:bg-[var(--primary)] after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-panel after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-3 peer-focus-visible:ring-[var(--border-focus)]" />
    </label>
  );
}
