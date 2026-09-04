/**
 * Undangan dan manajemen pengguna — seluruh keputusan T-047 yang bukan tampilan.
 *
 * Route handler di `app/api/users/**` dan halaman `app/(auth)/undangan/[token]`
 * (lane ui) memanggil fungsi di sini. Tanda tangannya tercatat di
 * `docs/ai/UNDANGAN_CONTRACT.md`.
 *
 * ===========================================================================
 * YANG DISIMPAN HASH-NYA, BUKAN TOKENNYA
 * ===========================================================================
 * Token mentah hanya ada dua kali sepanjang hidupnya: sekali sebagai nilai
 * kembalian `undang()`, dan sekali di dalam tautan yang dibuka pengundang.
 * Yang masuk database hanya SHA-256-nya (`invitation.token_hash`).
 *
 * Konsekuensinya disengaja dan tidak boleh "diperbaiki": tautan yang hilang
 * TIDAK dapat ditampilkan ulang. Admin harus mengundang ulang. Menyimpan token
 * mentah supaya bisa ditampilkan lagi berarti siapa pun yang membaca isi
 * database dapat menebus setiap undangan yang belum dipakai — dan undangan
 * adalah jalan masuk ke akun ber-role.
 *
 * ===========================================================================
 * AKUN SUPABASE AUTH DIBUAT SAAT DIUNDANG, BUKAN SAAT DIAKTIFKAN
 * ===========================================================================
 * `app_user.id` WAJIB sama dengan `auth.users.id` (migrasi 003), dan
 * `invitation.user_id` menunjuk `app_user`. Supabase tidak mengizinkan id akun
 * ditentukan pemanggil, jadi urutannya hanya bisa satu arah: buat akun auth
 * lebih dulu, pakai id-nya untuk `app_user`.
 *
 * Passwordnya diisi nilai acak yang tidak pernah keluar dari fungsi ini dan
 * tidak pernah diketahui siapa pun. `aktivasi()` yang menggantinya. Akun yang
 * undangannya tidak pernah dipakai karena itu tidak dapat dimasuki: passwordnya
 * tidak diketahui, dan `is_active` masih false.
 *
 * ===========================================================================
 * SATU KELEMAHAN YANG DISADARI: DUA SISTEM, SATU TRANSAKSI TIDAK MUNGKIN
 * ===========================================================================
 * Membuat akun auth adalah panggilan HTTP ke Supabase; menyimpan `app_user`
 * adalah transaksi Postgres. Tidak ada transaksi yang mencakup keduanya.
 *
 * Bila penyimpanan gagal setelah akun auth terbuat, akun itu menjadi yatim —
 * ada di `auth.users`, tidak ada di `app_user`. Keadaan itu persis yang dialami
 * akun uji `e2e-tanpa-profil`, dan dari sisi pengguna tidak dapat dibedakan
 * dari kredensial salah (lihat `login()`).
 *
 * Karena itu ada kompensasi: bila penyimpanan melempar, akun auth-nya DIHAPUS
 * lagi. Kompensasi bisa saja ikut gagal — jaringan putus di antara keduanya —
 * dan itu tidak dapat dihilangkan, hanya dipersempit. Yang tersisa dilaporkan
 * lewat `kode: 'AUTH_YATIM'` supaya Admin tahu harus menghubungi pemegang kunci,
 * bukan mengira sistemnya rusak.
 *
 * Sumber: PRD F-1.2 · USER_FLOW §2.1, §2.2 · SYSTEM_DESIGN §16.2 · migrasi 003
 */

import crypto from 'node:crypto';

import { z } from 'zod';

import type { TxKlien } from '@/lib/db/with-audit-context';
import { db } from '@/lib/db/client';
import type { Konteks } from './guard';
import { ROLES, type RoleCode } from './permissions';

if (typeof window !== 'undefined') {
  throw new Error('lib/auth/invitation.ts adalah modul server-only.');
}

