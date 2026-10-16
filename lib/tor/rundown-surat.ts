/**
 * Rundown acara → baris tabel susunan acara Surat Undangan (T-095).
 *
 * Satu sumber (tabel `rundown`, migrasi 012) untuk TOR, Proposal, dan Surat
 * Undangan. Surat adalah dokumen resmi yang dibekukan saat terbit, jadi
 * barisnya diisikan dari tabel saat surat dibuat untuk acara itu — isinya sama
 * persis dengan Lampiran II TOR — lalu tetap dapat disunting di draft.
 *
 * Bentuk baris mengikuti skema surat (lib/surat/field-schemas.ts): hari/tanggal
 * hanya di baris pertama tiap tanggal, waktu "07:00 - 08:00".
 */

import type { BarisRundown } from '@/lib/tor/schema';
import { formatTanggalPanjang } from '@/lib/utils/format-tanggal';

export interface BarisRundownSurat {
  hari_tanggal: string;
  waktu: string;
  acara: string;
  keterangan: string;
}

export function rundownKeSurat(baris: readonly BarisRundown[]): BarisRundownSurat[] {
  const urut = [...baris].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  return urut.map((b, i) => ({
    hari_tanggal: i === 0 || urut[i - 1]!.tanggal !== b.tanggal ? formatTanggalPanjang(b.tanggal) : '',
    waktu: b.waktu_mulai ? `${b.waktu_mulai}${b.waktu_selesai ? ` - ${b.waktu_selesai}` : ''}` : '-',
    acara: b.acara,
    keterangan: b.keterangan,
  }));
}
