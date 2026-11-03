/**
 * template — template form global (ADR-038 #3). SERVER-ONLY.
 * Baca: semua pengguna login. Tulis: Sekum & Admin (guard + RLS).
 */

import { Prisma } from '@prisma/client';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';

import { pengelolaTemplate } from './akses';
import type { Hasil } from './service';
import { SkemaStruktur, SkemaTemplate, type Kategori, type Struktur } from './skema';
import { TEMPLATE_BAWAAN } from './template-bawaan';

if (typeof window !== 'undefined') {
  throw new Error('lib/form/template.ts adalah modul server-only.');
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RingkasTemplate {
  id: string;
  nama: string;
  kategori: Kategori;
  deskripsi: string;
  bawaan: boolean;
  aktif: boolean;
  jumlah_pertanyaan: number;
  jumlah_bagian: number;
  dipakai: number;
}

/** Menyemai template bawaan yang belum ada (dicocokkan nama, tanpa memedulikan huruf besar). Idempoten. */
export async function pastikanTemplateBawaan(): Promise<void> {
  const ada = new Set((await db.form_template.findMany({ select: { nama: true } })).map((t) => t.nama.toLowerCase()));
  for (const t of TEMPLATE_BAWAAN) {
    if (ada.has(t.nama.toLowerCase())) continue;
    await db.form_template
      .create({ data: { nama: t.nama, kategori: t.kategori, deskripsi: t.deskripsi, isi: t.isi as unknown as Prisma.InputJsonValue, bawaan: true } })
      .catch((e: unknown) => {
        // Dua permintaan pertama bersamaan: indeks unik nama menolak salah satunya — aman diabaikan.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      });
  }
}

export async function daftarTemplate(opsi: { termasukNonaktif?: boolean } = {}): Promise<RingkasTemplate[]> {
  await pastikanTemplateBawaan();
  const baris = await db.form_template.findMany({
    where: opsi.termasukNonaktif ? {} : { aktif: true },
    orderBy: [{ bawaan: 'desc' }, { nama: 'asc' }],
    include: { _count: { select: { form: true } } },
  });
  return baris.map((t) => {
    const isi = SkemaStruktur.safeParse(t.isi);
    const s: Struktur = isi.success ? isi.data : { bagian: [] };
    return {
      id: t.id,
      nama: t.nama,
      kategori: t.kategori as Kategori,
      deskripsi: t.deskripsi,
      bawaan: t.bawaan,
      aktif: t.aktif,
      jumlah_bagian: s.bagian.length,
      jumlah_pertanyaan: s.bagian.reduce((n, b) => n + b.pertanyaan.length, 0),
      dipakai: t._count.form,
    };
  });
}

export async function muatTemplate(id: string): Promise<(RingkasTemplate & { isi: Struktur }) | null> {
  if (!POLA_UUID.test(id)) return null;
  const t = await db.form_template.findUnique({ where: { id }, include: { _count: { select: { form: true } } } });
  if (!t) return null;
  const isi = SkemaStruktur.safeParse(t.isi);
  const s: Struktur = isi.success ? isi.data : { bagian: [] };
  return {
    id: t.id,
    nama: t.nama,
    kategori: t.kategori as Kategori,
    deskripsi: t.deskripsi,
    bawaan: t.bawaan,
    aktif: t.aktif,
    isi: s,
    jumlah_bagian: s.bagian.length,
    jumlah_pertanyaan: s.bagian.reduce((n, b) => n + b.pertanyaan.length, 0),
    dipakai: t._count.form,
  };
}

const unik = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export async function simpanTemplate(tx: TxKlien, konteks: Konteks, id: string | null, masukan: unknown): Promise<Hasil<{ id: string }>> {
  if (!pengelolaTemplate(konteks.roles)) return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Template dikelola Sekum atau Admin.' };
  const v = SkemaTemplate.safeParse(masukan);
  if (!v.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: v.error.issues[0]?.message ?? 'Isian tidak valid.', details: v.error.issues };
  const data = { nama: v.data.nama, kategori: v.data.kategori, deskripsi: v.data.deskripsi, isi: v.data.isi as unknown as Prisma.InputJsonValue, aktif: v.data.aktif };
  try {
    if (id) {
      if (!POLA_UUID.test(id)) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Template tidak ditemukan.' };
      const n = await tx.form_template.updateMany({ where: { id }, data });
      if (n.count !== 1) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Template tidak ditemukan.' };
      return { ok: true, nilai: { id } };
    }
    const t = await tx.form_template.create({ data: { ...data, dibuat_oleh: konteks.sesi.userId }, select: { id: true } });
    return { ok: true, nilai: { id: t.id } };
  } catch (e) {
    if (unik(e)) return { ok: false, kode: 'KONFLIK', pesan: `Nama template "${v.data.nama}" sudah dipakai.` };
    throw e;
  }
}

/** Hapus template yang belum pernah dipakai; yang sudah dipakai dinonaktifkan saja. */
export async function hapusTemplate(tx: TxKlien, konteks: Konteks, id: string): Promise<Hasil<{ aksi: 'DIHAPUS' | 'DINONAKTIFKAN' }>> {
  if (!pengelolaTemplate(konteks.roles)) return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Template dikelola Sekum atau Admin.' };
  if (!POLA_UUID.test(id)) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Template tidak ditemukan.' };
  const t = await tx.form_template.findUnique({ where: { id }, include: { _count: { select: { form: true } } } });
  if (!t) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Template tidak ditemukan.' };
  if (t._count.form > 0 || t.bawaan) {
    await tx.form_template.update({ where: { id }, data: { aktif: false } });
    return { ok: true, nilai: { aksi: 'DINONAKTIFKAN' } };
  }
  await tx.form_template.delete({ where: { id } });
  return { ok: true, nilai: { aksi: 'DIHAPUS' } };
}
