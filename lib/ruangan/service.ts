/**
 * service ruangan — master ruangan & peminjaman (T-108). Server-only.
 *
 *   ruangan   dikelola sendiri oleh Sekretaris (PRD F-14.2): ADMIN/SEKUM, yaitu
 *             pemegang `ruangan.update`. KADEPT memegang `C*` di matriks untuk
 *             MENGAJUKAN peminjaman, bukan untuk menambah ruangan — sama dengan
 *             RLS `ruangan_insert` yang hanya ADMIN/SEKUM.
 *   booking   dibuat ADMIN/SEKUM/KADEPT (`ruangan.create`), dihapus ADMIN/SEKUM
 *             (`ruangan.delete`) — cermin RLS booking_ruangan_*.
 *   bentrok   PERINGATAN, bukan blokir (lihat lib/ruangan/bentrok.ts). Server
 *             menjawab 409 BENTROK sekali; klien mengirim ulang dengan
 *             `lanjutkan_meski_bentrok: true` sesudah pengguna membaca detailnya.
 *   surat     "Buat Surat Peminjaman Ruangan" membuat draft surat 05 terisi dari
 *             booking dan menautkan `booking_ruangan.surat_id` saat itu juga.
 *             Nomornya tampil di booking begitu surat terbit (nomor_lengkap).
 *
 * Seluruh data ber-scope periode aktif (INV-08).
 *
 * Sumber: docs/ai/tasks/P8-kesekretariatan.md T-108 · PRD F-14.2 · USER_FLOW §9.3
 */

