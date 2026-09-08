/**
 * Service periode kepengurusan — seluruh keputusan T-050 yang bukan tampilan.
 *
 * Route handler di `app/api/periode/**` (lane ui) memanggil fungsi di sini.
 * Tanda tangannya tercatat di `docs/ai/PERIODE_CONTRACT.md`.
 *
 * ===========================================================================
 * KENAPA ADA SERVICE INI SAMA SEKALI
 * ===========================================================================
 * Rencana pertama menaruh SELURUH T-050 di lane ui, karena seluruh berkas di
 * kontraknya jatuh di `app/**`. Itu keliru, dan Codex benar menandainya
 * (ADR-050): aktivasi periode memanggil fungsi database dalam transaksi
 * beraudit, penghapusan bergantung pada ada-tidaknya surat terbit, dan
 * pengubahan ditolak untuk periode arsip. Ketiganya aturan data, dan menaruhnya
 * di route handler berarti memindahkan `DATABASE_URL` beserta aturan bisnis ke
 * lane yang salah — persis yang dihindari pembelahan T-047 dan T-065.
 *
 * Maka T-050 dibelah seperti yang lain: service di sini (`T-050-DATA`), route
 * dan halaman tipis di lane ui (`T-050-UI`).
 *
 * ===========================================================================
 * LOCKOUT AKTIVASI — DISELESAIKAN DENGAN CARRY-FORWARD ADMIN (ADR-024)
 * ===========================================================================
 * Peran disimpan PER PERIODE (`user_role.periode_id`), dan undangan menuliskan
 * peran ke periode yang sedang AKTIF. Naif, ini menciptakan lockout: periode
 * `PERSIAPAN` baru tidak punya peran apa pun, dan Admin yang mengaktifkannya
 * kehilangan seluruh perannya di periode baru — `konteksSaatIni()` mengembalikan
 * `roles: []` dan ia terkunci.
 *
 * ADR-050 menuntut dua hal yang sekilas bertentangan: (3) aktivasi mensyaratkan
 * minimal satu ADMIN di periode target, dan (4) ada jalur bootstrap
 * terautentikasi untuk periode pertama. Keduanya BISA dipenuhi bersamaan tanpa
 * mengubah skema — lihat ADR-024:
 *
 *   BOOTSTRAP (butir 4). Periode pertama beserta ADMIN pertamanya dibuat oleh
 *   `prisma/seed.ts`, dijalankan pemegang kredensial (SUPABASE_SECRET_KEY +
 *   DATABASE_URL). Itulah jalur terautentikasi untuk periode pertama; tidak ada
 *   jalur anonim in-app, dan memang tidak boleh ada — tanpa periode aktif, tidak
 *   seorang pun dapat diautentikasi ber-peran.
 *
 *   CARRY-FORWARD (butir 3). `buatPeriode` MENYALIN baris peran ADMIN dari
 *   periode aktif ke periode PERSIAPAN yang baru. Karena `buatPeriode` hanya bisa
 *   dipanggil saat ADA periode aktif (guard `periode.create` menolak tanpa
 *   periode), selalu ada sumber untuk disalin. Maka setiap periode baru sudah
 *   punya ADMIN sebelum diaktifkan, dan `aktifkanPeriode` menegakkan butir 3 apa
 *   adanya — bukan lagi deadlock, melainkan penjaga yang selalu dapat dipenuhi.
 *
 * Hasilnya: Admin yang mengaktifkan periode baru TETAP ber-ADMIN sesudahnya.
 *
 * ===========================================================================
 * SELURUHNYA SQL MENTAH, TANGGAL SELALU STRING
 * ===========================================================================
 * Sama seperti `lib/proker/service.ts`: kolom tanggal bertipe `DATE`, dan
 * melewatkannya sebagai `Date` JavaScript menggeser satu hari pada offset
 * negatif. Tanggal tetap string 'YYYY-MM-DD' dari form sampai SQL (K-07).
 *
 * Sumber: PRD F-2.1 · SYSTEM_DESIGN §7.3 · ADR-003 · ADR-050 · migrasi 003, 014b · K-07, K-09
 */

