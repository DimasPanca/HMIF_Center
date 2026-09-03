/**
 * Skema Zod program kerja — dipakai form wizard di klien DAN validasi di server
 * (K-04). Satu berkas, satu skema; dua skema untuk entitas yang sama pasti
 * berbeda suatu hari, dan bedanya baru terlihat saat sesuatu yang ditolak form
 * ternyata diterima server.
 *
 * ===========================================================================
 * SKEMA INI MENCERMINKAN CONSTRAINT DATABASE, TIDAK MENGGANTIKANNYA
 * ===========================================================================
 * `urutan_tanggal` dan `durasi_persiapan_15_45` sudah ditegakkan CHECK di
 * migrasi 004. Yang ditambahkan di sini bukan penjaminan melainkan PESAN:
 * pengguna berhak tahu "persiapan 8 hari, minimal 15" sebelum menekan simpan,
 * bukan menerima kegagalan constraint berbahasa Postgres sesudahnya.
 *
 * Karena itu setiap aturan di bawah ditulis persis sama dengan constraint-nya.
 * Bila keduanya berbeda, yang menang adalah database — dan selisihnya muncul
 * sebagai error 500 yang membingungkan, bukan sebagai pesan form.
 *
 * ===========================================================================
 * TANGGAL BERUPA STRING 'YYYY-MM-DD', BUKAN Date
 * ===========================================================================
 * Kolomnya `DATE` — hari kalender, tanpa jam dan tanpa zona waktu. `Date` di
 * JavaScript selalu membawa keduanya, dan `new Date('2026-11-01')` di browser
 * ber-offset negatif menghasilkan 31 Oktober waktu setempat. Untuk sistem yang
 * seluruh aturannya tentang tanggal mana yang terkunci, pergeseran satu hari
 * itu persis kesalahan yang paling mahal.
 *
 * String tetap string dari form sampai SQL. Perhitungan selisih hari memakai
 * `Date.UTC` di `selisihHari()` supaya tidak pernah menyentuh zona waktu lokal.
 *
 * Sumber: PRD F-5.1, F-5.2, F-5.3 · SYSTEM_DESIGN §4.3 · migrasi 004 · K-04
 */

import { z } from 'zod';

import { KATEGORI, STATUS } from './status';

// ---------------------------------------------------------------------------
// Tanggal
// ---------------------------------------------------------------------------

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function keMs(s: string): number {
  const [t, b, h] = s.split('-').map(Number) as [number, number, number];
  return Date.UTC(t, b - 1, h);
}

/**
 * Satu hari kalender.
 *
 * Regex saja tidak cukup: '2026-02-31' lolos pola tetapi bukan tanggal. Kolom
 * DATE akan menolaknya, jadi pemeriksaannya dikerjakan di sini supaya
 * penolakannya berbentuk pesan form, bukan error dari driver.
 */
export const tanggal = z
  .string()
  .regex(POLA_TANGGAL, 'Tanggal harus berformat YYYY-MM-DD.')
  .refine((s) => {
    const [t, b, h] = s.split('-').map(Number) as [number, number, number];
    const d = new Date(Date.UTC(t, b - 1, h));
    return d.getUTCFullYear() === t && d.getUTCMonth() === b - 1 && d.getUTCDate() === h;
  }, 'Tanggal tidak ada pada kalender.');

