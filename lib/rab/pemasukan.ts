/**
 * service PEMASUKAN & data peserta (T-092, PRD F-9.4). Server-only.
 *
 *   baca   sama dengan angka RAB (lib/acara/service.ts `boleh_rab`): pimpinan,
 *          Kadept PIC, panitia acara — data keuangan, bukan untuk semua
 *   tulis  Admin & Bendum, atau panitia acara itu (koordinator/anggota divisi,
 *          Ketua Pelaksana) dengan role non-BPH pada periode aktif —
 *          cermin RLS pemasukan_/peserta_insert|update (`my_kepanitiaan()`)
 *   hapus  Admin & Bendum saja — cermin RLS pemasukan_/peserta_delete
 *
 * Nomor urut dirapatkan setelah hapus (UNIQUE kepanitiaan_id, no_urut).
 * Import peserta memakai parse-tabel (T-048): NIM yang sudah terdaftar
 * MEMPERBARUI barisnya (impor ulang = perbarui status bayar), sisanya ditambah.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-092 · PRD F-9.4 · 015b pemasukan_*, peserta_*
 */

import { muatAcara } from '@/lib/acara/service';
import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { bacaTabel, parseTabel, type HasilParse, type Masalah, type StatusBaris } from '@/lib/import/parse-tabel';
import {
  KOLOM_IMPORT_PESERTA,
  SkemaPeserta,
  SkemaSumberDana,
  ringkasPeserta,
  skemaBarisPeserta,
  type BarisPeserta,
  type BarisSumberDana,
  type InputPeserta,
  type RingkasPeserta,
} from '@/lib/rab/pemasukan-skema';

if (typeof window !== 'undefined') {
  throw new Error('lib/rab/pemasukan.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

type Klien = TxKlien | typeof db;

export type KodeGagalPemasukan = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'FILE_TIDAK_VALID';
export const STATUS_GAGAL_PEMASUKAN: Record<KodeGagalPemasukan, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  FILE_TIDAK_VALID: 422,
};
export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalPemasukan; pesan: string };
const gagal = (kode: KodeGagalPemasukan, pesan: string): Hasil<never> => ({ ok: false, kode, pesan });

export const BATAS_BARIS_PESERTA = 2_000;
export const BATAS_BERKAS_PESERTA = 2 * 1024 * 1024;

export interface IzinPemasukan {
  tulis: boolean;
  hapus: boolean;
}

export interface DataPemasukan {
  kepanitiaan_id: string;
  nama_acara: string;
  sumber: BarisSumberDana[];
  peserta: BarisPeserta[];
  ringkas: RingkasPeserta;
  izin: IzinPemasukan;
}

async function izinPemasukan(k: Klien, konteks: Konteks, kepanitiaanId: string): Promise<IzinPemasukan> {
  const kp = await k.kepanitiaan.findUnique({
    where: { id: kepanitiaanId },
    select: {
      ketua_pelaksana: true,
      proker: { select: { periode_id: true } },
      divisi: { select: { koordinator_id: true, divisi_member: { select: { user_id: true } } } },
    },
  });
  if (!kp || kp.proker.periode_id !== konteks.periodeId) return { tulis: false, hapus: false };
  const keuangan = konteks.roles.includes('ADMIN') || konteks.roles.includes('BENDUM');
  const saya = konteks.sesi.userId;
  const panitia =
    konteks.roles.some((r) => r !== 'BPH') &&
    (kp.ketua_pelaksana === saya || kp.divisi.some((d) => d.koordinator_id === saya || d.divisi_member.some((m) => m.user_id === saya)));
  return { tulis: keuangan || panitia, hapus: keuangan };
}

