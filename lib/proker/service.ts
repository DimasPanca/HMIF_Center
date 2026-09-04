/**
 * Service program kerja — seluruh keputusan proker yang bukan tampilan.
 *
 * Route handler di `app/api/proker/**` (lane ui) tidak menyusun SQL, tidak
 * memutuskan status, dan tidak menafsirkan konflik. Ia memanggil fungsi di
 * berkas ini dan menerjemahkan hasilnya menjadi respons HTTP. Tanda tangannya
 * tercatat di `docs/ai/PROKER_CONTRACT.md`.
 *
 * ===========================================================================
 * SERVICE HANYA MEMBERI TAHU. DATABASE YANG MENOLAK.
 * ===========================================================================
 * Tidak ada satu pun fungsi di sini yang menegakkan anti-bentrok. `cekKonflik()`
 * mengembalikan daftar konflik untuk ditampilkan lebih awal — dan daftar itu
 * sudah berpotensi basi pada saat ia sampai ke layar, karena departemen lain
 * dapat menyetujui proker di rentang yang sama pada detik berikutnya.
 *
 * Yang menjamin hanya satu hal: EXCLUDE constraint `no_overlap_terjadwal` di
 * `proker_lock`, lewat fungsi `setujui_proker` (INV-09). Menambahkan
 * pemeriksaan "untuk jaga-jaga" di service tidak menutup celah apa pun; ia
 * hanya membuat orang berikutnya mengira celahnya sudah tertutup di sini.
 *
 * ===========================================================================
 * SELURUHNYA SQL MENTAH, DAN TANGGAL SELALU BERUPA STRING
 * ===========================================================================
 * Kolom tanggal proker bertipe `DATE` — hari kalender tanpa jam dan tanpa zona
 * waktu. Melewatkannya sebagai `Date` JavaScript (yang dilakukan Prisma untuk
 * `@db.Date`) berarti setiap penulisan dan pembacaan melewati konversi zona
 * waktu yang, pada offset negatif, menggeser tanggal satu hari. Untuk sistem
 * yang seluruh aturannya tentang tanggal mana yang terkunci, itu kesalahan
 * paling mahal yang bisa dibuat diam-diam.
 *
 * Karena itu SELURUH kueri di sini ditulis mentah: menulis dengan `::date` dan
 * membaca dengan `to_char(..., 'YYYY-MM-DD')`. Tanggal tetap string yang sama
 * dari form sampai SQL dan kembali. Ini juga yang diminta K-07 untuk kueri
 * kritis — anti-bentrok termasuk di dalamnya.
 *
 * Sumber: PRD F-5.1, F-5.2 · SYSTEM_DESIGN §6.3–§6.6, §16.2 · K-07, K-09 · INV-09, INV-10
 */

import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import type { Konteks } from '@/lib/auth/guard';
import { lingkupUntuk, type Permission } from '@/lib/auth/permissions';

import {
  SkemaProker,
  type FilterProker,
  type InputCekKonflik,
  type InputProker,
} from './schema';
import { STATUS_MENGUNCI, type ProkerKategori, type ProkerStatus } from './status';

// ---------------------------------------------------------------------------
// Bentuk data yang dikembalikan
// ---------------------------------------------------------------------------

/** Satu proker yang menghalangi sebuah rentang. */
export interface KonflikProker {
  proker_id: string;
  nama_proker: string;
  nama_departemen: string;
  /** Hari pertama yang terkunci, 'YYYY-MM-DD'. */
  mulai: string;
  /** Hari TERAKHIR yang terkunci, inklusif (INV-11). */
  selesai: string;
}

export interface RingkasProker {
  id: string;
  nama: string;
  kategori: ProkerKategori;
  status: ProkerStatus;
  departemen_id: string;
  nama_departemen: string;
  tanggal_mulai_persiapan: string | null;
  tanggal_hari_h_mulai: string | null;
  tanggal_hari_h_selesai: string | null;
  terkunci: boolean;
}

