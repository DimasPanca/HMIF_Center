/**
 * Import massal pengguna (T-048) — pratinjau tanpa menulis, lalu simpan per baris.
 * SERVER-ONLY.
 *
 * ===========================================================================
 * PER BARIS, BUKAN SATU TRANSAKSI UNTUK SELURUH BERKAS (ADR-054 butir 2)
 * ===========================================================================
 * Setiap undangan membuat akun Supabase Auth lewat HTTP sebelum baris
 * `app_user` ditulis (lihat `undang()`). Satu transaksi Postgres untuk seratus
 * baris tidak dapat membatalkan seratus akun auth itu: kegagalan di baris ke-50
 * akan menggulung balik 49 `app_user` dan meninggalkan 49 akun auth yatim.
 *
 * Karena itu setiap baris adalah satu unit — satu `withAuditContext`, dengan
 * kompensasi akun auth yang sudah ada di `undang()` — dan hasilnya dilaporkan
 * per NOMOR BARIS BERKAS: berhasil (beserta tautannya), gagal (beserta
 * alasannya), atau dilewati. Kontrak T-048 butir 3 memang menuntut ini: baris
 * bermasalah dilewati satuan, sisanya tetap diimpor.
 *
 * ===========================================================================
 * BERKAS DIBACA ULANG SAAT KONFIRMASI
 * ===========================================================================
 * Konfirmasi mengirim BERKAS yang sama plus nomor baris yang dilewati — bukan
 * data baris hasil pratinjau. Server mem-parse ulang dengan aturan yang sama,
 * sehingga yang disimpan tidak pernah berupa data yang disunting di browser.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-048 · PRD F-1.2 · ADR-054 · USER_FLOW §9.1
 */

import { z } from 'zod';

import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import {
  bacaTabel,
  parseTabel,
  type HasilParse,
  type Masalah,
  type StatusBaris,
} from '@/lib/import/parse-tabel';

import type { Konteks } from './guard';
import { undang } from './invitation';
import { ROLES, type RoleCode } from './permissions';
import { KOLOM_IMPORT_PENGGUNA, SkemaUndang, type InputUndang } from './skema-pengguna';

/** Batas per berkas. Tiap baris memanggil Admin API Supabase; 200 baris ≈ < 60 detik. */
export const BATAS_BARIS_IMPORT = 200;
export const BATAS_UKURAN_BERKAS = 2 * 1024 * 1024;

export { KOLOM_IMPORT_PENGGUNA };

// ---------------------------------------------------------------------------
// Hasil
// ---------------------------------------------------------------------------

export type KodeGagalImport = 'FILE_TIDAK_VALID' | 'TIDAK_VALID';
export const STATUS_GAGAL_IMPORT: Record<KodeGagalImport, number> = {
  FILE_TIDAK_VALID: 422,
  TIDAK_VALID: 422,
};
export type HasilImport<T> =
  | { ok: true; nilai: T }
  | { ok: false; kode: KodeGagalImport; pesan: string };

export interface BarisPratinjau {
  nomor: number;
  status: StatusBaris;
  masalah: Masalah[];
  /** Isi sel mentah, supaya baris ERROR pun dapat dikenali di pratinjau. */
  sel: string[];
  /** NIM/email sudah ada di sistem: `undang()` pasti menolaknya. */
  terdaftar: boolean;
}

export interface PratinjauImport {
  header: string[];
  peta: Record<string, number>;
  takDikenal: string[];
  hilang: string[];
  ringkas: HasilParse<unknown>['ringkas'];
  baris: BarisPratinjau[];
  /** Berkas memuat lebih dari BATAS_BARIS_IMPORT baris data; sisanya tidak dibaca. */
  terpotong: boolean;
}

export interface LaporanImport {
  berhasil: { nomor: number; nama_lengkap: string; email: string; tautan: string; kedaluwarsa: string }[];
  gagal: { nomor: number; nama_lengkap: string; email: string; pesan: string }[];
  dilewati: { nomor: number; alasan: string }[];
}