/** Masa berlaku undangan (PRD F-1.2). */
const BERLAKU_HARI = 7;

// ---------------------------------------------------------------------------
// Skema — dipakai form klien DAN validasi server (K-04)
// ---------------------------------------------------------------------------

/**
 * Aturan password PRD F-1.1: minimal 8 karakter, mengandung huruf dan angka.
 *
 * Ditulis sebagai dua `regex` terpisah, bukan satu regex gabungan, supaya
 * pesan yang muncul menyebut syarat mana yang belum terpenuhi. Satu regex
 * gabungan hanya bisa mengatakan "password tidak valid".
 */
export const kataSandi = z
  .string()
  .min(8, 'Password minimal 8 karakter.')
  .regex(/[A-Za-z]/, 'Password harus mengandung huruf.')
  .regex(/[0-9]/, 'Password harus mengandung angka.');

const peran = z.object({
  role: z.enum(ROLES),
  /** Wajib untuk KADEPT dan ANGGOTA, dilarang untuk peran lain. */
  departemen_id: z.uuid().optional(),
});

/**
 * Form undangan (PRD F-1.2, USER_FLOW §2.1).
 *
 * Aturan departemen di bawah menyalin CHECK `role_dept_wajib` migrasi 003 apa
 * adanya. Yang ditambahkan di sini bukan penjaminan melainkan pesan: Admin
 * berhak tahu peran mana yang kurang departemennya sebelum menekan kirim,
 * bukan menerima kegagalan constraint berbahasa Postgres sesudahnya.
 */
export const SkemaUndang = z
  .object({
    nama_lengkap: z.string().trim().min(3, 'Nama minimal 3 karakter.').max(150),
    nim: z
      .string()
      .trim()
      .regex(/^\d{8,12}$/, 'NIM harus 8-12 digit angka.'),
    email: z.email('Format email tidak valid.').transform((v) => v.trim().toLowerCase()),
    angkatan: z.int().min(2000).max(2100).optional(),
    no_hp: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s]{8,20}$/, 'Nomor HP tidak valid.')
      .optional(),
    roles: z.array(peran).min(1, 'Pilih minimal satu peran.'),
  })
  .superRefine((v, ctx) => {
    v.roles.forEach((r, i) => {
      const butuh = r.role === 'KADEPT' || r.role === 'ANGGOTA';
      if (butuh && !r.departemen_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', i, 'departemen_id'],
          message: `Peran ${r.role} wajib memiliki departemen.`,
        });
      }
      if (!butuh && r.departemen_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', i, 'departemen_id'],
          message: `Peran ${r.role} bersifat lintas-himpunan dan tidak boleh berdepartemen.`,
        });
      }
    });

    // Duplikat ditolak di sini supaya pesannya menyebut peran yang mana.
    // `user_role_unik` di database juga menolaknya, tetapi dengan pesan yang
    // menyebut nama constraint alih-alih nama perannya.
    const kunci = v.roles.map((r) => `${r.role}:${r.departemen_id ?? ''}`);
    kunci.forEach((k, i) => {
      if (kunci.indexOf(k) !== i) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', i],
          message: 'Peran ini sudah dipilih.',
        });
      }
    });
  });

export type InputUndang = z.infer<typeof SkemaUndang>;

/** Form aktivasi (USER_FLOW §2.2). */
export const SkemaAktivasi = z
  .object({
    token: z.string().min(20, 'Token undangan tidak lengkap.'),
    password: kataSandi,
    konfirmasi: z.string(),
  })
  .refine((v) => v.password === v.konfirmasi, {
    message: 'Konfirmasi password tidak sama.',
    path: ['konfirmasi'],
  });

export type InputAktivasi = z.infer<typeof SkemaAktivasi>;