export interface DetailProker extends RingkasProker {
  periode_id: string;
  deskripsi: string | null;
  tujuan: string | null;
  sasaran: string | null;
  estimasi_peserta: number | null;
  penanggung_jawab: string | null;
  nama_penanggung_jawab: string | null;
  pola_ulang: unknown;
  estimasi_anggaran: string | null;
  sumber_dana: string[];
  diajukan_at: string | null;
  disetujui_oleh: string | null;
  disetujui_at: string | null;
  alasan_penolakan: string | null;
  dibuat_oleh: string;
}

/**
 * Satu baris kalender ketersediaan.
 *
 * `jenis` memisahkan dua hal yang tampak mirip tetapi berbeda akibatnya:
 * `TERKUNCI` benar-benar memblokir tanggal untuk proker TERJADWAL lain,
 * sedangkan `BERKALA` hanya ditampilkan sebagai keterangan dan tidak memblokir
 * apa pun (PRD F-5.2 R4). Menyatukan keduanya membuat kalender berbohong.
 */
export interface EntriKalender {
  jenis: 'TERKUNCI' | 'BERKALA';
  proker_id: string;
  nama_proker: string;
  departemen_id: string;
  nama_departemen: string;
  mulai: string;
  selesai: string;
  /** Hanya untuk `TERKUNCI`: batas hari-H di dalam rentang, untuk tooltip T-067. */
  hari_h_mulai: string | null;
  hari_h_selesai: string | null;
  penanggung_jawab: string | null;
  pola_ulang: unknown;
}

/** Kegagalan yang bukan bug: sesuatu yang memang boleh terjadi dan punya pesan. */
export type KodeGagalProker =
  | 'TIDAK_DITEMUKAN'
  | 'DI_LUAR_LINGKUP'
  | 'TIDAK_VALID'
  | 'TIDAK_ADA_PERIODE_AKTIF';

export interface GagalProker {
  ok: false;
  kode: KodeGagalProker;
  pesan: string;
  /** Terisi untuk `TIDAK_VALID`: path field → pesan, siap dipasang ke form. */
  isu?: { path: string; pesan: string }[];
}

export type Hasil<T> = { ok: true; nilai: T } | GagalProker;

// ---------------------------------------------------------------------------
// Pengecekan preventif
// ---------------------------------------------------------------------------

/**
 * Konflik terhadap sebuah rentang, untuk ditampilkan SEBELUM submit.
 *
 * Memanggil fungsi database `cek_konflik_proker` apa adanya — bukan menyalin
 * logikanya ke TypeScript. Bila keduanya ditulis terpisah, keduanya pasti
 * berbeda suatu hari, dan yang terlihat pengguna adalah peringatan yang tidak
 * cocok dengan penolakan yang ia terima kemudian.
 *
 * Rentangnya inklusif di kedua ujung: `mulai` dan `selesai` sama-sama ikut
 * diperiksa (INV-11). Target respons < 500 ms; kuerinya satu panggilan fungsi
 * yang memakai indeks GiST `proker_lock_rentang`.
 */
export async function cekKonflik(
  periodeId: string,
  input: InputCekKonflik,
  klien: TxKlien | typeof db = db,
): Promise<KonflikProker[]> {
  return klien.$queryRaw<KonflikProker[]>`
    SELECT
      k.proker_id,
      k.nama_proker,
      k.nama_departemen,
      to_char(k.rentang_mulai,   'YYYY-MM-DD') AS mulai,
      to_char(k.rentang_selesai, 'YYYY-MM-DD') AS selesai
    FROM cek_konflik_proker(
           ${periodeId}::uuid,
           ${input.mulai}::date,
           ${input.selesai}::date,
           ${input.exclude_id ?? null}::uuid
         ) k
    ORDER BY k.rentang_mulai
  `;
}

// ---------------------------------------------------------------------------
// Kalender ketersediaan
// ---------------------------------------------------------------------------

