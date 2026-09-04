/**
 * parse-tabel — membaca CSV/XLSX menjadi baris tervalidasi, siap dipratinjau.
 *
 * Dipakai T-048 (import pengurus), dan sejak awal dibuat generik karena T-092
 * (data peserta) dan T-107 (data pengurus kesekretariatan) akan memakainya
 * dengan kolom dan aturan yang berbeda. Karena itu modul ini TIDAK tahu apa pun
 * tentang pengguna, NIM, atau departemen: pemanggil menyerahkan definisi kolom
 * dan satu skema Zod, dan modul ini mengurus sisanya.
 *
 * ===========================================================================
 * TIDAK MENYENTUH DATABASE, DAN ITU YANG MEMBUATNYA DAPAT DIPAKAI ULANG
 * ===========================================================================
 * Klausa **Jangan** T-048 berbunyi: jangan menyimpan apa pun sebelum pengguna
 * menekan konfirmasi. Cara paling sederhana memenuhinya bukan disiplin melainkan
 * bentuk — modul ini tidak punya akses database sama sekali, jadi ia tidak
 * mungkin menyimpan apa pun walau salah dipakai.
 *
 * Duplikat TERHADAP DATABASE tetap perlu ditandai di pratinjau. Itu masuk lewat
 * `opsi.sudahAda`, sebuah predikat yang disuntik pemanggil. Modul ini hanya
 * memanggilnya; yang tahu isi database tetap pemanggilnya.
 *
 * ===========================================================================
 * TIGA KELAS BARIS, DAN KENAPA DUPLIKAT BUKAN ERROR
 * ===========================================================================
 * USER_FLOW §9.1 menetapkan tiga kelas: valid, peringatan, error. NIM duplikat
 * disebut di sana sebagai PERINGATAN, NIM kosong sebagai ERROR.
 *
 * Bedanya bukan selera. Baris ERROR tidak dapat disimpan sama sekali — datanya
 * memang tidak lengkap. Baris PERINGATAN dapat disimpan, dan keputusannya milik
 * manusia: NIM yang sama bisa berarti berkas hasil ekspor memuat orang yang
 * sama dua kali, bisa juga berarti dua orang berbeda yang salah satunya salah
 * ketik. Sistem tidak dapat membedakannya, jadi ia tidak boleh memutuskan.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-048 · PRD F-1.2 · USER_FLOW §9.1
 */

import type { ZodType } from 'zod';

// ---------------------------------------------------------------------------
// Bentuk data
// ---------------------------------------------------------------------------

/** Satu kolom yang diharapkan ada di berkas. */
export interface DefinisiKolom {
  /** Nama medan pada objek hasil. */
  kunci: string;
  /** Judul yang ditampilkan pada layar pemetaan. */
  label: string;
  /**
   * Judul kolom yang dikenali otomatis, selain `label`.
   *
   * Dicocokkan setelah dinormalkan (huruf kecil, tanda baca dibuang), jadi
   * "Nama Lengkap", "nama_lengkap", dan "NAMA LENGKAP" cukup ditulis sekali.
   */
  alias?: string[];
  wajib?: boolean;
}

export type TingkatMasalah = 'ERROR' | 'PERINGATAN';

export interface Masalah {
  tingkat: TingkatMasalah;
  /** Kunci kolom yang bermasalah, bila masalahnya menunjuk satu kolom. */
  kolom?: string;
  pesan: string;
}

export type StatusBaris = 'VALID' | 'PERINGATAN' | 'ERROR';

export interface BarisHasil<T> {
  /** Nomor baris di BERKAS ASLI, 1-based dan sudah memperhitungkan header. */
  nomor: number;
  /** Terisi hanya bila tidak ada masalah bertingkat ERROR. */
  data: T | null;
  masalah: Masalah[];
  status: StatusBaris;
}

export interface HasilParse<T> {
  /** Kunci kolom → indeks kolom di berkas. `-1` berarti tidak ditemukan. */
  peta: Record<string, number>;
  /** Judul kolom di berkas yang tidak dikenali satu pun definisi. */
  takDikenal: string[];
  /** Kunci kolom wajib yang tidak ditemukan di berkas. */
  hilang: string[];
  baris: BarisHasil<T>[];
  ringkas: { total: number; valid: number; peringatan: number; error: number };
}