import type { Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import {
  cariBentrok,
  draftSuratDariBooking,
  labelWaktu,
  type Bentrok,
  type DetailBentrok,
  type JadwalBooking,
  rentangBulan,
} from '@/lib/ruangan/bentrok';

export { rentangBulan };
import { SkemaBooking, SkemaRuangan } from '@/lib/ruangan/skema';
import { STATUS_DAPAT_DISUNTING, simpanDraft } from '@/lib/surat/draft';

if (typeof window !== 'undefined') {
  throw new Error('lib/ruangan/service.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type KodeGagalRuangan = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'BENTROK' | 'TIDAK_BERWENANG' | 'SURAT_GAGAL';
export const STATUS_GAGAL_RUANGAN: Record<KodeGagalRuangan, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  BENTROK: 409,
  TIDAK_BERWENANG: 403,
  SURAT_GAGAL: 422,
};
export type Hasil<T> =
  | { ok: true; nilai: T }
  | { ok: false; kode: KodeGagalRuangan; pesan: string; details?: unknown };

const gagalValidasi = (issues: { message: string }[]): Hasil<never> => ({
  ok: false,
  kode: 'VALIDASI_GAGAL',
  pesan: issues[0]?.message ?? 'Isian tidak valid.',
});

// ---------------------------------------------------------------------------
// Konversi kolom TIME/DATE ⇄ teks
// ---------------------------------------------------------------------------

/** Prisma memetakan TIME ke Date 1970-01-01 UTC. */
const keJam = (d: Date | null): string | null => (d ? d.toISOString().slice(11, 16) : null);
const dariJam = (j: string | null): Date | null => (j ? new Date(`1970-01-01T${j}:00.000Z`) : null);
const keTanggal = (d: Date): string => d.toISOString().slice(0, 10);
const dariTanggal = (t: string): Date => new Date(`${t}T00:00:00.000Z`);

// ---------------------------------------------------------------------------
// Ruangan
// ---------------------------------------------------------------------------

export interface BarisRuangan {
  id: string;
  nama: string;
  lokasi: string | null;
  kapasitas: number | null;
  pengelola: string | null;
  catatan: string | null;
}

export async function daftarRuangan(): Promise<BarisRuangan[]> {
  return db.ruangan.findMany({
    where: { is_active: true },
    orderBy: { nama: 'asc' },
    select: { id: true, nama: true, lokasi: true, kapasitas: true, pengelola: true, catatan: true },
  });
}

export async function buatRuangan(tx: TxKlien, body: unknown): Promise<Hasil<{ id: string }>> {
  const p = SkemaRuangan.safeParse(body);
  if (!p.success) return gagalValidasi(p.error.issues);
  return { ok: true, nilai: await tx.ruangan.create({ data: p.data, select: { id: true } }) };
}

export async function ubahRuangan(tx: TxKlien, id: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const p = SkemaRuangan.safeParse(body);
  if (!p.success) return gagalValidasi(p.error.issues);
  const r = await tx.ruangan.updateMany({ where: { id, is_active: true }, data: p.data });
  return r.count ? { ok: true, nilai: { id } } : { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Ruangan tidak ditemukan.' };
}

/**
 * Menonaktifkan, bukan menghapus: booking lama merujuk ruangan ini (FK tanpa
 * CASCADE) dan riwayatnya harus tetap terbaca dengan nama ruangan yang benar.
 */
export async function nonaktifkanRuangan(tx: TxKlien, id: string): Promise<Hasil<{ id: string }>> {
  const r = await tx.ruangan.updateMany({ where: { id, is_active: true }, data: { is_active: false } });
  return r.count ? { ok: true, nilai: { id } } : { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Ruangan tidak ditemukan.' };
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export interface BarisBooking extends JadwalBooking {
  nama_ruangan: string;
  kegiatan: string;
  jumlah_peserta: number | null;
  keperluan: string | null;
  label_waktu: string;
  nama_pembuat: string;
  dibuat_oleh: string;
  surat: { id: string; status: string; nomor_lengkap: string | null } | null;
}

const PILIH_BOOKING = {
  id: true,
  ruangan_id: true,
  tanggal: true,
  waktu_mulai: true,
  waktu_selesai: true,
  kegiatan: true,
  jumlah_peserta: true,
  keperluan: true,
  dibuat_oleh: true,
  ruangan: { select: { nama: true } },
  app_user: { select: { nama_lengkap: true } },
  surat: { select: { id: true, status: true, nomor_lengkap: true } },
} as const;

type BookingDb = {
  id: string;
  ruangan_id: string;
  tanggal: Date;
  waktu_mulai: Date | null;
  waktu_selesai: Date | null;
  kegiatan: string;
  jumlah_peserta: number | null;
  keperluan: string | null;
  dibuat_oleh: string;
  ruangan: { nama: string };
  app_user: { nama_lengkap: string };
  surat: { id: string; status: string; nomor_lengkap: string | null } | null;
};

function bentukBooking(b: BookingDb): BarisBooking {
  const waktu_mulai = keJam(b.waktu_mulai);
  const waktu_selesai = keJam(b.waktu_selesai);
  return {
    id: b.id,
    ruangan_id: b.ruangan_id,
    tanggal: keTanggal(b.tanggal),
    waktu_mulai,
    waktu_selesai,
    nama_ruangan: b.ruangan.nama,
    kegiatan: b.kegiatan,
    jumlah_peserta: b.jumlah_peserta,
    keperluan: b.keperluan,
    label_waktu: labelWaktu(waktu_mulai, waktu_selesai),
    nama_pembuat: b.app_user.nama_lengkap,
    dibuat_oleh: b.dibuat_oleh,
    // Surat yang dibatalkan tidak lagi mewakili booking ini.
    surat: b.surat && b.surat.status !== 'DIBATALKAN' ? b.surat : null,
  };
}

export interface FilterBooking {
  /** `YYYY-MM` — bulan kalender. */
  bulan?: string;
  ruangan?: string;
}

export async function daftarBooking(konteks: Konteks, f: FilterBooking = {}): Promise<BarisBooking[]> {
  const { awal, akhir } = rentangBulan(f.bulan);
  const baris = await db.booking_ruangan.findMany({
    where: {
      periode_id: konteks.periodeId,
      tanggal: { gte: awal, lt: akhir },
      ...(f.ruangan ? { ruangan_id: f.ruangan } : {}),
    },
    orderBy: [{ tanggal: 'asc' }, { waktu_mulai: 'asc' }],
    take: 1000,
    select: PILIH_BOOKING,
  });
  return baris.map(bentukBooking);
}

async function bentrokUntuk(
  klien: TxKlien | typeof db,
  konteks: Konteks,
  baru: Omit<JadwalBooking, 'id'> & { id?: string },
): Promise<Bentrok<BarisBooking>[]> {
  const sehari = await klien.booking_ruangan.findMany({
    where: { periode_id: konteks.periodeId, ruangan_id: baru.ruangan_id, tanggal: dariTanggal(baru.tanggal) },
    select: PILIH_BOOKING,
  });
  return cariBentrok(baru, sehari.map(bentukBooking));
}

const ringkasBentrok = (b: Bentrok<BarisBooking>[]): DetailBentrok[] =>
  b.map(({ booking: x, tumpangJam }) => ({
    id: x.id,
    kegiatan: x.kegiatan,
    nama_ruangan: x.nama_ruangan,
    tanggal: x.tanggal,
    label_waktu: x.label_waktu,
    nama_pembuat: x.nama_pembuat,
    tumpang_jam: tumpangJam,
  }));

export async function buatBooking(
  tx: TxKlien,
  konteks: Konteks,
  body: unknown,
): Promise<Hasil<{ id: string; bentrok: DetailBentrok[] }>> {
  const p = SkemaBooking.safeParse(body);
  if (!p.success) return gagalValidasi(p.error.issues);
  const d = p.data;
  const lanjut = typeof body === 'object' && body !== null && (body as Record<string, unknown>).lanjutkan_meski_bentrok === true;

  const ruangan = await tx.ruangan.findFirst({ where: { id: d.ruangan_id, is_active: true }, select: { id: true } });
  if (!ruangan) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Ruangan tidak ditemukan atau sudah dinonaktifkan.' };

  const bentrok = ringkasBentrok(await bentrokUntuk(tx, konteks, d));
  if (bentrok.length && !lanjut) {
    return {
      ok: false,
      kode: 'BENTROK',
      pesan: 'Ruangan ini sudah tercatat dipinjam di tanggal yang sama. Keputusan akhir tetap di Dekanat — lanjutkan bila memang perlu.',
      details: { bentrok },
    };
  }

  const r = await tx.booking_ruangan.create({
    data: {
      ruangan_id: d.ruangan_id,
      periode_id: konteks.periodeId,
      kegiatan: d.kegiatan,
      tanggal: dariTanggal(d.tanggal),
      waktu_mulai: dariJam(d.waktu_mulai),
      waktu_selesai: dariJam(d.waktu_selesai),
      jumlah_peserta: d.jumlah_peserta,
      keperluan: d.keperluan,
      dibuat_oleh: konteks.sesi.userId,
    },
    select: { id: true },
  });
  return { ok: true, nilai: { id: r.id, bentrok } };
}

export async function hapusBooking(tx: TxKlien, konteks: Konteks, id: string): Promise<Hasil<{ id: string }>> {
  const r = await tx.booking_ruangan.deleteMany({ where: { id, periode_id: konteks.periodeId } });
  return r.count ? { ok: true, nilai: { id } } : { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Peminjaman tidak ditemukan.' };
}

// ---------------------------------------------------------------------------
// Surat Peminjaman Ruangan (kode 05)
// ---------------------------------------------------------------------------

/** Pembuat booking atau pengelola ruangan (ADMIN/SEKUM). */
export function bolehSuratBooking(konteks: Konteks, dibuatOleh: string): boolean {
  if (!can(konteks.roles, 'surat.create')) return false;
  return dibuatOleh === konteks.sesi.userId || can(konteks.roles, 'ruangan.update');
}

/**
 * Membuka surat booking: draft milik pengguna yang masih dapat disunting
 * dilanjutkan, surat yang sudah diajukan/terbit dibuka detailnya, selain itu
 * (belum ada, dibatalkan) dibuat draft baru terisi dari booking lalu ditautkan.
 */
export async function suratDariBooking(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
): Promise<Hasil<{ surat_id: string; tujuan: string }>> {
  const b = await tx.booking_ruangan.findFirst({
    where: { id, periode_id: konteks.periodeId },
    select: {
      kegiatan: true,
      tanggal: true,
      waktu_mulai: true,
      waktu_selesai: true,
      keperluan: true,
      dibuat_oleh: true,
      ruangan: { select: { nama: true, lokasi: true, pengelola: true } },
      surat: { select: { id: true, status: true, dibuat_oleh: true } },
    },
  });
  if (!b) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Peminjaman tidak ditemukan.' };
  if (!bolehSuratBooking(konteks, b.dibuat_oleh)) {
    return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Surat peminjaman dibuat oleh pencatat booking atau Sekretaris.' };
  }

  const s = b.surat;
  if (s && s.status !== 'DIBATALKAN') {
    const draftSaya = STATUS_DAPAT_DISUNTING.includes(s.status) && s.dibuat_oleh === konteks.sesi.userId;
    return { ok: true, nilai: { surat_id: s.id, tujuan: draftSaya ? `/surat/baru?id=${s.id}` : `/surat/${s.id}` } };
  }

  const draft = await simpanDraft(
    tx,
    konteks,
    draftSuratDariBooking({
      kegiatan: b.kegiatan,
      tanggal: keTanggal(b.tanggal),
      waktu_mulai: keJam(b.waktu_mulai),
      waktu_selesai: keJam(b.waktu_selesai),
      keperluan: b.keperluan,
      ruangan: b.ruangan,
    }),
    null,
  );
  if (!draft.ok) return { ok: false, kode: 'SURAT_GAGAL', pesan: draft.pesan };

  await tx.booking_ruangan.update({ where: { id }, data: { surat_id: draft.nilai.id } });
  return { ok: true, nilai: { surat_id: draft.nilai.id, tujuan: `/surat/baru?id=${draft.nilai.id}` } };
}