/**
 * Seluruh rentang terkunci periode aktif, plus proker BERKALA, dalam SATU
 * kueri.
 *
 * Satu kueri dan bukan dua karena kalender T-067 mengambil datanya sekali lalu
 * memfilter di klien saat berganti bulan; dua round-trip di sini akan menjadi
 * dua kali lipat pada setiap pembukaan wizard.
 *
 * Cabang TERKUNCI membaca `proker_lock`, bukan tanggal di tabel `proker`.
 * Keduanya tidak selalu sama: proker yang sedang menunggu approval revisi masih
 * memegang kunci LAMA (INV-13), dan yang benar bagi kalender adalah kunci itu,
 * bukan tanggal baru yang belum disetujui. Filter status memastikan draft dan
 * yang dibatalkan tidak pernah tampil terkunci (INV-10), termasuk pada jeda
 * antara pembatalan dan cron `lepas_kunci_selesai` berikutnya.
 */
export async function kalenderTerkunci(
  periodeId: string,
  klien: TxKlien | typeof db = db,
): Promise<EntriKalender[]> {
  return klien.$queryRaw<EntriKalender[]>`
    SELECT
      'TERKUNCI'                                             AS jenis,
      p.id                                                   AS proker_id,
      p.nama                                                 AS nama_proker,
      d.id                                                   AS departemen_id,
      d.nama                                                 AS nama_departemen,
      to_char(lower(pl.rentang),        'YYYY-MM-DD')        AS mulai,
      to_char(upper(pl.rentang) - 1,    'YYYY-MM-DD')        AS selesai,
      to_char(p.tanggal_hari_h_mulai,   'YYYY-MM-DD')        AS hari_h_mulai,
      to_char(p.tanggal_hari_h_selesai, 'YYYY-MM-DD')        AS hari_h_selesai,
      u.nama_lengkap                                         AS penanggung_jawab,
      NULL::jsonb                                            AS pola_ulang
    FROM proker_lock pl
    JOIN proker p       ON p.id = pl.proker_id
    JOIN departemen d   ON d.id = p.departemen_id
    LEFT JOIN app_user u ON u.id = p.penanggung_jawab
    WHERE pl.periode_id = ${periodeId}::uuid
      AND p.status = ANY (${STATUS_MENGUNCI as unknown as string[]}::proker_status[])

    UNION ALL

    SELECT
      'BERKALA'                                              AS jenis,
      p.id, p.nama, d.id, d.nama,
      p.pola_ulang ->> 'mulai'                               AS mulai,
      p.pola_ulang ->> 'selesai'                             AS selesai,
      NULL, NULL,
      u.nama_lengkap,
      p.pola_ulang
    FROM proker p
    JOIN departemen d    ON d.id = p.departemen_id
    LEFT JOIN app_user u ON u.id = p.penanggung_jawab
    WHERE p.periode_id = ${periodeId}::uuid
      AND p.kategori = 'BERKALA'
      AND p.status = ANY (${STATUS_MENGUNCI as unknown as string[]}::proker_status[])
      AND p.pola_ulang IS NOT NULL

    ORDER BY mulai
  `;
}

// ---------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------

/**
 * Daftar proker satu periode.
 *
 * Seluruh filter opsional dan digabung dengan AND. Ditulis sebagai satu kueri
 * ber-`COALESCE` alih-alih rangkaian `Prisma.sql` bersyarat supaya rencana
 * eksekusinya tetap satu dan mudah dibaca ulang saat menelusuri lambatnya
 * halaman.
 *
 * `terkunci` diambil dari keberadaan baris `proker_lock`, bukan disimpulkan
 * dari status — status DISETUJUI pada proker BERKALA tidak mengunci apa pun.
 */