export interface OpsiParse<T> {
  /**
   * Pemetaan manual dari layar pemetaan, menimpa deteksi otomatis.
   * Kunci kolom → indeks kolom di berkas.
   */
  petaManual?: Record<string, number>;
  /** Kunci yang harus unik. Duplikat di dalam berkas menjadi PERINGATAN. */
  kunciUnik?: string;
  /**
   * Apakah nilai `kunciUnik` sudah ada di penyimpanan.
   *
   * Disuntik pemanggil karena modul ini sengaja tidak mengenal database.
   */
  sudahAda?: (nilai: string) => boolean;
  /** Batas jumlah baris data. Melindungi dari berkas yang tidak masuk akal. */
  batasBaris?: number;
  /** Dipanggil untuk tiap baris yang lolos skema, untuk aturan tambahan. */
  periksaTambahan?: (data: T, nomor: number) => Masalah[];
}

const BATAS_BARIS_BAWAAN = 5_000;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Menebak pemisah kolom dari baris pertama.
 *
 * Titik koma diperiksa lebih dulu dan itu disengaja: Excel berbahasa Indonesia
 * menyimpan CSV dengan pemisah `;` karena koma sudah dipakai sebagai pemisah
 * desimal. Berkas seperti itu, bila dibaca dengan koma, menghasilkan SATU kolom
 * berisi seluruh baris — dan gejalanya bukan error melainkan "semua kolom tidak
 * dikenali", yang membuat orang menyalahkan judul kolomnya.
 *
 * Yang dihitung hanya pemisah DI LUAR tanda kutip, supaya nama berkoma seperti
 * `"Putri, Nadia"` tidak membuat koma tampak menang.
 */
function tebakPemisah(barisPertama: string): string {
  const kandidat = [';', ',', '\t'];
  let terbaik = ',';
  let terbanyak = 0;

  for (const p of kandidat) {
    let n = 0;
    let dalamKutip = false;
    for (let i = 0; i < barisPertama.length; i++) {
      const c = barisPertama[i];
      if (c === '"') dalamKutip = !dalamKutip;
      else if (c === p && !dalamKutip) n++;
    }
    if (n > terbanyak) {
      terbanyak = n;
      terbaik = p;
    }
  }

  return terbaik;
}

/**
 * Membaca CSV menjadi matriks teks.
 *
 * Ditulis tangan, bukan memakai pustaka: satu-satunya kebutuhan di sini adalah
 * RFC 4180 apa adanya, dan menambah dependency untuk itu berarti menambah
 * permukaan yang harus dipelihara demi kode yang muat di satu layar.
 *
 * Yang ditangani dan mudah terlewat: BOM UTF-8 dari Excel, akhir baris CRLF,
 * tanda kutip ganda di dalam medan berkutip (`""`), dan baris baru DI DALAM
 * medan berkutip — yang terakhir membuat pemisahan per-baris naif salah tanpa
 * satu pun error.
 */
export function bacaCsv(isi: string): string[][] {
  const teks = isi.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!teks.trim()) return [];

  const pemisah = tebakPemisah(teks.split('\n')[0] ?? '');
  const matriks: string[][] = [];
  let baris: string[] = [];
  let medan = '';
  let dalamKutip = false;

  for (let i = 0; i < teks.length; i++) {
    const c = teks[i]!;

    if (dalamKutip) {
      if (c === '"') {
        if (teks[i + 1] === '"') {
          medan += '"';
          i++;
        } else {
          dalamKutip = false;
        }
      } else {
        medan += c;
      }
      continue;
    }

    if (c === '"') dalamKutip = true;
    else if (c === pemisah) {
      baris.push(medan);
      medan = '';
    } else if (c === '\n') {
      baris.push(medan);
      matriks.push(baris);
      baris = [];
      medan = '';
    } else medan += c;
  }

  if (medan !== '' || baris.length) {
    baris.push(medan);
    matriks.push(baris);
  }

  // Baris yang seluruh selnya kosong dibuang. Excel gemar menyisakan puluhan
  // baris seperti itu di bawah data, dan tanpa ini pratinjau melaporkan
  // "37 baris error" untuk berkas yang sebenarnya bersih.
  return matriks.filter((b) => b.some((sel) => sel.trim() !== ''));
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/** Nilai sel exceljs → teks. */
function selKeTeks(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return '';
  if (typeof nilai === 'string') return nilai;
  if (typeof nilai === 'number' || typeof nilai === 'boolean') return String(nilai);
  if (nilai instanceof Date) return nilai.toISOString().slice(0, 10);

  const o = nilai as Record<string, unknown>;
  // Sel berformula: yang dipakai hasilnya, bukan rumusnya.
  if ('result' in o) return selKeTeks(o.result);
  if ('text' in o) return selKeTeks(o.text);
  // Rich text: potongan-potongan yang harus disatukan.
  if (Array.isArray(o.richText)) {
    return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
  }
  if ('hyperlink' in o) return selKeTeks(o.text ?? o.hyperlink);

  return String(nilai);
}

