'use client';

/**
 * Panel visual halaman login (ADR-064, revisi pemilik 2026-11-02): pemandangan malam berbukit pasir dalam
 * palet HMIF (navy #0A0F1F/#111C44, biru #0066A9/#1E90FF, cyan #00B4D8), digambar sebagai SVG — tanpa
 * foto berlisensi, tajam di layar apa pun. Logo beranimasi (permintaan 2026-10-17) di pojok kiri atas.
 *
 * Latar elemen `login-hero` tetap `linear-gradient` (langit malam) — kontrak T-045 butir 7.
 */

import Image, { getImageProps } from 'next/image';
import { useEffect, useState } from 'react';

// Poster video lewat optimizer Next (WebP kecil), bukan PNG mentah 113 KB (T-114).
const POSTER_LOGO = getImageProps({ src: '/logo-hmif.png', alt: '', width: 44, height: 44 }).props.src;

/** Bintang: posisi tetap (bukan acak) supaya server & klien sama. */
const BINTANG: readonly [number, number, number][] = [
  [62, 70, 1.1], [140, 132, 0.8], [228, 48, 1.3], [305, 118, 0.7], [388, 64, 1], [470, 140, 0.8], [545, 82, 1.2],
  [96, 214, 0.7], [262, 196, 0.9], [420, 230, 0.7], [520, 196, 1], [180, 280, 0.6], [350, 300, 0.8], [585, 260, 0.6],
  [30, 330, 0.8], [480, 320, 0.6],
];

function Pemandangan() {
  return (
    <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <linearGradient id="langit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03060F" />
          <stop offset="0.38" stopColor="#0A1A3F" />
          <stop offset="0.56" stopColor="#1A4E96" />
          <stop offset="0.62" stopColor="#5FB4FF" />
        </linearGradient>
        <radialGradient id="pendar" cx="0.5" cy="0.6" r="0.55">
          <stop offset="0" stopColor="#1E90FF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#1E90FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bukitJauh" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2C5598" />
          <stop offset="1" stopColor="#0E214D" />
        </linearGradient>
        <linearGradient id="bukitUtamaTerang" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#9DB4DC" />
          <stop offset="0.55" stopColor="#4C6FA8" />
          <stop offset="1" stopColor="#1B3570" />
        </linearGradient>
        <linearGradient id="bukitUtamaGelap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13285A" />
          <stop offset="1" stopColor="#081330" />
        </linearGradient>
        <linearGradient id="bukitDepan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A5486" />
          <stop offset="0.35" stopColor="#14254F" />
          <stop offset="1" stopColor="#050A1C" />
        </linearGradient>
        <filter id="kabur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="600" height="800" fill="url(#langit)" />
      <ellipse cx="300" cy="500" rx="420" ry="160" fill="url(#pendar)" />
      {BINTANG.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#DCEBFF" opacity="0.75" />
      ))}

      {/* Bukit jauh: dua lapis rendah, kontras kecil. */}
      <path d="M0 455 C 90 430, 170 440, 250 428 C 340 414, 420 396, 500 410 C 545 418, 575 430, 600 436 L600 800 L0 800 Z" fill="url(#bukitJauh)" opacity="0.9" />
      <path d="M0 490 C 120 470, 230 478, 330 466 C 430 454, 520 470, 600 480 L600 800 L0 800 Z" fill="#102555" />

      {/* Bukit utama: punggungan melengkung (S) — sisi terang di kiri, sisi bayangan di kanan. */}
      <path d="M0 610 C 80 560, 150 500, 230 452 C 290 416, 350 396, 410 392 C 380 430, 340 470, 300 512 C 240 574, 170 626, 90 660 C 55 674, 25 680, 0 682 Z" fill="url(#bukitUtamaTerang)" />
      <path d="M410 392 C 470 390, 540 412, 600 446 L600 800 L0 800 L0 682 C 25 680, 55 674, 90 660 C 170 626, 240 574, 300 512 C 340 470, 380 430, 410 392 Z" fill="url(#bukitUtamaGelap)" />
      {/* Pendar biru HMIF di sepanjang punggungan. */}
      <path d="M90 660 C 170 626, 240 574, 300 512 C 340 470, 380 430, 410 392" stroke="#1E90FF" strokeWidth="6" fill="none" opacity="0.55" filter="url(#kabur)" />
      <path d="M90 660 C 170 626, 240 574, 300 512 C 340 470, 380 430, 410 392" stroke="#8FD0FF" strokeWidth="1.3" fill="none" opacity="0.9" />
      <path d="M410 392 C 470 390, 540 412, 600 446" stroke="#5FB4FF" strokeWidth="1" fill="none" opacity="0.45" />

      {/* Bukit depan dengan riak pasir. */}
      <path d="M0 700 C 120 668, 250 656, 380 668 C 470 676, 540 690, 600 688 L600 800 L0 800 Z" fill="url(#bukitDepan)" />
      <path d="M0 700 C 120 668, 250 656, 380 668 C 470 676, 540 690, 600 688" stroke="#00B4D8" strokeWidth="1" fill="none" opacity="0.4" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={`M0 ${722 + i * 16} C 140 ${700 + i * 16}, 300 ${694 + i * 16}, 440 ${706 + i * 16} S 560 ${722 + i * 16}, 600 ${718 + i * 16}`}
          stroke="#7CC4FF"
          strokeWidth="0.8"
          fill="none"
          opacity={0.12 - i * 0.018}
        />
      ))}
    </svg>
  );
}

export function PanelLogin() {
  const [videoAktif, setVideoAktif] = useState(false);
  // Video dipasang setelah hidrasi: unduhannya tidak berebut dengan JS halaman (T-114).
  useEffect(() => setVideoAktif(true), []);

  return (
    <section
      data-testid="login-hero"
      aria-label="HMIF Center"
      className="relative isolate m-3 h-[17rem] overflow-hidden rounded-2xl ring-1 ring-white/10 sm:h-[20rem] lg:m-4 lg:h-auto lg:min-h-[calc(100dvh-2rem)]"
      style={{ background: 'linear-gradient(180deg, #03060F 0%, #0A1A3F 45%, #1A4E96 100%)' }}
    >
      <Pemandangan />

      <div className="absolute top-4 left-4 z-10 flex items-center gap-2.5 sm:top-5 sm:left-5">
        <video
          src={videoAktif ? '/logo-hmif-animasi.webm' : undefined}
          poster={POSTER_LOGO}
          autoPlay
          muted
          loop
          playsInline
          aria-label="Logo HMIF Fakultas Teknik UNTIRTA"
          data-testid="login-logo-animasi"
          className="size-10 object-contain motion-reduce:hidden lg:size-11"
        />
        <Image src="/logo-hmif.png" alt="Logo HMIF Fakultas Teknik UNTIRTA" width={44} height={44} priority className="hidden size-10 motion-reduce:block lg:size-11" />
        <p className="text-[13px] leading-[17px] font-medium text-white/90">
          HMIF FT UNTIRTA
          <br />
          <span className="font-normal text-white/60">Kabinet Vardhana 2026–2027</span>
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 text-center sm:pb-8 lg:pb-12">
        <h1 className="text-[24px] leading-tight font-light tracking-[-0.02em] text-white sm:text-[30px] lg:text-[clamp(32px,2.9vw,42px)]">
          HMIF Center
          <br />
          <span className="text-white/85">Satu ruang kerja himpunan</span>
        </h1>
        <p className="mt-2 hidden text-[14px] text-white/60 sm:block lg:mt-3">Program kerja, surat, keuangan, dan acara Himpunan Mahasiswa Informatika.</p>
      </div>
    </section>
  );
}