import { z } from 'zod';

import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';

if (typeof window !== 'undefined') {
  throw new Error('lib/periode/service.ts adalah modul server-only.');
}

// ---------------------------------------------------------------------------
// Skema — dipakai form klien DAN validasi server (K-04)
// ---------------------------------------------------------------------------

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

const tanggal = z
  .string()
  .regex(POLA_TANGGAL, 'Tanggal harus berformat YYYY-MM-DD.')
  .refine((s) => {
    const [t, b, h] = s.split('-').map(Number) as [number, number, number];
    const d = new Date(Date.UTC(t, b - 1, h));
    return d.getUTCFullYear() === t && d.getUTCMonth() === b - 1 && d.getUTCDate() === h;
  }, 'Tanggal tidak ada pada kalender.');

/**
 * Skema pembuatan periode.
 *
 * `status` sengaja TIDAK ada di sini. Satu-satunya jalan menuju AKTIF adalah
 * `aktifkanPeriode`, yang memanggil fungsi database. Periode yang lahir langsung
 * AKTIF melewati `aktifkan_periode`, dan bersamanya melewati pembuatan
 * `surat_counter` — surat pertamanya gagal memperoleh nomor, jauh kemudian,
 * tanpa sebab yang terlihat.
 */
export const SkemaBuatPeriode = z
  .object({
    nama: z.string().trim().min(3, 'Nama periode minimal 3 karakter.').max(150),
    tanggal_mulai: tanggal,
    tanggal_selesai: tanggal,
    // ADR-003: counter dimulai dari nomor_surat_awal - 1. Nol membuat surat
    // pertama bernomor 000; CHECK `periode_nomor_awal_positif` juga menolaknya,
    // tetapi di sini penolakannya berbentuk pesan form.
    nomor_surat_awal: z.int().min(1, 'Nomor surat awal minimal 1.').default(1),
  })
  .refine((v) => v.tanggal_selesai > v.tanggal_mulai, {
    message: 'Tanggal selesai harus setelah tanggal mulai.',
    path: ['tanggal_selesai'],
  });

export type InputBuatPeriode = z.infer<typeof SkemaBuatPeriode>;