/** Selisih hari antara dua tanggal 'YYYY-MM-DD', bebas zona waktu. */
export function selisihHari(dari: string, sampai: string): number {
  return Math.round((keMs(sampai) - keMs(dari)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Bagian yang sama untuk ketiga kategori
// ---------------------------------------------------------------------------

/** Empat pilihan PRD F-5.3 langkah 3. Kolomnya TEXT[]; daftarnya aturan bisnis. */
export const SUMBER_DANA = [
  'KAS_HIMPUNAN',
  'IURAN_PESERTA',
  'SPONSOR',
  'DANA_FAKULTAS',
] as const;

const dasar = {
  departemen_id: z.uuid('Departemen wajib dipilih.'),
  nama: z
    .string()
    .trim()
    .min(3, 'Nama proker minimal 3 karakter.')
    .max(200, 'Nama proker maksimal 200 karakter.'),
  deskripsi: z.string().trim().max(4000).optional(),
  tujuan: z.string().trim().max(4000).optional(),
  sasaran: z.string().trim().max(4000).optional(),
  estimasi_peserta: z.int().positive('Estimasi peserta harus lebih dari 0.').optional(),
  penanggung_jawab: z.uuid().optional(),
  estimasi_anggaran: z.number().nonnegative('Anggaran tidak boleh negatif.').optional(),
  sumber_dana: z.array(z.enum(SUMBER_DANA)).optional(),
};

// ---------------------------------------------------------------------------
// Pola pengulangan — hanya BERKALA
// ---------------------------------------------------------------------------

export const HARI = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'] as const;

/**
 * Bentuknya ditetapkan komentar migrasi 004 dan SYSTEM_DESIGN §4.3:
 * `{"frekuensi":"MINGGUAN","hari":["SABTU"],"mulai":"...","selesai":"..."}`.
 *
 * `hari` tetap berisi nama hari untuk frekuensi BULANAN — "Sabtu pertama tiap
 * bulan" memakai bentuk yang sama. Menambahkan bentuk kedua khusus BULANAN
 * berarti mengubah isi kolom JSONB yang sudah punya pembaca lain.
 */
export const SkemaPolaUlang = z
  .object({
    frekuensi: z.enum(['MINGGUAN', 'BULANAN']),
    hari: z.array(z.enum(HARI)).min(1, 'Pilih minimal satu hari.'),
    mulai: tanggal,
    selesai: tanggal,
  })
  .refine((p) => selisihHari(p.mulai, p.selesai) >= 0, {
    message: 'Rentang pengulangan berakhir sebelum dimulai.',
    path: ['selesai'],
  });

export type PolaUlang = z.infer<typeof SkemaPolaUlang>;

// ---------------------------------------------------------------------------
// Tiga kategori, tiga aturan berbeda
// ---------------------------------------------------------------------------

/**
 * TERJADWAL — satu-satunya kategori yang mengunci kalender.
 *
 * Ketiga tanggalnya wajib, dan durasi persiapan 15–45 hari adalah aturan keras
 * organisasi, bukan konfigurasi (ADR-008). Dihitung dari mulai persiapan sampai
 * hari-H PERTAMA, sama seperti CHECK `durasi_persiapan_15_45`.
 */
const terjadwal = z
  .object({
    ...dasar,
    kategori: z.literal('TERJADWAL'),
    tanggal_mulai_persiapan: tanggal,
    tanggal_hari_h_mulai: tanggal,
    tanggal_hari_h_selesai: tanggal,
    pola_ulang: z.undefined().optional(),
  })
  .superRefine((v, ctx) => {
    if (selisihHari(v.tanggal_hari_h_mulai, v.tanggal_hari_h_selesai) < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['tanggal_hari_h_selesai'],
        message: 'Hari-H selesai lebih awal daripada hari-H mulai.',
      });
    }

    const durasi = selisihHari(v.tanggal_mulai_persiapan, v.tanggal_hari_h_mulai);
    if (durasi < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['tanggal_mulai_persiapan'],
        message: 'Persiapan dimulai setelah hari-H.',
      });
      return;
    }
    if (durasi < 15 || durasi > 45) {
      ctx.addIssue({
        code: 'custom',
        path: ['tanggal_mulai_persiapan'],
        message: `Durasi persiapan ${durasi} hari. Harus antara 15 dan 45 hari sebelum hari-H.`,
      });
    }
  });