/** Menjalankan satu unit kerja dalam transaksi berkonteks audit (K-09). */
export type Jalankan = <T>(fn: (tx: TxKlien) => Promise<T>) => Promise<T>;

// ---------------------------------------------------------------------------
// Teks sel → bentuk undangan
// ---------------------------------------------------------------------------

const normal = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');

const ALIAS_PERAN: Record<string, RoleCode> = {
  admin: 'ADMIN',
  ketua: 'KETUA',
  'ketua himpunan': 'KETUA',
  'ketua umum': 'KETUA',
  wakil: 'WAKIL',
  'wakil ketua': 'WAKIL',
  wakahim: 'WAKIL',
  sekum: 'SEKUM',
  sekretaris: 'SEKUM',
  'sekretaris umum': 'SEKUM',
  bendum: 'BENDUM',
  bendahara: 'BENDUM',
  'bendahara umum': 'BENDUM',
  kadept: 'KADEPT',
  kadep: 'KADEPT',
  'kepala departemen': 'KADEPT',
  anggota: 'ANGGOTA',
  'anggota departemen': 'ANGGOTA',
  staf: 'ANGGOTA',
  staff: 'ANGGOTA',
  bph: 'BPH',
  'badan pengurus harian': 'BPH',
};

const PERAN_BERDEPARTEMEN: readonly RoleCode[] = ['KADEPT', 'ANGGOTA'];

function kePeran(teks: string): RoleCode | null {
  const n = normal(teks);
  if (ALIAS_PERAN[n]) return ALIAS_PERAN[n];
  const kode = n.toUpperCase().replace(/ /g, '_');
  return (ROLES as readonly string[]).includes(kode) ? (kode as RoleCode) : null;
}

export interface DepartemenImport {
  id: string;
  kode: string;
  nama: string;
}

/**
 * Skema satu baris berkas: teks sel → `InputUndang`, lalu divalidasi
 * `SkemaUndang` yang sama dengan form undangan satuan (K-04).
 */
export function skemaBarisPengguna(departemen: DepartemenImport[]) {
  const petaDept = new Map<string, string>();
  for (const d of departemen) {
    petaDept.set(normal(d.kode), d.id);
    petaDept.set(normal(d.nama), d.id);
  }

  return z
    .object({
      nama_lengkap: z.string(),
      nim: z.string(),
      email: z.string(),
      angkatan: z.string(),
      peran: z.string(),
      departemen: z.string(),
      no_hp: z.string(),
    })
    .transform((m, ctx): z.input<typeof SkemaUndang> => {
      const bagian = m.peran.split(/[,;/+]/).map((s) => s.trim()).filter(Boolean);
      if (!bagian.length) {
        ctx.addIssue({ code: 'custom', path: ['peran'], message: 'Peran wajib diisi.' });
        return z.NEVER;
      }
      const roles: RoleCode[] = [];
      for (const b of bagian) {
        const r = kePeran(b);
        if (!r) {
          ctx.addIssue({ code: 'custom', path: ['peran'], message: `Peran "${b}" tidak dikenali.` });
          return z.NEVER;
        }
        roles.push(r);
      }

      let departemenId: string | undefined;
      if (m.departemen) {
        departemenId = petaDept.get(normal(m.departemen.replace(/^departemen\s+/i, '')));
        if (!departemenId) {
          ctx.addIssue({
            code: 'custom',
            path: ['departemen'],
            message: `Departemen "${m.departemen}" tidak dikenali. Pakai kode atau nama departemen.`,
          });
          return z.NEVER;
        }
      }

      if (m.angkatan && !/^\d{4}$/.test(m.angkatan)) {
        ctx.addIssue({ code: 'custom', path: ['angkatan'], message: 'Angkatan harus tahun 4 digit.' });
        return z.NEVER;
      }

      return {
        nama_lengkap: m.nama_lengkap,
        nim: m.nim,
        email: m.email,
        angkatan: m.angkatan ? Number(m.angkatan) : undefined,
        no_hp: m.no_hp || undefined,
        roles: roles.map((role) =>
          PERAN_BERDEPARTEMEN.includes(role) ? { role, departemen_id: departemenId } : { role },
        ),
      };
    })
    .pipe(SkemaUndang);
}

