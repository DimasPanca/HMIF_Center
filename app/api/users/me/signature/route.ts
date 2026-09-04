import { NextResponse } from 'next/server';

import { konteksSaatIni } from '@/lib/auth/guard';
import type { RoleCode } from '@/lib/auth/permissions';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { keys, storage } from '@/lib/storage';

const MAKS_UKURAN_TTD = 2 * 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const ROLE_PENGUNGGAH = new Set<RoleCode>(['KETUA', 'WAKIL', 'SEKUM']);

function jsonTanpaCache(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function gagal(code: string, message: string, status: number) {
  return jsonTanpaCache({ ok: false, error: { code, message } }, { status });
}

function pngSah(bytes: Uint8Array) {
  return (
    bytes.length >= PNG_MAGIC.length && PNG_MAGIC.every((nilai, index) => bytes[index] === nilai)
  );
}

async function pulihkanBerkas(key: string, sebelumnya: Buffer | null) {
  if (sebelumnya) {
    await storage.put(key, sebelumnya, 'image/png', { upsert: true });
    return;
  }

  await storage.delete(key);
}

export async function POST(request: Request) {
  const konteks = await konteksSaatIni();

  if (!konteks) {
    return gagal('TIDAK_TERAUTENTIKASI', 'Sesi tidak ditemukan atau sudah berakhir.', 401);
  }
  if (!konteks.sesi.isActive) {
    return gagal('AKUN_NONAKTIF', 'Akun Anda dinonaktifkan. Hubungi Admin.', 403);
  }
  if (!konteks.periodeId) {
    return gagal('TIDAK_ADA_PERIODE', 'Belum ada periode kepengurusan yang aktif.', 409);
  }
  if (!konteks.roles.some((role) => ROLE_PENGUNGGAH.has(role))) {
    return gagal(
      'TIDAK_BERWENANG',
      'Hanya Ketua, Wakil, atau Sekum yang dapat mengunggah tanda tangan.',
      403,
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return gagal('FILE_TIDAK_VALID', 'Pilih berkas PNG yang akan diunggah.', 422);
  }
  if (file.size === 0 || file.size > MAKS_UKURAN_TTD) {
    return gagal(
      'FILE_TIDAK_VALID',
      'Ukuran tanda tangan harus lebih dari 0 dan maksimum 2 MB.',
      422,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAKS_UKURAN_TTD || !pngSah(buffer)) {
    return gagal('FILE_TIDAK_VALID', 'Berkas tanda tangan harus berupa PNG yang sah.', 422);
  }

  const key = keys.ttd(konteks.sesi.userId);
  let sebelumnya: Buffer | null = null;

  try {
    if (await storage.exists(key)) sebelumnya = await storage.get(key);
    await storage.put(key, buffer, 'image/png', { upsert: true });

    try {
      await withAuditContext(request, (tx) =>
        tx.signature.upsert({
          where: { user_id: konteks.sesi.userId },
          create: { user_id: konteks.sesi.userId, storage_key: key },
          update: { storage_key: key, updated_at: new Date() },
        }),
      );
    } catch (error) {
      await pulihkanBerkas(key, sebelumnya).catch(() => undefined);
      throw error;
    }
  } catch {
    return gagal('UNGGAH_GAGAL', 'Tanda tangan belum dapat disimpan. Silakan coba kembali.', 500);
  }

  return jsonTanpaCache({ ok: true, data: { hasSignature: true } });
}
