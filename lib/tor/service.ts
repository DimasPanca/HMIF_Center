/**
 * Service TOR (T-094, PRD F-10.1). Server-only.
 *
 *   baca    siapa pun yang dapat membuka ruang kerja acaranya (muatAcara)
 *   tulis   cermin RLS tor_update/rundown_* (015b, 043): Admin/Ketua/Wakil,
 *           Kadept departemen PIC, atau panitia acara (Ketua Pelaksana,
 *           koordinator, anggota divisi) — periode berjalan, bukan BPH saja.
 *
 * `tor.data` menyimpan bagian 1–10 dan 13. Rundown (11) disinkronkan ke tabel
 * `rundown`; Anggaran (12) dan Penandatangan (14) selalu ditarik ulang dari
 * RAB dan data acara/periode — tidak pernah disalin (migrasi 012).
 *
 * Sumber: docs/ai/tasks/P6-tor-proposal.md T-094 · PRD F-10.1 · migrasi 012
 */

import { Prisma } from '@prisma/client';

import { muatAcara } from '@/lib/acara/service';
import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { sanitasiKonten } from '@/lib/notulensi/sanitasi';
import { hitungRab } from '@/lib/rab/calculate';
import { muatRab } from '@/lib/rab/service';
import { bacaKetuaHimpunan } from '@/lib/surat/konfig';
import {
  MAKS_JSON_TOR,
  SkemaSimpanTor,
  kelengkapanTor,
  normalisasiTor,
  type BarisRundown,
  type DataTor,
} from '@/lib/tor/schema';

if (typeof window !== 'undefined') {
  throw new Error('lib/tor/service.ts adalah modul server-only.');
}

type Klien = TxKlien | typeof db;
export type KodeGagalTor = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG';
export const STATUS_GAGAL_TOR: Record<KodeGagalTor, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
};
export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalTor; pesan: string };

export interface AnggaranTor {
  divisi: { nama: string; total: number }[];
  total_divisi: number;
  dana_tak_terduga: number;
  total: number;
}

export interface DataTorLengkap {
  kepanitiaan_id: string;
  nama_acara: string;
  data: DataTor;
  rundown: BarisRundown[];
  /** Bagian 12 — dihitung dari RAB saat ini; 'TERBATAS' bila angka RAB bukan hak pengguna. */
  anggaran: AnggaranTor | 'TERBATAS';
  /** Bagian 14 — dari data acara & periode. */
  penandatangan: {
    ketua_pelaksana: string | null;
    ketua_himpunan: { nama: string; nim: string } | null;
  };
  boleh_tulis: boolean;
  diperbarui_at: string | null;
  diperbarui_oleh: string | null;
}

// ---------------------------------------------------------------------------
// Hak
// ---------------------------------------------------------------------------