/**
 * Membaca sheet PERTAMA sebuah XLSX menjadi matriks teks.
 *
 * Hanya sheet pertama. Berkas hasil form pendataan kerap memuat sheet kedua
 * berisi daftar pilihan dropdown; membacanya akan menyisipkan puluhan baris
 * sampah ke pratinjau.
 */
export async function bacaXlsx(buf: Buffer | ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);

  const ws = wb.worksheets[0];
  if (!ws) return [];

  const matriks: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const nilai = row.values as unknown[];
    // exceljs memakai indeks 1-based dan menaruh `undefined` di posisi 0.
    const sel = nilai.slice(1).map(selKeTeks);
    if (sel.some((s) => s.trim() !== '')) matriks.push(sel);
  });

  return matriks;
}

/** Memilih pembaca berdasarkan nama berkas. */
export async function bacaTabel(namaBerkas: string, isi: Buffer): Promise<string[][]> {
  const ekstensi = namaBerkas.toLowerCase().split('.').pop() ?? '';

  if (ekstensi === 'xlsx' || ekstensi === 'xlsm') return bacaXlsx(isi);
  if (ekstensi === 'csv' || ekstensi === 'txt' || ekstensi === 'tsv') {
    return bacaCsv(isi.toString('utf8'));
  }

  throw new Error(
    `Format berkas ".${ekstensi}" tidak didukung. Gunakan CSV atau XLSX.`,
  );
}

// ---------------------------------------------------------------------------
// Deteksi kolom
// ---------------------------------------------------------------------------

/**
 * Menormalkan judul kolom sebelum dicocokkan.
 *
 * Tanpa ini, "Nama Lengkap", "nama_lengkap", dan "NAMA  LENGKAP" harus ditulis
 * satu per satu sebagai alias — dan yang terlupa akan muncul sebagai kolom tak
 * dikenal yang membingungkan.
 */