export async function daftarProker(
  periodeId: string,
  filter: FilterProker = {},
  klien: TxKlien | typeof db = db,
): Promise<RingkasProker[]> {
  return klien.$queryRaw<RingkasProker[]>`
    SELECT
      p.id, p.nama, p.kategori, p.status,
      p.departemen_id,
      d.nama                                                 AS nama_departemen,
      to_char(p.tanggal_mulai_persiapan, 'YYYY-MM-DD')       AS tanggal_mulai_persiapan,
      to_char(p.tanggal_hari_h_mulai,    'YYYY-MM-DD')       AS tanggal_hari_h_mulai,
      to_char(p.tanggal_hari_h_selesai,  'YYYY-MM-DD')       AS tanggal_hari_h_selesai,
      (pl.id IS NOT NULL)                                    AS terkunci
    FROM proker p
    JOIN departemen d       ON d.id = p.departemen_id
    LEFT JOIN proker_lock pl ON pl.proker_id = p.id
    WHERE p.periode_id = ${periodeId}::uuid
      AND (${filter.departemen_id ?? null}::uuid IS NULL OR p.departemen_id = ${filter.departemen_id ?? null}::uuid)
      AND (${filter.kategori ?? null}::text IS NULL OR p.kategori::text = ${filter.kategori ?? null}::text)
      AND (${filter.status ?? null}::text   IS NULL OR p.status::text   = ${filter.status ?? null}::text)
      AND (${filter.q ?? null}::text        IS NULL OR p.nama ILIKE '%' || ${filter.q ?? null}::text || '%')
    ORDER BY p.tanggal_hari_h_mulai NULLS LAST, p.nama
  `;
}

/** Satu proker beserta seluruh medannya, atau `null` bila tidak ada. */
export async function detailProker(
  id: string,
  klien: TxKlien | typeof db = db,
): Promise<DetailProker | null> {
  const baris = await klien.$queryRaw<DetailProker[]>`
    SELECT
      p.id, p.periode_id, p.nama, p.kategori, p.status,
      p.departemen_id,
      d.nama                                                 AS nama_departemen,
      p.deskripsi, p.tujuan, p.sasaran, p.estimasi_peserta,
      p.penanggung_jawab,
      u.nama_lengkap                                         AS nama_penanggung_jawab,
      to_char(p.tanggal_mulai_persiapan, 'YYYY-MM-DD')       AS tanggal_mulai_persiapan,
      to_char(p.tanggal_hari_h_mulai,    'YYYY-MM-DD')       AS tanggal_hari_h_mulai,
      to_char(p.tanggal_hari_h_selesai,  'YYYY-MM-DD')       AS tanggal_hari_h_selesai,
      p.pola_ulang,
      p.estimasi_anggaran::text                              AS estimasi_anggaran,
      p.sumber_dana,
      to_char(p.diajukan_at,  'YYYY-MM-DD"T"HH24:MI:SSOF')   AS diajukan_at,
      p.disetujui_oleh,
      to_char(p.disetujui_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')   AS disetujui_at,
      p.alasan_penolakan, p.dibuat_oleh,
      (pl.id IS NOT NULL)                                    AS terkunci
    FROM proker p
    JOIN departemen d        ON d.id = p.departemen_id
    LEFT JOIN app_user u     ON u.id = p.penanggung_jawab
    LEFT JOIN proker_lock pl ON pl.proker_id = p.id
    WHERE p.id = ${id}::uuid
  `;
  return baris[0] ?? null;
}

// ---------------------------------------------------------------------------
// Lingkup — tanda `*` pada PRD §5.1
// ---------------------------------------------------------------------------

/**
 * Menolak aksi yang menyentuh departemen di luar jangkauan pemanggil.
 *
 * `can()` sudah dipanggil guard sebelum ini, tetapi ia tidak tahu BARIS mana
 * yang sedang disentuh sehingga tidak dapat menegakkan tanda `*`. Di sinilah
 * batas itu diterapkan; RLS (015b) tetap menjaganya seandainya fungsi ini lupa
 * dipanggil.
 */
export function dalamLingkup(
  konteks: Konteks,
  permission: Permission,
  departemenId: string,
): boolean {
  const lingkup = lingkupUntuk(konteks.roles, permission);
  if (lingkup === null) return true;
  return konteks.departemenIds.includes(departemenId);
}

const DI_LUAR_LINGKUP: GagalProker = {
  ok: false,
  kode: 'DI_LUAR_LINGKUP',
  pesan: 'Proker ini bukan milik departemen Anda.',
};

// ---------------------------------------------------------------------------
// Mutasi — seluruhnya menerima `tx` (K-09)
// ---------------------------------------------------------------------------

