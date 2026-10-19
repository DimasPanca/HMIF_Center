/**
 * skema editor Gantt (T-078) — satu skema untuk form & server (K-04). Aman
 * untuk klien. Konstanta & utilitas tanggal tinggal di `geser.ts` (tanpa zod)
 * dan diekspor ulang di sini.
 *
 * Tanggal task adalah tanggal KALENDER (`YYYY-MM-DD`, kolom DATE), bukan
 * waktu: drag menggeser per hari utuh, dan seluruh aritmetika berjalan di
 * UTC supaya pergantian zona/DST tak pernah menggeser satu hari.
 *
 * Sumber: T-078 · PRD F-6.1, F-6.3 · SYSTEM_DESIGN §4.4
 */

import { z } from 'zod';

import { tanggalSah } from './geser';

export {
  LABEL_LEVEL,
  LABEL_SKALA,
  LEVEL,
  SCOPE_KE_LEVEL,
  SKALA,
  SKALA_KE_GEOMETRI,
  dariHari,
  geserTanggal,
  hasilGeser,
  keHari,
  pxKeHari,
  tanggalSah,
  type Level,
  type ModeGeser,
  type Skala,
} from './geser';

// ---------------------------------------------------------------------------
// Skema
// ---------------------------------------------------------------------------

const tanggal = (label: string) =>
  z.string({ error: `${label} wajib diisi.` }).refine(tanggalSah, `${label} harus tanggal yang sah (YYYY-MM-DD).`);

const nama = (label: string, maks: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(maks, `${label} maksimal ${maks} karakter.`);

const rentangSah = (v: { tanggal_mulai?: string; tanggal_selesai?: string }) =>
  !v.tanggal_mulai || !v.tanggal_selesai || !tanggalSah(v.tanggal_mulai) || !tanggalSah(v.tanggal_selesai) || v.tanggal_selesai >= v.tanggal_mulai;
const pesanRentang = { message: 'Tanggal selesai tidak boleh mendahului tanggal mulai.', path: ['tanggal_selesai'] };

export const SkemaTaskBaru = z
  .object({
    group_id: z.uuid({ error: 'Pilih grup.' }),
    nama: nama('Nama task', 200),
    tanggal_mulai: tanggal('Tanggal mulai'),
    tanggal_selesai: tanggal('Tanggal selesai'),
    progres: z.coerce.number().int().min(0, 'Progres 0–100.').max(100, 'Progres 0–100.').default(0),
    is_milestone: z.boolean().default(false),
    /** Task pendahulu (Finish-to-Start). */
    bergantung_pada: z.array(z.uuid()).max(20).default([]),
  })
  .refine(rentangSah, pesanRentang);

export const SkemaUbahTask = z
  .object({
    group_id: z.uuid().optional(),
    nama: nama('Nama task', 200).optional(),
    tanggal_mulai: tanggal('Tanggal mulai').optional(),
    tanggal_selesai: tanggal('Tanggal selesai').optional(),
    progres: z.coerce.number().int().min(0, 'Progres 0–100.').max(100, 'Progres 0–100.').optional(),
    is_milestone: z.boolean().optional(),
    bergantung_pada: z.array(z.uuid()).max(20).optional(),
  })
  .refine(rentangSah, pesanRentang)
  .refine((v) => Object.keys(v).length > 0, 'Tidak ada perubahan.');

const warna = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Warna harus heksadesimal, mis. #2563EB.');

export const SkemaGrupBaru = z.object({
  nama: nama('Nama grup', 120),
  warna: warna.default('#2563EB'),
  pj_nama: z.string().trim().max(150).nullable().default(null),
});

export const SkemaUbahGrup = z
  .object({
    nama: nama('Nama grup', 120).optional(),
    warna: warna.optional(),
    pj_nama: z.string().trim().max(150).nullable().optional(),
    collapsed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Tidak ada perubahan.');

/** Badan POST /api/gantt/[chartId] — task atau grup baru. */
export const SkemaTambah = z.discriminatedUnion('jenis', [
  z.object({ jenis: z.literal('task'), data: z.unknown() }),
  z.object({ jenis: z.literal('grup'), data: z.unknown() }),
]);

// ---------------------------------------------------------------------------
// Dependensi
// ---------------------------------------------------------------------------

export interface Dependensi {
  dari: string;
  ke: string;
}

/**
 * Apakah menetapkan `pendahulu` → `task` membentuk siklus? Siklus panjang
 * (A→B→C→A) tak dapat dicegah constraint (migrasi 006), jadi diperiksa di sini.
 */
export function membentukSiklus(deps: readonly Dependensi[], task: string, pendahulu: readonly string[]): boolean {
  const keluar = new Map<string, string[]>();
  for (const d of deps) {
    if (d.ke === task) continue; // pendahulu lama task ini diganti seluruhnya
    keluar.set(d.dari, [...(keluar.get(d.dari) ?? []), d.ke]);
  }
  for (const p of pendahulu) keluar.set(p, [...(keluar.get(p) ?? []), task]);
  // Siklus ⇔ dari `task` dapat kembali ke `task`.
  const tumpuk = [...(keluar.get(task) ?? [])];
  const dilihat = new Set<string>();
  while (tumpuk.length) {
    const n = tumpuk.pop()!;
    if (n === task) return true;
    if (dilihat.has(n)) continue;
    dilihat.add(n);
    tumpuk.push(...(keluar.get(n) ?? []));
  }
  return false;
}
