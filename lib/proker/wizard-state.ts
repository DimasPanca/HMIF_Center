/**
 * wizard-state — mesin keadaan wizard "Tambah Proker", dipakai klien DAN server.
 *
 * ===========================================================================
 * MODUL MURNI, AMAN DI KLIEN — TIDAK MENYENTUH DATABASE
 * ===========================================================================
 * `WizardShell` dan komponen langkah (lane ui) mengimpor berkas ini di klien
 * untuk tahu langkah mana yang valid, boleh dilewati, dan bentuk permintaan cek
 * konflik. Karena itu ia TIDAK BOLEH mengimpor `db` — persistensi draft ada di
 * `lib/proker/draft-store.ts` yang server-only. Pembelahan ini disengaja:
 * validasi per langkah harus sama persis di klien (agar tombol Lanjut hidup/mati
 * seketika) dan di server (agar tidak dapat ditembus), jadi ia hidup sekali di
 * sini (K-04).
 *
 * ===========================================================================
 * DRAFT SENGAJA PARSIAL; YANG MENJAMIN LENGKAP ADALAH SUBMIT
 * ===========================================================================
 * `WizardDraft` adalah versi longgar `InputProker`: setiap medan opsional, boleh
 * kosong, boleh setengah jadi. Itu memang sifat draft — wizard bisa ditinggal di
 * langkah mana pun. Validasi PENUH (discriminated union `SkemaProker` dengan
 * seluruh aturannya) baru dijalankan saat submit di T-069; di sini yang divalidasi
 * hanya potongan per langkah, supaya tombol Lanjut tahu kapan boleh menyala.
 *
 * Aturan 15-45 hari, urutan tanggal, dan pesan berangka aktual seluruhnya dibaca
 * dari primitif `schema.ts` — tidak ditulis ulang, supaya tidak pernah berbeda
 * dari yang ditegakkan database.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-068 · PRD F-5.3 (Langkah 1-3) ·
 *         USER_FLOW §4.1 · docs/ai/WIZARD_PROKER_CONTRACT.md · K-04
 */

import { z } from 'zod';

import {
  HARI,
  SUMBER_DANA,
  SkemaPolaUlang,
  selisihHari,
  tanggal,
  type InputProker,
} from './schema';
import { KATEGORI, type ProkerKategori } from './status';

// ---------------------------------------------------------------------------
// Model langkah
// ---------------------------------------------------------------------------

export type NomorLangkah = 1 | 2 | 3 | 4 | 5 | 6;

export interface Langkah {
  nomor: NomorLangkah;
  kunci: string;
  judul: string;
  /**
   * Kategori yang mewajibkan langkah ini. Langkah di luar daftar ini
   * DILEWATI untuk kategori lain — bukan ditampilkan nonaktif.
   */
  wajibUntuk: readonly ProkerKategori[];
}

const SEMUA = KATEGORI; // TERJADWAL, BERKALA, RESPONSIF

/**
 * Enam langkah PRD F-5.3.
 *
 * Langkah 4 (Kepanitiaan) dan 5 (Gantt) hanya untuk TERJADWAL — PRD menandainya
 * "wajib untuk TERJADWAL", dan BERKALA/RESPONSIF tidak membentuk kepanitiaan.
 * Langkah 2 selalu ada tetapi ISINYA berbeda: penjadwalan untuk TERJADWAL/
 * RESPONSIF, pola pengulangan untuk BERKALA (kontrak 5).
 */
export const LANGKAH: readonly Langkah[] = [
  { nomor: 1, kunci: 'informasi', judul: 'Informasi Dasar', wajibUntuk: SEMUA },
  { nomor: 2, kunci: 'jadwal', judul: 'Penjadwalan', wajibUntuk: SEMUA },
  { nomor: 3, kunci: 'anggaran', judul: 'Anggaran & Kebutuhan', wajibUntuk: SEMUA },
  { nomor: 4, kunci: 'kepanitiaan', judul: 'Kepanitiaan', wajibUntuk: ['TERJADWAL'] },
  { nomor: 5, kunci: 'gantt', judul: 'Gantt Chart', wajibUntuk: ['TERJADWAL'] },
  { nomor: 6, kunci: 'tinjau', judul: 'Tinjau & Ajukan', wajibUntuk: SEMUA },
];

/** Langkah yang berlaku untuk sebuah kategori, urut. Kategori kosong → semua. */
export function langkahUntuk(kategori: ProkerKategori | undefined): Langkah[] {
  if (!kategori) return [...LANGKAH];
  return LANGKAH.filter((l) => l.wajibUntuk.includes(kategori));
}

// ---------------------------------------------------------------------------
// Bentuk draft
// ---------------------------------------------------------------------------

/**
 * Isi wizard sejauh ini. Longgar dengan sengaja — cerminan `InputProker` yang
 * seluruh medannya opsional.
 *
 * `departemen_id` diisi UI dari konteks pengguna (Kadept membuat proker untuk
 * departemennya), bukan medan yang diketik di layar. Ia ada di draft karena
 * `keInputProker` membutuhkannya saat submit.
 */