/**
 * `tx` bukan opsional pada fungsi-fungsi di bawah, dan itu disengaja.
 *
 * Konteks audit dipasang `set_config(..., true)` yang bersifat transaction-local:
 * kueri yang berjalan di koneksi lain tidak pernah melihatnya, dan baris
 * auditnya terbentuk dengan IP serta user agent NULL tanpa satu pun error.
 * Menuntut `tx` di tanda tangan membuat kelalaian itu menjadi kesalahan tipe.
 */

function keIsu(e: unknown): { path: string; pesan: string }[] {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  return (issues ?? []).map((i) => ({ path: i.path.join('.'), pesan: i.message }));
}

/** Membentuk parameter tanggal: string 'YYYY-MM-DD' atau NULL, tanpa objek Date. */
function tgl(v: string | undefined): string | null {
  return v ?? null;
}

/**
 * Membuat proker baru berstatus DRAFT.
 *
 * Statusnya selalu DRAFT, tidak pernah diterima dari pemanggil: satu-satunya
 * jalan ke MENUNGGU_APPROVAL adalah pengajuan, dan ke DISETUJUI adalah
 * `setujui_proker`. Menerima `status` dari badan request akan membuat proker
 * dapat lahir langsung dalam keadaan disetujui — tanpa kunci kalender, sehingga
 * kalender pun tidak akan menyadarinya.
 */
