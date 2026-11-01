'use client';

/**
 * IsiForm — halaman isi form (ADR-038). Satu bagian per layar seperti Google
 * Form: pengisi hanya melihat pertanyaan yang relevan, tombol "Berikutnya"
 * memeriksa bagian itu lebih dulu, logika lompat diikuti `bagianBerikutnya`.
 *
 * Draf jawaban (tanpa berkas) disimpan di localStorage per tautan supaya
 * jawaban panjang tidak hilang bila tab tertutup — hanya kenyamanan, server
 * tetap memvalidasi ulang semuanya.
 */

import { CheckCircle2, ChevronLeft, ChevronRight, Lock, Send, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { BidangJawaban } from '@/components/form/BidangJawaban';
import { Button } from '@/components/ui/button';
import { bagianBerikutnya, jalurBagian, periksaJawaban, type MasukanJawaban, type NilaiMasukan } from '@/lib/form/jawaban';
import type { FormIsi } from '@/lib/form/respons';

const MAKS_TOTAL = 4.2 * 1024 * 1024;

/** Foto besar dari kamera HP dikecilkan di peramban (Vercel menolak badan > 4,5 MB). */
async function kecilkanGambar(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size <= 1.5 * 1024 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f);
    const skala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * skala);
    c.height = Math.round(bmp.height * skala);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return f;
  }
}

function bacaDraf(kunci: string): MasukanJawaban {
  try {
    const s = localStorage.getItem(kunci);
    const v = s ? (JSON.parse(s) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as MasukanJawaban) : {};
  } catch {
    return {};
  }
}

