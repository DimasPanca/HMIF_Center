/**
 * Job desk divisi (T-093, PRD F-8.2). Server-only.
 *
 *   simpan   JSON ProseMirror (JSONB), DISANITASI allowlist sebelum disimpan
 *   baca     disanitasi LAGI sebelum dirender (pertahanan berlapis, kontrak 2)
 *   tulis    `bisaTulisDivisi` (T-085): koordinator/anggota divisi itu, Ketua
 *            Pelaksana, Admin, Bendum — divisi lain hanya membaca (INV-30)
 *   lihat    siapa pun yang dapat membuka ruang kerja acaranya (lib/acara/service)
 *
 * Konten disimpan sebagai JSON, bukan HTML: sanitasi = menyaring pohon node
 * terhadap allowlist (lib/notulensi/sanitasi.ts) — lebih ketat daripada
 * membersihkan HTML, dan tampilan baca merendernya tanpa TipTap.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-093 · PRD F-8.2 · K-XSS
 */

import { Prisma } from '@prisma/client';

import { muatAcara } from '@/lib/acara/service';
import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { bisaTulisDivisi } from '@/lib/kepanitiaan/akses';
import { sanitasiKonten, type NodeProseMirror } from '@/lib/notulensi/sanitasi';

if (typeof window !== 'undefined') {
  throw new Error('lib/acara/job-desk.ts adalah modul server-only.');
}

/** Batas kasar ukuran JSON supaya auto-save tidak dipakai menimbun dokumen raksasa. */
export const MAKS_JSON_JOB_DESK = 200_000;

export type Hasil<T> =
  | { ok: true; nilai: T }
  | { ok: false; kode: 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG'; pesan: string };

export interface DataJobDesk {
  divisi_id: string;
  konten: NodeProseMirror;
  boleh_tulis: boolean;
  diperbarui_at: string | null;
  diperbarui_oleh: string | null;
}

async function divisiTerlihat(konteks: Konteks, divisiId: string): Promise<boolean> {
  const d = await db.divisi.findUnique({
    where: { id: divisiId },
    select: { kepanitiaan_id: true },
  });
  return !!d && (await muatAcara(konteks, d.kepanitiaan_id)) !== null;
}

/** null = divisi tidak ada atau acaranya tidak terlihat (404). */
export async function muatJobDesk(konteks: Konteks, divisiId: string): Promise<DataJobDesk | null> {
  if (!(await divisiTerlihat(konteks, divisiId))) return null;
  const [j, boleh] = await Promise.all([
    db.job_desk.findUnique({
      where: { divisi_id: divisiId },
      select: { konten: true, updated_at: true, app_user: { select: { nama_lengkap: true } } },
    }),
    bisaTulisDivisi(konteks, divisiId),
  ]);
  return {
    divisi_id: divisiId,
    konten: sanitasiKonten(j?.konten ?? null),
    boleh_tulis: boleh,
    diperbarui_at: j?.updated_at.toISOString() ?? null,
    diperbarui_oleh: j?.app_user?.nama_lengkap ?? null,
  };
}

export async function simpanJobDesk(
  tx: TxKlien,
  konteks: Konteks,
  divisiId: string,
  body: unknown,
): Promise<Hasil<{ diperbarui_at: string; konten: NodeProseMirror }>> {
  const konten =
    typeof body === 'object' && body !== null ? (body as { konten?: unknown }).konten : undefined;
  if (!konten || typeof konten !== 'object')
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Isi job desk tidak valid.' };
  if (JSON.stringify(konten).length > MAKS_JSON_JOB_DESK)
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Job desk terlalu panjang.' };
  const d = await tx.divisi.findUnique({ where: { id: divisiId }, select: { id: true } });
  if (!d) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Divisi tidak ditemukan.' };
  if (!(await bisaTulisDivisi(konteks, divisiId, tx))) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Job desk hanya dapat diubah panitia divisi ini atau Ketua Pelaksana.',
    };
  }
  const bersih = sanitasiKonten(konten);
  const sekarang = new Date();
  const r = await tx.job_desk.upsert({
    where: { divisi_id: divisiId },
    create: {
      divisi_id: divisiId,
      konten: bersih as unknown as Prisma.InputJsonValue,
      updated_by: konteks.sesi.userId,
      updated_at: sekarang,
    },
    update: {
      konten: bersih as unknown as Prisma.InputJsonValue,
      updated_by: konteks.sesi.userId,
      updated_at: sekarang,
    },
    select: { updated_at: true },
  });
  return { ok: true, nilai: { diperbarui_at: r.updated_at.toISOString(), konten: bersih } };
}
