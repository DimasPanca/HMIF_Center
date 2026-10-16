/**
 * akses divisi kepanitiaan (T-085, PRD F-8.3, INV-30). Server-only.
 *
 * Cermin aplikasi dari helper RLS migrasi 039/040 — dua lapis yang sama
 * aturannya (INV-01): app bypass RLS, jadi route WAJIB memanggil ini sebelum
 * menulis data divisi; RLS menjaga jalur langsung (PostgREST + JWT pengguna).
 *
 *   bisaTulisPanitiaDivisi  koordinator, anggota divisi, atau Ketua Pelaksana
 *                           acaranya — periode AKTIF, punya role non-BPH
 *                           (SQL: panitia_tulis_divisi)
 *   bisaTulisDivisi         + Admin dan Bendum (RAB & nota seluruh divisi)
 *                           (SQL: tulis_divisi)
 *
 * Divisi lain dalam acara yang sama tetap TERBACA (lib/acara/service.ts);
 * yang dibatasi di sini hanya tulis. UI tidak merender tombol tulis bila
 * hasilnya false — bukan `disabled` (INV-30, kontrak T-085 butir 2).
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-085 · PRD F-8.3 · migrasi 039, 040
 */

import type { Konteks } from '@/lib/auth/guard';
import type { RoleCode } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';

if (typeof window !== 'undefined') {
  throw new Error('lib/kepanitiaan/akses.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

type Klien = TxKlien | typeof db;

/** Fakta satu divisi yang menentukan hak tulis — dipisah supaya aturannya dapat diuji tanpa DB. */
export interface FaktaDivisi {
  periodeId: string;
  ketuaPelaksanaId: string | null;
  koordinatorId: string | null;
  anggotaIds: readonly string[];
}

export interface Pelaku {
  userId: string;
  roles: readonly RoleCode[];
  periodeId: string;
}

/** Role selain BPH. BPH tidak pernah menulis, walau tercatat sebagai panitia (INV-03). */
const punyaRoleTulis = (roles: readonly RoleCode[]) => roles.some((r) => r !== 'BPH');

export function putusanPanitiaDivisi(p: Pelaku, d: FaktaDivisi): boolean {
  if (!punyaRoleTulis(p.roles)) return false;
  if (d.periodeId !== p.periodeId) return false; // arsip baca saja (INV-08)
  return p.userId === d.ketuaPelaksanaId || p.userId === d.koordinatorId || d.anggotaIds.includes(p.userId);
}

export function putusanTulisDivisi(p: Pelaku, d: FaktaDivisi): boolean {
  return p.roles.includes('ADMIN') || p.roles.includes('BENDUM') || putusanPanitiaDivisi(p, d);
}

/** Fakta divisi, atau null bila divisinya tidak ada. */
export async function faktaDivisi(divisiId: string, klien: Klien = db): Promise<(FaktaDivisi & { departemenPicId: string }) | null> {
  const d = await klien.divisi.findUnique({
    where: { id: divisiId },
    select: {
      koordinator_id: true,
      divisi_member: { select: { user_id: true } },
      kepanitiaan: { select: { ketua_pelaksana: true, proker: { select: { periode_id: true, departemen_id: true } } } },
    },
  });
  if (!d) return null;
  return {
    periodeId: d.kepanitiaan.proker.periode_id,
    departemenPicId: d.kepanitiaan.proker.departemen_id,
    ketuaPelaksanaId: d.kepanitiaan.ketua_pelaksana,
    koordinatorId: d.koordinator_id,
    anggotaIds: d.divisi_member.map((m) => m.user_id),
  };
}

const pelaku = (k: Konteks): Pelaku => ({ userId: k.sesi.userId, roles: k.roles, periodeId: k.periodeId });

/** Hak tulis data divisi (RAB, job desk, dokumen): panitia divisi itu, Ketua Pelaksana, Admin, Bendum. */
export async function bisaTulisDivisi(konteks: Konteks, divisiId: string, klien: Klien = db): Promise<boolean> {
  const d = await faktaDivisi(divisiId, klien);
  return d !== null && putusanTulisDivisi(pelaku(konteks), d);
}

/** Hak panitia divisi saja — tanpa jalur Admin/Bendum (mis. unggah nota atas nama divisi). */
export async function bisaTulisPanitiaDivisi(konteks: Konteks, divisiId: string, klien: Klien = db): Promise<boolean> {
  const d = await faktaDivisi(divisiId, klien);
  return d !== null && putusanPanitiaDivisi(pelaku(konteks), d);
}

/**
 * Kadept departemen PIC acara divisi ini — role dan departemen pada BARIS
 * user_role yang sama. `konteks.departemenIds` menggabungkan departemen semua
 * role, jadi Anggota departemen PIC akan ikut lolos bila itu yang dipakai.
 */
export async function kadeptPic(konteks: Konteks, departemenPicId: string, klien: Klien = db): Promise<boolean> {
  if (!konteks.roles.includes('KADEPT')) return false;
  const r = await klien.user_role.findFirst({
    where: { user_id: konteks.sesi.userId, periode_id: konteks.periodeId, role: 'KADEPT', departemen_id: departemenPicId },
    select: { id: true },
  });
  return r !== null;
}
