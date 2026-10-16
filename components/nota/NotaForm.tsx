'use client';

/**
 * Alur upload nota (T-101, USER_FLOW §7.1):
 *   1 divisi (otomatis bila satu) → 2 item RAB (WAJIB) → 3 foto (kamera/galeri,
 *   auto-scan, pratinjau) → 4 metadata + alokasi → kirim → MENUNGGU_VERIFIKASI.
 *
 * Tombol kamera NONAKTIF sampai minimal satu item RAB / "di luar RAB" dipilih
 * (kontrak 1). Pemindai & OpenCV hanya dimuat saat kamera dibuka (T-100).
 * Mode perbaikan (`perbaikan`): isian nota DITOLAK dimuat, dikirim lewat PATCH.
 */

import { Camera, Check, ImageIcon, RotateCcw } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';

import { AlokasiEditor, type BarisAlokasi } from '@/components/nota/AlokasiEditor';
import { ItemRabSelector } from '@/components/nota/ItemRabSelector';
import type { HasilTangkapan } from '@/components/nota/CameraCapture';
import { CurrencyInput } from '@/components/rab/CurrencyInput';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DivisiUpload } from '@/lib/nota/service';
import { selisihAlokasi, type IsianNota } from '@/lib/nota/skema';
import { formatRupiah } from '@/lib/utils/format-rupiah';

const CameraCapture = dynamic(
  () => import('@/components/nota/CameraCapture').then((m) => m.CameraCapture),
  {
    ssr: false,
    loading: () => <Skeleton variant="card" loadingLabel="Menyiapkan kamera…" />,
  },
);

const KOTAK =
  'h-[34px] w-full min-w-0 rounded-sm border border-[var(--text-tertiary)] bg-panel px-2 text-[14px] outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-3 focus-visible:ring-[var(--border-focus)]';

export interface PerbaikanNota {
  id: string;
  alasan_penolakan: string | null;
  isian: IsianNota;
  urlPratinjau: string;
}

type Respons =
  | { ok: true; data: { id: string; status: string } }
  | { ok: false; error?: { code?: string; message?: string; details?: { selisih?: number } } };

function Langkah({
  no,
  judul,
  aktif,
  children,
}: {
  no: number;
  judul: string;
  aktif: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={`space-y-3 p-4 ${aktif ? '' : 'opacity-60'}`}
      data-testid={`nota-langkah-${no}`}
      data-aktif={aktif ? '1' : '0'}
    >
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-subtle text-[12px] tabular-nums">
          {no}
        </span>
        {judul}
      </h2>
      {children}
    </Card>
  );
}

function barisDariIsian(isian: IsianNota): BarisAlokasi[] {
  return isian.alokasi.map((a) => ({
    kunci: crypto.randomUUID(),
    rab_item_id: a.rab_item_id,
    uraian_luar_rab: a.uraian_luar_rab ?? '',
    jumlah_aktual: a.jumlah_aktual,
    harga_aktual: a.harga_aktual,
    nominal: a.nominal,
  }));
}

