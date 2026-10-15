/**
 * skema editor Gantt (T-078) — satu skema untuk form & server (K-04), plus
 * utilitas tanggal murni yang dipakai drag di klien dan validasi di server.
 * Aman untuk klien.
 *
 * Tanggal task adalah tanggal KALENDER (`YYYY-MM-DD`, kolom DATE), bukan
 * waktu: drag menggeser per hari utuh, dan seluruh aritmetika berjalan di
 * UTC supaya pergantian zona/DST tak pernah menggeser satu hari.
 *
 * Sumber: T-078 · PRD F-6.1, F-6.3 · SYSTEM_DESIGN §4.4
 */

import { z } from 'zod';

const HARI_MS = 86_400_000;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export const SKALA = ['minggu', 'bulan', 'kuartal'] as const;
export type Skala = (typeof SKALA)[number];
export const SKALA_KE_GEOMETRI = { minggu: 'week', bulan: 'month', kuartal: 'quarter' } as const satisfies Record<Skala, 'week' | 'month' | 'quarter'>;
export const LABEL_SKALA: Record<Skala, string> = { minggu: 'Minggu', bulan: 'Bulan', kuartal: 'Kuartal' };

export const LEVEL = ['departemen', 'proker', 'ketuplak', 'divisi'] as const;
export type Level = (typeof LEVEL)[number];
export const SCOPE_KE_LEVEL = { DEPARTEMEN: 'departemen', PROKER: 'proker', KETUPLAK: 'ketuplak', DIVISI: 'divisi' } as const satisfies Record<string, Level>;
export const LABEL_LEVEL: Record<Level, string> = {
  departemen: 'Departemen',
  proker: 'Proker',
  ketuplak: 'Ketua Pelaksana',
  divisi: 'Divisi',
};

export function tanggalSah(s: string): boolean {
  if (!POLA_TANGGAL.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function keHari(s: string): number {
  return Math.round(Date.parse(`${s}T00:00:00.000Z`) / HARI_MS);
}

export function dariHari(n: number): string {
  return new Date(n * HARI_MS).toISOString().slice(0, 10);
}

export function geserTanggal(s: string, hari: number): string {
  return dariHari(keHari(s) + hari);
}

/** Jarak piksel → jumlah hari utuh (snap ke hari, kontrak #2). */
export function pxKeHari(dx: number, pxPerHari: number): number {
  if (!Number.isFinite(dx) || !(pxPerHari > 0)) return 0;
  const n = Math.round(dx / pxPerHari);
  return n === 0 ? 0 : n; // hindari -0
}

export type ModeGeser = 'pindah' | 'awal' | 'akhir';

/**
 * Rentang baru setelah drag. `pindah` menggeser kedua ujung; `awal`/`akhir`
 * mengubah durasi dan tak pernah membuat selesai mendahului mulai (task satu
 * hari sah — CHECK `task_tanggal_valid`).
 */
export function hasilGeser(mulai: string, selesai: string, mode: ModeGeser, hari: number): { mulai: string; selesai: string } {
  if (mode === 'pindah') return { mulai: geserTanggal(mulai, hari), selesai: geserTanggal(selesai, hari) };
  if (mode === 'awal') {
    const baru = Math.min(keHari(mulai) + hari, keHari(selesai));
    return { mulai: dariHari(baru), selesai };
  }
  const baru = Math.max(keHari(selesai) + hari, keHari(mulai));
  return { mulai, selesai: dariHari(baru) };
}

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
