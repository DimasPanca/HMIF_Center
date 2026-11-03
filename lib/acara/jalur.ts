/**
 * Jalur dokumen acara (ADR-039): TOR → RAB → Proposal → Hari-H → Nota → LPJ dalam
 * satu baris status, dengan satu langkah yang ditandai "berikutnya" supaya
 * panitia tahu apa yang harus dikerjakan tanpa membuka setiap tab.
 *
 * Modul ini murni (diuji unit); pengambil faktanya ada di `jalur-data.ts`.
 * Langkah yang tidak boleh dibaca pengguna ditandai TERBATAS, tidak pernah
 * dibocorkan statusnya.
 */

export type StatusLpj = 'DRAFT' | 'DIAJUKAN' | 'DISETUJUI_BENDUM' | 'FINAL';

export type IdLangkah = 'tor' | 'rab' | 'proposal' | 'hari_h' | 'nota' | 'lpj';
export type StatusLangkah = 'SELESAI' | 'BERJALAN' | 'BELUM' | 'TERBATAS';

export interface LangkahJalur {
  id: IdLangkah;
  label: string;
  status: StatusLangkah;
  keterangan: string;
  href: string;
}

export interface FaktaJalur {
  acaraId: string;
  dibatalkan: boolean;
  tor: { terisi: number; total: number };
  /** null = tidak boleh membaca RAB. */
  rab: { status: string | null } | null;
  proposalTersimpan: boolean;
  hariH: { mulai: string | null; selesai: string | null };
  nota: { menunggu: number; terverifikasi: number; ditolak: number } | null;
  /** 'TERBATAS' = tidak boleh membaca LPJ; null = belum dibuat. */
  lpj: StatusLpj | 'TERBATAS' | null;
}

const HARI_MS = 86_400_000;

/** Selisih hari kalender (tanggal ISO `YYYY-MM-DD`), b − a. */
export function selisihHari(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / HARI_MS);
}

/** "H-5", "Hari-H", "H+2" relatif ke hari ini; null bila tanggal tidak ada. */
export function hitungMundur(hariIni: string, mulai: string | null, selesai: string | null): string | null {
  if (!mulai) return null;
  const akhir = selesai && selesai >= mulai ? selesai : mulai;
  if (hariIni < mulai) return `H-${selisihHari(hariIni, mulai)}`;
  if (hariIni <= akhir) return 'Hari-H';
  return `H+${selisihHari(akhir, hariIni)}`;
}

export function susunJalur(f: FaktaJalur, hariIni: string): { langkah: LangkahJalur[]; berikutnya: IdLangkah | null } {
  const a = `/acara/${f.acaraId}`;
  const akhirHariH = f.hariH.selesai && f.hariH.mulai && f.hariH.selesai >= f.hariH.mulai ? f.hariH.selesai : f.hariH.mulai;
  const sudahLewat = !!akhirHariH && hariIni > akhirHariH;

  const tor: LangkahJalur = {
    id: 'tor',
    label: 'TOR',
    href: `${a}/tor`,
    ...(f.tor.terisi >= f.tor.total
      ? { status: 'SELESAI', keterangan: 'Lengkap' }
      : f.tor.terisi > 0
        ? { status: 'BERJALAN', keterangan: `${f.tor.terisi}/${f.tor.total} bagian` }
        : { status: 'BELUM', keterangan: 'Belum disusun' }),
  };

  const s = f.rab?.status ?? null;
  const rab: LangkahJalur = {
    id: 'rab',
    label: 'RAB',
    href: `${a}?tab=rab`,
    ...(!f.rab
      ? { status: 'TERBATAS', keterangan: 'Terbatas' }
      : s === 'DISETUJUI' || s === 'REALISASI' || s === 'SELESAI'
        ? { status: 'SELESAI', keterangan: s === 'DISETUJUI' ? 'Disetujui' : s === 'REALISASI' ? 'Realisasi' : 'Selesai' }
        : s === 'DIAJUKAN'
          ? { status: 'BERJALAN', keterangan: 'Menunggu persetujuan' }
          : s === 'DRAFT'
            ? { status: 'BERJALAN', keterangan: 'Draft' }
            : { status: 'BELUM', keterangan: 'Belum disusun' }),
  };

  const proposal: LangkahJalur = {
    id: 'proposal',
    label: 'Proposal',
    href: `${a}/proposal`,
    ...(f.proposalTersimpan
      ? { status: 'SELESAI', keterangan: 'Tersimpan' }
      : { status: 'BELUM', keterangan: 'Belum dibuat' }),
  };

  const mundur = hitungMundur(hariIni, f.hariH.mulai, f.hariH.selesai);
  const hariH: LangkahJalur = {
    id: 'hari_h',
    label: 'Hari-H',
    href: `${a}?tab=gantt`,
    ...(f.dibatalkan
      ? { status: 'BELUM', keterangan: 'Dibatalkan' }
      : !mundur
      ? { status: 'BELUM', keterangan: 'Tanggal belum ada' }
      : sudahLewat
        ? { status: 'SELESAI', keterangan: 'Terlaksana' }
        : mundur === 'Hari-H'
          ? { status: 'BERJALAN', keterangan: 'Berlangsung' }
          : { status: 'BELUM', keterangan: mundur }),
  };

  const n = f.nota;
  const nota: LangkahJalur = {
    id: 'nota',
    label: 'Nota',
    href: `${a}?tab=nota`,
    ...(!n
      ? { status: 'TERBATAS', keterangan: 'Terbatas' }
      : n.menunggu > 0
        ? { status: 'BERJALAN', keterangan: `${n.menunggu} menunggu verifikasi` }
        : n.ditolak > 0
          ? { status: 'BERJALAN', keterangan: `${n.ditolak} ditolak` }
          : n.terverifikasi > 0
            ? sudahLewat
              ? { status: 'SELESAI', keterangan: `${n.terverifikasi} terverifikasi` }
              : { status: 'BERJALAN', keterangan: `${n.terverifikasi} terverifikasi` }
            : { status: 'BELUM', keterangan: 'Belum ada nota' }),
  };

  const lpj: LangkahJalur = {
    id: 'lpj',
    label: 'LPJ',
    href: `${a}/lpj`,
    ...(f.lpj === 'TERBATAS'
      ? { status: 'TERBATAS', keterangan: 'Terbatas' }
      : f.lpj === 'FINAL'
        ? { status: 'SELESAI', keterangan: 'Final' }
        : f.lpj === 'DISETUJUI_BENDUM'
          ? { status: 'BERJALAN', keterangan: 'Menunggu Ketua' }
          : f.lpj === 'DIAJUKAN'
            ? { status: 'BERJALAN', keterangan: 'Menunggu Bendahara' }
            : f.lpj === 'DRAFT'
              ? { status: 'BERJALAN', keterangan: 'Draft' }
              : { status: 'BELUM', keterangan: sudahLewat ? 'Belum disusun' : 'Setelah acara' }),
  };

  const langkah = [tor, rab, proposal, hariH, nota, lpj];
  // Langkah berikutnya: yang pertama belum selesai dan boleh dibaca. Acara batal tidak punya.
  const berikutnya = f.dibatalkan ? null : (langkah.find((l) => l.status === 'BELUM' || l.status === 'BERJALAN')?.id ?? null);
  return { langkah, berikutnya };
}

export interface TugasSaya {
  id: string;
  judul: string;
  kolom: 'TODO' | 'IN_PROGRESS' | 'REVIEW';
  deadline: string | null;
  divisi: { id: string; nama: string };
}
