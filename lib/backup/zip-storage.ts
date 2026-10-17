/**
 * zip-storage — Lapis 3: arsip ZIP seluruh berkas storage. SERVER-ONLY.
 *
 * Mengarsipkan SEMUA objek kedua bucket (nota/, dokumen/, ttd/, avatar/,
 * kendala/, template/, aset/, …) kecuali `backup/` sendiri — mengarsipkan
 * backup lama ke dalam backup baru membuat ukurannya berlipat setiap bulan.
 *
 * Arsip dipecah menjadi volume ≤ `batasVolume()` (batas unggah objek
 * Supabase); setiap volume ZIP utuh yang dapat dibuka sendiri.
 *
 * Di dalam ZIP, setiap berkas tersimpan di path yang sama dengan key-nya
 * (bucket ditentukan ulang dari bentuk key saat restore, `bucketUntuk`), plus
 * `_indeks.json`: key, ukuran, content type, dan SHA-256 tiap berkas supaya
 * restore (T-112) dapat membuktikan setiap berkas utuh, bukan sekadar ZIP-nya.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-110 kontrak 5 · PRD F-16.1
 */

import PizZip from 'pizzip';

import type { StorageAdapter, StorageObject } from '@/lib/storage/adapter';
import { keys } from '@/lib/storage/keys';

import { sha256 } from './manifest';

export const NAMA_INDEKS = '_indeks.json';

export interface EntriIndeks {
  key: string;
  size: number;
  contentType: string | null;
  checksum: string;
}

/** Sudah terkompresi — DEFLATE hanya membuang waktu. */
const TANPA_KOMPRESI = /\.(jpe?g|png|webp|gif|zip|gz|docx|xlsx|pdf)$/i;

async function paralel<T, H>(isi: T[], lebar: number, kerja: (x: T) => Promise<H>): Promise<H[]> {
  const hasil: H[] = new Array(isi.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(lebar, isi.length) }, async () => {
      while (i < isi.length) {
        const j = i++;
        hasil[j] = await kerja(isi[j]!);
      }
    }),
  );
  return hasil;
}

/**
 * Batas isi satu volume arsip. Supabase Storage menolak objek di atas batas
 * unggah proyek (50 MB pada paket gratis) — arsip dipecah menjadi beberapa
 * volume, masing-masing ZIP utuh dengan `_indeks.json`-nya sendiri.
 */
export function batasVolume(): number {
  const mb = Number(process.env.BACKUP_BATAS_VOLUME_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 45) * 1024 * 1024;
}

/** Kelompokkan objek menjadi volume ≤ batas (ukuran mentah); objek raksasa menjadi volumenya sendiri. */
export function bagiVolume<T extends { size: number }>(objek: T[], batas: number): T[][] {
  const hasil: T[][] = [];
  let kini: T[] = [];
  let isi = 0;
  for (const o of objek) {
    if (kini.length && isi + o.size > batas) {
      hasil.push(kini);
      kini = [];
      isi = 0;
    }
    kini.push(o);
    isi += o.size;
  }
  if (kini.length || !hasil.length) hasil.push(kini);
  return hasil;
}

/**
 * Mengarsipkan storage per volume dan menyerahkan setiap volume ke `simpan`
 * segera setelah jadi — hanya satu volume yang tinggal di memori.
 */
export async function zipStorage(
  storage: Pick<StorageAdapter, 'list' | 'get'>,
  simpan: (nomor: number, zip: Buffer) => Promise<void>,
  opsi: { batas?: number; onProgres?: (selesai: number, total: number) => void } = {},
): Promise<{ jumlah: number; volume: number }> {
  const semua: StorageObject[] = (await storage.list(''))
    .filter((o) => !o.key.startsWith(keys.prefixBackup))
    .sort((a, b) => a.key.localeCompare(b.key));
  const volume = bagiVolume(semua, opsi.batas ?? batasVolume());
  let selesai = 0;

  for (const [i, isiVolume] of volume.entries()) {
    const zip = new PizZip();
    const indeks: EntriIndeks[] = [];
    await paralel(isiVolume, 6, async (o) => {
      const isi = await storage.get(o.key);
      zip.file(o.key, isi, {
        binary: true,
        compression: TANPA_KOMPRESI.test(o.key) ? 'STORE' : 'DEFLATE',
      });
      indeks.push({
        key: o.key,
        size: isi.length,
        contentType: o.contentType,
        checksum: sha256(isi),
      });
      opsi.onProgres?.(++selesai, semua.length);
    });
    indeks.sort((a, b) => a.key.localeCompare(b.key));
    zip.file(NAMA_INDEKS, JSON.stringify(indeks, null, 2));
    await simpan(i + 1, zip.generate({ type: 'nodebuffer' }) as Buffer);
  }
  return { jumlah: semua.length, volume: volume.length };
}

/** Membaca ulang arsip dan mencocokkan setiap berkas dengan indeksnya. */
export function periksaArsip(zipBuf: Buffer): { jumlah: number; rusak: string[] } {
  const zip = new PizZip(zipBuf);
  const f = zip.file(NAMA_INDEKS);
  if (!f) return { jumlah: 0, rusak: [NAMA_INDEKS] };
  const indeks = JSON.parse(f.asText()) as EntriIndeks[];
  const rusak: string[] = [];
  for (const e of indeks) {
    const isi = zip.file(e.key);
    if (!isi) {
      rusak.push(e.key);
      continue;
    }
    const buf = isi.asNodeBuffer();
    if (buf.length !== e.size || sha256(buf) !== e.checksum) rusak.push(e.key);
  }
  return { jumlah: indeks.length, rusak };
}
