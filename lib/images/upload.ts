/**
 * Orkestrasi unggah gambar nota (T-098 #5–#7). Server-only.
 *
 *   validasi ketiga berkas  →  simpan (UUID, bukan nama pengguna)  →
 *   baca ulang master & decode  →  BARU buat record `image`.
 *
 * Gagal di titik mana pun → SELURUH berkas yang sempat terunggah dihapus dan
 * tidak ada record (INV-23, PRD I11). Storage & penulis record disuntikkan
 * supaya urutan itu dapat dibuktikan unit test tanpa jaringan.
 *
 * Sumber: T-098 · SYSTEM_DESIGN §9.3 · INV-21, INV-23
 */

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  FileTidakValidError,
  sanitasiNamaBerkas,
  validasiGambar,
  verifikasiMaster,
  type GambarSah,
} from '@/lib/images/server-validate';
import type { StorageAdapter } from '@/lib/storage/adapter';
import { keys } from '@/lib/storage/keys';

/** Metadata sumber asli (sebelum pipeline klien) — tidak dapat dibuktikan server, hanya diperiksa kewajarannya. */
export const SkemaMetaSumber = z.object({
  original_width: z.coerce.number().int().min(1).max(50_000),
  original_height: z.coerce.number().int().min(1).max(50_000),
  original_mime_type: z.string().trim().regex(/^image\/[\w.+-]{1,60}$/, 'Jenis berkas asli tidak sah.'),
  kind: z.enum(['FOTO', 'DOKUMEN']).default('FOTO'),
  is_scanned: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false),
});
export type MetaSumber = z.infer<typeof SkemaMetaSumber>;

export interface RecordGambar {
  uploader_id: string;
  original_filename: string;
  storage_uuid: string;
  master_path: string;
  preview_path: string;
  thumbnail_path: string;
  original_mime_type: string;
  master_mime_type: string;
  original_width: number;
  original_height: number;
  master_width: number;
  master_height: number;
  master_file_size: bigint;
  kind: 'FOTO' | 'DOKUMEN';
  is_scanned: boolean;
}

export interface DepsUnggah {
  storage: Pick<StorageAdapter, 'put' | 'get' | 'delete'>;
  simpanRecord: (r: RecordGambar) => Promise<{ id: string }>;
  uuid?: () => string;
}

export interface MasukanUnggah {
  master: Buffer;
  preview: Buffer;
  thumb: Buffer;
  namaAsli: string;
  meta: MetaSumber;
  uploaderId: string;
}

export interface HasilUnggah {
  id: string;
  master_width: number;
  master_height: number;
  master_mime_type: string;
}

export async function unggahGambar(deps: DepsUnggah, m: MasukanUnggah): Promise<HasilUnggah> {
  // 1–4. Validasi SEBELUM satu byte pun menyentuh storage.
  const [master, preview, thumb]: [GambarSah, GambarSah, GambarSah] = await Promise.all([
    validasiGambar(m.master, 'master'),
    validasiGambar(m.preview, 'preview'),
    validasiGambar(m.thumb, 'thumb'),
  ]);
  if (master.lebar > m.meta.original_width || master.tinggi > m.meta.original_height) {
    // CHECK master_tidak_upscale (migrasi 008) — tolak dengan pesan, bukan galat DB.
    throw new FileTidakValidError('Ukuran gambar asli yang dilaporkan lebih kecil daripada gambar utama.');
  }

  const uuid = (deps.uuid ?? randomUUID)();
  const kunci = {
    master: keys.notaMaster(uuid, master.ekstensi),
    preview: keys.notaPreview(uuid, preview.ekstensi),
    thumb: keys.notaThumb(uuid, thumb.ekstensi),
  };
  const terunggah: string[] = [];

  try {
    // 5. Simpan — satu per satu supaya daftar pembersihan selalu akurat.
    await deps.storage.put(kunci.master, master.isi, master.mime);
    terunggah.push(kunci.master);
    await deps.storage.put(kunci.preview, preview.isi, preview.mime);
    terunggah.push(kunci.preview);
    await deps.storage.put(kunci.thumb, thumb.isi, thumb.mime);
    terunggah.push(kunci.thumb);

    // 6. Verifikasi akhir: yang tersimpan benar-benar dapat dibaca kembali.
    await verifikasiMaster(await deps.storage.get(kunci.master), master.lebar, master.tinggi);

    // 7. Baru record.
    const r = await deps.simpanRecord({
      uploader_id: m.uploaderId,
      original_filename: sanitasiNamaBerkas(m.namaAsli),
      storage_uuid: uuid,
      master_path: kunci.master,
      preview_path: kunci.preview,
      thumbnail_path: kunci.thumb,
      original_mime_type: m.meta.original_mime_type,
      master_mime_type: master.mime,
      original_width: m.meta.original_width,
      original_height: m.meta.original_height,
      master_width: master.lebar,
      master_height: master.tinggi,
      master_file_size: BigInt(master.isi.length),
      kind: m.meta.kind,
      is_scanned: m.meta.is_scanned,
    });
    return { id: r.id, master_width: master.lebar, master_height: master.tinggi, master_mime_type: master.mime };
  } catch (e) {
    // INV-23: tidak ada berkas yatim. allSettled — satu penghapusan gagal tidak
    // boleh menghentikan penghapusan lainnya.
    const hasil = await Promise.allSettled(terunggah.map((k) => deps.storage.delete(k)));
    hasil.forEach((h, i) => {
      if (h.status === 'rejected') console.error(`[images] berkas parsial ${terunggah[i]} gagal dihapus`, h.reason);
    });
    throw e;
  }
}
