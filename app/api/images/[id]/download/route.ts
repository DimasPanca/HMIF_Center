import { z } from 'zod';

import { konteksSaatIni } from '@/lib/auth/guard';
import { gagal } from '@/lib/http/respond';
import { bolehUnduh, cariGambar, responsMaster } from '@/lib/images/download';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/**
 * ⚠️ SELALU MASTER, TIDAK PERNAH REKOMPRESI (INV-19, PRD I2/I3).
 * Baca peringatan lengkap di lib/images/download.ts sebelum mengubah apa pun.
 * Tidak ada parameter query — sengaja.
 */
export async function GET(_request: Request, context: RouteContext) {
  // Bukan requirePermission('nota.read'): Anggota & Kadept hanya punya hak C
  // atas nota, tetapi tetap harus dapat mengunduh nota yang mereka unggah.
  // Hak per-gambar diputuskan bolehUnduh().
  const konteks = await konteksSaatIni();
  if (!konteks) return gagal('TIDAK_TERAUTENTIKASI', 'Silakan masuk terlebih dahulu.', { status: 401, headers: TANPA_CACHE });
  if (!konteks.sesi.isActive) return gagal('AKUN_NONAKTIF', 'Akun Anda tidak aktif.', { status: 403, headers: TANPA_CACHE });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return gagal('VALIDASI_GAGAL', 'ID tidak valid.', { status: 422, headers: TANPA_CACHE });

  const g = await cariGambar(id);
  // Tidak berhak = tidak ditemukan: jawaban tidak membocorkan nota mana yang ada.
  if (!g || !(await bolehUnduh(konteks, g))) {
    return gagal('TIDAK_DITEMUKAN', 'Gambar tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
  }

  let isi: Buffer;
  try {
    isi = await storage.get(g.master_path); // master_path — BUKAN preview_path/thumbnail_path
  } catch (e) {
    console.error(`[images] master ${g.master_path} tidak terbaca`, e);
    return gagal('TIDAK_DITEMUKAN', 'Berkas gambar tidak tersedia.', { status: 404, headers: TANPA_CACHE });
  }
  return responsMaster(g, isi);
}
