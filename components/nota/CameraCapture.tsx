'use client';

/**
 * Tangkap nota: kamera dengan deteksi tepi real-time, atau pilih dari galeri
 * (T-100, PRD F-11.3, DESIGN_SYSTEM §9.6). Keluarannya SATU berkas gambar
 * untuk pipeline T-097 — komponen ini tidak membuat turunan apa pun.
 *
 *   pilih ──▶ kamera ──(jepret)──▶ pratinjau ──(Gunakan)──▶ onGunakan
 *     │          │                     │
 *     └─ galeri ─┴──── ditolak/galat ──┘ (Ambil Ulang kembali ke sumbernya)
 *
 * ===========================================================================
 * TIDAK PERNAH MEMBLOKIR (kontrak 4)
 * ===========================================================================
 * OpenCV dimuat di latar sejak kamera dibuka. Bila belum siap, gagal dimuat,
 * atau tepinya tidak meyakinkan, jepretan tetap jadi — foto apa adanya
 * (auto-rotate & tiga turunan dikerjakan pipeline T-097 sesudahnya).
 *
 * `jscanify-loader` diimpor DINAMIS di `bukaKamera`, jadi baik loader maupun
 * OpenCV.js tidak ada di bundle halaman sebelum kamera dibuka (kontrak 1).
 *
 * Test id: kamera-pilih, kamera-buka, kamera-galeri, kamera-galeri-input,
 * kamera-video, kamera-jepret, kamera-batal, kamera-status-pemindai
 * (data-status="memuat|siap|gagal"), kamera-ditolak, kamera-galat.
 */

import { Camera, CameraOff, ImageUp, X } from 'lucide-react';
import * as React from 'react';

import { ScanOverlay } from '@/components/nota/ScanOverlay';
import { ScanPreview } from '@/components/nota/ScanPreview';
import { Button } from '@/components/ui/button';
import type { Pemindai } from '@/lib/images/jscanify-loader';
import type { Sudut } from '@/lib/images/pemindai';

export interface HasilTangkapan {
  berkas: Blob;
  /** true bila koreksi perspektif diterapkan — diteruskan ke pipeline sebagai `isScanned`. */
  terpindai: boolean;
  sumber: 'KAMERA' | 'GALERI';
}

type Tahap =
  | { jenis: 'pilih' }
  | { jenis: 'membuka' }
  | { jenis: 'kamera' }
  | { jenis: 'memproses' }
  | { jenis: 'ditolak' }
  | { jenis: 'galat'; pesan: string }
  | { jenis: 'pratinjau'; hasil: HasilTangkapan; url: string; catatan: string | null };

type StatusPemindai = 'mati' | 'memuat' | 'siap' | 'gagal';

/** JPEG mutu tinggi: pipeline mengompres ulang ke 0,90/0,93, jadi kerugian di sini dijaga minimum. */
const MUTU_JEPRET = 0.97;
const JEDA_DETEKSI_MS = 250;

const keBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error('Kanvas kosong.'))), 'image/jpeg', MUTU_JEPRET));