/**
 * BERKALA — rutin berulang, bebas bentrok dengan apa pun (PRD F-5.2 R4).
 *
 * Tanggal tunggal TIDAK wajib; yang wajib adalah `pola_ulang`. Kategori ini
 * juga tidak melewati approval sama sekali (PRD F-5.1), sehingga ia tidak
 * pernah muncul di antrian Ketua/Wakil.
 */
const berkala = z.object({
  ...dasar,
  kategori: z.literal('BERKALA'),
  tanggal_mulai_persiapan: tanggal.optional(),
  tanggal_hari_h_mulai: tanggal.optional(),
  tanggal_hari_h_selesai: tanggal.optional(),
  pola_ulang: SkemaPolaUlang,
});

/**
 * RESPONSIF — insidental, tetap butuh approval, tidak mengunci kalender
 * (PRD F-5.2 R5).
 *
 * Hari-H wajib karena acaranya memang punya tanggal; masa persiapan tidak,
 * karena kategori ini justru lahir dari ketiadaan waktu persiapan. Aturan
 * 15–45 hari tidak berlaku di sini — memberlakukannya membuat kategori ini
 * mustahil dipakai untuk hal yang menjadi alasan keberadaannya.
 */
const responsif = z
  .object({
    ...dasar,
    kategori: z.literal('RESPONSIF'),
    tanggal_mulai_persiapan: tanggal.optional(),
    tanggal_hari_h_mulai: tanggal,
    tanggal_hari_h_selesai: tanggal,
    pola_ulang: z.undefined().optional(),
  })
  .superRefine((v, ctx) => {
    if (selisihHari(v.tanggal_hari_h_mulai, v.tanggal_hari_h_selesai) < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['tanggal_hari_h_selesai'],
        message: 'Hari-H selesai lebih awal daripada hari-H mulai.',
      });
    }
    if (
      v.tanggal_mulai_persiapan &&
      selisihHari(v.tanggal_mulai_persiapan, v.tanggal_hari_h_mulai) < 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['tanggal_mulai_persiapan'],
        message: 'Persiapan dimulai setelah hari-H.',
      });
    }
  });

/**
 * Skema proker, dipakai POST maupun PATCH.
 *
 * PATCH memakai skema yang sama dan bukan versi partial-nya: aturan yang
 * membedakan ketiga kategori hanya dapat diperiksa bila seluruh medannya ada.
 * Skema partial akan meloloskan perubahan tanggal yang memecah durasi 15–45
 * hari, karena medan pembandingnya tidak ikut dikirim. Service menggabung
 * perubahan dengan baris tersimpan LEBIH DULU, baru memvalidasinya — lihat
 * `ubahProker()` di service.ts dan docs/ai/PROKER_CONTRACT.md §3.
 */
export const SkemaProker = z.discriminatedUnion('kategori', [terjadwal, berkala, responsif]);

export type InputProker = z.infer<typeof SkemaProker>;

// ---------------------------------------------------------------------------
// Skema untuk endpoint pembacaan
// ---------------------------------------------------------------------------

/** Badan `POST /api/proker/cek-konflik`. */
export const SkemaCekKonflik = z
  .object({
    mulai: tanggal,
    selesai: tanggal,
    /** Proker yang sedang diedit, supaya ia tidak dilaporkan bentrok dengan dirinya sendiri. */
    exclude_id: z.uuid().optional(),
  })
  .refine((v) => selisihHari(v.mulai, v.selesai) >= 0, {
    message: 'Rentang berakhir sebelum dimulai.',
    path: ['selesai'],
  });

export type InputCekKonflik = z.infer<typeof SkemaCekKonflik>;

/** Query `GET /api/proker`. Seluruh medannya opsional. */
export const SkemaFilterProker = z.object({
  departemen_id: z.uuid().optional(),
  kategori: z.enum(KATEGORI).optional(),
  status: z.enum(STATUS).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

export type FilterProker = z.infer<typeof SkemaFilterProker>;
