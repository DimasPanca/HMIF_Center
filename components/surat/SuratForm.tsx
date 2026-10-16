'use client';

/**
 * SuratForm — form surat dinamis (T-058): form kiri 60%, pratinjau kanan 40%.
 *
 * Satu skema untuk semuanya (K-04): `buatSkemaSurat(konfig)` menentukan field
 * mana yang kurang, `serialisasiFieldSchema(jenis)` menentukan field khusus
 * yang dirender, `FIELD_UMUM_TERPAKAI[jenis]` menentukan field umum yang
 * tampil. Konfigurasi (kegiatan, kota, kode administrasi, PDF) datang dari
 * server sebagai props — tidak ada default yang ditulis di sini.
 *
 * Auto-save tiap 10 detik dan saat fokus meninggalkan form, hanya bila ada
 * perubahan. Draft pertama dibuat lewat POST; id-nya dipasang ke URL dengan
 * `history.replaceState`, bukan navigasi router, supaya form tidak di-render
 * ulang di tengah orang mengetik.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-058 · PRD F-4.2 · USER_FLOW §5.1 ·
 *         DESIGN_SYSTEM §9.5 · ADR-026
 */

import { Check, CircleAlert, Clock3, Send } from 'lucide-react';
import * as React from 'react';

import { FieldRenderer, type CariGalat } from '@/components/surat/FieldRenderer';
import { IsiSuratEditor } from '@/components/surat/IsiSuratEditor';
import { SuratPreview } from '@/components/surat/SuratPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ToastProvider, useToast } from '@/components/ui/toast';
import {
  ATURAN_PENANDATANGAN,
  FIELD_UMUM_TERPAKAI,
  JENIS_SURAT,
  infoJenis,
  kunciKhusus,
  nilaiAwalSurat,
  opsiFormatOutput,
  periksaKelengkapan,
  serialisasiFieldSchema,
  type FieldUmum,
  type JenisSurat,
  type KonfigSurat,
  type MasalahField,
  type SuratFormInput,
} from '@/lib/surat/field-schemas';
import { terapkanPreset, type PresetTujuan } from '@/lib/surat/preset-tujuan';
import type { KetuaHimpunan } from '@/lib/surat/render-preview';
import { cn } from '@/lib/utils';

export const INTERVAL_AUTOSAVE_MS = 10_000;
const DURASI_TERSIMPAN_MS = 2_000;

type Nilai = Record<string, unknown> & { jenis: JenisSurat; data_dinamis: Record<string, unknown> };
type Ttd = { jabatan: string; nama: string; nim: string; user_id?: string | null };

/** Field umum yang diingat lintas jenis, supaya bolak-balik jenis tidak menghapus isian. */
const KUNCI_BERSAMA: FieldUmum[] = [
  'kode_kegiatan',
  'tanggal_surat',
  'kota',
  'lampiran',
  'perihal',
  'tujuan_preset',
  'tujuan_nama',
  'tujuan_alamat',
  'isi_surat',
  'penandatangan_tambahan',
  'format_output',
];

export interface SuratFormProps {
  konfig: KonfigSurat;
  preset: PresetTujuan[];
  awal: { id: string; nilai: SuratFormInput } | null;
  /**
   * Isian awal draft baru dari konteks pemanggil, mis. "Buat Surat untuk acara
   * ini" (T-084): kode kegiatan dan field khusus senama (`nama_kegiatan`,
   * `tema_kegiatan`). Kunci yang tidak dipakai jenis awal diabaikan.
   */
  /** Isian dari acara (T-084); `rundown` = baris tabel rundown acara (T-095). */
  isianAwal?: { kode_kegiatan?: string; data_dinamis?: Record<string, string | Record<string, string>[]> };
  /** Ketua Himpunan periode aktif — kolom kanan blok tanda tangan di pratinjau. */
  ketua: KetuaHimpunan | null;
  /** Jenis awal untuk draft baru, mis. dari `?jenis=` atau peminjaman ruangan. */
  jenisAwal?: JenisSurat;
  /** Diisi bila surat ini dikembalikan approver; menyuntingnya menjadikannya draft lagi. */
  alasanPenolakan?: string | null;
}

type StatusSimpan = 'diam' | 'menyimpan' | 'tersimpan' | 'galat';