export function CameraCapture({ onGunakan, onBatal }: { onGunakan: (h: HasilTangkapan) => void; onBatal?: () => void }) {
  const [tahap, setTahap] = React.useState<Tahap>({ jenis: 'pilih' });
  const [status, setStatus] = React.useState<StatusPemindai>('mati');
  const [sudut, setSudut] = React.useState<Sudut | null>(null);
  const [ukuran, setUkuran] = React.useState({ lebar: 0, tinggi: 0 });
  const video = React.useRef<HTMLVideoElement>(null);
  const stream = React.useRef<MediaStream | null>(null);
  const pemindai = React.useRef<Pemindai | null>(null);
  const galeri = React.useRef<HTMLInputElement>(null);

  const hentikanKamera = React.useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setSudut(null);
  }, []);

  // Lepas kamera dan object URL saat komponen hilang.
  React.useEffect(() => () => hentikanKamera(), [hentikanKamera]);
  React.useEffect(() => {
    if (tahap.jenis !== 'pratinjau') return;
    return () => URL.revokeObjectURL(tahap.url);
  }, [tahap]);

  // Pasang stream ke <video> setelah elemennya dirender.
  React.useEffect(() => {
    if (tahap.jenis !== 'kamera' || !video.current || !stream.current) return;
    const v = video.current;
    v.srcObject = stream.current;
    const siap = () => setUkuran({ lebar: v.videoWidth, tinggi: v.videoHeight });
    v.addEventListener('loadedmetadata', siap);
    void v.play().catch(() => {});
    return () => v.removeEventListener('loadedmetadata', siap);
  }, [tahap.jenis]);

  // Deteksi tepi real-time — hanya saat kamera hidup dan pemindai siap.
  React.useEffect(() => {
    if (tahap.jenis !== 'kamera' || status !== 'siap') return;
    const id = window.setInterval(() => {
      const v = video.current;
      if (!v || !pemindai.current || v.readyState < 2) return;
      setSudut(pemindai.current.deteksiCepat(v, v.videoWidth, v.videoHeight));
    }, JEDA_DETEKSI_MS);
    return () => window.clearInterval(id);
  }, [tahap.jenis, status]);

  function muatPemindaiLatar() {
    if (pemindai.current || status === 'memuat') return;
    setStatus('memuat');
    import('@/lib/images/jscanify-loader')
      .then((m) => m.muatPemindai())
      .then((p) => {
        pemindai.current = p;
        setStatus('siap');
      })
      .catch(() => setStatus('gagal'));
  }

  async function bukaKamera() {
    setTahap({ jenis: 'membuka' });
    if (!navigator.mediaDevices?.getUserMedia) {
      setTahap({ jenis: 'galat', pesan: 'Browser ini tidak dapat membuka kamera.' });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setTahap({ jenis: 'kamera' });
      muatPemindaiLatar();
    } catch (e) {
      const nama = e instanceof DOMException ? e.name : '';
      if (nama === 'NotAllowedError' || nama === 'SecurityError') setTahap({ jenis: 'ditolak' });
      else setTahap({ jenis: 'galat', pesan: 'Kamera tidak tersedia di perangkat ini atau sedang dipakai aplikasi lain.' });
    }
  }

  async function jepret() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setTahap({ jenis: 'memproses' });
    const bingkai = document.createElement('canvas');
    bingkai.width = v.videoWidth;
    bingkai.height = v.videoHeight;
    bingkai.getContext('2d')?.drawImage(v, 0, 0);
    hentikanKamera();

    let hasilKanvas: HTMLCanvasElement | null = null;
    let catatan: string | null = null;
    const p = pemindai.current;
    if (p) {
      const s = p.deteksiCepat(bingkai, bingkai.width, bingkai.height);
      hasilKanvas = s ? p.potong(bingkai, s) : null;
      if (!hasilKanvas) catatan = 'Tepi dokumen tidak terdeteksi — foto dipakai apa adanya.';
    } else {
      catatan = 'Deteksi tepi belum tersedia — foto dipakai apa adanya.';
    }

    try {
      const berkas = await keBlob(hasilKanvas ?? bingkai);
      setTahap({
        jenis: 'pratinjau',
        hasil: { berkas, terpindai: hasilKanvas !== null, sumber: 'KAMERA' },
        url: URL.createObjectURL(berkas),
        catatan,
      });
    } catch {
      setTahap({ jenis: 'galat', pesan: 'Foto gagal diproses. Coba ambil ulang.' });
    }
  }

  function pilihGaleri(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = e.target.files?.[0];
    e.target.value = ''; // supaya memilih berkas yang sama tetap memicu onChange
    if (!berkas) return;
    hentikanKamera();
    setTahap({
      jenis: 'pratinjau',
      hasil: { berkas, terpindai: false, sumber: 'GALERI' },
      url: URL.createObjectURL(berkas),
      catatan: 'Foto dari galeri dipakai apa adanya.',
    });
  }

  function batal() {
    hentikanKamera();
    setTahap({ jenis: 'pilih' });
    onBatal?.();
  }

  const tombolGaleri = (label = 'Pilih dari galeri') => (
    <Button variant="secondary" className="h-12 w-full text-[15px]" onClick={() => galeri.current?.click()} data-testid="kamera-galeri">
      <ImageUp aria-hidden="true" /> {label}
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-md">
      <input ref={galeri} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pilihGaleri} data-testid="kamera-galeri-input" />

      {tahap.jenis === 'pilih' || tahap.jenis === 'membuka' ? (
        <div className="grid gap-3" data-testid="kamera-pilih">
          <Button className="h-14 w-full text-[16px]" loading={tahap.jenis === 'membuka'} onClick={() => void bukaKamera()} data-testid="kamera-buka">
            <Camera aria-hidden="true" /> Buka kamera
          </Button>
          {tombolGaleri()}
          <p className="text-center text-[12px] text-tertiary">Letakkan nota di permukaan gelap dan rata supaya tepinya mudah dikenali.</p>
        </div>
      ) : null}

      {tahap.jenis === 'kamera' || tahap.jenis === 'memproses' ? (
        <div className="grid gap-3">
          <div className="relative h-[62dvh] min-h-64 overflow-hidden rounded-sm bg-black">
            <video ref={video} muted playsInline autoPlay className="size-full object-contain" data-testid="kamera-video" />
            <ScanOverlay sudut={sudut} lebar={ukuran.lebar} tinggi={ukuran.tinggi} />
            <p
              data-testid="kamera-status-pemindai"
              data-status={status}
              className="absolute inset-x-2 top-2 rounded-sm bg-black/60 px-2 py-1 text-center text-[12px] text-white"
            >
              {status === 'siap'
                ? sudut
                  ? 'Tepi dokumen terdeteksi'
                  : 'Arahkan kamera ke nota'
                : status === 'gagal'
                  ? 'Deteksi tepi tidak tersedia — foto tetap dapat diambil'
                  : 'Menyiapkan deteksi tepi…'}
            </p>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Button variant="ghost" className="h-12" onClick={batal} data-testid="kamera-batal">
              <X aria-hidden="true" /> Batal
            </Button>
            <button
              type="button"
              onClick={() => void jepret()}
              disabled={tahap.jenis === 'memproses' || !ukuran.lebar}
              aria-label="Ambil foto"
              data-testid="kamera-jepret"
              className="size-16 rounded-full border-4 border-[var(--primary)] bg-panel outline-none focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] disabled:opacity-50"
            />
            <span />
          </div>
        </div>
      ) : null}

      {tahap.jenis === 'ditolak' ? (
        <div role="alert" className="grid gap-3 rounded-sm bg-[var(--warning-subtle)] p-4" data-testid="kamera-ditolak">
          <p className="flex items-start gap-2 text-[14px]">
            <CameraOff aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--warning)]" />
            Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, atau pilih foto nota dari galeri.
          </p>
          {tombolGaleri()}
          <Button variant="ghost" onClick={() => void bukaKamera()}>
            Coba buka kamera lagi
          </Button>
        </div>
      ) : null}

      {tahap.jenis === 'galat' ? (
        <div role="alert" className="grid gap-3 rounded-sm bg-[var(--warning-subtle)] p-4" data-testid="kamera-galat">
          <p className="flex items-start gap-2 text-[14px]">
            <CameraOff aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--warning)]" />
            {tahap.pesan}
          </p>
          {tombolGaleri()}
        </div>
      ) : null}

      {tahap.jenis === 'pratinjau' ? (
        <ScanPreview
          url={tahap.url}
          terpindai={tahap.hasil.terpindai}
          catatan={tahap.catatan}
          labelUlang={tahap.hasil.sumber === 'KAMERA' ? 'Ambil Ulang' : 'Pilih lagi'}
          onAmbilUlang={() => {
            if (tahap.hasil.sumber === 'KAMERA') void bukaKamera();
            else {
              setTahap({ jenis: 'pilih' });
              galeri.current?.click();
            }
          }}
          onGunakan={() => onGunakan(tahap.hasil)}
        />
      ) : null}
    </div>
  );
}