/** null = acara tidak ada/tidak terlihat (404); 'TERBATAS' = angka keuangannya bukan hak (403). */
export async function muatPemasukan(konteks: Konteks, kepanitiaanId: string): Promise<DataPemasukan | 'TERBATAS' | null> {
  const acara = await muatAcara(konteks, kepanitiaanId);
  if (!acara) return null;
  if (!acara.boleh_rab) return 'TERBATAS';
  const [sumber, peserta, izin] = await Promise.all([
    db.pemasukan.findMany({ where: { kepanitiaan_id: kepanitiaanId }, orderBy: { no_urut: 'asc' }, select: { id: true, no_urut: true, keterangan: true, saldo: true } }),
    db.peserta.findMany({
      where: { kepanitiaan_id: kepanitiaanId },
      orderBy: { no_urut: 'asc' },
      select: { id: true, no_urut: true, nama_lengkap: true, nim: true, sudah_bayar: true, tanggal_bayar: true, jumlah: true },
    }),
    izinPemasukan(db, konteks, kepanitiaanId),
  ]);
  const rows: BarisPeserta[] = peserta.map((p) => ({
    ...p,
    tanggal_bayar: p.tanggal_bayar ? p.tanggal_bayar.toISOString().slice(0, 10) : null,
    jumlah: Number(p.jumlah),
  }));
  return {
    kepanitiaan_id: kepanitiaanId,
    nama_acara: acara.nama_acara,
    sumber: sumber.map((s) => ({ ...s, saldo: Number(s.saldo) })),
    peserta: rows,
    ringkas: ringkasPeserta(rows),
    izin,
  };
}

async function wajibIzin(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, hak: keyof IzinPemasukan): Promise<Hasil<true>> {
  const i = await izinPemasukan(tx, konteks, kepanitiaanId);
  if (i[hak]) return { ok: true, nilai: true };
  return gagal('TIDAK_BERWENANG', hak === 'hapus' ? 'Menghapus data pemasukan hanya untuk Bendahara atau Admin.' : 'Data pemasukan diubah panitia acara ini, Bendahara, atau Admin.');
}

const pesanZod = (issues: { message: string }[]) => issues[0]?.message ?? 'Isian tidak valid.';

/** Merapatkan nomor urut setelah hapus — dua langkah supaya UNIQUE tidak bertabrakan. */
async function rapatkan(tx: TxKlien, tabel: 'pemasukan' | 'peserta', kepanitiaanId: string, dari: number) {
  if (tabel === 'pemasukan') {
    await tx.$executeRaw`UPDATE pemasukan SET no_urut = -no_urut WHERE kepanitiaan_id = ${kepanitiaanId}::uuid AND no_urut > ${dari}`;
    await tx.$executeRaw`UPDATE pemasukan SET no_urut = -no_urut - 1 WHERE kepanitiaan_id = ${kepanitiaanId}::uuid AND no_urut < 0`;
  } else {
    await tx.$executeRaw`UPDATE peserta SET no_urut = -no_urut WHERE kepanitiaan_id = ${kepanitiaanId}::uuid AND no_urut > ${dari}`;
    await tx.$executeRaw`UPDATE peserta SET no_urut = -no_urut - 1 WHERE kepanitiaan_id = ${kepanitiaanId}::uuid AND no_urut < 0`;
  }
}

// ---------------------------------------------------------------------------
// Sumber dana
// ---------------------------------------------------------------------------

export async function tambahSumber(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const izin = await wajibIzin(tx, konteks, kepanitiaanId, 'tulis');
  if (!izin.ok) return izin;
  const p = SkemaSumberDana.safeParse(body);
  if (!p.success) return gagal('VALIDASI_GAGAL', pesanZod(p.error.issues));
  const akhir = await tx.pemasukan.aggregate({ where: { kepanitiaan_id: kepanitiaanId }, _max: { no_urut: true } });
  const r = await tx.pemasukan.create({ data: { kepanitiaan_id: kepanitiaanId, no_urut: (akhir._max.no_urut ?? 0) + 1, ...p.data }, select: { id: true } });
  return { ok: true, nilai: r };
}

