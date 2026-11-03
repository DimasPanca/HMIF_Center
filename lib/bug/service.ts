/**
 * Lapor bug (ADR-060 §5). Semua pengguna aktif boleh melapor; pelapor melihat laporannya sendiri,
 * Admin melihat semua dan mengubah status. Lampiran opsional: gambar JPG/PNG/WebP ≤ 4 MB, jenis
 * dicek dari magic bytes, disimpan privat (`keys.laporanBug`).
 */

import { randomUUID } from 'node:crypto';

import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { storage } from '@/lib/storage';
import { keys } from '@/lib/storage/keys';

if (typeof window !== 'undefined') throw new Error('lib/bug/service.ts adalah modul server-only.');

export const STATUS_BUG = ['BARU', 'DITANGANI', 'SELESAI', 'DITOLAK'] as const;
export type StatusBug = (typeof STATUS_BUG)[number];
export const MAKS_LAMPIRAN = 4 * 1024 * 1024;

export const SkemaLaporBug = z.object({
  deskripsi: z.string().trim().min(10, 'Ceritakan bug-nya minimal 10 karakter.').max(5000, 'Deskripsi maksimal 5000 karakter.'),
  halaman: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
  peramban: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
});

export const SkemaUbahBug = z.object({
  status: z.enum(STATUS_BUG),
  catatan_admin: z.string().trim().max(2000, 'Catatan maksimal 2000 karakter.').default(''),
});

export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'DILARANG'; pesan: string };

export interface LaporanBug {
  id: string;
  deskripsi: string;
  halaman: string | null;
  peramban: string | null;
  ada_lampiran: boolean;
  status: StatusBug;
  catatan_admin: string;
  created_at: string;
  updated_at: string;
  pelapor: { id: string; nama: string; email: string };
  ditangani_oleh: string | null;
}

export const adalahAdmin = (k: Pick<Konteks, 'roles'>) => k.roles.includes('ADMIN');

const EKSTENSI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** Lampiran yang lolos pemeriksaan, atau pesan galatnya. */
export async function periksaLampiran(isi: Buffer): Promise<{ mime: keyof typeof EKSTENSI } | { galat: string }> {
  if (isi.length > MAKS_LAMPIRAN) return { galat: 'Tangkapan layar maksimal 4 MB.' };
  const jenis = await fileTypeFromBuffer(isi);
  if (!jenis || !(jenis.mime in EKSTENSI)) return { galat: 'Lampiran harus gambar JPG, PNG, atau WebP.' };
  return { mime: jenis.mime as keyof typeof EKSTENSI };
}

/** Simpan lampiran (bila ada) lalu catat laporan di dalam transaksi audit. */
export async function buatLaporan(
  jalankan: <T>(fn: (tx: TxKlien) => Promise<T>) => Promise<T>,
  konteks: Konteks,
  masukan: unknown,
  lampiran: Buffer | null,
): Promise<Hasil<{ id: string }>> {
  const p = SkemaLaporBug.safeParse(masukan);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Laporan tidak valid.' };

  const id = randomUUID();
  let key: string | null = null;
  let mime: string | null = null;
  if (lampiran && lampiran.length) {
    const cek = await periksaLampiran(lampiran);
    if ('galat' in cek) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: cek.galat };
    key = keys.laporanBug(id, EKSTENSI[cek.mime]);
    mime = cek.mime;
    await storage.put(key, lampiran, mime);
  }
  try {
    await jalankan((tx) =>
      tx.$executeRaw`
        INSERT INTO laporan_bug (id, pelapor_id, deskripsi, halaman, peramban, lampiran_key, lampiran_mime)
        VALUES (${id}::uuid, ${konteks.sesi.userId}::uuid, ${p.data.deskripsi}, ${p.data.halaman}, ${p.data.peramban}, ${key}, ${mime})`,
    );
  } catch (e) {
    if (key) await storage.delete(key).catch(() => undefined);
    throw e;
  }
  return { ok: true, nilai: { id } };
}

interface BarisBug {
  id: string;
  deskripsi: string;
  halaman: string | null;
  peramban: string | null;
  lampiran_key: string | null;
  status: StatusBug;
  catatan_admin: string;
  created_at: Date;
  updated_at: Date;
  pelapor_id: string;
  pelapor_nama: string;
  pelapor_email: string;
  penangan: string | null;
}

const keLaporan = (b: BarisBug): LaporanBug => ({
  id: b.id,
  deskripsi: b.deskripsi,
  halaman: b.halaman,
  peramban: b.peramban,
  ada_lampiran: !!b.lampiran_key,
  status: b.status,
  catatan_admin: b.catatan_admin,
  created_at: b.created_at.toISOString(),
  updated_at: b.updated_at.toISOString(),
  pelapor: { id: b.pelapor_id, nama: b.pelapor_nama, email: b.pelapor_email },
  ditangani_oleh: b.penangan,
});

/** Admin: semua laporan; selain itu hanya laporan milik pengguna. Terbaru dulu, maks 200. */
export async function daftarLaporan(konteks: Konteks): Promise<LaporanBug[]> {
  const semua = adalahAdmin(konteks);
  const baris = await db.$queryRaw<BarisBug[]>`
    SELECT l.id::text, l.deskripsi, l.halaman, l.peramban, l.lampiran_key, l.status, l.catatan_admin,
           l.created_at, l.updated_at, l.pelapor_id::text, u.nama_lengkap AS pelapor_nama, u.email AS pelapor_email,
           h.nama_lengkap AS penangan
    FROM laporan_bug l
    JOIN app_user u ON u.id = l.pelapor_id
    LEFT JOIN app_user h ON h.id = l.ditangani_oleh
    WHERE ${semua} OR l.pelapor_id = ${konteks.sesi.userId}::uuid
    ORDER BY l.created_at DESC
    LIMIT 200`;
  return baris.map(keLaporan);
}

export async function ubahLaporan(tx: TxKlien, konteks: Konteks, id: string, masukan: unknown): Promise<Hasil<{ status: StatusBug }>> {
  if (!adalahAdmin(konteks)) return { ok: false, kode: 'DILARANG', pesan: 'Hanya Admin yang dapat mengubah status laporan.' };
  if (!z.uuid().safeParse(id).success) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Laporan tidak ditemukan.' };
  const p = SkemaUbahBug.safeParse(masukan);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Perubahan tidak valid.' };
  const n = await tx.$executeRaw`
    UPDATE laporan_bug SET status = ${p.data.status}, catatan_admin = ${p.data.catatan_admin}, ditangani_oleh = ${konteks.sesi.userId}::uuid
    WHERE id = ${id}::uuid`;
  return n ? { ok: true, nilai: { status: p.data.status } } : { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Laporan tidak ditemukan.' };
}

/** Lampiran untuk pelapor atau Admin; null = tidak ada / tidak berhak (dijawab 404). */
export async function ambilLampiran(konteks: Konteks, id: string): Promise<{ isi: Buffer; mime: string } | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [b] = await db.$queryRaw<{ pelapor_id: string; lampiran_key: string | null; lampiran_mime: string | null }[]>`
    SELECT pelapor_id::text, lampiran_key, lampiran_mime FROM laporan_bug WHERE id = ${id}::uuid`;
  if (!b?.lampiran_key || !b.lampiran_mime) return null;
  if (b.pelapor_id !== konteks.sesi.userId && !adalahAdmin(konteks)) return null;
  return { isi: await storage.get(b.lampiran_key), mime: b.lampiran_mime };
}

export const STATUS_HTTP_BUG = { VALIDASI_GAGAL: 422, TIDAK_DITEMUKAN: 404, DILARANG: 403 } as const;
