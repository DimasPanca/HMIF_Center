import { NextResponse } from 'next/server';

import { logout } from '@/lib/auth/session';

export async function POST() {
  await logout();

  const response = NextResponse.json({ ok: true, data: null });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