/** Skema pengubahan. Seluruh medan opsional; `status` tetap tak dapat diubah. */
export const SkemaUbahPeriode = z
  .object({
    nama: z.string().trim().min(3).max(150).optional(),
    tanggal_mulai: tanggal.optional(),
    tanggal_selesai: tanggal.optional(),
    nomor_surat_awal: z.int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' });

export type InputUbahPeriode = z.infer<typeof SkemaUbahPeriode>;

/** Badan `POST /api/periode/{id}/activate`. */
export const SkemaAktivasi = z.object({
  /** Nama periode, diketik ulang. Dicocokkan dengan nama kanonis di server. */
  konfirmasi: z.string().min(1, 'Ketik nama periode untuk mengonfirmasi.'),
});

// ---------------------------------------------------------------------------
// Bentuk hasil
// ---------------------------------------------------------------------------

export type KodeGagalPeriode =
  | 'VALIDASI_GAGAL'
  | 'TIDAK_DITEMUKAN'
  | 'PERIODE_ARSIP'
  | 'PUNYA_SURAT_TERBIT'
  | 'BUKAN_PERSIAPAN'
  | 'KONFIRMASI_TIDAK_COCOK'
  | 'TANPA_ADMIN';

export interface GagalPeriode {
  ok: false;
  kode: KodeGagalPeriode;
  pesan: string;
  isu?: { path: string; pesan: string }[];
}

export type Hasil<T> = { ok: true; nilai: T } | GagalPeriode;

/**
 * Peta kode → status HTTP, diekspor supaya route handler tetap tipis:
 *
 *     : gagal(h.kode, h.pesan, { details: h.isu, status: STATUS_GAGAL[h.kode] })
 *
 * Semantik HTTP hidup di sini, di lane yang mendefinisikan kodenya, bukan
 * ditebak ulang di route handler milik lane ui.
 */
export const STATUS_GAGAL: Record<KodeGagalPeriode, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  // 409: bukan soal identitas melainkan keadaan — periode ini arsip, atau
  // masih memegang surat terbit. Masuk ulang tidak mengubah apa pun.
  PERIODE_ARSIP: 409,
  PUNYA_SURAT_TERBIT: 409,
  BUKAN_PERSIAPAN: 409,
  KONFIRMASI_TIDAK_COCOK: 422,
  // 409: periode target tidak punya ADMIN, jadi mengaktifkannya akan mengunci
  // seluruh pengelola. Keadaan, bukan identitas (ADR-050 §3, ADR-024).
  TANPA_ADMIN: 409,
};

export interface RingkasPeriode {
  id: string;
  nama: string;
  status: 'AKTIF' | 'ARSIP' | 'PERSIAPAN';
  tanggal_mulai: string;
  tanggal_selesai: string;
  nomor_surat_awal: number;
  /** true bila periode punya minimal satu surat berstatus TERBIT (tak dapat dihapus). */
  ada_surat_terbit: boolean;
}

// ---------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------

/**
 * Seluruh periode, terbaru dulu.
 *
 * Tidak menerima konteks: PRD F-2.1 menyatakan periode lama dapat dibaca SEMUA
 * role. Otorisasi baca ada di guard route (`periode.read`, dimiliki semua role),
 * bukan di sini.
 */
export async function daftarPeriode(klien: TxKlien | typeof db = db): Promise<RingkasPeriode[]> {
  return klien.$queryRaw<RingkasPeriode[]>`
    SELECT p.id, p.nama, p.status,
           to_char(p.tanggal_mulai,   'YYYY-MM-DD') AS tanggal_mulai,
           to_char(p.tanggal_selesai, 'YYYY-MM-DD') AS tanggal_selesai,
           p.nomor_surat_awal,
           EXISTS (
             SELECT 1 FROM surat s WHERE s.periode_id = p.id AND s.status = 'TERBIT'
           ) AS ada_surat_terbit
    FROM periode p
    ORDER BY p.tanggal_mulai DESC, p.created_at DESC
  `;
}

export async function detailPeriode(
  id: string,
  klien: TxKlien | typeof db = db,
): Promise<RingkasPeriode | null> {
  const baris = await klien.$queryRaw<RingkasPeriode[]>`
    SELECT p.id, p.nama, p.status,
           to_char(p.tanggal_mulai,   'YYYY-MM-DD') AS tanggal_mulai,
           to_char(p.tanggal_selesai, 'YYYY-MM-DD') AS tanggal_selesai,
           p.nomor_surat_awal,
           EXISTS (
             SELECT 1 FROM surat s WHERE s.periode_id = p.id AND s.status = 'TERBIT'
           ) AS ada_surat_terbit
    FROM periode p WHERE p.id = ${id}::uuid
  `;
  return baris[0] ?? null;
}

// ---------------------------------------------------------------------------
// Mutasi — seluruhnya menerima `tx` (K-09)
// ---------------------------------------------------------------------------

function keIsu(e: unknown): { path: string; pesan: string }[] {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  return (issues ?? []).map((i) => ({ path: i.path.join('.'), pesan: i.message }));
}

/** Membuat periode baru berstatus PERSIAPAN. */
export async function buatPeriode(tx: TxKlien, input: unknown): Promise<Hasil<{ id: string }>> {
  const parsed = SkemaBuatPeriode.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Data periode belum lengkap atau tidak memenuhi aturan.',
      isu: keIsu(parsed.error),
    };
  }
  const v = parsed.data;

  const baris = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, nomor_surat_awal, status)
    VALUES (${v.nama}, ${v.tanggal_mulai}::date, ${v.tanggal_selesai}::date,
            ${v.nomor_surat_awal}::int, 'PERSIAPAN')
    RETURNING id
  `;
  const id = baris[0]!.id;

  // CARRY-FORWARD ADMIN (ADR-024, memenuhi ADR-050 §3 tanpa deadlock).
  //
  // Salin baris peran ADMIN dari periode AKTIF ke periode baru, supaya periode
  // ini sudah punya ADMIN sebelum diaktifkan — tanpa ini, `aktifkanPeriode`
  // menolaknya dan tidak ada jalan menaruh ADMIN di periode PERSIAPAN.
  //
  // Selalu ada sumber: `buatPeriode` hanya bisa dipanggil ketika ADA periode
  // aktif (guard `periode.create`). departemen_id disalin apa adanya — ADMIN
  // selalu NULL — dan ON CONFLICT DO NOTHING menjaga idempotensi bila entah
  // bagaimana barisnya sudah ada.
  await tx.$executeRaw`
    INSERT INTO user_role (user_id, periode_id, role, departemen_id)
    SELECT ur.user_id, ${id}::uuid, 'ADMIN'::role_code, ur.departemen_id
    FROM user_role ur
    JOIN periode p ON p.id = ur.periode_id AND p.status = 'AKTIF'
    WHERE ur.role = 'ADMIN'
    ON CONFLICT DO NOTHING
  `;

  return { ok: true, nilai: { id } };
}

/**
 * Mengubah periode.
 *
 * Periode ARSIP tidak dapat diubah (PRD F-2.1 AC 3) — hanya dibaca. Yang AKTIF
 * masih dapat diubah namanya dan nomor awalnya; hanya status yang tak pernah
 * diubah lewat sini.
 *
 * Digabung dengan baris tersimpan lebih dulu, lalu divalidasi, supaya aturan
 * tanggal (selesai > mulai) tetap dapat diperiksa saat hanya satu tanggal
 * dikirim — pola yang sama dengan `ubahProker`.
 */
export async function ubahPeriode(
  tx: TxKlien,
  id: string,
  perubahan: unknown,
): Promise<Hasil<{ id: string }>> {
  const parsedAwal = SkemaUbahPeriode.safeParse(perubahan);
  if (!parsedAwal.success) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Perubahan tidak valid.',
      isu: keIsu(parsedAwal.error),
    };
  }

  const lama = await detailPeriode(id, tx);
  if (!lama) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Periode tidak ditemukan.' };

  if (lama.status === 'ARSIP') {
    return {
      ok: false,
      kode: 'PERIODE_ARSIP',
      pesan: 'Periode arsip hanya dapat dibaca, tidak dapat diubah.',
    };
  }

  const p = parsedAwal.data;
  const gabung = {
    nama: p.nama ?? lama.nama,
    tanggal_mulai: p.tanggal_mulai ?? lama.tanggal_mulai,
    tanggal_selesai: p.tanggal_selesai ?? lama.tanggal_selesai,
    nomor_surat_awal: p.nomor_surat_awal ?? lama.nomor_surat_awal,
  };

  // Divalidasi ulang sebagai satu kesatuan supaya CHECK `periode_tanggal_valid`
  // tidak pernah menjadi jalan penolakan — pesannya berbahasa Postgres.
  const parsed = SkemaBuatPeriode.safeParse(gabung);
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Perubahan melanggar aturan periode.',
      isu: keIsu(parsed.error),
    };
  }
  const v = parsed.data;

  await tx.$executeRaw`
    UPDATE periode SET
      nama             = ${v.nama},
      tanggal_mulai    = ${v.tanggal_mulai}::date,
      tanggal_selesai  = ${v.tanggal_selesai}::date,
      nomor_surat_awal = ${v.nomor_surat_awal}::int,
      updated_at       = now()
    WHERE id = ${id}::uuid
  `;
  return { ok: true, nilai: { id } };
}

/**
 * Menghapus periode.
 *
 * DITOLAK bila periode punya surat berstatus TERBIT (klausa "Jangan" T-050):
 * nomor surat yang sudah beredar adalah identitas resmi organisasi dan tidak
 * boleh kehilangan induknya. Periode tanpa surat terbit boleh dihapus — biasanya
 * periode PERSIAPAN yang dibuat lalu dibatalkan.
 */
export async function hapusPeriode(tx: TxKlien, id: string): Promise<Hasil<{ id: string }>> {
  const periode = await detailPeriode(id, tx);
  if (!periode) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Periode tidak ditemukan.' };

  if (periode.ada_surat_terbit) {
    return {
      ok: false,
      kode: 'PUNYA_SURAT_TERBIT',
      pesan: 'Periode ini memiliki surat yang sudah terbit dan tidak dapat dihapus.',
    };
  }

  await tx.$executeRaw`DELETE FROM periode WHERE id = ${id}::uuid`;
  return { ok: true, nilai: { id } };
}

/**
 * Mengaktifkan periode.
 *
 * Hanya periode PERSIAPAN. Mengaktifkan ulang yang sudah AKTIF tidak ada artinya,
 * dan mengaktifkan yang ARSIP akan menghidupkan kembali penomoran surat yang
 * sudah ditutup.
 *
 * Konfirmasi dibandingkan dengan nama KANONIS yang dibaca dari database dalam
 * transaksi yang sama — bukan dengan nama yang dikirim klien. Klien yang keliru
 * soal nama periode tidak boleh dapat mengaktifkannya hanya karena mengulang
 * tebakannya sendiri.
 *
 * Soal Admin yang bisa terkunci setelah aktivasi: lihat catatan panjang di
 * kepala berkas. Sengaja TIDAK dijaga di sini.
 */
export async function aktifkanPeriode(
  tx: TxKlien,
  id: string,
  konfirmasi: string,
): Promise<Hasil<{ periodeLama: string | null; nomorPertama: number }>> {
  const periode = await tx.$queryRaw<{ nama: string; status: string }[]>`
    SELECT nama, status FROM periode WHERE id = ${id}::uuid FOR UPDATE
  `;
  const p = periode[0];
  if (!p) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Periode tidak ditemukan.' };

  if (p.status !== 'PERSIAPAN') {
    return {
      ok: false,
      kode: 'BUKAN_PERSIAPAN',
      pesan: `Periode berstatus ${p.status} — hanya periode berstatus PERSIAPAN yang dapat diaktifkan.`,
    };
  }

  if (konfirmasi.trim() !== p.nama) {
    return {
      ok: false,
      kode: 'KONFIRMASI_TIDAK_COCOK',
      pesan: 'Konfirmasi tidak cocok. Ketik nama periode persis seperti tertera.',
    };
  }

  // ADR-050 §3: periode target WAJIB punya minimal satu ADMIN sebelum diaktifkan.
  // Tanpa ini, aktivasi mengunci seluruh pengelola (peran per-periode). Normalnya
  // sudah terpenuhi oleh carry-forward di `buatPeriode`; penjaga ini menangkap
  // kasus tepi — mis. periode yang seluruh ADMIN-nya dihapus setelah dibuat.
  const admin = await tx.$queryRaw<{ ada: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM user_role WHERE periode_id = ${id}::uuid AND role = 'ADMIN'
    ) AS ada
  `;
  if (!admin[0]?.ada) {
    return {
      ok: false,
      kode: 'TANPA_ADMIN',
      pesan:
        'Periode ini belum memiliki ADMIN. Mengaktifkannya akan mengunci seluruh ' +
        'pengelola. Tetapkan minimal satu ADMIN pada periode ini lebih dulu.',
    };
  }

  const hasil = await tx.$queryRaw<
    { aktifkan_periode: { periode_lama: string | null; nomor_pertama: number } }[]
  >`
    SELECT aktifkan_periode(${id}::uuid)
  `;
  const r = hasil[0]!.aktifkan_periode;
  return { ok: true, nilai: { periodeLama: r.periode_lama, nomorPertama: r.nomor_pertama } };
}