/** Perubahan yang boleh dilakukan Admin atas seorang pengguna. */
export const SkemaUbahPengguna = z
  .object({
    nama_lengkap: z.string().trim().min(3).max(150).optional(),
    angkatan: z.int().min(2000).max(2100).nullable().optional(),
    no_hp: z.string().trim().max(20).nullable().optional(),
    is_active: z.boolean().optional(),
    /**
     * Bila diisi, SELURUH peran pengguna pada periode aktif diganti dengan ini.
     *
     * `.min(1)` bukan formalitas: daftar peran kosong akan menghapus seluruh
     * `user_role` pengguna itu pada periode aktif, dan `daftarPengguna()`
     * menyaring berdasarkan peran — penggunanya lenyap dari halaman Admin dan
     * tidak ada lagi cara memulihkannya lewat antarmuka.
     */
    roles: z.array(peran).min(1, 'Pengguna harus punya minimal satu peran.').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' });

export type InputUbahPengguna = z.infer<typeof SkemaUbahPengguna>;

// ---------------------------------------------------------------------------
// Bentuk hasil
// ---------------------------------------------------------------------------

export type KodeGagalUndangan =
  | 'TIDAK_VALID'
  | 'EMAIL_TERDAFTAR'
  | 'NIM_TERDAFTAR'
  | 'TIDAK_ADA_PERIODE'
  | 'TIDAK_DITEMUKAN'
  | 'TOKEN_TIDAK_DIKENAL'
  | 'TOKEN_KEDALUWARSA'
  | 'TOKEN_TERPAKAI'
  | 'GAGAL_AUTH'
  | 'AUTH_YATIM';

export interface GagalUndangan {
  ok: false;
  kode: KodeGagalUndangan;
  /** Kalimat siap tampil, sudah dalam bahasa Indonesia. */
  pesan: string;
  /** Terisi untuk `TIDAK_VALID`: path field → pesan, siap dipasang ke form. */
  isu?: { path: string; pesan: string }[];
}

export type Hasil<T> = { ok: true; nilai: T } | GagalUndangan;

export interface UndanganTerbuat {
  userId: string;
  invitationId: string;
  /**
   * Tautan lengkap untuk disalin Admin. HANYA ADA SEKALI.
   *
   * Tidak dapat ditampilkan ulang — yang tersimpan hanya hash-nya. Bila hilang,
   * undang ulang.
   */
  tautan: string;
  kedaluwarsa: string;
}

/**
 * Keadaan pengguna yang diturunkan, bukan disimpan.
 *
 * Tabel `app_user` hanya punya `is_active`. Tanpa turunan ini, halaman admin
 * tidak dapat membedakan pengguna yang BELUM PERNAH mengaktifkan akunnya dari
 * pengguna yang sengaja dinonaktifkan — keduanya `is_active = false`, dan
 * tindakan yang tepat untuk keduanya berbeda: yang pertama diundang ulang,
 * yang kedua diaktifkan kembali.
 */
export type KeadaanPengguna = 'AKTIF' | 'NONAKTIF' | 'MENUNGGU_AKTIVASI' | 'UNDANGAN_KEDALUWARSA';

export interface RingkasPengguna {
  id: string;
  nama_lengkap: string;
  nim: string;
  email: string;
  angkatan: number | null;
  is_active: boolean;
  keadaan: KeadaanPengguna;
  roles: { role: RoleCode; departemen_id: string | null; nama_departemen: string | null }[];
}

export interface UndanganDibuka {
  email: string;
  namaLengkap: string;
  roles: RoleCode[];
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

/**
 * 32 byte acak kriptografis, base64url.
 *
 * `randomBytes`, bukan `Math.random()` — yang terakhir dapat diprediksi dari
 * beberapa keluaran sebelumnya, dan yang dijaga di sini adalah jalan masuk ke
 * akun ber-role.
 */
function buatToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** SHA-256 heksadesimal. Deterministik, jadi pencarian tetap satu indeks. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Supabase Admin API
// ---------------------------------------------------------------------------

/**
 * Env dibaca DI DALAM fungsi, bukan di tingkat modul.
 *
 * Pola yang sama pernah salah empat kali di project ini dan gejalanya selalu
 * sama: berkas yang sekadar mengimpor modul ini gagal di lingkungan yang
 * env-nya belum lengkap, dan `next build` ikut jatuh dengan pesan yang menunjuk
 * ke dalam node_modules. Dijaga `npm run check:lazy-env`.
 */
function konfigAuth(): { url: string; kepala: Record<string, string> } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY belum diisi. Jalankan: npm run check:env',
    );
  }

  return {
    url,
    kepala: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  };
}