// ---------------------------------------------------------------------------
// Baca berkas
// ---------------------------------------------------------------------------

export async function bacaBerkasImport(nama: string, isi: Buffer): Promise<HasilImport<string[][]>> {
  if (isi.byteLength === 0) return { ok: false, kode: 'FILE_TIDAK_VALID', pesan: 'Berkas kosong.' };
  if (isi.byteLength > BATAS_UKURAN_BERKAS) {
    return { ok: false, kode: 'FILE_TIDAK_VALID', pesan: 'Berkas lebih dari 2 MB.' };
  }
  try {
    const matriks = await bacaTabel(nama, isi);
    if (matriks.length < 2) {
      return { ok: false, kode: 'FILE_TIDAK_VALID', pesan: 'Berkas tidak memuat baris data di bawah judul kolom.' };
    }
    return { ok: true, nilai: matriks };
  } catch (e) {
    const pesan = e instanceof Error && e.message.startsWith('Format berkas')
      ? e.message
      : 'Berkas tidak dapat dibaca. Pastikan formatnya CSV atau XLSX yang tidak rusak.';
    return { ok: false, kode: 'FILE_TIDAK_VALID', pesan };
  }
}

// ---------------------------------------------------------------------------
// Pratinjau — HANYA MEMBACA
// ---------------------------------------------------------------------------

interface Susunan {
  hasil: HasilParse<InputUndang>;
  terdaftar: Set<number>;
}

async function susun(
  matriks: string[][],
  petaManual: Record<string, number> | undefined,
  klien: TxKlien | typeof db,
): Promise<Susunan> {
  const departemen = await klien.$queryRaw<DepartemenImport[]>`
    SELECT id, kode, nama FROM departemen WHERE is_active`;
  const skema = skemaBarisPengguna(departemen);
  const opsiDasar = { petaManual, kunciUnik: 'nim', batasBaris: BATAS_BARIS_IMPORT };

  // Lintasan pertama mengumpulkan NIM & email yang sah untuk satu kueri duplikat.
  const awal = parseTabel(matriks, KOLOM_IMPORT_PENGGUNA, skema, opsiDasar);
  const sah = awal.baris.flatMap((b) => (b.data ? [b.data] : []));
  const nims = sah.map((d) => d.nim);
  const emails = sah.map((d) => d.email);

  const ada = nims.length
    ? await klien.$queryRaw<{ nim: string; email: string }[]>`
        SELECT nim, lower(email) AS email FROM app_user
        WHERE nim = ANY(${nims}::text[]) OR lower(email) = ANY(${emails}::text[])`
    : [];
  const nimAda = new Set(ada.map((a) => a.nim));
  const emailAda = new Set(ada.map((a) => a.email));

  const hitungEmail = new Map<string, number>();
  for (const e of emails) hitungEmail.set(e, (hitungEmail.get(e) ?? 0) + 1);

  const terdaftar = new Set<number>();
  const hasil = parseTabel(matriks, KOLOM_IMPORT_PENGGUNA, skema, {
    ...opsiDasar,
    sudahAda: (nim) => nimAda.has(nim),
    periksaTambahan: (d, nomor) => {
      const masalah: Masalah[] = [];
      if ((hitungEmail.get(d.email) ?? 0) > 1) {
        masalah.push({
          tingkat: 'PERINGATAN',
          kolom: 'email',
          pesan: `Email "${d.email}" muncul ${hitungEmail.get(d.email)} kali di berkas ini.`,
        });
      }
      if (emailAda.has(d.email)) {
        masalah.push({ tingkat: 'PERINGATAN', kolom: 'email', pesan: `Email "${d.email}" sudah terdaftar di sistem.` });
      }
      if (nimAda.has(d.nim) || emailAda.has(d.email)) terdaftar.add(nomor);
      return masalah;
    },
  });

  return { hasil, terdaftar };
}