export interface WizardDraft {
  departemen_id?: string;
  // Langkah 1
  nama?: string;
  kategori?: ProkerKategori;
  deskripsi?: string;
  tujuan?: string;
  sasaran?: string;
  estimasi_peserta?: number;
  penanggung_jawab?: string;
  // Langkah 2 — TERJADWAL / RESPONSIF
  tanggal_mulai_persiapan?: string;
  tanggal_hari_h_mulai?: string;
  tanggal_hari_h_selesai?: string;
  // Langkah 2 — BERKALA
  pola_ulang?: z.infer<typeof SkemaPolaUlang>;
  // Langkah 3
  estimasi_anggaran?: number;
  sumber_dana?: (typeof SUMBER_DANA)[number][];
  /**
   * Kebutuhan ruangan & barang (PRD F-5.3 Langkah 3). Tabel `proker` belum punya
   * kolomnya, jadi keduanya HANYA hidup di draft untuk pemulihan isian, dan
   * `keInputProker` membuangnya. Persistensinya menyusul bila kolomnya ditambah.
   */
  kebutuhan_ruangan?: string;
  kebutuhan_barang?: string;
}

export type PatchLangkah = Partial<WizardDraft>;

/**
 * Menggabungkan patch satu langkah ke draft.
 *
 * `undefined` berarti "jangan sentuh"; untuk mengosongkan medan, kirim `null`
 * dari UI — di sini `null` disaring menjadi penghapusan kunci. Tanpa aturan ini,
 * mengosongkan sebuah medan mustahil karena patch hanya bisa menimpa, tak bisa
 * menghapus.
 */
export function terapkanLangkah(draft: WizardDraft, patch: PatchLangkah): WizardDraft {
  const keluar: WizardDraft = { ...draft };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete (keluar as Record<string, unknown>)[k];
    else (keluar as Record<string, unknown>)[k] = v;
  }
  return keluar;
}

// ---------------------------------------------------------------------------
// Validasi per langkah (1-3; 4-6 milik T-069)
// ---------------------------------------------------------------------------

export interface HasilLangkah {
  ok: boolean;
  isu: { path: string; pesan: string }[];
}

const OK: HasilLangkah = { ok: true, isu: [] };

function dariZod(e: z.ZodError): HasilLangkah {
  return { ok: false, isu: e.issues.map((i) => ({ path: i.path.join('.'), pesan: i.message })) };
}

/** Langkah 1 — Informasi Dasar. */
const skemaLangkah1 = z.object({
  departemen_id: z.uuid('Departemen wajib dipilih.'),
  nama: z.string().trim().min(3, 'Nama proker minimal 3 karakter.').max(200),
  kategori: z.enum(KATEGORI),
  deskripsi: z.string().trim().max(4000).optional(),
  tujuan: z.string().trim().max(4000).optional(),
  sasaran: z.string().trim().max(4000).optional(),
  estimasi_peserta: z.int().positive('Estimasi peserta harus lebih dari 0.').optional(),
  penanggung_jawab: z.uuid().optional(),
});

/**
 * Langkah 2 untuk TERJADWAL: ketiga tanggal wajib, urutan benar, durasi 15-45.
 *
 * Aturan durasinya identik dengan CHECK `durasi_persiapan_15_45` dan superRefine
 * `SkemaProker`. Ditulis di sini juga (bukan mengimpor) karena `SkemaProker`
 * adalah discriminated union ber-superRefine yang tidak bisa dipotong per medan;
 * yang penting angkanya sama — 15 dan 45, inklusif — dan diuji terhadap
 * `SkemaProker` agar tidak menyimpang.
 */
const skemaJadwalTerjadwal = z
  .object({
    tanggal_mulai_persiapan: tanggal,
    tanggal_hari_h_mulai: tanggal,
    tanggal_hari_h_selesai: tanggal,
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
        message: pesanDurasi(durasi),
      });
    }
  });

const skemaJadwalResponsif = z
  .object({
    tanggal_mulai_persiapan: tanggal.optional(),
    tanggal_hari_h_mulai: tanggal,
    tanggal_hari_h_selesai: tanggal,
  })
  .superRefine((v, ctx) => {
    if (selisihHari(v.tanggal_hari_h_mulai, v.tanggal_hari_h_selesai) < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['tanggal_hari_h_selesai'],
        message: 'Hari-H selesai lebih awal daripada hari-H mulai.',
      });
    }
  });

/** Langkah 3 — Anggaran. Seluruhnya opsional; yang diisi harus valid. */
const skemaLangkah3 = z.object({
  estimasi_anggaran: z.number().nonnegative('Anggaran tidak boleh negatif.').optional(),
  sumber_dana: z.array(z.enum(SUMBER_DANA)).optional(),
  kebutuhan_ruangan: z.string().trim().max(2000).optional(),
  kebutuhan_barang: z.string().trim().max(2000).optional(),
});

/**
 * Durasi persiapan dalam hari, atau `null` bila kedua tanggalnya belum lengkap.
 * Dipakai UI untuk menampilkan hitungan langsung saat tanggal dipilih.
 */
