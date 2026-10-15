/**
 * Tingkat deadline (T-083, PRD F-7.4, DESIGN_SYSTEM §12.5). Murni, aman
 * untuk klien.
 *
 * Deadline adalah TANGGAL, bukan waktu: sisa hari = selisih nomor hari
 * kalender (Asia/Jakarta), bukan selisih milidetik dibagi 86 400 000 —
 * cara itu memberi "0,4 hari" pada pukul 14.00 dan membulatkan kartu
 * ber-deadline besok menjadi hari ini. Nomor hari dihitung dari tahun-bulan-
 * tanggal dengan aritmetika bilangan bulat (algoritma days-from-civil).
 *
 *   NORMAL      sisa > peringatan            (bawaan > 7 hari)
 *   PERINGATAN  kritis < sisa ≤ peringatan   (≤ 7 hari)
 *   KRITIS      0 ≤ sisa ≤ kritis            (≤ 3 hari, termasuk hari-H)
 *   TERLAMBAT   sisa < 0
 *
 * Ambang dibaca dari `app_config` (`deadline_warning_hari`,
 * `deadline_critical_hari`) di server dan diteruskan ke sini.
 *
 * Sumber: T-083 · PRD F-7.4 · DESIGN_SYSTEM §12.5 · K-15
 */

export type TingkatDeadline = 'NORMAL' | 'PERINGATAN' | 'KRITIS' | 'TERLAMBAT';

export interface AmbangDeadline {
  peringatan: number;
  kritis: number;
}

export const AMBANG_BAWAAN: AmbangDeadline = { peringatan: 7, kritis: 3 };

const POLA = /^(\d{4})-(\d{2})-(\d{2})/;

/** `YYYY-MM-DD` → nomor hari sejak 1970-01-01, bilangan bulat murni. */
export function nomorHari(tanggal: string): number {
  const m = POLA.exec(tanggal);
  if (!m) throw new RangeError(`Tanggal "${tanggal}" bukan YYYY-MM-DD.`);
  let y = Number(m[1]);
  const bln = Number(m[2]);
  const d = Number(m[3]);
  // Howard Hinnant, days_from_civil.
  y -= bln <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (bln + (bln > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Sisa hari kalender dari `hariIni` ke `deadline` (negatif = lewat). */
export function sisaHari(deadline: string, hariIni: string): number {
  return nomorHari(deadline) - nomorHari(hariIni);
}

/** Ambang dari nilai `app_config` mentah; nilai tak masuk akal jatuh ke bawaan. */
export function normalkanAmbang(peringatan: unknown, kritis: unknown): AmbangDeadline {
  const p = Number(peringatan);
  const k = Number(kritis);
  const sahP = Number.isInteger(p) && p >= 1 && p <= 60 ? p : AMBANG_BAWAAN.peringatan;
  const sahK = Number.isInteger(k) && k >= 0 && k < sahP ? k : Math.min(AMBANG_BAWAAN.kritis, sahP - 1);
  return { peringatan: sahP, kritis: sahK };
}

export function tingkatDeadline(sisa: number, ambang: AmbangDeadline = AMBANG_BAWAAN): TingkatDeadline {
  if (sisa < 0) return 'TERLAMBAT';
  if (sisa <= ambang.kritis) return 'KRITIS';
  if (sisa <= ambang.peringatan) return 'PERINGATAN';
  return 'NORMAL';
}

/** Teks status yang terbaca tanpa warna (K-15). */
export function teksSisa(sisa: number): string {
  if (sisa < 0) return `Terlambat ${-sisa} hari`;
  if (sisa === 0) return 'Hari ini';
  if (sisa === 1) return 'Besok';
  return `${sisa} hari lagi`;
}

export interface InfoDeadline {
  tingkat: TingkatDeadline;
  sisa: number;
  teks: string;
}

export function infoDeadline(deadline: string, hariIni: string, ambang: AmbangDeadline = AMBANG_BAWAAN): InfoDeadline {
  const sisa = sisaHari(deadline, hariIni);
  return { tingkat: tingkatDeadline(sisa, ambang), sisa, teks: teksSisa(sisa) };
}

export const LABEL_TINGKAT: Record<TingkatDeadline, string> = {
  NORMAL: 'Normal',
  PERINGATAN: 'Peringatan',
  KRITIS: 'Kritis',
  TERLAMBAT: 'Terlambat',
};
