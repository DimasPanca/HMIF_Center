/**
 * Skema pengajuan Surat Keterangan Aktif mandiri (ADR-036) — dipakai form klien
 * dan server (K-04). Modul murni tanpa akses DB.
 */

import { z } from 'zod';

export const SkemaAjukanSkAktif = z.strictObject({
  keperluan: z
    .string({ error: 'Keperluan wajib diisi.' })
    .trim()
    .min(5, 'Tulis keperluannya minimal 5 karakter, mis. "Persyaratan beasiswa".')
    .max(200, 'Keperluan maksimal 200 karakter.'),
});
export type InputAjukanSkAktif = z.infer<typeof SkemaAjukanSkAktif>;

/** Pilihan cepat di form — tetap dapat diketik bebas. */
export const KEPERLUAN_UMUM = [
  'Persyaratan pendaftaran beasiswa',
  'Persyaratan magang / kerja praktik',
  'Pendaftaran lomba atau kompetisi',
  'Administrasi kampus',
] as const;
