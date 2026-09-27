/**
 * skema — skema Zod notulensi (K-04), satu sumber untuk form klien dan service.
 * Modul murni tanpa akses DB supaya aman diimpor komponen klien; service
 * mengekspor ulang skema yang sama.
 */

import { z } from 'zod';

export type StatusKehadiran = 'HADIR' | 'IZIN' | 'SAKIT' | 'ALFA';
export const STATUS_KEHADIRAN = ['HADIR', 'IZIN', 'SAKIT', 'ALFA'] as const satisfies readonly StatusKehadiran[];

const tanggal = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD.');
const jam = z.string().regex(/^\d{2}:\d{2}$/, 'Waktu harus HH:MM.');
const teksSingkat = z.string().trim().min(1).max(500);

export const SkemaKehadiran = z.object({
  user_id: z.uuid(),
  status: z.enum(STATUS_KEHADIRAN),
});
export const SkemaActionItemInput = z.object({
  tugas: teksSingkat,
  pic_id: z.uuid().nullish(),
  deadline: tanggal.nullish(),
  departemen_id: z.uuid().nullish(),
});
export const SkemaBuatNotulensi = z
  .object({
    judul: z.string().trim().min(1).max(300),
    tanggal,
    waktu_mulai: jam.nullish(),
    waktu_selesai: jam.nullish(),
    tempat: z.string().trim().max(300).nullish(),
    pemimpin_id: z.uuid().nullish(),
    notulis_id: z.uuid().nullish(),
    departemen_id: z.uuid().nullable(),
    konten: z.unknown().optional(),
    keputusan: z.array(z.string().trim().min(1)).default([]),
    kehadiran: z.array(SkemaKehadiran).default([]),
    action_items: z.array(SkemaActionItemInput).default([]),
  })
  .refine((v) => !(v.waktu_mulai && v.waktu_selesai) || v.waktu_selesai > v.waktu_mulai, {
    message: 'Waktu selesai harus setelah waktu mulai.',
    path: ['waktu_selesai'],
  });
export const SkemaPerbaruiNotulensi = z.object({
  judul: z.string().trim().min(1).max(300).optional(),
  tanggal: tanggal.optional(),
  waktu_mulai: jam.nullish(),
  waktu_selesai: jam.nullish(),
  tempat: z.string().trim().max(300).nullish(),
  pemimpin_id: z.uuid().nullish(),
  notulis_id: z.uuid().nullish(),
  konten: z.unknown().optional(),
  keputusan: z.array(z.string().trim().min(1)).optional(),
  kehadiran: z.array(SkemaKehadiran).optional(),
});
export const SkemaKonversi = z.object({ departemen_id: z.uuid().nullish() });