function normalkan(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mencocokkan judul kolom berkas dengan definisi.
 *
 * Kolom yang sudah terpakai tidak dicocokkan dua kali: berkas yang memuat
 * "Nama" dan "Nama Lengkap" sekaligus akan memakai yang pertama cocok, dan
 * sisanya masuk `takDikenal` supaya terlihat di layar pemetaan.
 */
export function deteksiKolom(
  header: string[],
  definisi: DefinisiKolom[],
): { peta: Record<string, number>; takDikenal: string[]; hilang: string[] } {
  const peta: Record<string, number> = {};
  const terpakai = new Set<number>();

  for (const d of definisi) {
    const calon = [d.label, ...(d.alias ?? [])].map(normalkan);
    const i = header.findIndex((h, idx) => !terpakai.has(idx) && calon.includes(normalkan(h)));
    peta[d.kunci] = i;
    if (i >= 0) terpakai.add(i);
  }

  return {
    peta,
    takDikenal: header.filter((h, i) => !terpakai.has(i) && h.trim() !== ''),
    hilang: definisi.filter((d) => d.wajib && peta[d.kunci] === -1).map((d) => d.kunci),
  };
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function statusDari(masalah: Masalah[]): StatusBaris {
  if (masalah.some((m) => m.tingkat === 'ERROR')) return 'ERROR';
  return masalah.length ? 'PERINGATAN' : 'VALID';
}

/**
 * Mengubah matriks teks menjadi baris tervalidasi.
 *
 * Baris pertama SELALU dianggap header. Berkas tanpa header tidak didukung, dan
 * itu disengaja: menebak apakah baris pertama data atau judul selalu salah pada
 * sebagian berkas, dan salahnya diam — satu orang hilang dari hasil import
 * tanpa satu pun peringatan.
 */
export function parseTabel<T>(
  matriks: string[][],
  definisi: DefinisiKolom[],
  skema: ZodType<T>,
  opsi: OpsiParse<T> = {},
): HasilParse<T> {
  const kosong: HasilParse<T> = {
    peta: {},
    takDikenal: [],
    hilang: definisi.filter((d) => d.wajib).map((d) => d.kunci),
    baris: [],
    ringkas: { total: 0, valid: 0, peringatan: 0, error: 0 },
  };

  if (!matriks.length) return kosong;

  const header = matriks[0]!;
  const otomatis = deteksiKolom(header, definisi);
  const peta = { ...otomatis.peta, ...(opsi.petaManual ?? {}) };
  const hilang = definisi.filter((d) => d.wajib && (peta[d.kunci] ?? -1) < 0).map((d) => d.kunci);

  const batas = opsi.batasBaris ?? BATAS_BARIS_BAWAAN;
  const isi = matriks.slice(1, 1 + batas);

  // Hitungan kemunculan nilai kunci unik DI DALAM berkas. Dikumpulkan lebih
  // dulu supaya kemunculan PERTAMA pun ikut ditandai — menandai hanya yang
  // kedua membuat pengguna mengira baris pertamanya bersih, lalu bingung
  // kenapa "duplikat" hanya satu padahal ada dua baris yang sama.
  const hitung = new Map<string, number>();
  if (opsi.kunciUnik) {
    const kolom = peta[opsi.kunciUnik] ?? -1;
    if (kolom >= 0) {
      for (const b of isi) {
        const nilai = (b[kolom] ?? '').trim();
        if (nilai) hitung.set(nilai, (hitung.get(nilai) ?? 0) + 1);
      }
    }
  }

  const baris: BarisHasil<T>[] = isi.map((sel, i) => {
    const nomor = i + 2; // +1 karena 1-based, +1 lagi karena baris header
    const masalah: Masalah[] = [];

    if (hilang.length) {
      masalah.push({
        tingkat: 'ERROR',
        pesan: `Kolom wajib belum dipetakan: ${hilang.join(', ')}.`,
      });
      return { nomor, data: null, masalah, status: 'ERROR' };
    }

    const mentah: Record<string, string> = {};
    for (const d of definisi) {
      const k = peta[d.kunci] ?? -1;
      mentah[d.kunci] = k >= 0 ? (sel[k] ?? '').trim() : '';
    }

    const h = skema.safeParse(mentah);
    if (!h.success) {
      for (const issue of h.error.issues) {
        masalah.push({
          tingkat: 'ERROR',
          kolom: typeof issue.path[0] === 'string' ? issue.path[0] : undefined,
          pesan: issue.message,
        });
      }
      return { nomor, data: null, masalah, status: 'ERROR' };
    }

    if (opsi.kunciUnik) {
      const nilai = mentah[opsi.kunciUnik] ?? '';
      if (nilai && (hitung.get(nilai) ?? 0) > 1) {
        masalah.push({
          tingkat: 'PERINGATAN',
          kolom: opsi.kunciUnik,
          pesan: `Nilai "${nilai}" muncul ${hitung.get(nilai)} kali di berkas ini.`,
        });
      }
      if (nilai && opsi.sudahAda?.(nilai)) {
        masalah.push({
          tingkat: 'PERINGATAN',
          kolom: opsi.kunciUnik,
          pesan: `Nilai "${nilai}" sudah terdaftar di sistem.`,
        });
      }
    }

    masalah.push(...(opsi.periksaTambahan?.(h.data, nomor) ?? []));

    const status = statusDari(masalah);
    return { nomor, data: status === 'ERROR' ? null : h.data, masalah, status };
  });

  return {
    peta,
    takDikenal: otomatis.takDikenal,
    hilang,
    baris,
    ringkas: {
      total: baris.length,
      valid: baris.filter((b) => b.status === 'VALID').length,
      peringatan: baris.filter((b) => b.status === 'PERINGATAN').length,
      error: baris.filter((b) => b.status === 'ERROR').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------

/**
 * Baris yang benar-benar akan disimpan.
 *
 * `lewati` memuat nomor baris yang dicentang pengguna untuk dilewati — satuan,
 * sesuai kontrak T-048 butir 3. Baris ERROR tidak pernah ikut, dengan atau
 * tanpa centang.
 */
export function barisUntukDisimpan<T>(hasil: HasilParse<T>, lewati: number[] = []): T[] {
  const dilewati = new Set(lewati);
  return hasil.baris
    .filter((b) => b.status !== 'ERROR' && !dilewati.has(b.nomor) && b.data !== null)
    .map((b) => b.data as T);
}

/**
 * Laporan CSV berisi baris bermasalah, untuk diunduh (kontrak T-048 butir 4).
 *
 * Berisi baris ERROR dan PERINGATAN sekaligus, bukan error saja: yang perlu
 * diperiksa manusia justru keduanya, dan memisahkannya menjadi dua berkas
 * membuat orang memperbaiki separuh lalu mengunggah ulang.
 */
export function laporanCsv<T>(hasil: HasilParse<T>): string {
  const kutip = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const baris = [['baris', 'status', 'kolom', 'pesan'].join(',')];

  for (const b of hasil.baris) {
    if (b.status === 'VALID') continue;
    for (const m of b.masalah) {
      baris.push([String(b.nomor), m.tingkat, kutip(m.kolom ?? ''), kutip(m.pesan)].join(','));
    }
  }

  // BOM supaya Excel membuka teks berbahasa Indonesia tanpa merusak huruf
  // beraksen. Tanpa ini "Peminjaman Ruangan" tetap benar, tetapi nama orang
  // seperti "Nurul Aisyah Fadhilah" yang mengandung karakter non-ASCII rusak.
  return '﻿' + baris.join('\r\n');
}
