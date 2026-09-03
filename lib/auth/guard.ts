/**
 * Penjaga permission untuk Route Handler dan Server Action.
 *
 * ===========================================================================
 * ROLE SELALU DIBACA DARI SERVER (INV-02)
 * ===========================================================================
 * Tidak ada satu pun fungsi di berkas ini yang menerima role sebagai argumen.
 * Role diambil dari cookie sesi yang diverifikasi ke Supabase, lalu dari tabel
 * `user_role` pada periode yang sedang aktif.
 *
 * Itu disengaja dan tidak boleh dilonggarkan "sedikit saja demi kepraktisan".
 * Begitu sebuah fungsi menerima `roles` dari pemanggil, penyerang cukup
 * mengirim `{"roles":["ADMIN"]}` di badan request. Tidak ada pemeriksaan lain
 * di jalur itu yang akan menangkapnya, karena seluruh lapisan di atas justru
 * mempercayai hasil fungsi ini.
 *
 * `can()` di permissions.ts memang menerima `roles` — tetapi ia fungsi murni
 * yang tidak tahu apa-apa soal request, dan satu-satunya pemasok `roles`-nya di
 * jalur server adalah `konteksSaatIni()` di bawah.
 *
 * ===========================================================================
 * INI LAPISAN KEDUA DARI TIGA, BUKAN SATU-SATUNYA
 * ===========================================================================
 *   1. middleware.ts   menyaring permintaan tanpa sesi, murah dan kasar
 *   2. berkas ini      menolak aksi yang rolenya memang tidak berhak
 *   3. RLS (015b)      menolak BARIS yang bukan miliknya — lapis terakhir, dan
 *                      satu-satunya yang tidak dapat dilewati kode aplikasi
 *
 * Lapis 2 tidak mengetahui baris mana yang sedang disentuh, jadi ia tidak dapat
 * menegakkan tanda `*` dan `**` pada PRD §5.1. `lingkupUntuk()` mengembalikan
 * batas itu supaya service dapat menerapkannya, dan RLS tetap menjaganya
 * seandainya service lupa.
 *
 * Sumber: PRD §5.1, §5.2 · SYSTEM_DESIGN §5.4 · INV-02, INV-03
 */

import { NextResponse } from 'next/server';

import { db } from '@/lib/db/client';
import {
  can,
  lingkupUntuk,
  type Lingkup,
  type Permission,
  type RoleCode,
} from './permissions';
import { sesiSaatIni, type Sesi } from './session';

/** Siapa pemanggilnya, dan sejauh mana ia boleh melangkah. */
export interface Konteks {
  sesi: Sesi;
  /** Periode berstatus `AKTIF`; seluruh role melekat pada satu periode. */
  periodeId: string;
  roles: RoleCode[];
  /**
   * Departemen tempat role berlingkup pengguna melekat.
   *
   * Kosong untuk pengguna yang tidak punya role berlingkup sama sekali. Dipakai
   * service untuk menerapkan tanda `*` PRD §5.1.
   */
  departemenIds: string[];
}

export type KodeGagalGuard =
  | 'TIDAK_TERAUTENTIKASI'
  | 'AKUN_NONAKTIF'
  | 'TIDAK_ADA_PERIODE'
  | 'TIDAK_BERWENANG';

export interface GagalGuard {
  code: KodeGagalGuard;
  pesan: string;
}

/**
 * Status HTTP per kode kegagalan.
 *
 * 401 dan 403 dibedakan dengan sengaja: 401 berarti "saya tidak tahu kamu
 * siapa" dan pemanggil sebaiknya masuk ulang, 403 berarti "saya tahu kamu
 * siapa, dan jawabannya tidak" — masuk ulang tidak akan mengubah apa pun.
 * Menyamakan keduanya membuat antarmuka mengirim pengguna ke halaman login
 * berulang kali untuk hal yang memang bukan haknya.
 *
 * 409 untuk TIDAK_ADA_PERIODE karena itu bukan soal identitas melainkan keadaan
 * sistem: belum ada periode kepengurusan aktif, dan yang harus bertindak adalah
 * Admin, bukan pengguna.
 */
const STATUS: Record<KodeGagalGuard, number> = {
  TIDAK_TERAUTENTIKASI: 401,
  AKUN_NONAKTIF: 403,
  TIDAK_ADA_PERIODE: 409,
  TIDAK_BERWENANG: 403,
};

const PESAN: Record<KodeGagalGuard, string> = {
  TIDAK_TERAUTENTIKASI: 'Sesi tidak ditemukan atau sudah berakhir.',
  AKUN_NONAKTIF: 'Akun Anda dinonaktifkan. Hubungi Admin.',
  TIDAK_ADA_PERIODE: 'Belum ada periode kepengurusan yang aktif. Hubungi Admin.',
  TIDAK_BERWENANG: 'Anda tidak berwenang melakukan tindakan ini.',
};

