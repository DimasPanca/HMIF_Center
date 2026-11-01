/**
 * akses — siapa membuat, mengelola, dan membaca form (ADR-038 #4, #6).
 * SERVER-ONLY. Lapis aplikasi; lapis database = `form_kelola()` (migrasi 053).
 *
 *   buat form organisasi   ADMIN, KETUA, WAKIL, SEKUM
 *   buat form acara        pimpinan penulis di atas + panitia acara itu
 *                          (anggota/koordinator divisi, ketua pelaksana) yang
 *                          memegang peran penulis (BENDUM/KADEPT/ANGGOTA)
 *   kelola & baca respons  pembuat + yang boleh membuat form itu
 *   baca struktur saja     + BPH (pengawas; TIDAK membaca respons)
 */

import type { Konteks } from '@/lib/auth/guard';
import type { RoleCode } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';

if (typeof window !== 'undefined') {
  throw new Error('lib/form/akses.ts adalah modul server-only.');
}

const PIMPINAN_PENULIS: readonly RoleCode[] = ['ADMIN', 'KETUA', 'WAKIL', 'SEKUM'];
const PANITIA_PENULIS: readonly RoleCode[] = ['BENDUM', 'KADEPT', 'ANGGOTA'];

export const pimpinanPenulis = (roles: readonly RoleCode[]) => roles.some((r) => PIMPINAN_PENULIS.includes(r));
export const pengelolaTemplate = (roles: readonly RoleCode[]) => roles.includes('ADMIN') || roles.includes('SEKUM');

/** Acara (periode aktif) tempat pengguna duduk sebagai panitia. */
export async function acaraPanitia(userId: string): Promise<Set<string>> {
  const baris = await db.$queryRaw<{ id: string }[]>`
    SELECT d.kepanitiaan_id::text AS id FROM divisi_member dm JOIN divisi d ON d.id = dm.divisi_id WHERE dm.user_id = ${userId}::uuid
    UNION SELECT d.kepanitiaan_id::text FROM divisi d WHERE d.koordinator_id = ${userId}::uuid
    UNION SELECT k.id::text FROM kepanitiaan k WHERE k.ketua_pelaksana = ${userId}::uuid`;
  return new Set(baris.map((b) => b.id));
}

/** Boleh membuat form untuk acara `kepanitiaanId` (null = form organisasi). */
export async function bolehBuat(konteks: Konteks, kepanitiaanId: string | null): Promise<boolean> {
  if (pimpinanPenulis(konteks.roles)) return true;
  if (!kepanitiaanId || !konteks.roles.some((r) => PANITIA_PENULIS.includes(r))) return false;
  return (await acaraPanitia(konteks.sesi.userId)).has(kepanitiaanId);
}

export interface FormAkses {
  dibuat_oleh: string;
  kepanitiaan_id: string | null;
}

/** Pengelola = pembuat, pimpinan penulis, atau panitia penulis acara form itu. Juga pembaca respons. */
export async function bolehKelola(konteks: Konteks, f: FormAkses, panitia?: Set<string>): Promise<boolean> {
  if (f.dibuat_oleh === konteks.sesi.userId || pimpinanPenulis(konteks.roles)) return true;
  if (!f.kepanitiaan_id || !konteks.roles.some((r) => PANITIA_PENULIS.includes(r))) return false;
  return (panitia ?? (await acaraPanitia(konteks.sesi.userId))).has(f.kepanitiaan_id);
}

/** Membaca struktur (tanpa respons): pengelola + BPH. */
export async function bolehBaca(konteks: Konteks, f: FormAkses, panitia?: Set<string>): Promise<boolean> {
  return konteks.roles.includes('BPH') || bolehKelola(konteks, f, panitia);
}
