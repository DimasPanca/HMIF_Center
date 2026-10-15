/**
 * skema ruangan — satu skema untuk form dan server (K-04). Aman untuk klien.
 *
 *   SkemaRuangan   master ruangan yang dikelola sendiri oleh Sekretaris
 *   SkemaBooking   form peminjaman; jam "HH:MM", jam selesai boleh kosong
 *                  ("s.d. selesai")
 *
 * Sumber: docs/ai/tasks/P8-kesekretariatan.md T-108 · PRD F-14.2 · USER_FLOW §9.3
 */

import { z } from 'zod';

const teks = (label: string, maks: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(maks, `${label} maksimal ${maks} karakter.`);

/** Teks opsional: string kosong disimpan sebagai NULL. */
const opsional = (label: string, maks: number) =>
  z
    .string()
    .trim()
    .max(maks, `${label} maksimal ${maks} karakter.`)
    .nullish()
    .transform((v) => (v ? v : null));

const angkaPositif = (label: string, maks: number) =>
  z
    .int({ error: `${label} harus bilangan bulat.` })
    .min(1, `${label} minimal 1.`)
    .max(maks, `${label} tidak masuk akal.`)
    .nullable()
    .default(null);

export const POLA_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export const SkemaRuangan = z.object({
  nama: teks('Nama ruangan', 150),
  lokasi: opsional('Lokasi', 200),
  kapasitas: angkaPositif('Kapasitas', 10_000),
  pengelola: opsional('Instansi pengelola', 200),
  catatan: opsional('Catatan', 500),
});
export type InputRuangan = z.infer<typeof SkemaRuangan>;

export const SkemaBooking = z
  .object({
    ruangan_id: z.uuid({ error: 'Pilih ruangan.' }),
    kegiatan: teks('Kegiatan', 200),
    tanggal: z
      .string({ error: 'Tanggal wajib diisi.' })
      .regex(POLA_TANGGAL, 'Tanggal wajib diisi.')
      .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Tanggal tidak valid.'),
    waktu_mulai: z.string({ error: 'Jam mulai wajib diisi.' }).regex(POLA_JAM, 'Jam mulai wajib diisi (JJ:MM).'),
    waktu_selesai: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || POLA_JAM.test(v), 'Jam selesai tidak valid (JJ:MM).'),
    jumlah_peserta: angkaPositif('Jumlah peserta', 100_000),
    keperluan: opsional('Keperluan', 500),
  })
  // Sama dengan CHECK booking_waktu_urut di 011_sekretariat.sql, supaya
  // pengguna membaca pesan yang jelas alih-alih galat constraint.
  .refine((b) => b.waktu_selesai === null || b.waktu_selesai > b.waktu_mulai, {
    message: 'Jam selesai harus sesudah jam mulai.',
    path: ['waktu_selesai'],
  });
export type InputBooking = z.infer<typeof SkemaBooking>;
