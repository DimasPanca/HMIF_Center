/**
 * skema pengurus — satu skema untuk form, server, dan import (K-04). Aman untuk klien.
 *
 * Data Pengurus adalah DAFTAR orang, bukan akun: baris boleh tanpa akun
 * (`user_id` NULL, ADR-012) dan import tidak pernah membuat akun.
 *
 * Sumber: docs/ai/tasks/P8-*.md T-107 · PRD F-14.1 · USER_FLOW §9.1
 */

import { z } from 'zod';

import type { DefinisiKolom } from '@/lib/import/parse-tabel';

/** Sama dengan aturan NIM pemohon Surat Keterangan Aktif — datanya mengalir ke sana. */
export const POLA_NIM = /^\d{6,20}$/;

export const KOLOM_IMPORT_PENGURUS: DefinisiKolom[] = [
  { kunci: 'nama_lengkap', label: 'Nama Lengkap', alias: ['nama', 'nama mahasiswa', 'nama pengurus'], wajib: true },
  { kunci: 'nim', label: 'NIM', alias: ['nomor induk mahasiswa', 'npm'], wajib: true },
  { kunci: 'jabatan', label: 'Jabatan', alias: ['posisi', 'jabatan pengurus', 'peran'], wajib: true },
  { kunci: 'departemen', label: 'Departemen', alias: ['divisi', 'dept', 'bidang'] },
  { kunci: 'angkatan', label: 'Angkatan', alias: ['tahun angkatan', 'tahun masuk'] },
  { kunci: 'status', label: 'Status', alias: ['status keaktifan', 'keaktifan', 'aktif'] },
];

const teks = (label: string, maks: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(maks, `${label} maksimal ${maks} karakter.`);

export const SkemaPengurus = z.object({
  nama_lengkap: teks('Nama lengkap', 150),
  nim: z.string({ error: 'NIM wajib diisi.' }).trim().regex(POLA_NIM, 'NIM hanya angka, 6–20 digit.'),
  jabatan: teks('Jabatan', 150),
  departemen_id: z.uuid({ error: 'Departemen tidak valid.' }).nullable().default(null),
  angkatan: z
    .int({ error: 'Angkatan harus tahun, mis. 2022.' })
    .min(2000, 'Angkatan tidak masuk akal.')
    .max(2100, 'Angkatan tidak masuk akal.')
    .nullable()
    .default(null),
  is_aktif: z.boolean().default(true),
});
export type InputPengurus = z.infer<typeof SkemaPengurus>;

// ---------------------------------------------------------------------------
// Baris import → InputPengurus
// ---------------------------------------------------------------------------

export interface DepartemenPilihan {
  id: string;
  kode: string;
  nama: string;
}

const normal = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');

const STATUS_AKTIF = new Set(['', 'aktif', 'ya', 'y', 'true', '1', 'active']);
const STATUS_NONAKTIF = new Set(['nonaktif', 'non aktif', 'tidak aktif', 'tidak', 'n', 'false', '0', 'inactive', 'demisioner']);

/** Skema satu baris berkas import: teks mentah → InputPengurus. */
export function skemaBarisPengurus(departemen: DepartemenPilihan[]) {
  const peta = new Map<string, string>();
  for (const d of departemen) {
    peta.set(normal(d.kode), d.id);
    peta.set(normal(d.nama), d.id);
  }
  return z
    .object({
      nama_lengkap: z.string(),
      nim: z.string(),
      jabatan: z.string(),
      departemen: z.string(),
      angkatan: z.string(),
      status: z.string(),
    })
    .transform((m, ctx): z.input<typeof SkemaPengurus> => {
      let departemenId: string | null = null;
      if (m.departemen.trim()) {
        departemenId = peta.get(normal(m.departemen.replace(/^departemen\s+/i, ''))) ?? null;
        if (!departemenId) {
          ctx.addIssue({ code: 'custom', path: ['departemen'], message: `Departemen "${m.departemen}" tidak dikenali.` });
          return z.NEVER;
        }
      }
      let angkatan: number | null = null;
      if (m.angkatan.trim()) {
        angkatan = Number(m.angkatan.trim());
        if (!Number.isInteger(angkatan)) {
          ctx.addIssue({ code: 'custom', path: ['angkatan'], message: `Angkatan "${m.angkatan}" bukan tahun.` });
          return z.NEVER;
        }
      }
      const st = normal(m.status);
      if (!STATUS_AKTIF.has(st) && !STATUS_NONAKTIF.has(st)) {
        ctx.addIssue({ code: 'custom', path: ['status'], message: `Status "${m.status}" tidak dikenali (Aktif/Nonaktif).` });
        return z.NEVER;
      }
      return {
        nama_lengkap: m.nama_lengkap,
        nim: m.nim.replace(/\s+/g, ''),
        jabatan: m.jabatan,
        departemen_id: departemenId,
        angkatan,
        is_aktif: !STATUS_NONAKTIF.has(st),
      };
    })
    .pipe(SkemaPengurus);
}