async function buatAkunAuth(email: string): Promise<string> {
  const { url, kepala } = konfigAuth();

  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: kepala,
    body: JSON.stringify({
      email,
      // Password acak yang tidak pernah keluar dari fungsi ini. Yang menggantinya
      // `aktivasi()`. Panjang 48 byte supaya tidak dapat ditebak seandainya
      // seseorang mencoba masuk sebelum undangannya dipakai.
      password: crypto.randomBytes(48).toString('base64url'),
      // Tanpa ini Supabase menuntut konfirmasi lewat surat. MVP tidak punya
      // layanan email (PRD §6.2), jadi surat itu tidak akan pernah sampai dan
      // akunnya terkunci selamanya.
      email_confirm: true,
    }),
  });

  if (!r.ok) throw new Error(`Gagal membuat akun auth: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { id: string }).id;
}

/**
 * Menghapus akun auth. MELEMPAR bila gagal, dan itu yang penting.
 *
 * Versi pertama memanggil `fetch` tanpa memeriksa `r.ok`. Akibatnya kompensasi
 * yang gagal tidak pernah terdeteksi: blok penanganan di `undang()` mengira
 * pembersihannya berhasil, melempar error aslinya, dan cabang `AUTH_YATIM`
 * menjadi kode mati. Admin tidak akan pernah diberi tahu bahwa ada akun auth
 * tanpa `app_user` yang harus dibersihkan tangan — persis keadaan yang paling
 * sulit didiagnosis dari luar, karena dari sisi pengguna ia tidak dapat
 * dibedakan dari kredensial salah.
 */
async function hapusAkunAuth(id: string): Promise<void> {
  const { url, kepala } = konfigAuth();
  const r = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: kepala });
  if (!r.ok) throw new Error(`Gagal menghapus akun auth: ${r.status} ${await r.text()}`);
}

async function setPasswordAuth(id: string, password: string): Promise<void> {
  const { url, kepala } = konfigAuth();

  const r = await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: kepala,
    body: JSON.stringify({ password, email_confirm: true }),
  });

  if (!r.ok) throw new Error(`Gagal menyetel password: ${r.status} ${await r.text()}`);
}

// ---------------------------------------------------------------------------
// Undang
// ---------------------------------------------------------------------------

function keIsu(e: unknown): { path: string; pesan: string }[] {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  return (issues ?? []).map((i) => ({ path: i.path.join('.'), pesan: i.message }));
}

/**
 * Mengundang pengurus baru.
 *
 * `tx` WAJIB dan datang dari `withAuditContext(req, ...)`: konteks audit
 * dipasang `set_config(..., true)` yang transaction-local, sehingga kueri di
 * koneksi lain menghasilkan baris audit ber-IP NULL tanpa satu pun error (K-09).
 *
 * `asalUrl` dipakai membentuk tautan undangan. Diminta dari pemanggil, bukan
 * dibaca dari `NEXT_PUBLIC_APP_URL`, karena tautan yang salah domain membuat
 * undangan tidak dapat dibuka dan itu baru ketahuan setelah dikirim ke orangnya.
 */
export async function undang(
  tx: TxKlien,
  konteks: Konteks,
  input: unknown,
  asalUrl: string,
): Promise<Hasil<UndanganTerbuat>> {
  const parsed = SkemaUndang.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'TIDAK_VALID',
      pesan: 'Data undangan belum lengkap atau tidak memenuhi aturan.',
      isu: keIsu(parsed.error),
    };
  }
  const v = parsed.data;

  if (!konteks.periodeId) {
    return {
      ok: false,
      kode: 'TIDAK_ADA_PERIODE',
      pesan: 'Belum ada periode kepengurusan yang aktif. Aktifkan periode lebih dulu.',
    };
  }

  // Pemeriksaan duplikat dijalankan LEBIH DULU, sebelum akun auth dibuat.
  // Membaliknya berarti setiap undangan duplikat meninggalkan akun auth yatim
  // yang harus dibersihkan tangan.
  const bentrok = await tx.$queryRaw<{ email: string; nim: string }[]>`
    SELECT email, nim FROM app_user
    WHERE lower(email) = ${v.email} OR nim = ${v.nim}
    LIMIT 1
  `;

  if (bentrok[0]) {
    const samaEmail = bentrok[0].email.toLowerCase() === v.email;
    return samaEmail
      ? {
          ok: false,
          kode: 'EMAIL_TERDAFTAR',
          pesan: `Email ${v.email} sudah terdaftar. Gunakan email lain atau aktifkan kembali akunnya.`,
        }
      : {
          ok: false,
          kode: 'NIM_TERDAFTAR',
          pesan: `NIM ${v.nim} sudah terdaftar atas nama pengguna lain.`,
        };
  }

  const userId = await buatAkunAuth(v.email);
  const token = buatToken();
  const kedaluwarsa = new Date(Date.now() + BERLAKU_HARI * 86_400_000);

  try {
    // `is_active` false sampai undangannya dipakai. USER_FLOW §2.1 menyebutnya
    // PENDING; tidak ada kolom untuk itu, dan menambahkannya berarti mengubah
    // migrasi yang sudah diterapkan. Bedanya dengan "dinonaktifkan Admin" tetap
    // terbaca dari ada-tidaknya undangan yang masih berlaku — lihat
    // `keadaanPengguna()` di kueri daftar.
    await tx.$executeRaw`
      INSERT INTO app_user (id, nama_lengkap, nim, email, angkatan, no_hp, is_active)
      VALUES (${userId}::uuid, ${v.nama_lengkap}, ${v.nim}, ${v.email},
              ${v.angkatan ?? null}::int, ${v.no_hp ?? null}, false)
    `;

    for (const r of v.roles) {
      await tx.$executeRaw`
        INSERT INTO user_role (user_id, periode_id, role, departemen_id)
        VALUES (${userId}::uuid, ${konteks.periodeId}::uuid, ${r.role}::role_code,
                ${r.departemen_id ?? null}::uuid)
      `;
    }

    const inv = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO invitation (email, token_hash, user_id, expires_at, created_by)
      VALUES (${v.email}, ${hashToken(token)}, ${userId}::uuid,
              ${kedaluwarsa.toISOString()}::timestamptz, ${konteks.sesi.userId}::uuid)
      RETURNING id
    `;

    return {
      ok: true,
      nilai: {
        userId,
        invitationId: inv[0]!.id,
        tautan: `${asalUrl.replace(/\/+$/, '')}/undangan/${token}`,
        kedaluwarsa: kedaluwarsa.toISOString(),
      },
    };
  } catch (e) {
    // Kompensasi: akun auth yang sudah terbuat dihapus lagi supaya tidak
    // menjadi yatim. Lihat catatan di kepala berkas — kompensasi ini sendiri
    // bisa gagal, dan sisanya dilaporkan sebagai AUTH_YATIM.
    try {
      await hapusAkunAuth(userId);
    } catch {
      return {
        ok: false,
        kode: 'AUTH_YATIM',
        pesan:
          'Undangan gagal disimpan dan akun autentikasinya tidak dapat dibersihkan otomatis. ' +
          `Hubungi pemegang kunci Supabase untuk menghapus akun ${v.email}.`,
      };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Aktivasi
// ---------------------------------------------------------------------------

/**
 * Keadaan sebuah token, untuk halaman `app/(auth)/undangan/[token]`.
 *
 * Tiga kegagalan dibedakan karena USER_FLOW §2.2 menuntut tiga halaman yang
 * berbeda, dan tindakan penggunanya memang berbeda: yang kedaluwarsa menghubungi
 * Admin, yang terpakai langsung login, yang tidak dikenal salah tautan.
 *
 * Tidak butuh sesi — halaman aktivasi memang dibuka orang yang belum punya akun.
 */
export async function periksaUndangan(token: string): Promise<Hasil<UndanganDibuka>> {
  if (!token || token.length < 20) {
    return { ok: false, kode: 'TOKEN_TIDAK_DIKENAL', pesan: 'Tautan undangan tidak dikenali.' };
  }

  const baris = await db.$queryRaw<
    { email: string; nama_lengkap: string; used_at: Date | null; kedaluwarsa: boolean }[]
  >`
    SELECT i.email,
           u.nama_lengkap,
           i.used_at,
           (i.expires_at <= now()) AS kedaluwarsa
    FROM invitation i
    JOIN app_user u ON u.id = i.user_id
    WHERE i.token_hash = ${hashToken(token)}
  `;

  const inv = baris[0];
  if (!inv) {
    return { ok: false, kode: 'TOKEN_TIDAK_DIKENAL', pesan: 'Tautan undangan tidak dikenali.' };
  }
  if (inv.used_at) {
    return {
      ok: false,
      kode: 'TOKEN_TERPAKAI',
      pesan: 'Undangan ini sudah digunakan. Silakan login dengan password yang Anda buat.',
    };
  }
  if (inv.kedaluwarsa) {
    return {
      ok: false,
      kode: 'TOKEN_KEDALUWARSA',
      pesan: 'Undangan kedaluwarsa, hubungi Admin.',
    };
  }

  const roles = await db.$queryRaw<{ role: RoleCode }[]>`
    SELECT ur.role
    FROM user_role ur
    JOIN invitation i ON i.user_id = ur.user_id
    JOIN periode p    ON p.id = ur.periode_id AND p.status = 'AKTIF'
    WHERE i.token_hash = ${hashToken(token)}
  `;

  return {
    ok: true,
    nilai: {
      email: inv.email,
      namaLengkap: inv.nama_lengkap,
      roles: [...new Set(roles.map((r) => r.role))],
    },
  };
}

/**
 * Menyetel password dan mengaktifkan akun.
 *
 * `used_at` diisi dengan `UPDATE ... WHERE used_at IS NULL`, dan barisnya
 * dihitung. Itu yang membuat undangan benar-benar SEKALI PAKAI: dua permintaan
 * yang tiba bersamaan sama-sama lolos `periksaUndangan()`, tetapi hanya satu
 * yang memperoleh baris. Memeriksa lebih dulu lalu menulis akan meloloskan
 * keduanya.
 *
 * Passwordnya disetel SESUDAH `used_at` berhasil diklaim. Urutan sebaliknya
 * membuat permintaan yang kalah tetap sempat mengganti password milik pemenang.
 */
export async function aktivasi(
  tx: TxKlien,
  input: unknown,
): Promise<Hasil<{ userId: string; email: string }>> {
  const parsed = SkemaAktivasi.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'TIDAK_VALID',
      pesan: 'Password belum memenuhi syarat.',
      isu: keIsu(parsed.error),
    };
  }
  const v = parsed.data;
  const hash = hashToken(v.token);

  const diklaim = await tx.$queryRaw<{ user_id: string; email: string }[]>`
    UPDATE invitation
       SET used_at = now()
     WHERE token_hash = ${hash}
       AND used_at IS NULL
       AND expires_at > now()
    RETURNING user_id, email
  `;

  if (!diklaim[0]) {
    // Membedakan sebabnya untuk pesan yang berguna. Aman dilakukan sesudah
    // klaim gagal: tidak ada lagi yang dapat berubah karenanya.
    const keadaan = await periksaUndangan(v.token);
    if (!keadaan.ok) return keadaan;
    return {
      ok: false,
      kode: 'TOKEN_TERPAKAI',
      pesan: 'Undangan ini sudah digunakan. Silakan login.',
    };
  }

  const { user_id: userId, email } = diklaim[0];

  await setPasswordAuth(userId, v.password);

  await tx.$executeRaw`
    UPDATE app_user SET is_active = true, updated_at = now() WHERE id = ${userId}::uuid
  `;

  return { ok: true, nilai: { userId, email } };
}