/** Pratinjau import. Tidak menulis apa pun — hanya dua kueri baca. */
export async function pratinjauImportPengguna(
  matriks: string[][],
  opsi: { petaManual?: Record<string, number> } = {},
  klien: TxKlien | typeof db = db,
): Promise<PratinjauImport> {
  const { hasil, terdaftar } = await susun(matriks, opsi.petaManual, klien);
  return {
    header: matriks[0] ?? [],
    peta: hasil.peta,
    takDikenal: hasil.takDikenal,
    hilang: hasil.hilang,
    ringkas: hasil.ringkas,
    baris: hasil.baris.map((b) => ({
      nomor: b.nomor,
      status: b.status,
      masalah: b.masalah,
      sel: matriks[b.nomor - 1] ?? [],
      terdaftar: terdaftar.has(b.nomor),
    })),
    terpotong: matriks.length - 1 > BATAS_BARIS_IMPORT,
  };
}

// ---------------------------------------------------------------------------
// Simpan — setelah konfirmasi
// ---------------------------------------------------------------------------

/** Setelah sekian kegagalan sistem beruntun, sisa baris tidak dicoba (layanan kemungkinan mati). */
const BATAS_GALAT_BERUNTUN = 3;

export async function simpanImportPengguna(
  jalankan: Jalankan,
  konteks: Konteks,
  matriks: string[][],
  opsi: { petaManual?: Record<string, number>; lewati?: number[] },
  asalUrl: string,
  klien: TxKlien | typeof db = db,
): Promise<HasilImport<LaporanImport>> {
  const { hasil } = await susun(matriks, opsi.petaManual, klien);
  if (hasil.hilang.length) {
    return {
      ok: false,
      kode: 'TIDAK_VALID',
      pesan: `Kolom wajib belum dipetakan: ${hasil.hilang.join(', ')}.`,
    };
  }

  const lewati = new Set(opsi.lewati ?? []);
  const laporan: LaporanImport = { berhasil: [], gagal: [], dilewati: [] };
  let galatBeruntun = 0;

  for (const b of hasil.baris) {
    if (b.status === 'ERROR' || !b.data) {
      laporan.dilewati.push({ nomor: b.nomor, alasan: b.masalah[0]?.pesan ?? 'Baris tidak valid.' });
      continue;
    }
    if (lewati.has(b.nomor)) {
      laporan.dilewati.push({ nomor: b.nomor, alasan: 'Dilewati oleh Admin.' });
      continue;
    }
    const identitas = { nomor: b.nomor, nama_lengkap: b.data.nama_lengkap, email: b.data.email };
    if (galatBeruntun >= BATAS_GALAT_BERUNTUN) {
      laporan.gagal.push({ ...identitas, pesan: 'Tidak dicoba: layanan tidak merespons pada baris-baris sebelumnya.' });
      continue;
    }

    const data = b.data;
    try {
      const h = await jalankan((tx) => undang(tx, konteks, data, asalUrl));
      galatBeruntun = 0;
      if (h.ok) laporan.berhasil.push({ ...identitas, tautan: h.nilai.tautan, kedaluwarsa: h.nilai.kedaluwarsa });
      else laporan.gagal.push({ ...identitas, pesan: h.pesan });
    } catch {
      galatBeruntun++;
      laporan.gagal.push({
        ...identitas,
        pesan: 'Kesalahan sistem saat menyimpan baris ini. Baris lain tidak terpengaruh; coba impor ulang baris ini.',
      });
    }
  }

  return { ok: true, nilai: laporan };
}