type Hasil<T> = { ok: true; konteks: Konteks } | { ok: false; nilai: T };

/**
 * Sesi beserta role-nya pada periode aktif.
 *
 * Mengembalikan `null` bila tidak ada sesi. Pengguna yang punya sesi tetapi
 * tidak punya satu pun role tetap mengembalikan konteks dengan `roles: []` —
 * bedanya penting: ia sudah masuk, hanya belum diberi peran. Menyamakannya
 * dengan "tidak ada sesi" akan mengirimnya ke halaman login berulang kali,
 * padahal yang kurang adalah tindakan Admin.
 */
export async function konteksSaatIni(): Promise<Konteks | null> {
  const sesi = await sesiSaatIni();
  if (!sesi) return null;

  const periode = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1
  `;
  const periodeId = periode[0]?.id;
  if (!periodeId) {
    return { sesi, periodeId: '', roles: [], departemenIds: [] };
  }

  const baris = await db.$queryRaw<{ role: RoleCode; departemen_id: string | null }[]>`
    SELECT role, departemen_id
    FROM user_role
    WHERE user_id = ${sesi.userId}::uuid AND periode_id = ${periodeId}::uuid
  `;

  return {
    sesi,
    periodeId,
    roles: [...new Set(baris.map((b) => b.role))],
    departemenIds: [...new Set(baris.map((b) => b.departemen_id).filter((d): d is string => d !== null))],
  };
}

/** Pemeriksaan bersama requirePermission dan guardAction. */
async function periksa(permission: Permission): Promise<Konteks | GagalGuard> {
  const konteks = await konteksSaatIni();

  if (!konteks) return { code: 'TIDAK_TERAUTENTIKASI', pesan: PESAN.TIDAK_TERAUTENTIKASI };
  if (!konteks.sesi.isActive) return { code: 'AKUN_NONAKTIF', pesan: PESAN.AKUN_NONAKTIF };
  if (konteks.periodeId === '') {
    return { code: 'TIDAK_ADA_PERIODE', pesan: PESAN.TIDAK_ADA_PERIODE };
  }
  if (!can(konteks.roles, permission)) {
    return { code: 'TIDAK_BERWENANG', pesan: PESAN.TIDAK_BERWENANG };
  }

  return konteks;
}

function gagal(x: Konteks | GagalGuard): x is GagalGuard {
  return 'code' in x;
}

/**
 * Penjaga untuk Route Handler.
 *
 * ```ts
 * const g = await requirePermission('proker.approve');
 * if (!g.ok) return g.nilai;
 * // g.konteks.roles sudah pasti berhak
 * ```
 *
 * Mengembalikan `NextResponse` siap-kirim alih-alih melempar. Guard yang
 * melempar menuntut setiap route handler membungkus dirinya dengan try/catch,
 * dan satu handler yang lupa akan menjawab 500 — bocor stack trace untuk
 * sesuatu yang seharusnya 403 yang tenang.
 */
export async function requirePermission(
  permission: Permission,
): Promise<Hasil<NextResponse>> {
  const h = await periksa(permission);
  if (!gagal(h)) return { ok: true, konteks: h };

  return {
    ok: false,
    nilai: NextResponse.json({ ok: false, error: h }, { status: STATUS[h.code] }),
  };
}

/**
 * Penjaga untuk Server Action.
 *
 * Server Action tidak mengembalikan Response, jadi kegagalannya berupa objek
 * yang dapat dikembalikan apa adanya ke komponen pemanggil — bentuknya sama
 * dengan badan JSON `requirePermission`, supaya penanganan di sisi klien tidak
 * bercabang hanya karena jalurnya berbeda.
 */
export async function guardAction(
  permission: Permission,
): Promise<Hasil<{ ok: false; error: GagalGuard }>> {
  const h = await periksa(permission);
  if (!gagal(h)) return { ok: true, konteks: h };
  return { ok: false, nilai: { ok: false, error: h } };
}

/**
 * Batas baris yang wajib diterapkan service untuk konteks ini.
 *
 * Dipanggil SETELAH guard lolos. `'DEPARTEMEN'` berarti aksi hanya boleh
 * menyentuh baris milik `konteks.departemenIds`; `'DIVISI'` berarti hanya
 * divisi kepanitiaan tempat pengguna ditugaskan — daftar divisinya bergantung
 * pada acara yang sedang dibuka, jadi service yang harus mengambilnya.
 */
export function lingkupKonteks(konteks: Konteks, permission: Permission): Lingkup | null {
  return lingkupUntuk(konteks.roles, permission);
}
