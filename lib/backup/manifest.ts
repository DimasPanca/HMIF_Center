/**
 * manifest — isi `manifest.json` bundel backup dan pemeriksaan checksum-nya.
 * Murni (tanpa DB/storage) supaya dipakai bersama service, skrip verifikasi,
 * dan restore (T-112).
 *
 * Struktur bundel (PRD F-16.1):
 *   manifest.json
 *   database/full-dump.sql.gz
 *   modules/{12 modul}.json
 *   exports/rab-{acara}.xlsx · exports/daftar-surat.xlsx
 *   files/storage-archive.zip (+ storage-archive-2.zip, … bila melebihi batas unggah)
 *
 * `manifest.json` ditulis PALING AKHIR, setelah seluruh berkas lain diunggah
 * dan diunduh ulang untuk dicocokkan checksum-nya. Bundel tanpa manifest
 * berarti backup tidak pernah selesai — tidak ada bundel setengah jadi yang
 * tampak sah.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-110 · PRD F-16.1 · SYSTEM_DESIGN §15.1
 */

import { createHash } from 'node:crypto';

import { z } from 'zod';

/** Versi format manifest itu sendiri — bukan versi skema database. */
export const FORMAT_MANIFEST = 1;

export const JALUR = {
  manifest: 'manifest.json',
  dump: 'database/full-dump.sql.gz',
  modul: (m: string) => `modules/${m}.json`,
  rab: (slug: string) => `exports/rab-${slug}.xlsx`,
  daftarSurat: 'exports/daftar-surat.xlsx',
  /** Volume 1 bernama persis PRD; volume berikutnya `storage-archive-{n}.zip`. */
  arsip: (n = 1) => (n === 1 ? 'files/storage-archive.zip' : `files/storage-archive-${n}.zip`),
  awalanArsip: 'files/storage-archive',
} as const;

export const MIME = {
  json: 'application/json',
  gzip: 'application/gzip',
  zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

const SkemaBerkas = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
});

export const SkemaManifest = z.object({
  format: z.literal(FORMAT_MANIFEST),
  backupId: z.string().min(1),
  /** `SCHEMA_VERSION` — versi kompatibilitas yang dibandingkan restore (T-112). */
  versiSkema: z.string().min(1),
  /** Migrasi terakhir yang terpasang (`_migrasi`), mis. `047_lpj_hapus_kaskade`. */
  migrasiTerakhir: z.string().min(1),
  dibuatPada: z.string(),
  jenis: z.enum(['OTOMATIS', 'MANUAL', 'PRA_RESTORE']),
  dump: z.object({
    metode: z.enum(['pg_dump', 'sql_per_tabel']),
    tabel: z.array(z.string()),
  }),
  files: z.array(SkemaBerkas),
  jumlahRecord: z.record(z.string(), z.number().int().nonnegative()),
  jumlahBerkasStorage: z.number().int().nonnegative(),
  volumeArsip: z.number().int().positive(),
  /** Hal yang TIDAK tercakup bundel ini — dibaca sebelum memulihkan. */
  keterbatasan: z.array(z.string()),
});

export type Manifest = z.infer<typeof SkemaManifest>;
export type BerkasManifest = z.infer<typeof SkemaBerkas>;

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function entriBerkas(path: string, data: Buffer): BerkasManifest {
  return { path, size: data.length, checksum: sha256(data) };
}

export interface HasilVerifikasi {
  ok: boolean;
  /** Berkas yang isinya tidak cocok dengan manifest, beserta sebabnya. */
  rusak: { path: string; sebab: string }[];
}

/**
 * Mencocokkan setiap berkas di manifest dengan isi sebenarnya.
 * `ambil` melempar bila berkas tidak ada — dicatat sebagai rusak, bukan
 * menggagalkan seluruh pemeriksaan, supaya laporannya lengkap.
 */
export async function verifikasiBerkas(
  manifest: Pick<Manifest, 'files'>,
  ambil: (path: string) => Promise<Buffer>,
): Promise<HasilVerifikasi> {
  const rusak: HasilVerifikasi['rusak'] = [];
  for (const f of manifest.files) {
    let isi: Buffer;
    try {
      isi = await ambil(f.path);
    } catch (e) {
      rusak.push({
        path: f.path,
        sebab: `tidak dapat dibaca: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    if (isi.length !== f.size)
      rusak.push({ path: f.path, sebab: `ukuran ${isi.length}, manifest ${f.size}` });
    else if (sha256(isi) !== f.checksum)
      rusak.push({ path: f.path, sebab: 'checksum SHA-256 tidak cocok' });
  }
  return { ok: rusak.length === 0, rusak };
}

/** Berkas wajib yang harus ada di setiap bundel lengkap. */
export function berkasWajib(modul: readonly string[]): string[] {
  return [JALUR.dump, ...modul.map(JALUR.modul), JALUR.daftarSurat, JALUR.arsip(1)];
}

/** Berkas wajib yang tidak tercantum di manifest. */
export function berkasHilang(
  manifest: Pick<Manifest, 'files'>,
  modul: readonly string[],
): string[] {
  const ada = new Set(manifest.files.map((f) => f.path));
  return berkasWajib(modul).filter((p) => !ada.has(p));
}

/** Nama berkas aman dari nama acara: huruf kecil, alfanumerik dan '-'. */
export function slug(teks: string): string {
  return (
    teks
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'acara'
  );
}
