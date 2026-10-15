/**
 * Pemuat jscanify + OpenCV.js (T-100). KHUSUS BROWSER, dan hanya diimpor lewat
 * `import()` dari `CameraCapture` saat kamera dibuka — tidak pernah dari
 * layout atau halaman (kontrak 1, SYSTEM_DESIGN §19.1¹).
 *
 * ===========================================================================
 * KENAPA SKRIP DARI jsDelivr DENGAN SRI, BUKAN PAKET NPM — lihat ADR-032
 * ===========================================================================
 *   - Paket npm `jscanify` menunjuk `jscanify-node.js` dan menyeret `canvas`
 *     (biner native) + `jsdom` ke dependensi produksi — risiko build Vercel
 *     untuk kode yang tidak pernah berjalan di server.
 *   - `opencv.js` ±9 MB. Membundelnya lewat webpack memperlambat build dan
 *     menyalinnya ke repo menambah ±25% ukuran git.
 *   - Berkas yang dimuat persis berkas paket `jscanify@1.4.3` (versi
 *     terkunci di URL), dan `integrity` SHA-384 membuat browser MENOLAK
 *     menjalankannya bila isinya berubah satu bita pun. Hash dihitung dari
 *     tarball npm dan dicocokkan dengan salinan jsDelivr (2026-10-15).
 *
 * Gagal memuat (offline, CDN diblokir, hash tak cocok) → promise ditolak dan
 * pemanggil memakai foto apa adanya (kontrak 4). Percobaan berikutnya memuat ulang.
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-100 · PRD F-11.3 · ADR-032
 */

import { skalakanSudut, sudutSah, ukuranHasil, type Sudut } from '@/lib/images/pemindai';

const VERSI = '1.4.3';
export const SKRIP_OPENCV = {
  src: `https://cdn.jsdelivr.net/npm/jscanify@${VERSI}/src/opencv.js`,
  integrity: 'sha384-gIQOiZ94Y7O29uYShJN17TQmC+8BFBNvRQ9dw9Uj9jTXckygNQz59FfqlrMzh3KT',
};
export const SKRIP_JSCANIFY = {
  src: `https://cdn.jsdelivr.net/npm/jscanify@${VERSI}/src/jscanify.js`,
  integrity: 'sha384-1lFiUI8fK3enJqIHszlQ9u3upmgE3Z0Jj0Pr9vubGa2amHhsn06NurXsHxJLX6Dz',
};

/** Batas tunggu muat + inisialisasi WASM di ponsel kelas bawah. */
const BATAS_MUAT_MS = 45_000;
/** Bingkai deteksi real-time diperkecil ke sisi ini — cukup untuk tepi, ringan untuk 4–5 fps. */
const SISI_DETEKSI_PX = 480;

/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCV.js & jscanify tidak bertipe. */
type CV = any;
type JscanifyKelas = new () => any;
declare global {
  interface Window {
    cv?: CV;
    jscanify?: JscanifyKelas;
  }
}

export interface Pemindai {
  /** Sudut dokumen pada kanvas, dalam koordinat kanvas itu; null bila tidak meyakinkan. */
  deteksi(sumber: HTMLCanvasElement): Sudut | null;
  /** Koreksi perspektif; null bila sudut menghasilkan ukuran yang tidak masuk akal. */
  potong(sumber: HTMLCanvasElement, sudut: Sudut): HTMLCanvasElement | null;
  /** Deteksi pada salinan kecil, sudut dikembalikan ke skala asli — untuk overlay real-time. */
  deteksiCepat(sumber: HTMLCanvasElement | HTMLVideoElement, lebar: number, tinggi: number): Sudut | null;
}

function muatSkrip({ src, integrity }: { src: string; integrity: string }): Promise<void> {
  return new Promise((selesai, gagal) => {
    const ada = document.querySelector<HTMLScriptElement>(`script[data-pemindai="${src}"]`);
    if (ada?.dataset.siap === '1') return selesai();
    ada?.remove(); // percobaan lama yang gagal
    const s = document.createElement('script');
    s.src = src;
    s.integrity = integrity;
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.dataset.pemindai = src;
    s.onload = () => {
      s.dataset.siap = '1';
      selesai();
    };
    s.onerror = () => {
      s.remove();
      gagal(new Error(`Gagal memuat ${src}`));
    };
    document.head.appendChild(s);
  });
}