export async function bisaTulisTor(
  konteks: Konteks,
  kepanitiaanId: string,
  k: Klien = db,
): Promise<boolean> {
  const kp = await k.kepanitiaan.findUnique({
    where: { id: kepanitiaanId },
    select: {
      ketua_pelaksana: true,
      proker: { select: { periode_id: true, departemen_id: true } },
      divisi: { select: { koordinator_id: true, divisi_member: { select: { user_id: true } } } },
    },
  });
  if (!kp || kp.proker.periode_id !== konteks.periodeId) return false;
  const r = konteks.roles;
  if (r.includes('ADMIN') || r.includes('KETUA') || r.includes('WAKIL')) return true;
  if (r.includes('KADEPT') && konteks.departemenIds.includes(kp.proker.departemen_id)) return true;
  const saya = konteks.sesi.userId;
  return (
    r.some((x) => x !== 'BPH') &&
    (kp.ketua_pelaksana === saya ||
      kp.divisi.some(
        (d) => d.koordinator_id === saya || d.divisi_member.some((m) => m.user_id === saya),
      ))
  );
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

/** Anggaran dari RAB SAAT INI — dipakai editor (bagian 12) dan generator T-095. */
export async function anggaranTor(
  konteks: Konteks,
  kepanitiaanId: string,
): Promise<AnggaranTor | 'TERBATAS' | null> {
  const rab = await muatRab(konteks, kepanitiaanId);
  if (!rab || rab === 'TERBATAS') return rab;
  const h = hitungRab(rab.divisi, rab.dana_tak_terduga);
  return {
    divisi: h.perDivisi.map((d) => ({ nama: d.nama, total: d.total })),
    total_divisi: h.totalDivisi,
    dana_tak_terduga: h.danaTakTerduga,
    total: h.grandTotal,
  };
}

export async function muatRundown(kepanitiaanId: string, k: Klien = db): Promise<BarisRundown[]> {
  return k.$queryRaw<BarisRundown[]>`
    SELECT id::text, to_char(tanggal, 'YYYY-MM-DD') AS tanggal,
           COALESCE(to_char(waktu_mulai, 'HH24:MI'), '') AS waktu_mulai,
           COALESCE(to_char(waktu_selesai, 'HH24:MI'), '') AS waktu_selesai,
           acara, COALESCE(keterangan, '') AS keterangan
    FROM rundown WHERE kepanitiaan_id = ${kepanitiaanId}::uuid
    ORDER BY tanggal, urutan, waktu_mulai NULLS FIRST, id`;
}

/** Bagian kaya disaring ulang sebelum dirender (pertahanan berlapis). */
function sanitasiData(d: DataTor): DataTor {
  return {
    ...d,
    gambaran_umum: sanitasiKonten(d.gambaran_umum),
    bentuk_acara: { ...d.bentuk_acara, uraian: sanitasiKonten(d.bentuk_acara.uraian) },
    sasaran: { ...d.sasaran, uraian: sanitasiKonten(d.sasaran.uraian) },
    penutup: sanitasiKonten(d.penutup),
  };
}

/** null = acara tidak ada / periode lain / tidak terlihat (404). */
export async function muatTor(
  konteks: Konteks,
  kepanitiaanId: string,
): Promise<DataTorLengkap | null> {
  const acara = await muatAcara(konteks, kepanitiaanId);
  if (!acara) return null;
  const [tor, rundown, anggaran, ketua, boleh] = await Promise.all([
    db.tor.findUnique({
      where: { kepanitiaan_id: kepanitiaanId },
      select: { data: true, updated_at: true, app_user: { select: { nama_lengkap: true } } },
    }),
    muatRundown(kepanitiaanId),
    anggaranTor(konteks, kepanitiaanId),
    konteks.periodeId ? bacaKetuaHimpunan(konteks.periodeId) : Promise.resolve(null),
    bisaTulisTor(konteks, kepanitiaanId),
  ]);
  return {
    kepanitiaan_id: kepanitiaanId,
    nama_acara: acara.nama_acara,
    // TOR baru: Nama & Tema diisi dari data acara supaya tidak diketik ulang.
    data: sanitasiData(
      normalisasiTor(tor?.data ?? null, { nama_kegiatan: acara.nama_acara, tema: acara.tema }),
    ),
    rundown,
    anggaran: anggaran ?? 'TERBATAS',
    penandatangan: { ketua_pelaksana: acara.ketua_pelaksana, ketua_himpunan: ketua },
    boleh_tulis: boleh,
    diperbarui_at: tor?.updated_at.toISOString() ?? null,
    diperbarui_oleh: tor?.app_user?.nama_lengkap ?? null,
  };
}

/** Fakta di luar tor.data untuk penghitung "x dari 14 bagian terisi". */
export function faktaLuar(t: Pick<DataTorLengkap, 'rundown' | 'anggaran' | 'penandatangan'>) {
  return {
    rundown: t.rundown.length,
    anggaran: t.anggaran !== 'TERBATAS' && t.anggaran.total_divisi > 0,
    penandatangan: !!t.penandatangan.ketua_pelaksana && !!t.penandatangan.ketua_himpunan,
  };
}

export function ringkasKelengkapan(t: DataTorLengkap) {
  return kelengkapanTor(t.data, faktaLuar(t));
}

// ---------------------------------------------------------------------------
// Simpan (auto-save)
// ---------------------------------------------------------------------------

async function sinkronRundown(
  tx: TxKlien,
  kepanitiaanId: string,
  baris: BarisRundown[],
): Promise<Hasil<true>> {
  if (new Set(baris.map((b) => b.id)).size !== baris.length)
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Baris rundown ganda.' };
  if (baris.length) {
    const asing = await tx.rundown.count({
      where: { id: { in: baris.map((b) => b.id) }, NOT: { kepanitiaan_id: kepanitiaanId } },
    });
    if (asing)
      return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Baris rundown milik acara lain.' };
  }
  await tx.rundown.deleteMany({
    where: { kepanitiaan_id: kepanitiaanId, id: { notIn: baris.map((b) => b.id) } },
  });
  for (const [i, b] of baris.entries()) {
    const mulai = b.waktu_mulai || null;
    const selesai = b.waktu_selesai || null;
    const ket = b.keterangan || null;
    await tx.$executeRaw`
      INSERT INTO rundown (id, kepanitiaan_id, tanggal, waktu_mulai, waktu_selesai, acara, keterangan, urutan)
      VALUES (${b.id}::uuid, ${kepanitiaanId}::uuid, ${b.tanggal}::date, ${mulai}::time, ${selesai}::time, ${b.acara}, ${ket}, ${i})
      ON CONFLICT (id) DO UPDATE SET
        tanggal = EXCLUDED.tanggal, waktu_mulai = EXCLUDED.waktu_mulai, waktu_selesai = EXCLUDED.waktu_selesai,
        acara = EXCLUDED.acara, keterangan = EXCLUDED.keterangan, urutan = EXCLUDED.urutan
      WHERE rundown.kepanitiaan_id = EXCLUDED.kepanitiaan_id`;
  }
  return { ok: true, nilai: true };
}

export async function simpanTor(
  tx: TxKlien,
  konteks: Konteks,
  kepanitiaanId: string,
  body: unknown,
): Promise<Hasil<{ diperbarui_at: string; data: DataTor; rundown: BarisRundown[] | null }>> {
  if (JSON.stringify(body ?? null).length > MAKS_JSON_TOR)
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Isi TOR terlalu panjang.' };
  const p = SkemaSimpanTor.safeParse(body);
  if (!p.success) {
    const i = p.error.issues[0];
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: i ? `${i.message} (${i.path.join('.')})` : 'Isi TOR tidak valid.',
    };
  }
  if (!(await tx.kepanitiaan.findUnique({ where: { id: kepanitiaanId }, select: { id: true } }))) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Acara tidak ditemukan.' };
  }
  if (!(await bisaTulisTor(konteks, kepanitiaanId, tx))) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'TOR disusun panitia acara ini, Kadept penanggung jawab, atau pimpinan.',
    };
  }
  const data = sanitasiData(p.data.data);
  const json = data as unknown as Prisma.InputJsonValue;
  const sekarang = new Date();
  const r = await tx.tor.upsert({
    where: { kepanitiaan_id: kepanitiaanId },
    create: {
      kepanitiaan_id: kepanitiaanId,
      data: json,
      updated_by: konteks.sesi.userId,
      updated_at: sekarang,
    },
    update: { data: json, updated_by: konteks.sesi.userId, updated_at: sekarang },
    select: { updated_at: true },
  });
  let rundown: BarisRundown[] | null = null;
  if (p.data.rundown) {
    const s = await sinkronRundown(tx, kepanitiaanId, p.data.rundown);
    if (!s.ok) return s;
    rundown = await muatRundown(kepanitiaanId, tx);
  }
  return { ok: true, nilai: { diperbarui_at: r.updated_at.toISOString(), data, rundown } };
}
