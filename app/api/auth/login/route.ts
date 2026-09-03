import { NextResponse } from 'next/server';

import { login, type KodeGagalLogin } from '@/lib/auth/session';

const STATUS: Record<KodeGagalLogin, number> = {
  INPUT_TIDAK_VALID: 400,
  KREDENSIAL_SALAH: 401,
  TERLALU_BANYAK_PERCOBAAN: 429,
  AKUN_NONAKTIF: 403,
  TIDAK_ADA_PERIODE: 409,
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asInput(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

export async function POST(request: Request) {
  const body = asObject(await request.json().catch(() => null));
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const hasil = await login({
    email: asInput(body.email),
    password: asInput(body.password),
    ip: forwardedIp || realIp || null,
    userAgent: request.headers.get('user-agent'),
    next: typeof body.next === 'string' ? body.next : null,
  });

  if (!hasil.ok) {
    const response = NextResponse.json(
      {
        ok: false,
        error: {
          code: hasil.kode,
          message: hasil.pesan,
        },
      },
      { status: STATUS[hasil.kode] },
    );
    response.headers.set('Cache-Control', 'no-store');

    if (hasil.kode === 'TERLALU_BANYAK_PERCOBAAN' && hasil.sisaDetik !== undefined) {
      response.headers.set('Retry-After', String(hasil.sisaDetik));
    }

    return response;
  }

  const response = NextResponse.json({
    ok: true,
    data: { redirect: hasil.redirect },
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