export function NotaForm({
  divisi,
  hariIni,
  perbaikan = null,
}: {
  divisi: DivisiUpload[];
  hariIni: string;
  perbaikan?: PerbaikanNota | null;
}) {
  const [divisiId, setDivisiId] = React.useState(
    perbaikan?.isian.divisi_id ?? (divisi.length === 1 ? divisi[0]!.id : ''),
  );
  const [alokasi, setAlokasi] = React.useState<BarisAlokasi[]>(() =>
    perbaikan ? barisDariIsian(perbaikan.isian) : [],
  );
  const [kamera, setKamera] = React.useState(false);
  const [gambar, setGambar] = React.useState<{ imageId: string; url: string } | null>(
    perbaikan ? { imageId: perbaikan.isian.image_id, url: perbaikan.urlPratinjau } : null,
  );
  const [mengunggah, setMengunggah] = React.useState(false);
  const [tanggal, setTanggal] = React.useState(perbaikan?.isian.tanggal_belanja ?? hariIni);
  const [total, setTotal] = React.useState(perbaikan?.isian.total_nota ?? 0);
  const [keterangan, setKeterangan] = React.useState(perbaikan?.isian.keterangan ?? '');
  const [galat, setGalat] = React.useState<string | null>(null);
  const [mengirim, setMengirim] = React.useState(false);
  const [selesai, setSelesai] = React.useState<string | null>(null);
  const [siap, setSiap] = React.useState(false);
  React.useEffect(() => setSiap(true), []);

  const d = divisi.find((x) => x.id === divisiId) ?? null;
  const terpilih = alokasi.flatMap((a) => (a.rab_item_id ? [a.rab_item_id] : []));
  const luarRab = alokasi.some((a) => a.rab_item_id === null);
  const adaPilihan = terpilih.length > 0 || luarRab;

  /** Pilihan item ↔ baris alokasi: item baru → baris baru; item dilepas → barisnya hilang. */
  const ubahPilihan = (items: string[], luar: boolean) => {
    setAlokasi((lama) => {
      const tetap = lama.filter((a) => (a.rab_item_id ? items.includes(a.rab_item_id) : luar));
      const baru = items
        .filter((id) => !tetap.some((a) => a.rab_item_id === id))
        .map((id) => ({
          kunci: crypto.randomUUID(),
          rab_item_id: id,
          uraian_luar_rab: '',
          jumlah_aktual: null,
          harga_aktual: null,
          nominal: 0,
        }));
      const luarBaru =
        luar && !tetap.some((a) => a.rab_item_id === null)
          ? [
              {
                kunci: crypto.randomUUID(),
                rab_item_id: null,
                uraian_luar_rab: '',
                jumlah_aktual: null,
                harga_aktual: null,
                nominal: 0,
              },
            ]
          : [];
      return [...tetap, ...baru, ...luarBaru];
    });
  };

  const gunakanFoto = async (h: HasilTangkapan) => {
    setKamera(false);
    setMengunggah(true);
    setGalat(null);
    try {
      const { unggahFotoNota } = await import('@/lib/nota/unggah-gambar');
      const r = await unggahFotoNota(h.berkas, h.terpindai);
      setGambar({ imageId: r.imageId, url: r.urlPratinjau });
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Foto nota gagal diunggah.');
    } finally {
      setMengunggah(false);
    }
  };

  const selisih = selisihAlokasi(total, alokasi);

  const kirim = async () => {
    if (!d || !gambar) return;
    setMengirim(true);
    setGalat(null);
    const isian: IsianNota = {
      divisi_id: d.id,
      image_id: gambar.imageId,
      tanggal_belanja: tanggal,
      total_nota: total,
      keterangan: keterangan.trim() || null,
      alokasi: alokasi.map((a) => ({
        rab_item_id: a.rab_item_id,
        uraian_luar_rab: a.rab_item_id ? null : a.uraian_luar_rab,
        jumlah_aktual: a.jumlah_aktual,
        harga_aktual: a.harga_aktual,
        nominal: a.nominal,
      })),
    };
    try {
      const r = await fetch(perbaikan ? `/api/nota/${perbaikan.id}` : '/api/nota', {
        method: perbaikan ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isian),
      });
      const b = (await r.json().catch(() => null)) as Respons | null;
      if (!r.ok || !b?.ok) {
        setGalat((b && !b.ok && b.error?.message) || 'Nota gagal dikirim.');
        return;
      }
      setSelesai(b.data.id);
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setMengirim(false);
    }
  };

  if (selesai) {
    return (
      <Card
        className="space-y-3 p-6 text-center"
        data-testid="nota-terkirim"
        data-nota-id={selesai}
      >
        <Check aria-hidden="true" className="mx-auto size-8 text-success" />
        <p className="text-[15px] font-semibold">Nota terkirim — menunggu verifikasi Bendahara.</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => window.location.assign('/keuangan/nota/upload')}
        >
          Unggah nota lain
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="nota-form" data-siap={siap ? '1' : '0'}>
      {perbaikan?.alasan_penolakan ? (
        <p
          role="note"
          className="rounded-sm bg-[var(--warning-subtle)] p-3 text-[13px]"
          data-testid="nota-alasan-penolakan"
        >
          Dikembalikan Bendahara: {perbaikan.alasan_penolakan}
        </p>
      ) : null}

      <Langkah no={1} judul="Divisi" aktif>
        {divisi.length === 1 || perbaikan ? (
          <p className="text-[14px]" data-testid="nota-divisi-otomatis">
            {d?.nama} <span className="text-secondary">· {d?.acara.nama}</span>
          </p>
        ) : (
          <div>
            <label htmlFor="nota-divisi" className="mb-1 block text-[13px] font-medium">
              Pilih divisi
            </label>
            <select
              id="nota-divisi"
              className={KOTAK}
              value={divisiId}
              onChange={(e) => {
                setDivisiId(e.target.value);
                setAlokasi([]);
              }}
            >
              <option value="">Pilih divisi…</option>
              {divisi.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nama} — {x.acara.nama}
                </option>
              ))}
            </select>
          </div>
        )}
      </Langkah>

      <Langkah no={2} judul="Item RAB" aktif={!!d}>
        {d ? (
          <ItemRabSelector
            items={d.items}
            terpilih={terpilih}
            luarRab={luarRab}
            onChange={ubahPilihan}
          />
        ) : (
          <p className="text-[13px] text-secondary">Pilih divisi dulu.</p>
        )}
      </Langkah>

      <Langkah no={3} judul="Foto nota" aktif={adaPilihan}>
        {!adaPilihan ? (
          <p className="text-[13px] text-secondary" data-testid="nota-kamera-terkunci">
            Pilih item RAB dulu — kamera aktif setelah item dipilih.
          </p>
        ) : null}
        {gambar && !kamera ? (
          <div className="flex flex-wrap items-center gap-3" data-testid="nota-foto">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL objek lokal hasil pipeline */}
            <img
              src={gambar.url}
              alt="Pratinjau nota"
              className="h-32 w-auto rounded-sm border border-default object-contain"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setKamera(true)}
              disabled={!adaPilihan}
            >
              <RotateCcw aria-hidden="true" /> Ganti foto
            </Button>
          </div>
        ) : null}
        {kamera ? (
          <CameraCapture onGunakan={(h) => void gunakanFoto(h)} onBatal={() => setKamera(false)} />
        ) : !gambar ? (
          <Button
            type="button"
            onClick={() => setKamera(true)}
            disabled={!adaPilihan || mengunggah}
            data-testid="nota-buka-kamera"
            className="h-12 w-full sm:w-auto"
          >
            <Camera aria-hidden="true" />{' '}
            {mengunggah ? 'Mengunggah foto…' : 'Ambil / pilih foto nota'}
          </Button>
        ) : null}
        {mengunggah ? (
          <p
            className="flex items-center gap-2 text-[13px] text-secondary"
            data-testid="nota-mengunggah"
          >
            <ImageIcon aria-hidden="true" className="size-4" /> Memproses & mengunggah foto…
          </p>
        ) : null}
      </Langkah>

      <Langkah no={4} judul="Rincian & alokasi" aktif={!!gambar}>
        {gambar && d ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="nota-tanggal" className="mb-1 block text-[13px] font-medium">
                  Tanggal belanja <span className="text-danger">*</span>
                </label>
                <input
                  id="nota-tanggal"
                  type="date"
                  max={hariIni}
                  className={KOTAK}
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="nota-total" className="mb-1 block text-[13px] font-medium">
                  Total nota <span className="text-danger">*</span>
                </label>
                <CurrencyInput
                  id="nota-total"
                  className={KOTAK}
                  value={total}
                  onNilai={setTotal}
                  data-testid="nota-total"
                />
              </div>
            </div>
            <AlokasiEditor
              baris={alokasi}
              items={d.items}
              totalNota={total}
              onChange={setAlokasi}
            />
            <div>
              <label htmlFor="nota-keterangan" className="mb-1 block text-[13px] font-medium">
                Keterangan
              </label>
              <textarea
                id="nota-keterangan"
                rows={2}
                maxLength={500}
                className="w-full rounded-sm border border-[var(--text-tertiary)] bg-panel px-2 py-1.5 text-[14px] outline-none focus-visible:border-[var(--border-focus)]"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
              />
            </div>
            {galat ? (
              <p role="alert" className="text-[13px] text-danger" data-testid="nota-galat">
                {galat}
              </p>
            ) : null}
            <Button
              type="button"
              className="h-12 w-full sm:w-auto"
              onClick={() => void kirim()}
              disabled={mengirim || total <= 0 || alokasi.length === 0}
              data-testid="nota-kirim"
              data-seimbang={selisih === 0 ? '1' : '0'}
            >
              {mengirim
                ? 'Mengirim…'
                : perbaikan
                  ? 'Kirim perbaikan'
                  : `Kirim nota ${total ? formatRupiah(total) : ''}`}
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-secondary">Rincian diisi setelah foto nota diunggah.</p>
        )}
        {galat && !gambar ? (
          <p role="alert" className="text-[13px] text-danger" data-testid="nota-galat">
            {galat}
          </p>
        ) : null}
      </Langkah>
    </div>
  );
}