export async function ubahSumber(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, id: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const izin = await wajibIzin(tx, konteks, kepanitiaanId, 'tulis');
  if (!izin.ok) return izin;
  const p = SkemaSumberDana.safeParse(body);
  if (!p.success) return gagal('VALIDASI_GAGAL', pesanZod(p.error.issues));
  const r = await tx.pemasukan.updateMany({ where: { id, kepanitiaan_id: kepanitiaanId }, data: p.data });
  return r.count ? { ok: true, nilai: { id } } : gagal('TIDAK_DITEMUKAN', 'Sumber dana tidak ditemukan.');
}

export async function hapusSumber(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, id: string): Promise<Hasil<{ id: string }>> {
  const izin = await wajibIzin(tx, konteks, kepanitiaanId, 'hapus');
  if (!izin.ok) return izin;
  const lama = await tx.pemasukan.findFirst({ where: { id, kepanitiaan_id: kepanitiaanId }, select: { no_urut: true } });
  if (!lama) return gagal('TIDAK_DITEMUKAN', 'Sumber dana tidak ditemukan.');
  await tx.pemasukan.delete({ where: { id } });
  await rapatkan(tx, 'pemasukan', kepanitiaanId, lama.no_urut);
  return { ok: true, nilai: { id } };
}

// ---------------------------------------------------------------------------
// Peserta
// ---------------------------------------------------------------------------

const tanggalDb = (t: string | null) => (t ? new Date(`${t}T00:00:00Z`) : null);

export async function tambahPeserta(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const izin = await wajibIzin(tx, konteks, kepanitiaanId, 'tulis');
  if (!izin.ok) return izin;
  const p = SkemaPeserta.safeParse(body);
  if (!p.success) return gagal('VALIDASI_GAGAL', pesanZod(p.error.issues));
  if (p.data.nim) {
    const ada = await tx.peserta.findFirst({ where: { kepanitiaan_id: kepanitiaanId, nim: p.data.nim }, select: { nama_lengkap: true } });
    if (ada) return gagal('VALIDASI_GAGAL', `NIM ${p.data.nim} sudah terdaftar atas nama ${ada.nama_lengkap}.`);
  }
  const akhir = await tx.peserta.aggregate({ where: { kepanitiaan_id: kepanitiaanId }, _max: { no_urut: true } });
  const r = await tx.peserta.create({
    data: { kepanitiaan_id: kepanitiaanId, no_urut: (akhir._max.no_urut ?? 0) + 1, ...p.data, tanggal_bayar: tanggalDb(p.data.tanggal_bayar) },
    select: { id: true },
  });
  return { ok: true, nilai: r };
}

export async function ubahPeserta(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, id: string, body: unknown): Promise<Hasil<BarisPeserta>> {
  const izin = await wajibIzin(tx, konteks, kepanitiaanId, 'tulis');
  if (!izin.ok) return izin;
  const lama = await tx.peserta.findFirst({ where: { id, kepanitiaan_id: kepanitiaanId } });
  if (!lama) return gagal('TIDAK_DITEMUKAN', 'Peserta tidak ditemukan.');
  // PATCH sebagian: digabung dengan nilai lama, lalu divalidasi sebagai satu baris utuh.
  const gabung = {
    nama_lengkap: lama.nama_lengkap,
    nim: lama.nim,
    sudah_bayar: lama.sudah_bayar,
    tanggal_bayar: lama.tanggal_bayar ? lama.tanggal_bayar.toISOString().slice(0, 10) : null,
    jumlah: Number(lama.jumlah),
    ...(typeof body === 'object' && body ? body : {}),
  } as Record<string, unknown>;
  // Status dicentang "belum" → tanggal bayar ikut dikosongkan, supaya baris tetap konsisten.
  if (gabung.sudah_bayar === false) gabung.tanggal_bayar = null;
  const p = SkemaPeserta.safeParse(gabung);
  if (!p.success) return gagal('VALIDASI_GAGAL', pesanZod(p.error.issues));
  if (p.data.nim && p.data.nim !== lama.nim) {
    const kembar = await tx.peserta.findFirst({ where: { kepanitiaan_id: kepanitiaanId, nim: p.data.nim, NOT: { id } }, select: { nama_lengkap: true } });
    if (kembar) return gagal('VALIDASI_GAGAL', `NIM ${p.data.nim} sudah dipakai ${kembar.nama_lengkap}.`);
  }
  const r = await tx.peserta.update({
    where: { id },
    data: { ...p.data, tanggal_bayar: tanggalDb(p.data.tanggal_bayar) },
    select: { id: true, no_urut: true, nama_lengkap: true, nim: true, sudah_bayar: true, tanggal_bayar: true, jumlah: true },
  });
  return { ok: true, nilai: { ...r, tanggal_bayar: r.tanggal_bayar ? r.tanggal_bayar.toISOString().slice(0, 10) : null, jumlah: Number(r.jumlah) } };
}

