/**
 * service pengurus — Data Pengurus per periode (T-107). Server-only.
 *
 *   daftar   Kadept/Anggota (lingkup departemen) hanya departemennya; periode
 *            lain boleh dibuka baca saja (INV-08 — app bypass RLS, lingkup di sini)
 *   tulis    ADMIN/SEKUM (`pengurus.create|update|delete`)
 *   import   pratinjau → pemetaan → simpan dalam SATU transaksi beraudit
 *   export   Excel
 *
 * Tidak pernah membuat akun (kontrak "Jangan"). Baris yang NIM-nya sama dengan
 * akun pengguna ditautkan (`user_id`), sisanya tetap tanpa akun dan tetap dapat
 * dipakai untuk Surat Keterangan Aktif (ADR-012).
 *
 * Sumber: T-107 · PRD F-14.1 · USER_FLOW §9.1 · ADR-012, ADR-052
 */

import { Prisma } from '@prisma/client';

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { bacaTabel, parseTabel, type HasilParse, type Masalah, type StatusBaris } from '@/lib/import/parse-tabel';
import {
  KOLOM_IMPORT_PENGURUS,
  SkemaPengurus,
  skemaBarisPengurus,
  type DepartemenPilihan,
  type InputPengurus,
} from '@/lib/pengurus/skema';

if (typeof window !== 'undefined') {
  throw new Error('lib/pengurus/service.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export const BATAS_BARIS_IMPORT = 500;
export const BATAS_UKURAN_BERKAS = 2 * 1024 * 1024;

export type KodeGagalPengurus = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'NIM_TERDAFTAR' | 'FILE_TIDAK_VALID';
export const STATUS_GAGAL_PENGURUS: Record<KodeGagalPengurus, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  NIM_TERDAFTAR: 409,
  FILE_TIDAK_VALID: 422,
};
export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalPengurus; pesan: string };

export interface BarisPengurus {
  id: string;
  nama_lengkap: string;
  nim: string;
  jabatan: string;
  departemen_id: string | null;
  nama_departemen: string | null;
  angkatan: number | null;
  is_aktif: boolean;
  punya_akun: boolean;
}

export interface FilterPengurus {
  periode?: string;
  q?: string;
  departemen?: string;
  /** `aktif` (bawaan), `nonaktif`, atau `semua`. */
  status?: 'aktif' | 'nonaktif' | 'semua';
}

function lingkupDepartemen(konteks: Konteks): string[] | null {
  return lingkupKonteks(konteks, 'pengurus.read') === null ? null : konteks.departemenIds;
}

export async function daftarDepartemen(): Promise<DepartemenPilihan[]> {
  return db.departemen.findMany({ where: { is_active: true }, orderBy: { urutan: 'asc' }, select: { id: true, kode: true, nama: true } });
}