const terisi = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);
/** Daftar yang belum disentuh: kosong, atau hanya baris default yang semua selnya kosong. */
const kosong = (v: unknown) =>
  Array.isArray(v) ? v.every((b) => !b || typeof b !== 'object' || Object.values(b).every((x) => !x)) : !v;

/** Menimpa nilai awal dengan `isianAwal`, hanya pada kunci yang memang ada di jenis itu. */
function isiAwal(nilai: Nilai, isian: SuratFormProps['isianAwal']): Nilai {
  if (!isian) return nilai;
  const dinamis = { ...nilai.data_dinamis };
  for (const [k, v] of Object.entries(isian.data_dinamis ?? {})) if (k in dinamis && terisi(v)) dinamis[k] = v;
  return { ...nilai, ...(isian.kode_kegiatan ? { kode_kegiatan: isian.kode_kegiatan } : {}), data_dinamis: dinamis };
}

function teks(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Path galat → id elemen yang difokuskan dari daftar "masih kurang". */
function idUntukPath(path: string): string {
  const [akar, a, b, c] = path.split('.');
  if (akar === 'data_dinamis') return b === undefined ? `surat-dinamis-${a}` : `surat-dinamis-${a}-${b}${c ? `-${c}` : ''}`;
  if (akar === 'penandatangan_tambahan') return b ? `surat-ttd-${b}` : 'surat-ttd';
  return `surat-field-${akar}`;
}

function Form({ konfig, preset, awal, jenisAwal, ketua, alasanPenolakan, isianAwal }: SuratFormProps) {
  const toast = useToast();
  const [nilai, setNilai] = React.useState<Nilai>(
    () => (awal?.nilai ?? isiAwal(nilaiAwalSurat(konfig, jenisAwal ?? 'PEMINJAMAN_RUANGAN') as unknown as Nilai, isianAwal)) as unknown as Nilai,
  );
  const [id, setId] = React.useState<string | null>(awal?.id ?? null);
  const [status, setStatus] = React.useState<StatusSimpan>('diam');
  const [pesanGalat, setPesanGalat] = React.useState<string | null>(null);
  const [disentuh, setDisentuh] = React.useState<Set<string>>(() => new Set());
  const [mengajukan, setMengajukan] = React.useState(false);
  const [diajukan, setDiajukan] = React.useState(false);

  // Ref untuk auto-save: interval tidak boleh menangkap nilai basi dari closure lama.
  const nilaiRef = React.useRef(nilai);
  const idRef = React.useRef(id);
  const kotorRef = React.useRef(false);
  const menyimpanRef = React.useRef(false);
  const memoriBersama = React.useRef<Record<string, unknown>>({});
  const timerTersimpan = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  nilaiRef.current = nilai;
  idRef.current = id;

  const jenis = nilai.jenis;
  const umum = React.useMemo(() => new Set(FIELD_UMUM_TERPAKAI[jenis]), [jenis]);
  const deskripsi = React.useMemo(() => serialisasiFieldSchema(jenis), [jenis]);
  const aturanKiri = ATURAN_PENANDATANGAN[jenis].find((a) => a.posisi === 'KIRI');
  const masalah = React.useMemo(() => periksaKelengkapan(konfig, nilai), [konfig, nilai]);
  const peta = React.useMemo(() => new Map(masalah.map((m) => [m.path, m.pesan])), [masalah]);

  // Galat inline hanya untuk field yang sudah disentuh; daftar "kurang" selalu tampil.
  const galat: CariGalat = React.useCallback(
    (path) => {
      for (const d of disentuh) if (path === d || path.startsWith(`${d}.`)) return peta.get(path);
      return undefined;
    },
    [disentuh, peta],
  );

  const ubah = React.useCallback((k: string, v: unknown) => {
    kotorRef.current = true;
    setNilai((n) => ({ ...n, [k]: v }));
  }, []);
  const ubahDinamis = React.useCallback((k: string, v: unknown) => {
    kotorRef.current = true;
    setNilai((n) => ({ ...n, data_dinamis: { ...n.data_dinamis, [k]: v } }));
  }, []);
  const sentuh = (path: string) => setDisentuh((s) => (s.has(path) ? s : new Set(s).add(path)));

  const simpan = React.useCallback(
    async (paksa = false): Promise<boolean> => {
      if ((!kotorRef.current && !paksa) || menyimpanRef.current) return !kotorRef.current;
      menyimpanRef.current = true;
      kotorRef.current = false;
      setStatus('menyimpan');
      try {
        const idKini = idRef.current;
        const res = await fetch(idKini ? `/api/surat/${idKini}` : '/api/surat', {
          method: idKini ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nilaiRef.current),
        });
        const body = (await res.json().catch(() => null)) as
          | { ok: true; data: { id: string } }
          | { ok: false; error: { message: string } }
          | null;
        if (!res.ok || !body?.ok) {
          throw new Error(body && !body.ok ? body.error.message : `Server menjawab ${res.status}.`);
        }
        if (!idKini) {
          setId(body.data.id);
          idRef.current = body.data.id;
          window.history.replaceState(window.history.state, '', `/surat/baru?id=${body.data.id}`);
        }
        setPesanGalat(null);
        setStatus('tersimpan');
        if (timerTersimpan.current) clearTimeout(timerTersimpan.current);
        timerTersimpan.current = setTimeout(() => setStatus('diam'), DURASI_TERSIMPAN_MS);
        return true;
      } catch (e) {
        kotorRef.current = true; // dicoba lagi pada siklus berikutnya
        setPesanGalat((e as Error).message);
        setStatus('galat');
        return false;
      } finally {
        menyimpanRef.current = false;
      }
    },
    [],
  );

  React.useEffect(() => {
    if (diajukan) return;
    const t = setInterval(() => void simpan(), INTERVAL_AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [simpan, diajukan]);

  // Menutup tab dengan perubahan belum tersimpan: kirim sekali dengan keepalive.
  React.useEffect(() => {
    const sebelumTutup = () => {
      if (!kotorRef.current || !idRef.current) return;
      void fetch(`/api/surat/${idRef.current}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nilaiRef.current),
        keepalive: true,
      });
    };
    window.addEventListener('pagehide', sebelumTutup);
    return () => window.removeEventListener('pagehide', sebelumTutup);
  }, []);

  React.useEffect(() => () => {
    if (timerTersimpan.current) clearTimeout(timerTersimpan.current);
  }, []);

  function gantiJenis(baru: JenisSurat) {
    if (baru === jenis) return;
    const lama = nilaiRef.current;
    // Ingat nilai bersama milik jenis lama sebelum ditimpa default jenis baru.
    for (const k of FIELD_UMUM_TERPAKAI[lama.jenis]) memoriBersama.current[k] = lama[k];

    const awalBaru = nilaiAwalSurat(konfig, baru) as unknown as Nilai;
    const terpakai = new Set(FIELD_UMUM_TERPAKAI[baru]);
    const bolehKiri = ATURAN_PENANDATANGAN[baru].some((a) => a.posisi === 'KIRI');
    const hasil: Nilai = { ...awalBaru };
    for (const k of KUNCI_BERSAMA) {
      if (!terpakai.has(k) || !(k in memoriBersama.current)) continue;
      if (k === 'penandatangan_tambahan' && !bolehKiri) continue;
      hasil[k] = memoriBersama.current[k];
    }
    // Field khusus senama (mis. nama_kegiatan, hari_tanggal) ikut pindah;
    // nilai tetap seperti label_kanan selalu dari default jenis baru.
    const tetap = serialisasiFieldSchema(baru).tetap;
    for (const k of kunciKhusus(baru)) {
      if (k in lama.data_dinamis && !(k in tetap)) hasil.data_dinamis[k] = lama.data_dinamis[k];
    }
    // Isian acara (mis. rundown) mengisi field jenis baru yang masih kosong.
    for (const [k, v] of Object.entries(isianAwal?.data_dinamis ?? {})) {
      if (k in hasil.data_dinamis && !(k in tetap) && terisi(v) && kosong(hasil.data_dinamis[k])) hasil.data_dinamis[k] = v;
    }
    kotorRef.current = true;
    setNilai(hasil);
  }

  function pilihPreset(label: string) {
    const isi = terapkanPreset(label, preset);
    kotorRef.current = true;
    setNilai((n) => ({ ...n, ...isi }));
  }

  async function ajukan() {
    if (masalah.length > 0 || mengajukan) return;
    setMengajukan(true);
    try {
      // Simpan dulu: yang diajukan harus persis yang terlihat di layar.
      if (!(await simpan(true)) || !idRef.current) {
        toast.error({
          title: 'Draft belum tersimpan',
          description: 'Surat belum dapat diajukan karena perubahan terakhir belum tersimpan.',
          suggestion: 'Tunggu indikator "Tersimpan", lalu tekan Ajukan lagi.',
        });
        return;
      }
      const res = await fetch(`/api/surat/${idRef.current}/submit`, { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
      if (!res.ok || !body?.ok) {
        toast.error({
          title: 'Surat belum dapat diajukan',
          description: body?.error?.message ?? `Server menjawab ${res.status}.`,
          suggestion: 'Periksa daftar field yang kurang, lalu coba lagi.',
        });
        return;
      }
      kotorRef.current = false;
      setDiajukan(true);
    } finally {
      setMengajukan(false);
    }
  }

  const ttd = (Array.isArray(nilai.penandatangan_tambahan) ? nilai.penandatangan_tambahan[0] : undefined) as Ttd | undefined;
  const ubahTtd = (k: keyof Ttd, v: string) =>
    ubah('penandatangan_tambahan', [{ jabatan: '', nama: '', nim: '', ...ttd, [k]: v }]);

  const field = (k: FieldUmum, label: string, opsi: { bantuan?: string; type?: string; wajib?: boolean } = {}) =>
    umum.has(k) ? (
      <div>
        <Label htmlFor={`surat-field-${k}`} required={opsi.wajib ?? true}>
          {label}
        </Label>
        <Input
          id={`surat-field-${k}`}
          data-testid={`surat-field-${k}`}
          type={opsi.type ?? 'text'}
          value={teks(nilai[k])}
          onChange={(e) => ubah(k, e.target.value)}
          onBlur={() => sentuh(k)}
          error={galat(k)}
        />
        {opsi.bantuan ? <p className="mt-1 text-[12px] leading-4 text-tertiary">{opsi.bantuan}</p> : null}
      </div>
    ) : null;

  const formatOpsi = opsiFormatOutput(konfig.pdfAktif);

  return (
    diajukan ? (
      <Card data-testid="surat-diajukan">
        <CardHeader>
          <CardTitle>Surat diajukan</CardTitle>
          <CardDescription>
            Menunggu persetujuan Ketua, Wakil, atau Sekretaris Umum. Nomor surat ditetapkan saat disetujui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="secondary" onClick={() => window.location.assign('/surat/baru')}>
            Buat surat lain
          </Button>
        </CardContent>
      </Card>
    ) : (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <form
        className="min-w-0 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void ajukan();
        }}
        // Auto-save saat fokus meninggalkan form (kontrak T-058 butir 5).
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void simpan();
        }}
        data-testid="surat-form"
        noValidate
      >
        {alasanPenolakan ? (
          <div role="alert" data-testid="surat-alasan-tolak" className="rounded-md border border-[var(--danger)] bg-[var(--danger-subtle)] p-4 text-[13px] text-primary">
            <p className="flex items-center gap-1.5 font-medium">
              <CircleAlert aria-hidden="true" className="size-4 text-[var(--danger)]" /> Surat ini dikembalikan approver
            </p>
            <p className="mt-1 text-secondary">{alasanPenolakan}</p>
            <p className="mt-1 text-tertiary">Perbaiki lalu ajukan kembali. Menyunting surat ini menjadikannya draft lagi.</p>
          </div>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Jenis surat</CardTitle>
            <CardDescription>Field di bawah menyesuaikan jenis yang dipilih.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="surat-jenis" required>
              Jenis surat
            </Label>
            <Select
              id="surat-jenis"
              data-testid="surat-jenis"
              value={jenis}
              onChange={(e) => gantiJenis(e.target.value as JenisSurat)}
            >
              {JENIS_SURAT.map((j) => (
                <option key={j.jenis} value={j.jenis}>
                  {j.kode} — {j.nama}
                </option>
              ))}
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data surat</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {field('kode_kegiatan', 'Kegiatan', { bantuan: 'Masuk ke nomor surat, mis. HMIF, KT2HMIF, MUSMAIF.' })}
            {field('tanggal_surat', 'Tanggal surat', { type: 'date' })}
            {field('kota', 'Kota')}
            {field('lampiran', 'Lampiran', { wajib: false, bantuan: 'Mis. 1 (satu) Lembar. Isi "-" bila tidak ada.' })}
            {umum.has('perihal') ? <div className="sm:col-span-2">{field('perihal', 'Perihal')}</div> : null}
          </CardContent>
        </Card>

        {umum.has('tujuan_nama') ? (
          <Card>
            <CardHeader>
              <CardTitle>Tujuan</CardTitle>
              <CardDescription>Memilih preset mengisi nama dan alamat; keduanya tetap dapat diubah.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="surat-field-tujuan_preset" required>
                  Preset tujuan
                </Label>
                <Select
                  id="surat-field-tujuan_preset"
                  data-testid="surat-tujuan-preset"
                  value={teks(nilai.tujuan_preset)}
                  onChange={(e) => pilihPreset(e.target.value)}
                  onBlur={() => sentuh('tujuan_preset')}
                  error={galat('tujuan_preset')}
                >
                  <option value="" disabled>
                    Pilih tujuan…
                  </option>
                  {preset.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              {field('tujuan_nama', 'Nama/jabatan tujuan')}
              {field('tujuan_alamat', 'Alamat tujuan', { bantuan: 'Mis. di Tempat, di Cilegon.' })}
            </CardContent>
          </Card>
        ) : null}

        {deskripsi.fields.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Rincian {infoJenis(jenis).nama}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deskripsi.fields.map((d) => (
                <div key={d.key} onBlur={() => sentuh(`data_dinamis.${d.key}`)}>
                  <FieldRenderer
                    deskripsi={d}
                    nilai={nilai.data_dinamis[d.key]}
                    onChange={(v) => ubahDinamis(d.key, v)}
                    path={`data_dinamis.${d.key}`}
                    galat={galat}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {umum.has('isi_surat') ? (
          <Card>
            <CardHeader>
              <CardTitle>Isi surat</CardTitle>
              <CardDescription>Paragraf, tebal, miring, dan daftar.</CardDescription>
            </CardHeader>
            <CardContent>
              <IsiSuratEditor
                id="surat-field-isi_surat"
                html={teks(nilai.isi_surat)}
                onChange={(html) => ubah('isi_surat', html)}
                onBlur={() => sentuh('isi_surat')}
                invalid={Boolean(galat('isi_surat'))}
              />
              {galat('isi_surat') ? (
                <p role="alert" className="mt-1 text-[12px] leading-4 text-danger">
                  {galat('isi_surat')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Penandatangan</CardTitle>
            <CardDescription>Kolom kanan selalu Ketua Himpunan, bertanda tangan dan berstempel otomatis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aturanKiri ? (
              aturanKiri.wajib || ttd ? (
                <fieldset id="surat-ttd" data-testid="surat-ttd" className="grid gap-4 sm:grid-cols-3" onBlur={() => sentuh('penandatangan_tambahan')}>
                  <legend className="mb-2 text-[13px] font-medium text-primary sm:col-span-3">
                    Kolom kiri{aturanKiri.wajib ? <span className="text-danger"> *</span> : null}
                  </legend>
                  {(['jabatan', 'nama', 'nim'] as const).map((k) => (
                    <div key={k}>
                      <Label htmlFor={`surat-ttd-${k}`} required>
                        {k === 'jabatan' ? 'Jabatan' : k === 'nama' ? 'Nama' : 'NIM'}
                      </Label>
                      <Input
                        id={`surat-ttd-${k}`}
                        data-testid={`surat-ttd-${k}`}
                        value={ttd?.[k] ?? ''}
                        placeholder={k === 'jabatan' ? 'Mis. Ketua Pelaksana' : undefined}
                        inputMode={k === 'nim' ? 'numeric' : undefined}
                        onChange={(e) => ubahTtd(k, e.target.value)}
                        error={galat(`penandatangan_tambahan.0.${k}`) ?? (k === 'jabatan' ? galat('penandatangan_tambahan') : undefined)}
                      />
                    </div>
                  ))}
                  {!aturanKiri.wajib ? (
                    <div className="sm:col-span-3">
                      <Button type="button" variant="ghost" onClick={() => ubah('penandatangan_tambahan', [])}>
                        Hapus kolom kiri
                      </Button>
                    </div>
                  ) : null}
                </fieldset>
              ) : (
                <Button type="button" variant="secondary" onClick={() => ubahTtd('jabatan', '')} data-testid="surat-ttd-tambah">
                  Tambah penandatangan kolom kiri
                </Button>
              )
            ) : (
              <p className="text-[13px] text-secondary">Jenis surat ini hanya ditandatangani Ketua Himpunan.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Format keluaran</CardTitle>
            {konfig.pdfAktif ? null : <CardDescription>PDF belum tersedia; surat dihasilkan sebagai DOCX.</CardDescription>}
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Format keluaran" className="flex flex-wrap gap-4" data-testid="surat-format">
              {formatOpsi.map((o) => (
                <label key={o.nilai} className="inline-flex items-center gap-2 text-[14px] text-primary">
                  <input
                    type="radio"
                    name="format_output"
                    value={o.nilai}
                    checked={nilai.format_output === o.nilai}
                    onChange={() => ubah('format_output', o.nilai)}
                    data-testid={`surat-format-${o.nilai}`}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <AreaAjukan masalah={masalah} status={status} pesanGalat={pesanGalat} mengajukan={mengajukan} />
      </form>

      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="Pratinjau surat">
        <Card>
          <CardHeader>
            <CardTitle>Pratinjau</CardTitle>
          </CardHeader>
          <CardContent>
            <SuratPreview nilai={nilai} konfig={konfig} ketua={ketua} />
          </CardContent>
        </Card>
      </aside>
    </div>
    )
  );
}

function AreaAjukan({
  masalah,
  status,
  pesanGalat,
  mengajukan,
}: {
  masalah: MasalahField[];
  status: StatusSimpan;
  pesanGalat: string | null;
  mengajukan: boolean;
}) {
  const lengkap = masalah.length === 0;
  return (
    <div className="space-y-3 rounded-md border border-default bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <IndikatorSimpan status={status} pesanGalat={pesanGalat} />
        <Button type="submit" disabled={!lengkap || status === 'menyimpan' || mengajukan} data-testid="surat-ajukan">
          <Send aria-hidden="true" /> {mengajukan ? 'Mengajukan…' : 'Ajukan'}
        </Button>
      </div>
      {lengkap ? (
        <p className="text-[13px] text-secondary">Semua field wajib sudah terisi.</p>
      ) : (
        <div data-testid="surat-kurang" role="status" aria-live="polite">
          <p className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-primary">
            <CircleAlert aria-hidden="true" className="size-4 text-[var(--warning)]" />
            {masalah.length} field masih perlu diisi sebelum dapat diajukan:
          </p>
          <ul className="space-y-0.5 pl-6 text-[13px] text-secondary">
            {masalah.map((m) => (
              <li key={m.path} data-testid="surat-kurang-item" data-path={m.path}>
                <a
                  href={`#${idUntukPath(m.path)}`}
                  className="underline-offset-2 hover:underline"
                  onClick={(e) => {
                    const el = document.getElementById(idUntukPath(m.path));
                    if (el) {
                      e.preventDefault();
                      el.focus();
                      el.scrollIntoView({ block: 'center' });
                    }
                  }}
                >
                  {m.label}
                </a>
                <span className="text-tertiary"> — {m.pesan}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IndikatorSimpan({ status, pesanGalat }: { status: StatusSimpan; pesanGalat: string | null }) {
  if (status === 'menyimpan') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-tertiary">
        <Clock3 aria-hidden="true" className="size-4" /> Menyimpan…
      </span>
    );
  }
  if (status === 'tersimpan') {
    return (
      <span data-testid="surat-tersimpan" className="inline-flex items-center gap-1.5 text-[13px] text-secondary">
        <Check aria-hidden="true" className="size-4 text-[var(--success)]" /> Tersimpan
      </span>
    );
  }
  if (status === 'galat') {
    return (
      <span role="alert" data-testid="surat-simpan-galat" className={cn('inline-flex items-center gap-1.5 text-[13px] text-danger')}>
        <CircleAlert aria-hidden="true" className="size-4" /> Gagal menyimpan{pesanGalat ? `: ${pesanGalat}` : ''}. Dicoba lagi otomatis.
      </span>
    );
  }
  return <span className="text-[13px] text-tertiary">Draft disimpan otomatis.</span>;
}

export function SuratForm(props: SuratFormProps) {
  return (
    <ToastProvider>
      <Form {...props} />
    </ToastProvider>
  );
}