export async function hapusPeserta(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, id: string): Promise<Hasil<{ id: string }>> {
  const izin = await wajibIzin(tx, konteks, kepanitiaanId, 'hapus');
  if (!izin.ok) return izin;
  const lama = await tx.peserta.findFirst({ where: { id, kepanitiaan_id: kepanitiaanId }, select: { no_urut: true } });
  if (!lama) return gagal('TIDAK_DITEMUKAN', 'Peserta tidak ditemukan.');
  await tx.peserta.delete({ where: { id } });
  await rapatkan(tx, 'peserta', kepanitiaanId, lama.no_urut);
  return { ok: true, nilai: { id } };
}

// ---------------------------------------------------------------------------
// Import massal peserta
// ---------------------------------------------------------------------------

export async function bacaBerkasPeserta(nama: string, isi: Buffer): Promise<Hasil<string[][]>> {
  if (isi.byteLength === 0) return gagal('FILE_TIDAK_VALID', 'Berkas kosong.');
  if (isi.byteLength > BATAS_BERKAS_PESERTA) return gagal('FILE_TIDAK_VALID', 'Berkas lebih dari 2 MB.');
  try {
    const m = await bacaTabel(nama, isi);
    if (m.length < 2) return gagal('FILE_TIDAK_VALID', 'Berkas tidak memuat baris data di bawah judul kolom.');
    return { ok: true, nilai: m };
  } catch (e) {
    return gagal('FILE_TIDAK_VALID', e instanceof Error && e.message.startsWith('Format berkas') ? e.message : 'Berkas tidak dapat dibaca. Pastikan CSV atau XLSX yang tidak rusak.');
  }
}

export interface PratinjauImportPeserta {
  header: string[];
  peta: Record<string, number>;
  takDikenal: string[];
  hilang: string[];
  ringkas: HasilParse<unknown>['ringkas'];
  baris: { nomor: number; status: StatusBaris; masalah: Masalah[]; sel: string[]; terdaftar: boolean }[];
  terpotong: boolean;
}

async function susunImport(k: Klien, kepanitiaanId: string, matriks: string[][], petaManual?: Record<string, number>) {
  const ada = await k.peserta.findMany({ where: { kepanitiaan_id: kepanitiaanId, nim: { not: null } }, select: { id: true, nim: true } });
  const nimAda = new Map(ada.map((a) => [a.nim!, a.id]));
  const terdaftar = new Set<number>();
  const hasil = parseTabel<InputPeserta>(matriks, KOLOM_IMPORT_PESERTA, skemaBarisPeserta(), {
    petaManual,
    // NIM ganda di dalam berkas = peringatan; NIM kosong tidak dihitung (parse-tabel).
    kunciUnik: 'nim',
    batasBaris: BATAS_BARIS_PESERTA,
    periksaTambahan: (d, nomor) => {
      if (d.nim && nimAda.has(d.nim)) {
        terdaftar.add(nomor);
        return [{ tingkat: 'PERINGATAN', kolom: 'nim', pesan: `NIM ${d.nim} sudah terdaftar — barisnya akan diperbarui.` }];
      }
      return [];
    },
  });
  return { hasil, terdaftar, nimAda };
}

