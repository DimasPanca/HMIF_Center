/**
 * Dasar editor Gantt yang TIDAK butuh zod: konstanta skala/level dan
 * aritmetika tanggal kalender untuk drag (T-078). Dipisah dari `skema.ts`
 * karena komponen chart (TaskBar, ScaleSwitcher) ikut bundle awal beranda —
 * mengimpor `skema.ts` menyeret zod (±26 KB gzip) ke Master Gantt hanya demi
 * `pxKeHari` (T-114, anggaran beranda < 180 KB). `skema.ts` mengekspor ulang
 * seluruh isi berkas ini, jadi kode server tidak berubah.
 *
 * Tanggal task adalah tanggal KALENDER (`YYYY-MM-DD`, kolom DATE), bukan
 * waktu: drag menggeser per hari utuh, dan seluruh aritmetika berjalan di
 * UTC supaya pergantian zona/DST tak pernah menggeser satu hari.
 *
 * Sumber: T-078 · T-114 · SYSTEM_DESIGN §19.1
 */

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
