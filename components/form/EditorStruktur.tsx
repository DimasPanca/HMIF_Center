'use client';

/**
 * EditorStruktur — penyusun bagian & pertanyaan (form dan template).
 *
 * Pola "kartu aktif" ala Google Form: hanya satu pertanyaan terbuka penuh,
 * sisanya ringkas, supaya layar tidak penuh kontrol yang belum dibutuhkan.
 * Pilihan tipe dikelompokkan dengan kalimat bantu (bukan istilah teknis).
 * Pertanyaan yang sudah dijawab dikunci tipenya (ADR-038 #10).
 */

import {
  ArrowDown,
  ArrowUp,
  Copy,
  GitBranch,
  GripVertical,
  Lock,
  Plus,
  Rows3,
  Trash2,
  X,
} from 'lucide-react';
import * as React from 'react';

import { INFO_TIPE, LABEL_PERAN, opsiAwal, PERAN, PERAN_WAJIB, TIPE, TUJUAN_SELESAI, type Bagian, type Kategori, type Opsi, type Pertanyaan, type Struktur, type Tipe } from '@/lib/form/skema';
import { cn } from '@/lib/utils';

const KELAS_INPUT =
  'h-[34px] w-full rounded-sm border border-default bg-panel px-3 text-[14px] text-primary outline-none placeholder:text-tertiary focus:border-[var(--border-focus)] disabled:opacity-60';
const KELAS_KECIL = 'h-8 rounded-sm border border-default bg-panel px-2 text-[13px] text-primary outline-none focus:border-[var(--border-focus)]';
const KELOMPOK = ['Teks', 'Pilihan', 'Nilai', 'Lainnya'] as const;
const PUNYA_PILIHAN: Tipe[] = ['PILIHAN_GANDA', 'DROPDOWN', 'KOTAK_CENTANG'];
const BISA_LOMPAT: Tipe[] = ['PILIHAN_GANDA', 'DROPDOWN'];

export interface EditorStrukturProps {
  struktur: Struktur;
  onUbah: (s: Struktur) => void;
  kategori: Kategori;
  /** id pertanyaan yang sudah punya jawaban. */
  terjawab?: ReadonlySet<string>;
  buatId: () => string;
  nonaktif?: boolean;
}

function pindah<T>(arr: T[], i: number, arah: -1 | 1): T[] {
  const j = i + arah;
  if (j < 0 || j >= arr.length) return arr;
  const salin = [...arr];
  [salin[i], salin[j]] = [salin[j]!, salin[i]!];
  return salin;
}

