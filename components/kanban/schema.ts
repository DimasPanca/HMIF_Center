import { z } from 'zod';

export const SkemaBuatKartu = z.strictObject({
  departemen_id: z.uuid(),
  proker_id: z.uuid().nullable(),
  judul: z.string().trim().min(1).max(160),
  deskripsi: z.string().trim().max(2000).nullable(),
  prioritas: z.enum(['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS']),
  assignee_id: z.uuid().nullable(),
  deadline: z.iso.date().nullable(),
});

export const SkemaGeserKartu = z.strictObject({
  kolom: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']),
  urutan: z.number().int().min(0),
});
