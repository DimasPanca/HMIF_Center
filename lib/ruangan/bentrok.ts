/**
 * bentrok ruangan — logika murni peminjaman (T-108). Aman untuk klien.
 *
 * ===========================================================================
 * BENTROK ADALAH PERINGATAN, BUKAN BLOKIR
 * ===========================================================================
 * PRD F-14.2: keputusan final ada di Dekanat. Sistem hanya mencatat apa yang
 * sudah diajukan HMIF, bukan jadwal ruangan sesungguhnya, jadi ia tidak berhak
 * menolak. 011_sekretariat.sql sengaja TIDAK memasang EXCLUDE constraint, dan
 * berkas ini tidak menggantikannya dengan penolakan di aplikasi.
 *
 * Yang dianggap bentrok mengikuti USER_FLOW §9.3: ruangan dan tanggal yang
 * sama. Jam tidak menyaring — "Seminar Nasional 14.00–16.00" tetap ditampilkan
 * untuk peminjaman "16.00 – selesai", karena persiapan dan pembongkaran tidak
 * tercatat di jam mana pun. Tumpang-tindih jam hanya menaikkan penekanannya.
 *
 * Sumber: docs/ai/tasks/P8-kesekretariatan.md T-108 · PRD F-14.2 · USER_FLOW §9.3
 */

import { formatTanggalPanjang } from '@/lib/utils/format-tanggal';

export interface JadwalBooking {
  id: string;
  ruangan_id: string;
  /** `YYYY-MM-DD` */
  tanggal: string;
  /** `HH:MM` */
  waktu_mulai: string | null;
  /** `HH:MM`; null = "s.d. selesai" */
  waktu_selesai: string | null;
}

export interface Bentrok<T extends JadwalBooking> {
  booking: T;
  /** Jam benar-benar beririsan, bukan hanya hari yang sama. */
  tumpangJam: boolean;
}

const AKHIR_HARI = '24:00';

/** Rentang setengah terbuka [mulai, selesai); jam kosong dianggap sepanjang hari. */
function irisan(a: JadwalBooking, b: JadwalBooking): boolean {
  const am = a.waktu_mulai ?? '00:00';
  const as = a.waktu_selesai ?? AKHIR_HARI;
  const bm = b.waktu_mulai ?? '00:00';
  const bs = b.waktu_selesai ?? AKHIR_HARI;
  return am < bs && bm < as;
}

/**
 * Booking lain di ruangan dan tanggal yang sama, yang jamnya beririsan lebih
 * dulu. `baru.id` (bila ada) dikecualikan — booking tidak bentrok dengan dirinya.
 */
export function cariBentrok<T extends JadwalBooking>(
  baru: Omit<JadwalBooking, 'id'> & { id?: string },
  daftar: readonly T[],
): Bentrok<T>[] {
  const pembanding = { id: baru.id ?? '', ...baru } as JadwalBooking;
  return daftar
    .filter((b) => b.id !== baru.id && b.ruangan_id === baru.ruangan_id && b.tanggal === baru.tanggal)
    .map((booking) => ({ booking, tumpangJam: irisan(pembanding, booking) }))
    .sort((x, y) => Number(y.tumpangJam) - Number(x.tumpangJam) || (x.booking.waktu_mulai ?? '').localeCompare(y.booking.waktu_mulai ?? ''));
}

const titik = (jam: string) => jam.replace(':', '.');

/** "16.00 – 18.00 WIB" atau "16.00 WIB s.d. selesai" — bentuk yang dipakai surat HMIF. */
export function labelWaktu(mulai: string | null, selesai: string | null): string {
  if (!mulai) return 'Sepanjang hari';
  return selesai ? `${titik(mulai)} – ${titik(selesai)} WIB` : `${titik(mulai)} WIB s.d. selesai`;
}

/** "Kamis, 09 Oktober 2026" — nilai field "Hari, tanggal" surat 05. */
export function labelHariTanggal(tanggal: string): string {
  return formatTanggalPanjang(tanggal);
}

export interface SumberSurat {
  kegiatan: string;
  tanggal: string;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  keperluan: string | null;
  ruangan: { nama: string; lokasi: string | null; pengelola: string | null };
}

/**
 * Isi draft Surat Peminjaman Ruangan (kode 05) dari satu booking — bentuk
 * `SkemaDraftSurat`. Field yang tidak dapat diturunkan (tema, nama panitia)
 * dibiarkan kosong supaya form menandainya "masih kurang", bukan diisi tebakan.
 */
export function draftSuratDariBooking(b: SumberSurat) {
  const pengelola = b.ruangan.pengelola ?? '';
  return {
    jenis: 'PEMINJAMAN_RUANGAN' as const,
    perihal: 'Permohonan Peminjaman Ruangan',
    tujuan_nama: pengelola,
    data_dinamis: {
      nama_kegiatan: b.kegiatan,
      ruangan: b.ruangan.nama,
      tujuan_jabatan: pengelola,
      hari_tanggal: labelHariTanggal(b.tanggal),
      waktu: labelWaktu(b.waktu_mulai, b.waktu_selesai),
      tempat: b.ruangan.lokasi ? `${b.ruangan.nama}, ${b.ruangan.lokasi}` : b.ruangan.nama,
    },
  };
}

/** Detail yang dikirim bersama 409 BENTROK — cukup untuk ditampilkan apa adanya. */
export interface DetailBentrok {
  id: string;
  kegiatan: string;
  nama_ruangan: string;
  tanggal: string;
  label_waktu: string;
  nama_pembuat: string;
  tumpang_jam: boolean;
}

/** Rentang [awal, akhir) satu bulan kalender (`YYYY-MM`); bulan tak sah → bulan berjalan. */
export function rentangBulan(bulan: string | undefined, sekarang = new Date()): { awal: Date; akhir: Date; bulan: string } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(bulan ?? '');
  const y = m ? Number(m[1]) : sekarang.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : sekarang.getUTCMonth();
  return {
    awal: new Date(Date.UTC(y, mo, 1)),
    akhir: new Date(Date.UTC(y, mo + 1, 1)),
    bulan: `${y}-${String(mo + 1).padStart(2, '0')}`,
  };
}
