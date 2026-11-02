import { NextResponse } from 'next/server';

import { logout } from '@/lib/auth/session';

/**
 * Keluar. Dipanggil `fetch` dari menu pengguna (JSON), atau sebagai kiriman form biasa bila tombol
 * ditekan sebelum JavaScript halaman aktif — kasus kedua dijawab 303 ke /login supaya pengguna tidak
 * berhenti di halaman yang sama dengan "?" di URL.
 */
export async function POST(request: Request) {
  await logout();

  const jenis = request.headers.get('content-type') ?? '';
  if (jenis.includes('application/x-www-form-urlencoded') || jenis.includes('multipart/form-data')) {
    const response = NextResponse.redirect(new URL('/login', request.url), 303);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const response = NextResponse.json({ ok: true, data: null });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