export function EditorStruktur({ struktur, onUbah, kategori, terjawab = new Set(), buatId, nonaktif }: EditorStrukturProps) {
  const [aktif, setAktif] = React.useState<string | null>(struktur.bagian[0]?.pertanyaan[0]?.id ?? null);
  const [pemilihTipe, setPemilihTipe] = React.useState<string | null>(null);

  const ubahBagian = (bi: number, f: (b: Bagian) => Bagian) => onUbah({ bagian: struktur.bagian.map((b, i) => (i === bi ? f(b) : b)) });
  const ubahPertanyaan = (bi: number, pi: number, f: (p: Pertanyaan) => Pertanyaan) =>
    ubahBagian(bi, (b) => ({ ...b, pertanyaan: b.pertanyaan.map((p, i) => (i === pi ? f(p) : p)) }));

  const tambahPertanyaan = (bi: number, tipe: Tipe) => {
    const p: Pertanyaan = { id: buatId(), tipe, judul: '', deskripsi: '', wajib: false, opsi: opsiAwal(tipe, buatId), peran: null };
    const b = struktur.bagian[bi]!;
    const posisiAktif = b.pertanyaan.findIndex((q) => q.id === aktif);
    const sisip = posisiAktif >= 0 ? posisiAktif + 1 : b.pertanyaan.length;
    ubahBagian(bi, (x) => ({ ...x, pertanyaan: [...x.pertanyaan.slice(0, sisip), p, ...x.pertanyaan.slice(sisip)] }));
    setAktif(p.id);
    setPemilihTipe(null);
    requestAnimationFrame(() => document.getElementById(`judul-${p.id}`)?.focus());
  };

  const tambahBagian = () => {
    const b: Bagian = { id: buatId(), judul: `Bagian ${struktur.bagian.length + 1}`, deskripsi: '', lanjut_ke: null, pertanyaan: [] };
    onUbah({ bagian: [...struktur.bagian, b] });
    setPemilihTipe(b.id);
  };

  const hapusBagian = (bi: number) => {
    const b = struktur.bagian[bi]!;
    if (b.pertanyaan.length && !window.confirm(`Hapus "${b.judul || `Bagian ${bi + 1}`}" beserta ${b.pertanyaan.length} pertanyaannya?`)) return;
    // Rujukan lompat ke bagian ini dikembalikan ke "berikutnya".
    const bersih = (t: string | null | undefined) => (t === b.id ? null : t);
    onUbah({
      bagian: struktur.bagian
        .filter((_, i) => i !== bi)
        .map((x) => ({
          ...x,
          lanjut_ke: bersih(x.lanjut_ke) ?? null,
          pertanyaan: x.pertanyaan.map((p) => (p.opsi.pilihan ? { ...p, opsi: { ...p.opsi, pilihan: p.opsi.pilihan.map((o) => ({ ...o, lompat_ke: bersih(o.lompat_ke) ?? null })) } } : p)),
        })),
    });
  };

  const peranTerpakai = new Map(struktur.bagian.flatMap((b) => b.pertanyaan.filter((p) => p.peran).map((p) => [p.peran!, p.id] as const)));
  const peranKurang = PERAN_WAJIB[kategori].filter((r) => !peranTerpakai.has(r));
  const tujuan = (kecuali: number) => [
    { id: '', label: 'Lanjut ke bagian berikutnya' },
    ...struktur.bagian.map((b, i) => ({ id: b.id, label: `Ke bagian ${i + 1}${b.judul ? `: ${b.judul}` : ''}` })).filter((_, i) => i !== kecuali),
    { id: TUJUAN_SELESAI, label: 'Kirim form (selesai)' },
  ];

  return (
    <div className="grid gap-4">
      {peranKurang.length > 0 && (
        <p className="rounded-sm border border-[var(--warning)] bg-[var(--warning-subtle)] px-3 py-2 text-[13px] leading-5 text-primary">
          Sebelum dibuka, tandai pertanyaan sebagai data <b>{peranKurang.map((r) => LABEL_PERAN[r]).join(' & ')}</b> (menu &quot;Data untuk&quot; di kartu pertanyaan) supaya jawabannya
          bisa dipakai sistem.
        </p>
      )}

      {struktur.bagian.map((b, bi) => {
        const pemegangLogika = b.pertanyaan.find((p) => (p.opsi.pilihan ?? []).some((o) => o.lompat_ke));
        return (
          <section key={b.id} className="grid gap-3" aria-label={`Bagian ${bi + 1}`}>
            {struktur.bagian.length > 1 && (
              <div className="flex items-center gap-2 pt-2">
                <span className="rounded-t-sm bg-[var(--primary)] px-3 py-1 text-[12px] font-semibold text-[var(--primary-text)]">
                  Bagian {bi + 1} dari {struktur.bagian.length}
                </span>
                <div className="flex-1" />
                <IkonTombol label="Naikkan bagian" onClick={() => onUbah({ bagian: pindah(struktur.bagian, bi, -1) })} disabled={bi === 0 || nonaktif}>
                  <ArrowUp />
                </IkonTombol>
                <IkonTombol label="Turunkan bagian" onClick={() => onUbah({ bagian: pindah(struktur.bagian, bi, 1) })} disabled={bi === struktur.bagian.length - 1 || nonaktif}>
                  <ArrowDown />
                </IkonTombol>
                <IkonTombol label="Hapus bagian" onClick={() => hapusBagian(bi)} disabled={nonaktif}>
                  <Trash2 />
                </IkonTombol>
              </div>
            )}
            {(struktur.bagian.length > 1 || b.judul || b.deskripsi) && (
              <div className="grid gap-2 rounded-md border border-default border-t-[3px] border-t-[var(--primary)] bg-panel p-4">
                <input
                  aria-label="Judul bagian"
                  value={b.judul}
                  onChange={(e) => ubahBagian(bi, (x) => ({ ...x, judul: e.target.value }))}
                  placeholder="Judul bagian (mis. Data diri)"
                  maxLength={200}
                  disabled={nonaktif}
                  className={cn(KELAS_INPUT, 'text-[16px] font-semibold')}
                />
                <textarea
                  aria-label="Deskripsi bagian"
                  value={b.deskripsi}
                  onChange={(e) => ubahBagian(bi, (x) => ({ ...x, deskripsi: e.target.value }))}
                  placeholder="Keterangan bagian (opsional)"
                  rows={2}
                  maxLength={2000}
                  disabled={nonaktif}
                  className="rounded-sm border border-default bg-panel px-3 py-2 text-[13px] outline-none focus:border-[var(--border-focus)]"
                />
              </div>
            )}

            {b.pertanyaan.length === 0 && (
              <p className="rounded-md border border-dashed border-strong px-4 py-6 text-center text-[13px] text-secondary">Bagian ini belum punya pertanyaan.</p>
            )}

            {b.pertanyaan.map((p, pi) => (
              <KartuPertanyaan
                key={p.id}
                p={p}
                aktif={aktif === p.id}
                onAktif={() => setAktif(p.id)}
                terkunci={terjawab.has(p.id)}
                nonaktif={nonaktif}
                buatId={buatId}
                onUbah={(f) => ubahPertanyaan(bi, pi, f)}
                onNaik={pi > 0 ? () => ubahBagian(bi, (x) => ({ ...x, pertanyaan: pindah(x.pertanyaan, pi, -1) })) : undefined}
                onTurun={pi < b.pertanyaan.length - 1 ? () => ubahBagian(bi, (x) => ({ ...x, pertanyaan: pindah(x.pertanyaan, pi, 1) })) : undefined}
                onGandakan={() => {
                  const salin: Pertanyaan = {
                    ...p,
                    id: buatId(),
                    peran: null,
                    opsi: {
                      ...p.opsi,
                      pilihan: p.opsi.pilihan?.map((o) => ({ ...o, id: buatId(), lompat_ke: null })),
                      baris: p.opsi.baris?.map((o) => ({ ...o, id: buatId() })),
                      kolom: p.opsi.kolom?.map((o) => ({ ...o, id: buatId() })),
                    },
                  };
                  ubahBagian(bi, (x) => ({ ...x, pertanyaan: [...x.pertanyaan.slice(0, pi + 1), salin, ...x.pertanyaan.slice(pi + 1)] }));
                  setAktif(salin.id);
                }}
                onHapus={() => ubahBagian(bi, (x) => ({ ...x, pertanyaan: x.pertanyaan.filter((_, i) => i !== pi) }))}
                peranLain={(r) => {
                  const pemilik = peranTerpakai.get(r);
                  return !!pemilik && pemilik !== p.id;
                }}
                tujuanLompat={struktur.bagian.length > 1 ? tujuan(bi) : null}
                logikaDiTempatLain={!!pemegangLogika && pemegangLogika.id !== p.id}
              />
            ))}

            {pemilihTipe === b.id ? (
              <PemilihTipe onPilih={(t) => tambahPertanyaan(bi, t)} onTutup={() => setPemilihTipe(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPemilihTipe(b.id)}
                  disabled={nonaktif}
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-dashed border-strong bg-panel px-3 text-[14px] font-medium text-link hover:bg-subtle disabled:opacity-50"
                  data-testid="tambah-pertanyaan"
                >
                  <Plus className="size-4" /> Tambah pertanyaan
                </button>
                {struktur.bagian.length > 1 && (
                  <label className="ml-auto flex items-center gap-2 text-[13px] text-secondary">
                    Setelah bagian {bi + 1}:
                    <select
                      value={b.lanjut_ke ?? ''}
                      onChange={(e) => ubahBagian(bi, (x) => ({ ...x, lanjut_ke: e.target.value || null }))}
                      disabled={nonaktif}
                      className={KELAS_KECIL}
                    >
                      {tujuan(bi).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </section>
        );
      })}

      <button
        type="button"
        onClick={tambahBagian}
        disabled={nonaktif || struktur.bagian.length >= 30}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-dashed border-strong text-[14px] font-medium text-secondary hover:bg-subtle disabled:opacity-50"
      >
        <Rows3 className="size-4" /> Tambah bagian (halaman baru)
      </button>
    </div>
  );
}

function IkonTombol({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-sm text-secondary hover:bg-subtle hover:text-primary disabled:opacity-35 disabled:hover:bg-transparent [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function PemilihTipe({ onPilih, onTutup }: { onPilih: (t: Tipe) => void; onTutup: () => void }) {
  return (
    <div className="rounded-md border border-default bg-panel p-4 shadow-sm" role="dialog" aria-label="Pilih jenis pertanyaan">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[14px] font-semibold">Jenis pertanyaan apa?</p>
        <IkonTombol label="Tutup" onClick={onTutup}>
          <X />
        </IkonTombol>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KELOMPOK.map((k) => (
          <div key={k}>
            <p className="mb-1.5 text-[12px] font-medium text-tertiary">{k}</p>
            <div className="grid gap-1">
              {TIPE.filter((t) => INFO_TIPE[t].kelompok === k).map((t) => (
                <button key={t} type="button" onClick={() => onPilih(t)} className="rounded-sm px-2 py-1.5 text-left hover:bg-subtle" data-testid={`tipe-${t}`}>
                  <span className="block text-[14px] font-medium text-primary">{INFO_TIPE[t].label}</span>
                  <span className="block text-[12px] leading-4 text-tertiary">{INFO_TIPE[t].bantuan}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ringkasOpsi(p: Pertanyaan): string {
  const o = p.opsi;
  if (o.pilihan) return o.pilihan.map((x) => x.label).join(' · ');
  if (p.tipe === 'SKALA') return `${o.skala_min ?? 1}–${o.skala_maks ?? 5}${o.label_min ? ` (${o.label_min} → ${o.label_maks ?? ''})` : ''}`;
  if (o.baris) return `${o.baris.length} baris × ${o.kolom?.length ?? 0} kolom`;
  if (p.tipe === 'UNGGAH_BERKAS') return `${(o.jenis ?? []).map((j) => (j === 'gambar' ? 'Foto' : 'PDF')).join('/')} · maks ${o.maks_mb ?? 4} MB`;
  return '';
}

function KartuPertanyaan(props: {
  p: Pertanyaan;
  aktif: boolean;
  onAktif: () => void;
  terkunci: boolean;
  nonaktif?: boolean;
  buatId: () => string;
  onUbah: (f: (p: Pertanyaan) => Pertanyaan) => void;
  onNaik?: () => void;
  onTurun?: () => void;
  onGandakan: () => void;
  onHapus: () => void;
  peranLain: (r: Pertanyaan['peran'] & string) => boolean;
  tujuanLompat: { id: string; label: string }[] | null;
  logikaDiTempatLain: boolean;
}) {
  const { p, aktif, onAktif, terkunci, nonaktif, buatId, onUbah } = props;
  const o = p.opsi;
  const ubahOpsi = (f: (o: Opsi) => Opsi) => onUbah((x) => ({ ...x, opsi: f(x.opsi) }));
  const [keterangan, setKeterangan] = React.useState(!!p.deskripsi);
  const adaLogika = (o.pilihan ?? []).some((x) => x.lompat_ke);
  const [logika, setLogika] = React.useState(adaLogika);

  const gantiTipe = (t: Tipe) =>
    onUbah((x) => {
      // Pilihan dipertahankan antar-tipe pilihan; lompat hanya untuk PG/dropdown.
      const baru = PUNYA_PILIHAN.includes(t) && x.opsi.pilihan ? { pilihan: x.opsi.pilihan.map((c) => ({ ...c, lompat_ke: BISA_LOMPAT.includes(t) ? c.lompat_ke : null })) } : opsiAwal(t, buatId);
      return { ...x, tipe: t, opsi: baru };
    });

  if (!aktif) {
    return (
      <button
        type="button"
        onClick={onAktif}
        className="group flex w-full items-start gap-3 rounded-md border border-default bg-panel p-4 text-left transition-colors hover:border-strong"
        data-testid="kartu-pertanyaan"
      >
        <GripVertical aria-hidden className="mt-0.5 size-4 shrink-0 text-tertiary opacity-0 group-hover:opacity-100" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-6 font-medium text-primary">
            {p.judul || <span className="text-tertiary italic">Pertanyaan tanpa judul</span>}
            {p.wajib && <span className="ml-1 text-danger">*</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-tertiary">
            <span>{INFO_TIPE[p.tipe].label}</span>
            {ringkasOpsi(p) && <span className="max-w-[40ch] truncate">· {ringkasOpsi(p)}</span>}
            {p.peran && <span className="rounded-full bg-[var(--info-subtle)] px-2 py-0.5 text-primary">Data: {LABEL_PERAN[p.peran]}</span>}
            {adaLogika && (
              <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5">
                <GitBranch className="size-3" /> logika
              </span>
            )}
            {terkunci && <Lock className="size-3" aria-label="sudah dijawab" />}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-md border border-default border-l-[3px] border-l-[var(--primary)] bg-panel p-4 shadow-sm" data-testid="kartu-pertanyaan-aktif">
      <div className="grid gap-3 sm:grid-cols-[1fr_15rem]">
        <input
          id={`judul-${p.id}`}
          aria-label="Pertanyaan"
          value={p.judul}
          onChange={(e) => onUbah((x) => ({ ...x, judul: e.target.value }))}
          placeholder="Tulis pertanyaan"
          maxLength={500}
          disabled={nonaktif}
          className={cn(KELAS_INPUT, 'h-10 bg-subtle text-[15px] font-medium')}
        />
        <div>
          <select
            aria-label="Jenis pertanyaan"
            value={p.tipe}
            onChange={(e) => gantiTipe(e.target.value as Tipe)}
            disabled={nonaktif || terkunci}
            className={cn(KELAS_INPUT, 'h-10')}
          >
            {KELOMPOK.map((k) => (
              <optgroup key={k} label={k}>
                {TIPE.filter((t) => INFO_TIPE[t].kelompok === k).map((t) => (
                  <option key={t} value={t}>
                    {INFO_TIPE[t].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {terkunci && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-tertiary">
              <Lock className="size-3" /> Sudah dijawab — jenis terkunci
            </p>
          )}
        </div>
      </div>

      {keterangan ? (
        <textarea
          aria-label="Keterangan pertanyaan"
          value={p.deskripsi}
          onChange={(e) => onUbah((x) => ({ ...x, deskripsi: e.target.value }))}
          placeholder="Keterangan atau contoh jawaban"
          rows={2}
          maxLength={2000}
          disabled={nonaktif}
          className="mt-2 w-full rounded-sm border border-default bg-panel px-3 py-2 text-[13px] outline-none focus:border-[var(--border-focus)]"
        />
      ) : (
        <button type="button" onClick={() => setKeterangan(true)} className="mt-2 text-[12px] text-link hover:underline">
          + Tambah keterangan
        </button>
      )}

      <div className="mt-4">
        {PUNYA_PILIHAN.includes(p.tipe) && (
          <EditorPilihan
            p={p}
            buatId={buatId}
            nonaktif={nonaktif}
            ubahOpsi={ubahOpsi}
            tujuanLompat={logika && BISA_LOMPAT.includes(p.tipe) ? props.tujuanLompat : null}
          />
        )}
        {p.tipe === 'SKALA' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-[13px]">
              <select aria-label="Nilai terendah" value={o.skala_min ?? 1} onChange={(e) => ubahOpsi((x) => ({ ...x, skala_min: Number(e.target.value) as 0 | 1 }))} className={KELAS_KECIL} disabled={nonaktif}>
                <option value={0}>0</option>
                <option value={1}>1</option>
              </select>
              sampai
              <select aria-label="Nilai tertinggi" value={o.skala_maks ?? 5} onChange={(e) => ubahOpsi((x) => ({ ...x, skala_maks: Number(e.target.value) }))} className={KELAS_KECIL} disabled={nonaktif}>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <input aria-label="Label nilai terendah" value={o.label_min ?? ''} onChange={(e) => ubahOpsi((x) => ({ ...x, label_min: e.target.value }))} placeholder={`Label ${o.skala_min ?? 1} (mis. Sangat Tidak Puas)`} maxLength={60} className={KELAS_KECIL} disabled={nonaktif} />
              <input aria-label="Label nilai tertinggi" value={o.label_maks ?? ''} onChange={(e) => ubahOpsi((x) => ({ ...x, label_maks: e.target.value }))} placeholder={`Label ${o.skala_maks ?? 5} (mis. Sangat Puas)`} maxLength={60} className={KELAS_KECIL} disabled={nonaktif} />
            </div>
          </div>
        )}
        {(p.tipe === 'KISI_PILIHAN' || p.tipe === 'KISI_CENTANG') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <DaftarLabel judul="Baris (yang dinilai)" item={o.baris ?? []} onUbah={(v) => ubahOpsi((x) => ({ ...x, baris: v }))} buatId={buatId} awalan="Baris" maks={50} nonaktif={nonaktif} />
            <DaftarLabel judul="Kolom (pilihan)" item={o.kolom ?? []} onUbah={(v) => ubahOpsi((x) => ({ ...x, kolom: v }))} buatId={buatId} awalan="Kolom" maks={20} nonaktif={nonaktif} />
          </div>
        )}
        {(p.tipe === 'TEKS_SINGKAT' || p.tipe === 'PARAGRAF') && (
          <label className="flex items-center gap-2 text-[13px] text-secondary">
            Batas karakter
            <input
              type="number"
              min={1}
              max={p.tipe === 'TEKS_SINGKAT' ? 500 : 5000}
              value={o.maks ?? ''}
              placeholder={p.tipe === 'TEKS_SINGKAT' ? '500' : '5000'}
              onChange={(e) => ubahOpsi((x) => ({ ...x, maks: e.target.value ? Math.min(Number(e.target.value), p.tipe === 'TEKS_SINGKAT' ? 500 : 5000) : undefined }))}
              className={cn(KELAS_KECIL, 'w-24')}
              disabled={nonaktif}
            />
          </label>
        )}
        {p.tipe === 'ANGKA' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-secondary">
            Batas nilai
            <input type="number" aria-label="Minimal" placeholder="min" value={o.min ?? ''} onChange={(e) => ubahOpsi((x) => ({ ...x, min: e.target.value === '' ? undefined : Number(e.target.value) }))} className={cn(KELAS_KECIL, 'w-24')} disabled={nonaktif} />
            –
            <input type="number" aria-label="Maksimal" placeholder="maks" value={o.maks ?? ''} onChange={(e) => ubahOpsi((x) => ({ ...x, maks: e.target.value === '' ? undefined : Math.max(1, Math.trunc(Number(e.target.value))) }))} className={cn(KELAS_KECIL, 'w-24')} disabled={nonaktif} />
          </div>
        )}
        {p.tipe === 'KOTAK_CENTANG' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-secondary">
            Jumlah pilihan
            <input type="number" min={0} aria-label="Minimal dipilih" placeholder="min" value={o.min_pilih ?? ''} onChange={(e) => ubahOpsi((x) => ({ ...x, min_pilih: e.target.value === '' ? undefined : Number(e.target.value) }))} className={cn(KELAS_KECIL, 'w-20')} disabled={nonaktif} />
            –
            <input type="number" min={1} aria-label="Maksimal dipilih" placeholder="maks" value={o.maks_pilih ?? ''} onChange={(e) => ubahOpsi((x) => ({ ...x, maks_pilih: e.target.value === '' ? undefined : Number(e.target.value) }))} className={cn(KELAS_KECIL, 'w-20')} disabled={nonaktif} />
          </div>
        )}
        {p.tipe === 'UNGGAH_BERKAS' && (
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            {(['gambar', 'pdf'] as const).map((j) => {
              const jenis = o.jenis ?? ['gambar', 'pdf'];
              const ada = jenis.includes(j);
              return (
                <label key={j} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ada}
                    disabled={nonaktif || (ada && jenis.length === 1)}
                    onChange={() => ubahOpsi((x) => ({ ...x, jenis: ada ? jenis.filter((y) => y !== j) : [...jenis, j] }))}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {j === 'gambar' ? 'Foto (JPG/PNG/WebP)' : 'PDF'}
                </label>
              );
            })}
            <label className="flex items-center gap-2 text-secondary">
              Maks
              <select value={o.maks_mb ?? 4} onChange={(e) => ubahOpsi((x) => ({ ...x, maks_mb: Number(e.target.value) }))} className={KELAS_KECIL} disabled={nonaktif}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} MB
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {['EMAIL', 'TANGGAL', 'WAKTU'].includes(p.tipe) && <p className="text-[13px] text-tertiary">{INFO_TIPE[p.tipe].bantuan}.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-subtle pt-3">
        <label className="flex items-center gap-2 text-[13px] text-secondary" title="Hubungkan jawaban ke data sistem (peserta/pengurus)">
          Data untuk
          <select
            value={p.peran ?? ''}
            onChange={(e) => onUbah((x) => ({ ...x, peran: (e.target.value || null) as Pertanyaan['peran'] }))}
            disabled={nonaktif}
            className={KELAS_KECIL}
          >
            <option value="">— tidak ada —</option>
            {PERAN.map((r) => (
              <option key={r} value={r} disabled={props.peranLain(r)}>
                {LABEL_PERAN[r]}
                {props.peranLain(r) ? ' (sudah dipakai)' : ''}
              </option>
            ))}
          </select>
        </label>
        {BISA_LOMPAT.includes(p.tipe) && props.tujuanLompat && (
          <label className={cn('flex items-center gap-2 text-[13px] text-secondary', props.logikaDiTempatLain && 'opacity-50')} title={props.logikaDiTempatLain ? 'Hanya satu pertanyaan per bagian yang boleh berlogika' : undefined}>
            <input
              type="checkbox"
              checked={logika}
              disabled={nonaktif || props.logikaDiTempatLain}
              onChange={(e) => {
                setLogika(e.target.checked);
                if (!e.target.checked) ubahOpsi((x) => ({ ...x, pilihan: x.pilihan?.map((c) => ({ ...c, lompat_ke: null })) }));
              }}
              className="size-4 accent-[var(--primary)]"
            />
            <GitBranch className="size-3.5" /> Lompat ke bagian sesuai jawaban
          </label>
        )}
        <div className="ml-auto flex items-center gap-1">
          <IkonTombol label="Naikkan" onClick={() => props.onNaik?.()} disabled={!props.onNaik || nonaktif}>
            <ArrowUp />
          </IkonTombol>
          <IkonTombol label="Turunkan" onClick={() => props.onTurun?.()} disabled={!props.onTurun || nonaktif}>
            <ArrowDown />
          </IkonTombol>
          <IkonTombol label="Gandakan" onClick={props.onGandakan} disabled={nonaktif}>
            <Copy />
          </IkonTombol>
          <IkonTombol
            label={terkunci ? 'Arsipkan (sudah dijawab)' : 'Hapus'}
            onClick={() => {
              if (terkunci && !window.confirm('Pertanyaan ini sudah dijawab. Jawaban lama tetap tersimpan di ekspor sebagai kolom arsip. Lanjutkan?')) return;
              props.onHapus();
            }}
            disabled={nonaktif}
          >
            <Trash2 />
          </IkonTombol>
          <span className="mx-1 h-5 w-px bg-[var(--border-default)]" />
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
            Wajib
            <input
              type="checkbox"
              role="switch"
              checked={p.wajib}
              onChange={(e) => onUbah((x) => ({ ...x, wajib: e.target.checked }))}
              disabled={nonaktif}
              className="peer sr-only"
              data-testid="toggle-wajib"
            />
            <span aria-hidden className="relative h-5 w-9 rounded-full bg-muted transition-colors peer-checked:bg-[var(--primary)] after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-panel after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-3 peer-focus-visible:ring-[var(--border-focus)]" />
          </label>
        </div>
      </div>
    </div>
  );
}

function EditorPilihan({
  p,
  buatId,
  nonaktif,
  ubahOpsi,
  tujuanLompat,
}: {
  p: Pertanyaan;
  buatId: () => string;
  nonaktif?: boolean;
  ubahOpsi: (f: (o: Opsi) => Opsi) => void;
  tujuanLompat: { id: string; label: string }[] | null;
}) {
  const pilihan = p.opsi.pilihan ?? [];
  const tanda = p.tipe === 'KOTAK_CENTANG' ? 'rounded-[3px]' : p.tipe === 'PILIHAN_GANDA' ? 'rounded-full' : '';
  const ubahLabel = (i: number, label: string) => ubahOpsi((o) => ({ ...o, pilihan: (o.pilihan ?? []).map((c, j) => (j === i ? { ...c, label } : c)) }));
  const tambah = () => ubahOpsi((o) => ({ ...o, pilihan: [...(o.pilihan ?? []), { id: buatId(), label: `Opsi ${(o.pilihan?.length ?? 0) + 1}` }] }));

  return (
    <div className="grid gap-1.5">
      {pilihan.map((c, i) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {tanda ? <span aria-hidden className={cn('size-4 shrink-0 border-2 border-strong', tanda)} /> : <span className="w-4 shrink-0 text-right text-[12px] text-tertiary tabular-nums">{i + 1}.</span>}
          <input
            aria-label={`Opsi ${i + 1}`}
            value={c.label}
            onChange={(e) => ubahLabel(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                tambah();
                requestAnimationFrame(() => (e.currentTarget.closest('.grid')?.querySelectorAll('input[aria-label^="Opsi"]') as NodeListOf<HTMLInputElement> | undefined)?.[i + 1]?.focus());
              }
            }}
            maxLength={200}
            disabled={nonaktif}
            className="h-8 min-w-0 flex-1 border-0 border-b border-transparent bg-transparent px-1 text-[14px] outline-none hover:border-default focus:border-[var(--border-focus)]"
          />
          {tujuanLompat && (
            <select
              aria-label={`Setelah memilih ${c.label}`}
              value={c.lompat_ke ?? ''}
              onChange={(e) => ubahOpsi((o) => ({ ...o, pilihan: (o.pilihan ?? []).map((x, j) => (j === i ? { ...x, lompat_ke: e.target.value || null } : x)) }))}
              disabled={nonaktif}
              className={cn(KELAS_KECIL, 'max-w-56')}
            >
              {tujuanLompat.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          <IkonTombol label={`Hapus opsi ${i + 1}`} onClick={() => ubahOpsi((o) => ({ ...o, pilihan: (o.pilihan ?? []).filter((_, j) => j !== i) }))} disabled={nonaktif || pilihan.length <= 1}>
            <X />
          </IkonTombol>
        </div>
      ))}
      {p.opsi.lainnya && (
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn('size-4 shrink-0 border-2 border-strong', tanda)} />
          <span className="flex-1 px-1 text-[14px] text-tertiary">Lainnya: (diisi sendiri)</span>
          <IkonTombol label="Hapus Lainnya" onClick={() => ubahOpsi((o) => ({ ...o, lainnya: undefined }))} disabled={nonaktif}>
            <X />
          </IkonTombol>
        </div>
      )}
      <div className="flex items-center gap-2 pl-6 text-[13px]">
        <button type="button" onClick={tambah} disabled={nonaktif || pilihan.length >= 100} className="text-link hover:underline">
          Tambah opsi
        </button>
        {p.tipe === 'PILIHAN_GANDA' && !p.opsi.lainnya && (
          <>
            <span className="text-tertiary">atau</span>
            <button type="button" onClick={() => ubahOpsi((o) => ({ ...o, lainnya: true }))} disabled={nonaktif} className="text-link hover:underline">
              tambah &quot;Lainnya&quot;
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DaftarLabel({
  judul,
  item,
  onUbah,
  buatId,
  awalan,
  maks,
  nonaktif,
}: {
  judul: string;
  item: { id: string; label: string }[];
  onUbah: (v: { id: string; label: string }[]) => void;
  buatId: () => string;
  awalan: string;
  maks: number;
  nonaktif?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-secondary">{judul}</p>
      <div className="grid gap-1">
        {item.map((x, i) => (
          <div key={x.id} className="flex items-center gap-1">
            <span className="w-5 text-right text-[12px] text-tertiary tabular-nums">{i + 1}.</span>
            <input
              aria-label={`${awalan} ${i + 1}`}
              value={x.label}
              onChange={(e) => onUbah(item.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))}
              maxLength={200}
              disabled={nonaktif}
              className="h-8 min-w-0 flex-1 border-0 border-b border-transparent bg-transparent px-1 text-[14px] outline-none hover:border-default focus:border-[var(--border-focus)]"
            />
            <IkonTombol label={`Hapus ${awalan.toLowerCase()} ${i + 1}`} onClick={() => onUbah(item.filter((_, j) => j !== i))} disabled={nonaktif || item.length <= 1}>
              <X />
            </IkonTombol>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onUbah([...item, { id: buatId(), label: `${awalan} ${item.length + 1}` }])} disabled={nonaktif || item.length >= maks} className="mt-1 pl-6 text-[13px] text-link hover:underline">
        Tambah {awalan.toLowerCase()}
      </button>
    </div>
  );
}