/**
 * OpenCV.js siap bila `cv.Mat` sudah berupa fungsi — runtime WASM-nya
 * menginisialisasi diri sesudah skrip dimuat. Tidak memakai `await cv` pada
 * Module: build emscripten tertentu mengembalikan Module "thenable" yang
 * me-resolve dirinya sendiri, dan `await` padanya berputar tanpa akhir. Hanya
 * `Promise` sungguhan yang ditunggu.
 */
async function tungguRuntime(batasMs: number): Promise<void> {
  const mulai = Date.now();
  for (;;) {
    let cv = window.cv;
    if (cv instanceof Promise) {
      cv = await cv;
      window.cv = cv;
    }
    // JANGAN `return cv`: mengembalikan Module thenable dari fungsi async membuat
    // promise-nya mengadopsi `cv.then` tanpa akhir dan membekukan tab (terukur di gate).
    if (cv && typeof cv.Mat === 'function') return;
    if (Date.now() - mulai > batasMs) throw new Error('OpenCV.js tidak siap dalam batas waktu.');
    await new Promise((r) => setTimeout(r, 100));
  }
}

function buatPemindai(cv: CV, Jscanify: JscanifyKelas): Pemindai {
  const scanner = new Jscanify();
  const kecil = document.createElement('canvas');

  function deteksi(sumber: HTMLCanvasElement): Sudut | null {
    let mat: CV | null = null;
    let kontur: CV | null = null;
    try {
      mat = cv.imread(sumber);
      kontur = scanner.findPaperContour(mat);
      if (!kontur) return null;
      const s = scanner.getCornerPoints(kontur) as Partial<Sudut>;
      return sudutSah(s, sumber.width, sumber.height) ? s : null;
    } catch {
      return null;
    } finally {
      // findPaperContour tidak membebaskan kontur yang dikembalikannya.
      kontur?.delete?.();
      mat?.delete?.();
    }
  }

  return {
    deteksi,
    deteksiCepat(sumber, lebar, tinggi) {
      if (!lebar || !tinggi) return null;
      const faktor = Math.max(lebar, tinggi) / SISI_DETEKSI_PX;
      const skala = Math.max(1, faktor);
      kecil.width = Math.round(lebar / skala);
      kecil.height = Math.round(tinggi / skala);
      const ctx = kecil.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(sumber, 0, 0, kecil.width, kecil.height);
      const s = deteksi(kecil);
      return s ? skalakanSudut(s, skala) : null;
    },
    potong(sumber, sudut) {
      const ukuran = ukuranHasil(sudut);
      if (!ukuran) return null;
      try {
        return scanner.extractPaper(sumber, ukuran.lebar, ukuran.tinggi, sudut) as HTMLCanvasElement;
      } catch {
        return null;
      }
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let janji: Promise<Pemindai> | null = null;

/** Memuat sekali per tab; kegagalan tidak di-cache supaya percobaan berikutnya mengulang. */
export function muatPemindai(batasMs = BATAS_MUAT_MS): Promise<Pemindai> {
  // Diperiksa di sini, bukan saat modul dimuat: check-lazy-env mengimpor setiap modul lib/ di Node.
  if (typeof window === 'undefined') return Promise.reject(new Error('Pemindai hanya berjalan di browser.'));
  if (!janji) {
    janji = (async () => {
      // jscanify memakai global `cv` hanya saat dipanggil, jadi urutan muat bebas;
      // keduanya dimuat paralel.
      await Promise.all([muatSkrip(SKRIP_OPENCV), muatSkrip(SKRIP_JSCANIFY)]);
      await tungguRuntime(batasMs);
      if (!window.jscanify) throw new Error('jscanify tidak terdaftar.');
      return buatPemindai(window.cv, window.jscanify);
    })();
    janji.catch(() => {
      janji = null;
    });
  }
  return janji;
}
