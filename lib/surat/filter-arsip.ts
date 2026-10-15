/**
 * filter-arsip — skema filter Arsip Surat (T-063). Aman untuk klien.
 *
 * SATU skema untuk URL halaman, query API, dan export Excel (K-04): bilah
 * filter di klien menulis URL lewat `queryDariFilter`, server membacanya lewat
 * `filterDariQuery` — tautan yang dibagikan menghasilkan daftar yang sama.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-063 · PRD F-4.4
 */

import { z } from 'zod';

import { DAFTAR_JENIS } from '@/lib/surat/field-schemas';

export const STATUS_ARSIP = ['DRAFT', 'MENUNGGU_APPROVAL', 'DISETUJUI', 'TERBIT', 'DITOLAK', 'DIBATALKAN'] as const;
export type StatusArsip = (typeof STATUS_ARSIP)[number];

/** Status yang terlihat oleh semua pembaca arsip; sisanya hanya pembuatnya. */
export const STATUS_RESMI: readonly StatusArsip[] = ['MENUNGGU_APPROVAL', 'DISETUJUI', 'TERBIT', 'DIBATALKAN'];

export const BARIS_PER_HALAMAN = 50;

export const SkemaFilterArsip = z.object({
  periode: z.uuid().optional(),
  jenis: z.enum(DAFTAR_JENIS).optional(),
  /** YYYY-MM, bulan tanggal surat. */
  bulan: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  status: z.enum(STATUS_ARSIP).optional(),
  departemen: z.uuid().optional(),
  /** Kode kegiatan di nomor surat, mis. HMIF, KT2HMIF. */
  kegiatan: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.-]{1,30}$/)
    .optional(),
  q: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().max(300).optional(),
});
export type FilterArsip = z.infer<typeof SkemaFilterArsip>;

const KUNCI_FILTER = Object.keys(SkemaFilterArsip.shape) as (keyof FilterArsip)[];

/**
 * Filter dari URL. Nilai yang tidak sah DIABAIKAN satu per satu, tidak
 * menggagalkan semuanya: tautan lama yang dibagikan (mis. periode yang sudah
 * dihapus) tetap membuka arsip, hanya tanpa filter yang rusak itu.
 */
export function filterDariQuery(params: URLSearchParams | Record<string, string | string[] | undefined>): FilterArsip {
  const ambil = (k: string): string | undefined => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const hasil: Record<string, unknown> = {};
  for (const k of KUNCI_FILTER) {
    const v = ambil(k);
    if (v === undefined) continue;
    const r = SkemaFilterArsip.shape[k].safeParse(v);
    if (r.success && r.data !== undefined) hasil[k] = r.data;
  }
  return hasil as FilterArsip;
}

/** Filter → query string, tanpa nilai kosong. `ubah` menimpa / menghapus (undefined). */
export function queryDariFilter(f: FilterArsip, ubah: Partial<Record<keyof FilterArsip, string | undefined>> = {}): string {
  const p = new URLSearchParams();
  for (const k of KUNCI_FILTER) {
    const v = k in ubah ? ubah[k] : f[k];
    if (v) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