export async function daftarPengurusLengkap(konteks: Konteks, f: FilterPengurus = {}): Promise<BarisPengurus[]> {
  const dept = lingkupDepartemen(konteks);
  const where: Prisma.pengurusWhereInput = {
    periode_id: f.periode ?? konteks.periodeId,
    ...(f.status === 'semua' ? {} : { is_aktif: f.status !== 'nonaktif' }),
    ...(f.departemen ? { departemen_id: f.departemen } : {}),
    ...(dept ? { departemen_id: { in: dept } } : {}),
    ...(f.q?.trim()
      ? {
          OR: [
            { nama_lengkap: { contains: f.q.trim(), mode: 'insensitive' } },
            { nim: { contains: f.q.trim() } },
            { jabatan: { contains: f.q.trim(), mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  if (dept && f.departemen && !dept.includes(f.departemen)) return [];
  const baris = await db.pengurus.findMany({
    where,
    orderBy: [{ nama_lengkap: 'asc' }],
    take: 2000,
    select: {
      id: true,
      nama_lengkap: true,
      nim: true,
      jabatan: true,
      departemen_id: true,
      angkatan: true,
      is_aktif: true,
      user_id: true,
      departemen: { select: { nama: true } },
    },
  });
  return baris.map(({ user_id, departemen, ...b }) => ({ ...b, nama_departemen: departemen?.nama ?? null, punya_akun: user_id !== null }));
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

async function idAkun(tx: TxKlien, nim: string): Promise<string | null> {
  const u = await tx.app_user.findFirst({ where: { nim }, select: { id: true } });
  return u?.id ?? null;
}

export async function buatPengurus(tx: TxKlien, konteks: Konteks, body: unknown): Promise<Hasil<{ id: string }>> {
  const p = SkemaPengurus.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.' };
  const ada = await tx.pengurus.findFirst({ where: { periode_id: konteks.periodeId, nim: p.data.nim }, select: { nama_lengkap: true } });
  if (ada) return { ok: false, kode: 'NIM_TERDAFTAR', pesan: `NIM ${p.data.nim} sudah terdaftar atas nama ${ada.nama_lengkap} di periode ini.` };
  const r = await tx.pengurus.create({
    data: { ...p.data, periode_id: konteks.periodeId, user_id: await idAkun(tx, p.data.nim) },
    select: { id: true },
  });
  return { ok: true, nilai: r };
}

export async function ubahPengurus(tx: TxKlien, konteks: Konteks, id: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const p = SkemaPengurus.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.' };
  const lama = await tx.pengurus.findFirst({ where: { id, periode_id: konteks.periodeId }, select: { id: true } });
  if (!lama) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Pengurus tidak ditemukan.' };
  const kembar = await tx.pengurus.findFirst({ where: { periode_id: konteks.periodeId, nim: p.data.nim, NOT: { id } }, select: { nama_lengkap: true } });
  if (kembar) return { ok: false, kode: 'NIM_TERDAFTAR', pesan: `NIM ${p.data.nim} sudah dipakai ${kembar.nama_lengkap}.` };
  await tx.pengurus.update({ where: { id }, data: { ...p.data, user_id: await idAkun(tx, p.data.nim) } });
  return { ok: true, nilai: { id } };
}

/**
 * Menghapus baris pengurus. Surat yang sudah dibuat dari baris ini TIDAK ikut
 * terhapus atau berubah: surat menyimpan salinan nama/NIM/jabatan, bukan
 * rujukan ke baris ini.
 */
export async function hapusPengurus(tx: TxKlien, konteks: Konteks, id: string): Promise<Hasil<{ id: string }>> {
  const r = await tx.pengurus.deleteMany({ where: { id, periode_id: konteks.periodeId } });
  return r.count ? { ok: true, nilai: { id } } : { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Pengurus tidak ditemukan.' };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export async function bacaBerkasPengurus(nama: string, isi: Buffer): Promise<Hasil<string[][]>> {
  if (isi.byteLength === 0) return { ok: false, kode: 'FILE_TIDAK_VALID', pesan: 'Berkas kosong.' };
  if (isi.byteLength > BATAS_UKURAN_BERKAS) return { ok: false, kode: 'FILE_TIDAK_VALID', pesan: 'Berkas lebih dari 2 MB.' };
  try {
    const m = await bacaTabel(nama, isi);
    if (m.length < 2) return { ok: false, kode: 'FILE_TIDAK_VALID', pesan: 'Berkas tidak memuat baris data di bawah judul kolom.' };
    return { ok: true, nilai: m };
  } catch (e) {
    const pesan =
      e instanceof Error && e.message.startsWith('Format berkas')
        ? e.message
        : 'Berkas tidak dapat dibaca. Pastikan formatnya CSV atau XLSX yang tidak rusak.';
    return { ok: false, kode: 'FILE_TIDAK_VALID', pesan };
  }
}

export interface BarisPratinjauPengurus {
  nomor: number;
  status: StatusBaris;
  masalah: Masalah[];
  sel: string[];
  /** NIM sudah ada di Data Pengurus periode ini: dilewati bawaan, atau memperbarui bila tidak dilewati. */
  terdaftar: boolean;
}

export interface PratinjauImportPengurus {
  header: string[];
  peta: Record<string, number>;
  takDikenal: string[];
  hilang: string[];
  ringkas: HasilParse<unknown>['ringkas'];
  baris: BarisPratinjauPengurus[];
  terpotong: boolean;
}

async function susun(klien: TxKlien | typeof db, konteks: Konteks, matriks: string[][], petaManual?: Record<string, number>) {
  const departemen = await klien.departemen.findMany({ where: { is_active: true }, select: { id: true, kode: true, nama: true } });
  const skema = skemaBarisPengurus(departemen);
  const ada = await klien.pengurus.findMany({ where: { periode_id: konteks.periodeId }, select: { id: true, nim: true } });
  const nimAda = new Map(ada.map((a) => [a.nim, a.id]));
  const terdaftar = new Set<number>();
  const hasil = parseTabel<InputPengurus>(matriks, KOLOM_IMPORT_PENGURUS, skema, {
    petaManual,
    kunciUnik: 'nim',
    batasBaris: BATAS_BARIS_IMPORT,
    sudahAda: (nim) => nimAda.has(nim),
    periksaTambahan: (d, nomor) => {
      if (nimAda.has(d.nim)) terdaftar.add(nomor);
      return [];
    },
  });
  return { hasil, terdaftar, nimAda };
}

export async function pratinjauImportPengurus(
  konteks: Konteks,
  matriks: string[][],
  petaManual?: Record<string, number>,
): Promise<PratinjauImportPengurus> {
  const { hasil, terdaftar } = await susun(db, konteks, matriks, petaManual);
  return {
    header: matriks[0] ?? [],
    peta: hasil.peta,
    takDikenal: hasil.takDikenal,
    hilang: hasil.hilang,
    ringkas: hasil.ringkas,
    baris: hasil.baris.map((b) => ({ nomor: b.nomor, status: b.status, masalah: b.masalah, sel: matriks[b.nomor - 1] ?? [], terdaftar: terdaftar.has(b.nomor) })),
    terpotong: matriks.length - 1 > BATAS_BARIS_IMPORT,
  };
}

export interface LaporanImportPengurus {
  baru: number;
  diperbarui: number;
  dilewati: { nomor: number; alasan: string }[];
}

/**
 * Menyimpan hasil import dalam SATU transaksi pemanggil: semua tersimpan atau
 * tidak sama sekali. Baris ERROR selalu dilewati; baris yang dicentang
 * "lewati" dilewati; baris ber-NIM terdaftar yang TIDAK dilewati memperbarui
 * baris lama (tak pernah menabrak constraint unik periode+NIM).
 */
export async function simpanImportPengurus(
  tx: TxKlien,
  konteks: Konteks,
  matriks: string[][],
  opsi: { petaManual?: Record<string, number>; lewati?: number[] },
): Promise<Hasil<LaporanImportPengurus>> {
  const { hasil, nimAda } = await susun(tx, konteks, matriks, opsi.petaManual);
  if (hasil.hilang.length) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: `Kolom wajib belum dipetakan: ${hasil.hilang.join(', ')}.` };

  const lewati = new Set(opsi.lewati ?? []);
  const laporan: LaporanImportPengurus = { baru: 0, diperbarui: 0, dilewati: [] };
  const akun = new Map(
    (
      await tx.app_user.findMany({
        where: { nim: { in: hasil.baris.flatMap((b) => (b.data ? [b.data.nim] : [])) } },
        select: { id: true, nim: true },
      })
    ).map((u) => [u.nim, u.id]),
  );
  // Duplikat di dalam berkas: baris terakhir yang menang (pratinjau sudah memperingatkan).
  const baru = new Map<string, { data: InputPengurus; nomor: number }>();

  for (const b of hasil.baris) {
    if (b.status === 'ERROR' || !b.data) {
      laporan.dilewati.push({ nomor: b.nomor, alasan: b.masalah[0]?.pesan ?? 'Baris tidak valid.' });
      continue;
    }
    if (lewati.has(b.nomor)) {
      laporan.dilewati.push({ nomor: b.nomor, alasan: 'Dilewati.' });
      continue;
    }
    const idLama = nimAda.get(b.data.nim);
    if (idLama) {
      await tx.pengurus.update({ where: { id: idLama }, data: { ...b.data, user_id: akun.get(b.data.nim) ?? null } });
      laporan.diperbarui++;
    } else {
      const sebelumnya = baru.get(b.data.nim);
      if (sebelumnya) {
        laporan.dilewati.push({ nomor: sebelumnya.nomor, alasan: `NIM ${b.data.nim} ganda di berkas — dipakai baris ${b.nomor}.` });
      }
      baru.set(b.data.nim, { data: b.data, nomor: b.nomor });
    }
  }
  if (baru.size) {
    await tx.pengurus.createMany({
      data: [...baru.values()].map(({ data: d }) => ({ ...d, periode_id: konteks.periodeId, user_id: akun.get(d.nim) ?? null })),
    });
  }
  laporan.baru = baru.size;
  return { ok: true, nilai: laporan };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Nilai berawalan = + - @ dinetralkan supaya tidak dijalankan Excel sebagai rumus. */
const aman = (s: string | null | undefined) => {
  const v = s ?? '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
};

export async function exportPengurusXlsx(baris: BarisPengurus[], judul: string): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HMIF Center';
  const ws = wb.addWorksheet('Data Pengurus', { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.addRow([judul]);
  ws.mergeCells(1, 1, 1, 8);
  ws.getRow(1).font = { bold: true, size: 13 };
  const kepala = ws.addRow(['No', 'Nama Lengkap', 'NIM', 'Jabatan', 'Departemen', 'Angkatan', 'Status', 'Akun']);
  kepala.font = { bold: true };
  baris.forEach((b, i) =>
    ws.addRow([
      i + 1,
      aman(b.nama_lengkap),
      b.nim,
      aman(b.jabatan),
      aman(b.nama_departemen ?? '—'),
      b.angkatan ?? '',
      b.is_aktif ? 'Aktif' : 'Nonaktif',
      b.punya_akun ? 'Ya' : 'Tidak',
    ]),
  );
  [5, 34, 16, 32, 24, 10, 10, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  // NIM sebagai teks: Excel mengubah 3337220011 menjadi 3,34E+09 bila angka.
  ws.getColumn(3).numFmt = '@';
  return Buffer.from(await wb.xlsx.writeBuffer());
}