export async function pratinjauImportPeserta(kepanitiaanId: string, matriks: string[][], petaManual?: Record<string, number>): Promise<PratinjauImportPeserta> {
  const { hasil, terdaftar } = await susunImport(db, kepanitiaanId, matriks, petaManual);
  return {
    header: matriks[0] ?? [],
    peta: hasil.peta,
    takDikenal: hasil.takDikenal,
    hilang: hasil.hilang,
    ringkas: hasil.ringkas,
    baris: hasil.baris.map((b) => ({ nomor: b.nomor, status: b.status, masalah: b.masalah, sel: matriks[b.nomor - 1] ?? [], terdaftar: terdaftar.has(b.nomor) })),
    terpotong: matriks.length - 1 > BATAS_BARIS_PESERTA,
  };
}

export interface LaporanImportPeserta {
  baru: number;
  diperbarui: number;
  dilewati: { nomor: number; alasan: string }[];
}

/** Satu transaksi pemanggil: baris ERROR & yang dicentang "lewati" dilewati; NIM terdaftar diperbarui. */
export async function simpanImportPeserta(
  tx: TxKlien,
  konteks: Konteks,
  kepanitiaanId: string,
  matriks: string[][],
  opsi: { petaManual?: Record<string, number>; lewati?: number[] },
): Promise<Hasil<LaporanImportPeserta>> {
  const izin = await wajibIzin(tx, konteks, kepanitiaanId, 'tulis');
  if (!izin.ok) return izin;
  const { hasil, nimAda } = await susunImport(tx, kepanitiaanId, matriks, opsi.petaManual);
  if (hasil.hilang.length) return gagal('VALIDASI_GAGAL', `Kolom wajib belum dipetakan: ${hasil.hilang.join(', ')}.`);

  const lewati = new Set(opsi.lewati ?? []);
  const laporan: LaporanImportPeserta = { baru: 0, diperbarui: 0, dilewati: [] };
  let no = (await tx.peserta.aggregate({ where: { kepanitiaan_id: kepanitiaanId }, _max: { no_urut: true } }))._max.no_urut ?? 0;
  const baru: { kepanitiaan_id: string; no_urut: number; nama_lengkap: string; nim: string | null; sudah_bayar: boolean; tanggal_bayar: Date | null; jumlah: number }[] = [];
  const nimBerkas = new Set<string>();

  for (const b of hasil.baris) {
    if (b.status === 'ERROR' || !b.data) {
      laporan.dilewati.push({ nomor: b.nomor, alasan: b.masalah[0]?.pesan ?? 'Baris tidak valid.' });
      continue;
    }
    if (lewati.has(b.nomor)) {
      laporan.dilewati.push({ nomor: b.nomor, alasan: 'Dilewati.' });
      continue;
    }
    const d = b.data;
    const data = { nama_lengkap: d.nama_lengkap, nim: d.nim, sudah_bayar: d.sudah_bayar, tanggal_bayar: tanggalDb(d.tanggal_bayar), jumlah: d.jumlah };
    const idLama = d.nim ? nimAda.get(d.nim) : undefined;
    if (idLama) {
      await tx.peserta.update({ where: { id: idLama }, data });
      laporan.diperbarui++;
    } else if (d.nim && nimBerkas.has(d.nim)) {
      laporan.dilewati.push({ nomor: b.nomor, alasan: `NIM ${d.nim} ganda di berkas — baris pertama yang dipakai.` });
    } else {
      if (d.nim) nimBerkas.add(d.nim);
      baru.push({ kepanitiaan_id: kepanitiaanId, no_urut: ++no, ...data });
    }
  }
  if (baru.length) await tx.peserta.createMany({ data: baru });
  laporan.baru = baru.length;
  return { ok: true, nilai: laporan };
}
