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
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
