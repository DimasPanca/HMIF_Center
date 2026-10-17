import type { NextConfig } from 'next';

/**
 * Security header sesuai SYSTEM_DESIGN §18.2.
 *
 * `camera=(self)` bukan kelonggaran: modul Nota mengharuskan panitia memotret
 * struk langsung dari browser di lapangan (PRD F-11.3). Mikrofon dan geolokasi
 * ditutup penuh karena tidak ada fitur yang membutuhkannya, dan data GPS justru
 * wajib dibuang dari gambar nota (INV-20).
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  /**
   * CSP (SYSTEM_DESIGN §18.1 "CSP header", T-113). Sengaja TANPA `script-src`:
   * Next.js menyisipkan skrip inline (hidrasi, skrip tema di app/layout.tsx)
   * dan membatasinya menuntut nonce per permintaan. Yang ditutup di sini:
   * pembingkaian (clickjacking, melengkapi X-Frame-Options), plugin/objek,
   * pembajakan <base>, dan pengiriman form ke situs lain. XSS dicegah oleh
   * sanitasi allowlist di kedua sisi (lib/security/sanitize.ts) — SECURITY_AUDIT M-02.
   */
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * `NEXT_DIST_DIR` hanya untuk pengukuran: build produksi benchmark
   * (mis. `.next-bench`, T-102 bench-galeri-nota) dapat dibuat dan dijalankan
   * berdampingan dengan `next dev` tanpa menimpa `.next` miliknya. Bawaan tetap `.next`.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /**
   * Hanya berlaku di `next dev`. Bawaannya membuang rute yang menganggur
   * ±15 detik, lalu mengompilasinya ulang (9–25 detik) saat diminta lagi — di
   * tengah gate e2e yang panjang, autosave dan approval jadi timeout palsu
   * (diukur 2026-10-15, gate surat-approval/surat-massal). Satu jam cukup untuk
   * satu sesi kerja; produksi tidak terpengaruh.
   */
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 100,
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