// ---------------------------------------------------------------------------
// Manajemen pengguna
// ---------------------------------------------------------------------------

/**
 * Daftar pengguna pada periode aktif, beserta peran dan keadaannya.
 *
 * `keadaan` diturunkan di SQL, bukan di TypeScript, supaya halaman admin dapat
 * menyaringnya tanpa mengambil seluruh baris lebih dulu.
 */
export async function daftarPengguna(
  periodeId: string,
  filter: { q?: string; role?: RoleCode; departemen_id?: string; aktif?: boolean } = {},
  klien: TxKlien | typeof db = db,
): Promise<RingkasPengguna[]> {
  const baris = await klien.$queryRaw<
    (Omit<RingkasPengguna, 'roles'> & { roles: RingkasPengguna['roles'] | null })[]
  >`
    WITH peran AS (
      SELECT ur.user_id,
             jsonb_agg(jsonb_build_object(
               'role', ur.role,
               'departemen_id', ur.departemen_id,
               'nama_departemen', d.nama
             ) ORDER BY ur.role) AS daftar
      FROM user_role ur
      LEFT JOIN departemen d ON d.id = ur.departemen_id
      WHERE ur.periode_id = ${periodeId}::uuid
      GROUP BY ur.user_id
    ),
    undangan AS (
      -- Undangan TERAKHIR yang belum dipakai, per pengguna. Undangan lama yang
      -- sudah kedaluwarsa tidak boleh menutupi undangan baru yang masih hidup.
      SELECT DISTINCT ON (user_id) user_id, expires_at
      FROM invitation
      WHERE used_at IS NULL
      ORDER BY user_id, created_at DESC
    )
    SELECT u.id, u.nama_lengkap, u.nim, u.email, u.angkatan, u.is_active,
           CASE
             WHEN u.is_active                       THEN 'AKTIF'
             WHEN inv.expires_at > now()            THEN 'MENUNGGU_AKTIVASI'
             WHEN inv.expires_at IS NOT NULL        THEN 'UNDANGAN_KEDALUWARSA'
             ELSE 'NONAKTIF'
           END AS keadaan,
           COALESCE(peran.daftar, '[]'::jsonb) AS roles
    FROM app_user u
    JOIN peran        ON peran.user_id = u.id
    LEFT JOIN undangan inv ON inv.user_id = u.id
    WHERE (${filter.q ?? null}::text IS NULL
           OR u.nama_lengkap ILIKE '%' || ${filter.q ?? null}::text || '%'
           OR u.nim          ILIKE '%' || ${filter.q ?? null}::text || '%'
           OR u.email        ILIKE '%' || ${filter.q ?? null}::text || '%')
      AND (${filter.aktif ?? null}::boolean IS NULL OR u.is_active = ${filter.aktif ?? null}::boolean)
      AND (${filter.role ?? null}::text IS NULL
           OR EXISTS (SELECT 1 FROM user_role r
                       WHERE r.user_id = u.id AND r.periode_id = ${periodeId}::uuid
                         AND r.role::text = ${filter.role ?? null}::text))
      AND (${filter.departemen_id ?? null}::uuid IS NULL
           OR EXISTS (SELECT 1 FROM user_role r
                       WHERE r.user_id = u.id AND r.periode_id = ${periodeId}::uuid
                         AND r.departemen_id = ${filter.departemen_id ?? null}::uuid))
    ORDER BY u.nama_lengkap
  `;

  return baris.map((b) => ({ ...b, roles: b.roles ?? [] }));
}

