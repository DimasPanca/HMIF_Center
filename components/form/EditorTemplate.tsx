'use client';

/**
 * EditorTemplate — Sekum/Admin menyusun template global (ADR-038 #3).
 * Memakai penyusun yang sama dengan editor form supaya tidak ada dua cara
 * membuat pertanyaan. Simpan eksplisit: template bukan dokumen kerja harian.
 */

import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { lengkapiStruktur } from '@/components/form/EditorForm';
import { EditorStruktur } from '@/components/form/EditorStruktur';
import { Button } from '@/components/ui/button';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { INFO_KATEGORI, KATEGORI, SkemaTemplate, strukturKosong, type Kategori, type Struktur } from '@/lib/form/skema';

const buatId = () => crypto.randomUUID();

export interface TemplateAwal {
  id: string | null;
  nama: string;
  kategori: Kategori;
  deskripsi: string;
  aktif: boolean;
  bawaan: boolean;
  dipakai: number;
  isi: Struktur | null;
}

export function EditorTemplate(props: { awal: TemplateAwal }) {
  return (
    <ToastProvider>
      <Isi {...props} />
    </ToastProvider>
  );
}

function Isi({ awal }: { awal: TemplateAwal }) {
  const router = useRouter();
  const toast = useToast();
  const [nama, setNama] = React.useState(awal.nama);
  const [kategori, setKategori] = React.useState<Kategori>(awal.kategori);
  const [deskripsi, setDeskripsi] = React.useState(awal.deskripsi);
  const [aktif, setAktif] = React.useState(awal.aktif);
  const [struktur, setStruktur] = React.useState<Struktur>(() => awal.isi ?? strukturKosong(buatId));
  const [menyimpan, setMenyimpan] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  const simpan = async () => {
    const cek = SkemaTemplate.safeParse({ nama, kategori, deskripsi, aktif, isi: lengkapiStruktur(struktur) });
    if (!cek.success) return setGalat(cek.error.issues[0]?.message ?? 'Isian belum valid.');
    setGalat(null);
    setMenyimpan(true);
    try {
      const r = await fetch(awal.id ? `/api/form/template/${awal.id}` : '/api/form/template', {
        method: awal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cek.data),
      });
      const d = (await r.json().catch(() => null)) as { ok: true; data: { id: string } } | { ok: false; error: { message: string } } | null;
      if (d?.ok) {
        toast.success({ description: 'Template tersimpan. Form yang sudah dibuat tidak berubah.' });
        if (!awal.id) router.replace(`/form/template/${d.data.id}`);
        else router.refresh();
      } else setGalat(d && !d.ok ? d.error.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async () => {
    if (!awal.id || !window.confirm(awal.dipakai || awal.bawaan ? 'Template ini bawaan atau sudah dipakai, jadi akan dinonaktifkan (tidak muncul di pilihan). Lanjutkan?' : 'Hapus template ini?')) return;
    const r = await fetch(`/api/form/template/${awal.id}`, { method: 'DELETE' });
    if (r.ok) router.push('/form/template');
    else toast.error({ description: 'Gagal menghapus template.', suggestion: 'Muat ulang lalu coba lagi.' });
  };

  return (
    <div className="mx-auto max-w-[52rem] space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/form/template" className="flex size-8 items-center justify-center rounded-sm text-secondary hover:bg-subtle" aria-label="Kembali ke daftar template">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold">{awal.id ? 'Edit template' : 'Template baru'}</h1>
        {awal.id && (
          <Button variant="ghost" onClick={() => void hapus()}>
            <Trash2 /> {awal.dipakai || awal.bawaan ? 'Nonaktifkan' : 'Hapus'}
          </Button>
        )}
        <Button onClick={() => void simpan()} loading={menyimpan} data-testid="simpan-template">
          <Save /> Simpan template
        </Button>
      </header>

      {galat && (
        <p role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] px-3 py-2 text-[13px]">
          {galat}
        </p>
      )}

      <section className="grid gap-4 rounded-md border border-default border-t-[6px] border-t-[var(--primary)] bg-panel p-5 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[14px] sm:col-span-2">
          <span className="font-medium">Nama template <span className="text-danger">*</span></span>
          <input value={nama} onChange={(e) => setNama(e.target.value)} maxLength={120} placeholder="Mis. Template KT1" className="h-[34px] rounded-sm border border-default bg-panel px-3" data-testid="nama-template" />
        </label>
        <label className="grid gap-1.5 text-[14px]">
          <span className="font-medium">Untuk kategori</span>
          <select value={kategori} onChange={(e) => setKategori(e.target.value as Kategori)} className="h-[34px] rounded-sm border border-default bg-panel px-2">
            {KATEGORI.map((k) => (
              <option key={k} value={k}>
                {INFO_KATEGORI[k].label}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-tertiary">Template tampil paling depan untuk kategori ini di wizard &quot;Form baru&quot;.</span>
        </label>
        <label className="flex items-start gap-2 pt-7 text-[14px]">
          <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>
            <span className="font-medium">Aktif</span>
            <span className="block text-[12px] text-tertiary">Nonaktif = disembunyikan dari pilihan pembuat form.</span>
          </span>
        </label>
        <label className="grid gap-1.5 text-[14px] sm:col-span-2">
          <span className="font-medium">Deskripsi singkat</span>
          <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={2} maxLength={2000} placeholder="Kapan template ini dipakai" className="rounded-sm border border-default bg-panel px-3 py-2" />
        </label>
      </section>

      <EditorStruktur struktur={struktur} onUbah={setStruktur} kategori={kategori} buatId={buatId} />
    </div>
  );
}
