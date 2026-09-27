/**
 * Skema Zod undangan & pengguna (K-04) — satu sumber untuk form klien dan
 * service `invitation.ts`. Modul murni: tanpa akses DB, tanpa `node:crypto`,
 * aman diimpor komponen `"use client"`. `invitation.ts` mengekspor ulang.
 */

import { z } from 'zod';

import { ROLES } from './permissions';

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
 * Aturan peran bersama undangan dan perubahan pengguna: CHECK `role_dept_wajib`
 * (migrasi 003) dan `user_role_unik`, diberi pesan per baris. Tanpa ini pelanggaran
 * baru ketahuan di database sebagai error 500.
 */
function periksaPeran(roles: z.infer<typeof peran>[], ctx: z.RefinementCtx): void {
  roles.forEach((r, i) => {
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
  const kunci = roles.map((r) => `${r.role}:${r.departemen_id ?? ''}`);
  kunci.forEach((k, i) => {
    if (kunci.indexOf(k) !== i) {
      ctx.addIssue({
        code: 'custom',
        path: ['roles', i],
        message: 'Peran ini sudah dipilih.',
      });
    }
  });
}

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
  .superRefine((v, ctx) => periksaPeran(v.roles, ctx));

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
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' })
  .superRefine((v, ctx) => {
    if (v.roles) periksaPeran(v.roles, ctx);
  });

export type InputUbahPengguna = z.infer<typeof SkemaUbahPengguna>;
