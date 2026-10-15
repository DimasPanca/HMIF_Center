/**
 * Unduhan MASTER gambar nota (T-099). Server-only.
 *
 * ===========================================================================
 * PERINGATAN — BACA SEBELUM MENGUBAH (INV-19, PRD I2, I3)
 * ===========================================================================
 * Unduhan WAJIB membaca `master_path`. Bukan `preview_path`, bukan
 * `thumbnail_path`. Preview (1280px, WebP q0.78) dan thumb (400px) terlihat
 * "cukup bagus" di layar dan karena itu menggoda dipakai sebagai pintasan —
 * tetapi nota yang dicetak dari preview tidak terbaca nominalnya, dan LPJ yang
 * ditolak bagian keuangan kampus karena nota buram adalah kegagalan yang
 * tidak bisa diperbaiki setelah acara selesai.
 *
 * Berkas dikirim APA ADANYA: tanpa transform, resize, atau re-encode. Tidak
 * ada parameter query untuk resize — bila suatu saat dibutuhkan, itu endpoint
 * lain yang membaca preview, bukan endpoint ini.
 *
 * Sumber: T-099 · SYSTEM_DESIGN §9.4 · PRD F-11.2 (I2, I3) · INV-19
 */

import type { Konteks } from '@/lib/auth/guard';
import { lingkupKonteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { sanitasiNamaBerkas } from '@/lib/images/server-validate';

if (typeof window !== 'undefined') {
  throw new Error('lib/images/download.ts adalah modul server-only.');
}

export interface GambarUnduh {
  id: string;
  uploader_id: string;
  master_path: string;
  master_mime_type: string;
  original_filename: string;
}

/**
 * Siapa boleh mengunduh master:
 *   - pengunggahnya sendiri (termasuk sebelum gambar ditautkan ke nota);
 *   - pemilik `nota.read` tanpa lingkup (Ketua, Wakil, Sekum, Bendum, BPH);
 *   - untuk gambar yang sudah menjadi nota: Kadept departemen proker acara
 *     itu, anggota/koordinator divisi notanya, dan ketua pelaksana acaranya.
 */
export async function bolehUnduh(konteks: Konteks, g: GambarUnduh): Promise<boolean> {
  if (g.uploader_id === konteks.sesi.userId) return true;
  if (can(konteks.roles, 'nota.read') && lingkupKonteks(konteks, 'nota.read') === null) return true;
  const [r] = await db.$queryRaw<{ ya: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM nota n
      JOIN divisi d ON d.id = n.divisi_id
      JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
      JOIN proker p ON p.id = k.proker_id
      WHERE n.image_id = ${g.id}::uuid
        AND (
          p.departemen_id = ANY(${konteks.departemenIds}::uuid[])
          OR k.ketua_pelaksana = ${konteks.sesi.userId}::uuid
          OR d.koordinator_id = ${konteks.sesi.userId}::uuid
          OR EXISTS (SELECT 1 FROM divisi_member dm WHERE dm.divisi_id = d.id AND dm.user_id = ${konteks.sesi.userId}::uuid)
        )
    ) AS ya`;
  return r?.ya ?? false;
}

export async function cariGambar(id: string): Promise<GambarUnduh | null> {
  return db.image.findUnique({
    where: { id },
    select: { id: true, uploader_id: true, master_path: true, master_mime_type: true, original_filename: true },
  });
}

/**
 * Respons unduhan master. Murni — diuji unit. `isi` dikirim persis seperti
 * yang dibaca dari storage.
 */
export function responsMaster(g: Pick<GambarUnduh, 'master_mime_type' | 'original_filename'>, isi: Buffer): Response {
  const nama = sanitasiNamaBerkas(g.original_filename);
  const ascii = nama.replace(/[^\x20-\x7e]/g, '_');
  return new Response(new Uint8Array(isi), {
    status: 200,
    headers: {
      'Content-Type': g.master_mime_type,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      'Content-Length': String(isi.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