export async function buatProker(
  tx: TxKlien,
  konteks: Konteks,
  input: unknown,
): Promise<Hasil<{ id: string }>> {
  const parsed = SkemaProker.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'TIDAK_VALID',
      pesan: 'Data proker belum lengkap atau tidak memenuhi aturan.',
      isu: keIsu(parsed.error),
    };
  }
  const v: InputProker = parsed.data;

  if (!konteks.periodeId) {
    return {
      ok: false,
      kode: 'TIDAK_ADA_PERIODE_AKTIF',
      pesan: 'Belum ada periode kepengurusan yang aktif.',
    };
  }
  if (!dalamLingkup(konteks, 'proker.create', v.departemen_id)) return DI_LUAR_LINGKUP;

  const baris = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO proker (
      periode_id, departemen_id, nama, kategori, status,
      deskripsi, tujuan, sasaran, estimasi_peserta, penanggung_jawab,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
      pola_ulang, estimasi_anggaran, sumber_dana, dibuat_oleh
    ) VALUES (
      ${konteks.periodeId}::uuid,
      ${v.departemen_id}::uuid,
      ${v.nama},
      ${v.kategori}::proker_kategori,
      'DRAFT',
      ${v.deskripsi ?? null},
      ${v.tujuan ?? null},
      ${v.sasaran ?? null},
      ${v.estimasi_peserta ?? null}::int,
      ${v.penanggung_jawab ?? null}::uuid,
      ${tgl(v.tanggal_mulai_persiapan)}::date,
      ${tgl(v.tanggal_hari_h_mulai)}::date,
      ${tgl(v.tanggal_hari_h_selesai)}::date,
      ${(v.pola_ulang ?? null) as Prisma.InputJsonValue | null}::jsonb,
      ${v.estimasi_anggaran ?? null}::numeric,
      ${v.sumber_dana ?? []}::text[],
      ${konteks.sesi.userId}::uuid
    )
    RETURNING id
  `;

  return { ok: true, nilai: { id: baris[0]!.id } };
}

/**
 * Mengubah proker.
 *
 * Perubahan digabung dengan baris tersimpan LEBIH DULU, baru divalidasi. Itu
 * bukan kenyamanan melainkan syarat: aturan durasi persiapan 15–45 hari
 * membandingkan dua tanggal, dan PATCH yang hanya mengirim salah satunya tidak
 * dapat diperiksa terhadap yang lain kecuali yang lain ikut dibaca. Memvalidasi
 * badan request apa adanya akan meloloskan perubahan yang memecah aturan itu,
 * dan penolakannya baru datang dari CHECK constraint sebagai error 500.
 *
 * Status TIDAK ikut berubah di sini. Klasifikasi minor/mayor beserta
 * konsekuensinya terhadap kunci kalender adalah T-071; fungsi ini sengaja
 * berhenti sebelum garis itu.
 */
export async function ubahProker(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  perubahan: Record<string, unknown>,
): Promise<Hasil<{ id: string }>> {
  const lama = await detailProker(id, tx);
  if (!lama) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Proker tidak ditemukan.' };
  }
  if (!dalamLingkup(konteks, 'proker.update', lama.departemen_id)) return DI_LUAR_LINGKUP;

  const gabungan = { ...bentukInput(lama), ...perubahan };
  const parsed = SkemaProker.safeParse(gabungan);
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'TIDAK_VALID',
      pesan: 'Perubahan tidak memenuhi aturan proker.',
      isu: keIsu(parsed.error),
    };
  }
  const v: InputProker = parsed.data;

  if (
    v.departemen_id !== lama.departemen_id &&
    !dalamLingkup(konteks, 'proker.update', v.departemen_id)
  ) {
    return DI_LUAR_LINGKUP;
  }

  await tx.$executeRaw`
    UPDATE proker SET
      departemen_id           = ${v.departemen_id}::uuid,
      nama                    = ${v.nama},
      kategori                = ${v.kategori}::proker_kategori,
      deskripsi               = ${v.deskripsi ?? null},
      tujuan                  = ${v.tujuan ?? null},
      sasaran                 = ${v.sasaran ?? null},
      estimasi_peserta        = ${v.estimasi_peserta ?? null}::int,
      penanggung_jawab        = ${v.penanggung_jawab ?? null}::uuid,
      tanggal_mulai_persiapan = ${tgl(v.tanggal_mulai_persiapan)}::date,
      tanggal_hari_h_mulai    = ${tgl(v.tanggal_hari_h_mulai)}::date,
      tanggal_hari_h_selesai  = ${tgl(v.tanggal_hari_h_selesai)}::date,
      pola_ulang              = ${(v.pola_ulang ?? null) as Prisma.InputJsonValue | null}::jsonb,
      estimasi_anggaran       = ${v.estimasi_anggaran ?? null}::numeric,
      sumber_dana             = ${v.sumber_dana ?? []}::text[],
      updated_at              = now()
    WHERE id = ${id}::uuid
  `;

  return { ok: true, nilai: { id } };
}

/**
 * Baris tersimpan → bentuk yang dimengerti `SkemaProker`.
 *
 * Medan yang NULL di database dibuang, bukan dikirim sebagai `null`: skema
 * menuliskan medan opsional sebagai `.optional()` (undefined), dan `null`
 * bukan nilai yang sah baginya. Perbedaan itu tidak terlihat sampai sebuah
 * PATCH atas proker BERKALA ditolak dengan alasan yang menunjuk medan yang
 * tidak disentuh siapa pun.
 */
function bentukInput(p: DetailProker): Record<string, unknown> {
  const keluar: Record<string, unknown> = {
    departemen_id: p.departemen_id,
    nama: p.nama,
    kategori: p.kategori,
  };
  const opsional: [string, unknown][] = [
    ['deskripsi', p.deskripsi],
    ['tujuan', p.tujuan],
    ['sasaran', p.sasaran],
    ['estimasi_peserta', p.estimasi_peserta],
    ['penanggung_jawab', p.penanggung_jawab],
    ['tanggal_mulai_persiapan', p.tanggal_mulai_persiapan],
    ['tanggal_hari_h_mulai', p.tanggal_hari_h_mulai],
    ['tanggal_hari_h_selesai', p.tanggal_hari_h_selesai],
    ['pola_ulang', p.pola_ulang],
    ['estimasi_anggaran', p.estimasi_anggaran === null ? null : Number(p.estimasi_anggaran)],
    ['sumber_dana', p.sumber_dana],
  ];
  for (const [k, nilai] of opsional) {
    if (nilai !== null && nilai !== undefined) keluar[k] = nilai;
  }
  return keluar;
}