export function durasiPersiapan(draft: WizardDraft): number | null {
  if (!draft.tanggal_mulai_persiapan || !draft.tanggal_hari_h_mulai) return null;
  return selisihHari(draft.tanggal_mulai_persiapan, draft.tanggal_hari_h_mulai);
}

/**
 * Pesan durasi yang MENYEBUT angka aktualnya (kontrak 4): "Persiapan 12 hari —
 * minimal 15 hari" alih-alih "durasi tidak valid".
 */
export function pesanDurasi(durasi: number): string {
  if (durasi < 15) return `Persiapan ${durasi} hari — minimal 15 hari.`;
  if (durasi > 45) return `Persiapan ${durasi} hari — maksimal 45 hari.`;
  return `Persiapan ${durasi} hari.`;
}

/**
 * Memvalidasi satu langkah dari draft. Hanya langkah 1-3 (T-068). Langkah 4-6
 * milik T-069 dan sementara dianggap OK di sini supaya WizardShell tidak
 * menahan navigasi untuk aturan yang belum ditulis — T-069 menggantinya.
 */
export function validasiLangkah(draft: WizardDraft, nomor: NomorLangkah): HasilLangkah {
  if (nomor === 1) {
    const h = skemaLangkah1.safeParse(draft);
    return h.success ? OK : dariZod(h.error);
  }

  if (nomor === 2) {
    if (draft.kategori === 'BERKALA') {
      const h = SkemaPolaUlang.safeParse(draft.pola_ulang);
      return h.success ? OK : dariZod(h.error);
    }
    if (draft.kategori === 'RESPONSIF') {
      const h = skemaJadwalResponsif.safeParse(draft);
      return h.success ? OK : dariZod(h.error);
    }
    // TERJADWAL (dan default sebelum kategori dipilih memakai aturan terketat).
    const h = skemaJadwalTerjadwal.safeParse(draft);
    return h.success ? OK : dariZod(h.error);
  }

  if (nomor === 3) {
    const h = skemaLangkah3.safeParse(draft);
    return h.success ? OK : dariZod(h.error);
  }

  return OK; // 4-6: T-069
}

/**
 * Apakah wizard boleh maju MELEWATI `nomor` — yaitu langkah itu sudah valid.
 * "Langkah yang belum valid tidak bisa dilewati" (kontrak 1).
 */
export function bolehLanjut(draft: WizardDraft, nomor: NomorLangkah): boolean {
  return validasiLangkah(draft, nomor).ok;
}

// ---------------------------------------------------------------------------
// Cek konflik — jalur yang dipanggil T-068-UI
// ---------------------------------------------------------------------------

/**
 * Bentuk permintaan `POST /api/proker/cek-konflik` dari draft, atau `null` bila
 * cek belum relevan.
 *
 * `null` untuk BERKALA (bebas bentrok, cek disembunyikan — kontrak 5) dan
 * RESPONSIF (tidak mengunci kalender), serta selama kedua tanggal TERJADWAL
 * belum lengkap. Rentang yang dicek adalah SELURUH masa terkunci — mulai
 * persiapan sampai hari terakhir acara (INV-11), bukan hanya hari-H.
 *
 * Modul ini TIDAK memanggil endpoint; ia hanya membentuk badannya. Pemanggilan
 * dan target < 500 ms dikerjakan T-068-UI lewat service yang sudah ada.
 */
export function permintaanCekKonflik(
  draft: WizardDraft,
): { mulai: string; selesai: string; exclude_id?: string } | null {
  if (draft.kategori !== 'TERJADWAL') return null;
  if (!draft.tanggal_mulai_persiapan || !draft.tanggal_hari_h_selesai) return null;
  if (selisihHari(draft.tanggal_mulai_persiapan, draft.tanggal_hari_h_selesai) < 0) return null;
  return { mulai: draft.tanggal_mulai_persiapan, selesai: draft.tanggal_hari_h_selesai };
}

// ---------------------------------------------------------------------------
// Rakit untuk submit (dipakai T-069)
// ---------------------------------------------------------------------------

/**
 * Menyusun draft menjadi objek yang divalidasi `SkemaProker` saat submit.
 *
 * Membuang medan yang bukan milik `InputProker` (kebutuhan ruangan/barang) dan
 * medan kosong. TIDAK memvalidasi — itu tugas `SkemaProker` di jalur submit
 * (T-069). Disediakan di sini supaya bentuk draft→proker punya satu sumber.
 */
export function keInputProker(draft: WizardDraft): Partial<InputProker> & Record<string, unknown> {
  // Medan yang bukan milik InputProker dibuang di sini; sisanya disaring dari
  // nilai kosong.
  const dibuang = new Set(['kebutuhan_ruangan', 'kebutuhan_barang']);
  const keluar: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (dibuang.has(k)) continue;
    if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) {
      keluar[k] = v;
    }
  }
  return keluar as Partial<InputProker> & Record<string, unknown>;
}

export { HARI, SUMBER_DANA };
