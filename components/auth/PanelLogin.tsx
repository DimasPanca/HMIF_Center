'use client';

/**
 * Visual halaman login (ADR-064, revisi pemilik 2026-11-02 malam).
 *
 * `PanelLogin`: kartu berisi foto bersama Kabinet Vardhana saja, tanpa tulisan. Kartu berasio 3:2 sama
 * dengan foto, jadi foto memenuhi kartu dan semua orang tetap masuk bingkai. Foto sedikit digelapkan dan
 * dinaikkan kontrasnya agar tajam.
 *
 * `LogoLogin`: logo beranimasi (permintaan 2026-10-17), dipasang di atas form.
 *
 * Latar elemen `login-hero` tetap `linear-gradient` (langit malam) — kontrak T-045 butir 7.
 */

import Image, { getImageProps } from 'next/image';
import { useEffect, useState } from 'react';

// Poster video lewat optimizer Next (WebP kecil), bukan PNG mentah 113 KB (T-114).
const POSTER_LOGO = getImageProps({ src: '/logo-hmif.png', alt: '', width: 44, height: 44 }).props.src;

export function PanelLogin() {
  return (
    <section
      data-testid="login-hero"
      aria-label="Foto bersama Kabinet Vardhana"
      className="relative isolate m-3 aspect-[3/2] overflow-hidden rounded-2xl shadow-[0_24px_60px_-24px_rgba(0,102,169,0.45)] ring-1 ring-[#0066A9]/10 lg:m-6 lg:max-h-[calc(100dvh-3rem)] lg:self-center lg:rounded-3xl"
      style={{ background: 'linear-gradient(180deg, #03060F 0%, #0A1A3F 45%, #1A4E96 100%)' }}
    >
      <Image
        src="/login-kabinet-vardhana.jpg"
        alt="Foto bersama pengurus HMIF FT UNTIRTA Kabinet Vardhana 2026–2027"
        fill
        priority
        sizes="(min-width: 1024px) 60vw, 100vw"
        className="object-cover brightness-[0.8] contrast-[1.12] saturate-[1.05]"
      />
    </section>
  );
}

export function LogoLogin() {
  const [videoAktif, setVideoAktif] = useState(false);
  // Video dipasang setelah hidrasi: unduhannya tidak berebut dengan JS halaman (T-114).
  useEffect(() => setVideoAktif(true), []);

  return (
    <div className="flex items-center gap-2.5">
      <video
        src={videoAktif ? '/logo-hmif-animasi.webm' : undefined}
        poster={POSTER_LOGO}
        autoPlay
        muted
        loop
        playsInline
        aria-label="Logo HMIF Fakultas Teknik UNTIRTA"
        data-testid="login-logo-animasi"
        className="size-11 object-contain motion-reduce:hidden"
      />
      <Image src="/logo-hmif.png" alt="Logo HMIF Fakultas Teknik UNTIRTA" width={44} height={44} priority className="hidden size-11 motion-reduce:block" />
      <p className="text-[13px] leading-[17px] font-semibold text-[#0A0F1F]">
        HMIF FT UNTIRTA
        <br />
        <span className="font-normal text-[#475569]">Kabinet Vardhana 2026–2027</span>
      </p>
    </div>
  );
}