export function IsiForm({ form, pratinjau = false }: { form: FormIsi; pratinjau?: boolean }) {
  const struktur = form.struktur;
  const kunciDraf = `form-draf:${form.token}`;
  const [jawaban, setJawaban] = React.useState<MasukanJawaban>({});
  const [berkas, setBerkas] = React.useState<Record<string, File>>({});
  const [galat, setGalat] = React.useState<Record<string, string>>({});
  const [riwayat, setRiwayat] = React.useState<string[]>([struktur.bagian[0]!.id]);
  const [mengirim, setMengirim] = React.useState(false);
  const [galatUmum, setGalatUmum] = React.useState<string | null>(null);
  const [selesai, setSelesai] = React.useState<string | null>(null);
  const madu = React.useRef<HTMLInputElement>(null);
  const atas = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!pratinjau) setJawaban(bacaDraf(kunciDraf));
  }, [kunciDraf, pratinjau]);

  React.useEffect(() => {
    if (pratinjau || selesai) return;
    try {
      localStorage.setItem(kunciDraf, JSON.stringify(jawaban));
    } catch {
      /* penyimpanan diblokir: abaikan */
    }
  }, [jawaban, kunciDraf, pratinjau, selesai]);

  const idSaatIni = riwayat[riwayat.length - 1]!;
  const bagian = struktur.bagian.find((b) => b.id === idSaatIni) ?? struktur.bagian[0]!;
  const jalur = jalurBagian(struktur, jawaban);
  const urutan = Math.max(0, jalur.findIndex((b) => b.id === bagian.id));
  const berikut = bagianBerikutnya(struktur, bagian.id, jawaban);

  const ubah = (id: string, v: NilaiMasukan) => {
    setJawaban((j) => ({ ...j, [id]: v }));
    if (galat[id]) setGalat(({ [id]: _, ...sisa }) => sisa);
  };

  const pilihBerkas = async (id: string, f: File | null) => {
    if (!f) {
      setBerkas(({ [id]: _, ...sisa }) => sisa);
      ubah(id, null);
      return;
    }
    const kecil = await kecilkanGambar(f);
    const p = bagian.pertanyaan.find((q) => q.id === id);
    const maks = (p?.opsi.maks_mb ?? 4) * 1024 * 1024;
    if (kecil.size > maks) {
      setGalat((g) => ({ ...g, [id]: `Ukuran berkas maksimal ${p?.opsi.maks_mb ?? 4} MB.` }));
      return;
    }
    setBerkas((b) => ({ ...b, [id]: kecil }));
    ubah(id, { berkas: true });
  };

  const periksaBagian = (): boolean => {
    const g: Record<string, string> = {};
    for (const p of bagian.pertanyaan) {
      const h = periksaJawaban(p, jawaban[p.id], !!berkas[p.id]);
      if ('galat' in h) g[p.id] = h.galat;
    }
    setGalat(g);
    const pertama = bagian.pertanyaan.find((p) => g[p.id]);
    if (pertama) document.querySelector(`[data-pertanyaan="${pertama.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !pertama;
  };

  const keAtas = () => atas.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const lanjut = () => {
    if (!periksaBagian() || !berikut) return;
    setRiwayat((r) => [...r, berikut]);
    keAtas();
  };

  const kembali = () => {
    setGalat({});
    setRiwayat((r) => (r.length > 1 ? r.slice(0, -1) : r));
    keAtas();
  };

  const kirim = async () => {
    if (!periksaBagian() || pratinjau) return;
    const dilalui = new Set(jalur.flatMap((b) => b.pertanyaan.map((p) => p.id)));
    const fd = new FormData();
    fd.set('jawaban', JSON.stringify(Object.fromEntries(Object.entries(jawaban).filter(([k]) => dilalui.has(k)))));
    fd.set('situs_web', madu.current?.value ?? '');
    let total = 0;
    for (const [id, f] of Object.entries(berkas)) {
      if (!dilalui.has(id)) continue;
      fd.append(`berkas_${id}`, f, f.name);
      total += f.size;
    }
    if (total > MAKS_TOTAL) {
      setGalatUmum('Total ukuran berkas melebihi 4 MB. Perkecil atau kompres berkas lalu coba lagi.');
      return;
    }
    setMengirim(true);
    setGalatUmum(null);
    try {
      const r = await fetch(`/api/f/${form.token}`, { method: 'POST', body: fd });
      const d = (await r.json().catch(() => null)) as
        | { ok: true; data: { pesan_selesai: string } }
        | { ok: false; error: { message: string; details?: Record<string, string> } }
        | null;
      if (d?.ok) {
        try {
          localStorage.removeItem(kunciDraf);
        } catch {
          /* abaikan */
        }
        setSelesai(d.data.pesan_selesai);
        keAtas();
        return;
      }
      const rinci = d && !d.ok ? d.error.details : undefined;
      if (rinci && typeof rinci === 'object') {
        setGalat(rinci);
        const salah = jalur.find((b) => b.pertanyaan.some((p) => rinci[p.id]));
        if (salah && salah.id !== bagian.id) setRiwayat(jalur.slice(0, jalur.indexOf(salah) + 1).map((b) => b.id));
      }
      setGalatUmum(d && !d.ok ? d.error.message : r.status === 413 ? 'Berkas terlalu besar.' : 'Gagal mengirim. Periksa koneksi lalu coba lagi.');
    } catch {
      setGalatUmum('Gagal mengirim. Periksa koneksi lalu coba lagi.');
    } finally {
      setMengirim(false);
    }
  };

  if (selesai !== null) {
    return (
      <div ref={atas} className="rounded-md border border-default bg-panel p-6 text-center" data-testid="form-selesai">
        <CheckCircle2 aria-hidden className="mx-auto size-10 text-[var(--success)]" />
        <h2 className="mt-3 text-[20px] leading-7 font-semibold">Jawaban terkirim</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 whitespace-pre-line text-secondary">{selesai || 'Terima kasih sudah mengisi.'}</p>
      </div>
    );
  }

  return (
    <div ref={atas} className="grid gap-3 scroll-mt-4">
      <header className="overflow-hidden rounded-md border border-default bg-panel">
        <div className="h-2 bg-[var(--primary)]" />
        <div className="p-5 sm:p-6">
          {form.acara && <p className="text-[12px] leading-4 font-semibold tracking-[0.08em] text-[var(--primary)] uppercase">{form.acara}</p>}
          <h1 className="mt-1 text-[24px] leading-8 font-semibold tracking-[-0.01em] text-primary">{form.judul}</h1>
          {form.deskripsi && <p className="mt-2 text-[14px] leading-6 whitespace-pre-line text-secondary">{form.deskripsi}</p>}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-subtle pt-3 text-[12px] leading-4 text-secondary">
            <span>
              <span className="text-danger">*</span> wajib diisi
            </span>
            {form.anonim && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck aria-hidden className="size-3.5" /> Anonim — identitas akun tidak disimpan
              </span>
            )}
            {form.akses === 'INTERNAL' && (
              <span className="inline-flex items-center gap-1">
                <Lock aria-hidden className="size-3.5" /> Khusus pengguna HMIF Center
              </span>
            )}
          </div>
        </div>
      </header>

      {jalur.length > 1 && (
        <div className="px-1" aria-live="polite">
          <div className="flex items-center justify-between text-[12px] leading-4 text-secondary">
            <span>
              Bagian {urutan + 1} dari {jalur.length}
            </span>
            {bagian.judul && <span className="truncate pl-3 font-medium text-primary">{bagian.judul}</span>}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300" style={{ width: `${((urutan + 1) / jalur.length) * 100}%` }} />
          </div>
        </div>
      )}

      {(bagian.judul || bagian.deskripsi) && riwayat.length > 0 && (
        <section className="rounded-md border border-default bg-subtle px-5 py-4">
          {bagian.judul && <h2 className="text-[16px] leading-6 font-semibold text-primary">{bagian.judul}</h2>}
          {bagian.deskripsi && <p className="mt-1 text-[13px] leading-5 whitespace-pre-line text-secondary">{bagian.deskripsi}</p>}
        </section>
      )}

      {bagian.pertanyaan.map((p) => (
        <BidangJawaban
          key={p.id}
          p={p}
          nilai={jawaban[p.id]}
          galat={galat[p.id]}
          berkas={berkas[p.id] ?? null}
          onUbah={(v) => ubah(p.id, v)}
          onBerkas={(f) => void pilihBerkas(p.id, f)}
          nonaktif={mengirim}
        />
      ))}

      {/* Honeypot: tak terlihat manusia, diisi bot. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Situs web
          <input ref={madu} type="text" name="situs_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {galatUmum && (
        <p role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] px-3 py-2 text-[14px] leading-5 text-primary">
          {galatUmum}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1 pb-8">
        {riwayat.length > 1 && (
          <Button variant="secondary" onClick={kembali} disabled={mengirim}>
            <ChevronLeft /> Kembali
          </Button>
        )}
        <div className="flex-1" />
        {berikut ? (
          <Button onClick={lanjut}>
            Berikutnya <ChevronRight />
          </Button>
        ) : (
          <Button onClick={() => void kirim()} loading={mengirim} disabled={pratinjau} data-testid="form-kirim">
            <Send /> {pratinjau ? 'Kirim (pratinjau)' : 'Kirim'}
          </Button>
        )}
      </div>
    </div>
  );
}