/**
 * Mengubah data atau peran seorang pengguna.
 *
 * `is_active = false` HANYA mengubah kolom itu. Tidak ada baris lain yang
 * disentuh, dan itulah maksudnya (PRD F-1.2): proker, surat, dan nota yang
 * pernah dibuatnya tetap punya pemilik agar jejak audit utuh. Menghapus
 * penggunanya akan memutus seluruh foreign key itu.
 *
 * `roles` bersifat MENGGANTI, bukan menambah — seluruh peran pada periode aktif
 * dihapus lalu ditulis ulang. Bentuk "tambah satu peran" tidak disediakan
 * karena form Admin memang mengirim daftar utuh, dan dua jalur penulisan untuk
 * hal yang sama pasti berbeda perilakunya suatu hari.
 */
export async function ubahPengguna(
  tx: TxKlien,
  konteks: Konteks,
  userId: string,
  perubahan: unknown,
): Promise<Hasil<{ id: string }>> {
  const parsed = SkemaUbahPengguna.safeParse(perubahan);
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'TIDAK_VALID',
      pesan: 'Perubahan tidak valid.',
      isu: keIsu(parsed.error),
    };
  }
  const v = parsed.data;

  if (!konteks.periodeId) {
    return {
      ok: false,
      kode: 'TIDAK_ADA_PERIODE',
      pesan: 'Belum ada periode kepengurusan yang aktif.',
    };
  }

  const lama = await tx.$queryRaw<
    { nama_lengkap: string; angkatan: number | null; no_hp: string | null; is_active: boolean }[]
  >`
    SELECT nama_lengkap, angkatan, no_hp, is_active FROM app_user WHERE id = ${userId}::uuid
  `;
  if (!lama[0]) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Pengguna tidak ditemukan.' };
  }

  // Digabung di TypeScript, bukan lewat COALESCE di SQL.
  //
  // `angkatan` dan `no_hp` boleh bernilai NULL, dan COALESCE tidak dapat
  // membedakan dua maksud yang berbeda: `null` berarti "kosongkan", `undefined`
  // berarti "jangan sentuh". Versi COALESCE menyamakan keduanya dan diam-diam
  // menghapus angkatan setiap kali Admin hanya mengganti nama.
  const gabung = {
    nama_lengkap: v.nama_lengkap ?? lama[0].nama_lengkap,
    angkatan: v.angkatan === undefined ? lama[0].angkatan : v.angkatan,
    no_hp: v.no_hp === undefined ? lama[0].no_hp : v.no_hp,
    is_active: v.is_active ?? lama[0].is_active,
  };

  await tx.$executeRaw`
    UPDATE app_user SET
      nama_lengkap = ${gabung.nama_lengkap},
      angkatan     = ${gabung.angkatan}::int,
      no_hp        = ${gabung.no_hp},
      is_active    = ${gabung.is_active}::boolean,
      updated_at   = now()
    WHERE id = ${userId}::uuid
  `;

  if (v.roles) {
    await tx.$executeRaw`
      DELETE FROM user_role
      WHERE user_id = ${userId}::uuid AND periode_id = ${konteks.periodeId}::uuid
    `;
    for (const r of v.roles) {
      await tx.$executeRaw`
        INSERT INTO user_role (user_id, periode_id, role, departemen_id)
        VALUES (${userId}::uuid, ${konteks.periodeId}::uuid, ${r.role}::role_code,
                ${r.departemen_id ?? null}::uuid)
      `;
    }
  }

  return { ok: true, nilai: { id: userId } };
}
