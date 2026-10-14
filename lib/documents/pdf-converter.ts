/**
 * pdf-converter — DOCX → PDF. Server-only.
 *
 * Tiga jalur, dicoba BERURUTAN menurut yang terpasang (SYSTEM_DESIGN §8.4):
 *
 *   1. GOTENBERG_URL  layanan Gotenberg terpisah (LibreOffice di dalamnya)
 *   2. SOFFICE_PATH   LibreOffice headless di mesin yang sama (VPS)
 *   3. HTML           fallback berfidelitas rendah — HANYA bila
 *                     `PDF_FALLBACK_HTML=true` diset eksplisit
 *
 * ===========================================================================
 * MENOLAK, BUKAN MENURUNKAN MUTU DIAM-DIAM (ADR-010)
 * ===========================================================================
 * `PDF_ENABLED` bukan `true` → setiap permintaan PDF ditolak `PdfTidakTersedia`
 * dengan pesan yang dapat ditampilkan apa adanya. Jalur yang terpasang gagal →
 * galat, bukan pindah diam-diam ke jalur berikutnya yang lebih buruk: surat
 * resmi dengan kop rusak lebih berbahaya daripada surat tanpa PDF.
 *
 * Jalur HTML belum punya implementasi: konversi DOCX→HTML→PDF butuh pustaka di
 * luar SYSTEM_DESIGN §2 (mammoth + Chromium headless), dan tak satu pun dapat
 * berjalan di fungsi serverless Vercel. Mengaktifkannya menghasilkan penolakan
 * yang jelas sampai ada ADR yang menambah dependency-nya.
 *
 * Setiap PDF hasil WAJIB punya lapisan teks (`periksaPdfBerteks`) — PDF yang
 * hanya berisi gambar halaman (rasterisasi) ditolak, karena teksnya tidak
 * dapat diseleksi, dicari, maupun dibaca pembaca layar.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-062 · SYSTEM_DESIGN §8.4 · ADR-010
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

if (typeof window !== 'undefined') {
  throw new Error('lib/documents/pdf-converter.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type JalurPdf = 'GOTENBERG' | 'SOFFICE' | 'HTML';

export interface KonfigPdf {
  aktif: boolean;
  gotenbergUrl: string | null;
  sofficePath: string | null;
  fallbackHtml: boolean;
}

/** Dibaca saat dipanggil, bukan saat modul dimuat (check:lazy-env). */
export function bacaKonfigPdf(env: Record<string, string | undefined> = process.env): KonfigPdf {
  const isi = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    aktif: env.PDF_ENABLED === 'true',
    gotenbergUrl: isi(env.GOTENBERG_URL),
    sofficePath: isi(env.SOFFICE_PATH),
    fallbackHtml: env.PDF_FALLBACK_HTML === 'true',
  };
}

/** Jalur pertama yang terpasang, atau `null` bila tak satu pun. Murni. */
export function pilihJalur(k: KonfigPdf): JalurPdf | null {
  if (k.gotenbergUrl) return 'GOTENBERG';
  if (k.sofficePath) return 'SOFFICE';
  if (k.fallbackHtml) return 'HTML';
  return null;
}

/** PDF memang tidak tersedia di lingkungan ini — bukan kerusakan. */
export class PdfTidakTersedia extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfTidakTersedia';
  }
}

/** Jalur terpasang tetapi konversinya gagal atau hasilnya tidak layak. */
export class GalatPdf extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GalatPdf';
  }
}

export interface HasilPdf {
  pdf: Buffer;
  jalur: JalurPdf;
  /** Hanya jalur HTML; UI wajib menandainya (kontrak T-062 butir 3). */
  fidelitasRendah: boolean;
}

/** Disuntikkan supaya ketiga jalur dapat diuji tanpa layanan sungguhan. */
export interface DepPdf {
  fetch: typeof fetch;
  jalankan: (berkas: string, argumen: string[], opsi: { timeout: number }) => Promise<void>;
}

const BATAS_MS = 60_000;

const depBawaan: DepPdf = {
  fetch: (...a) => fetch(...a),
  jalankan: (berkas, argumen, opsi) =>
    new Promise((selesai, gagal) => {
      execFile(berkas, argumen, { timeout: opsi.timeout, windowsHide: true }, (e) => (e ? gagal(e) : selesai()));
    }),
};

async function lewatGotenberg(docx: Buffer, url: string, dep: DepPdf): Promise<Buffer> {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)]), 'surat.docx');
  let r: Response;
  try {
    r = await dep.fetch(`${url.replace(/\/+$/, '')}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(BATAS_MS),
    });
  } catch (e) {
    throw new GalatPdf(`Layanan Gotenberg tidak dapat dihubungi: ${(e as Error).message}`);
  }
  if (!r.ok) throw new GalatPdf(`Gotenberg menolak konversi (HTTP ${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

async function lewatSoffice(docx: Buffer, soffice: string, dep: DepPdf): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hmif-pdf-'));
  try {
    const masuk = path.join(dir, 'surat.docx');
    await writeFile(masuk, docx);
    // Profil pengguna terpisah per konversi: dua soffice yang berbagi profil
    // saling mengunci, dan yang kedua keluar tanpa menulis apa pun.
    const profil = `-env:UserInstallation=file:///${path.join(dir, 'profil').replace(/\\/g, '/')}`;
    try {
      await dep.jalankan(soffice, [profil, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, masuk], {
        timeout: BATAS_MS,
      });
    } catch (e) {
      throw new GalatPdf(`LibreOffice gagal mengonversi: ${(e as Error).message}`);
    }
    try {
      return await readFile(path.join(dir, 'surat.pdf'));
    } catch {
      throw new GalatPdf('LibreOffice selesai tanpa menghasilkan PDF.');
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Mengonversi DOCX menjadi PDF berlapis teks. Melempar `PdfTidakTersedia`
 * (dimatikan / tak ada jalur) atau `GalatPdf` (jalur gagal / hasil raster).
 */
export async function docxToPdf(docx: Buffer, konfig: KonfigPdf = bacaKonfigPdf(), dep: DepPdf = depBawaan): Promise<HasilPdf> {
  if (!konfig.aktif) {
    throw new PdfTidakTersedia('Format PDF belum tersedia (PDF_ENABLED=false). Surat diterbitkan sebagai DOCX.');
  }
  const jalur = pilihJalur(konfig);
  if (!jalur) {
    throw new PdfTidakTersedia('PDF diaktifkan tetapi belum ada konverter terpasang (GOTENBERG_URL atau SOFFICE_PATH).');
  }
  if (jalur === 'HTML') {
    throw new PdfTidakTersedia(
      'Jalur fallback HTML→PDF belum dipasang — butuh dependency di luar SYSTEM_DESIGN §2 (ADR-010). ' +
        'Pasang Gotenberg atau LibreOffice.',
    );
  }

  const pdf = jalur === 'GOTENBERG' ? await lewatGotenberg(docx, konfig.gotenbergUrl!, dep) : await lewatSoffice(docx, konfig.sofficePath!, dep);

  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new GalatPdf('Konverter mengembalikan berkas yang bukan PDF.');
  const periksa = periksaPdfBerteks(pdf);
  if (!periksa.berteks) {
    throw new GalatPdf('PDF hasil konversi tidak memuat lapisan teks (rasterisasi) dan ditolak — ADR-010.');
  }
  return { pdf, jalur, fidelitasRendah: false };
}

// ---------------------------------------------------------------------------
// Pemeriksaan lapisan teks
// ---------------------------------------------------------------------------

export interface PemeriksaanPdf {
  /** Ada font dan operator penulis teks di content stream. */
  berteks: boolean;
  operatorTeks: number;
  gambar: number;
}

/**
 * Apakah PDF punya teks sungguhan, bukan sekadar gambar halaman.
 *
 * Menghitung operator penulis teks (`Tj`, `TJ`, `'`, `"`) dan pemilih font
 * (`Tf`) di dalam blok `BT … ET` setiap content stream — termasuk yang dimampatkan FlateDecode,
 * yang dipakai LibreOffice untuk semuanya. PDF hasil rasterisasi hanya
 * berisi `/Subtype /Image` dan operator `Do`, tanpa satu pun blok teks.
 *
 * Bukan ekstraktor teks lengkap: font subset LibreOffice menulis glyph ID,
 * bukan huruf, sehingga membaca isinya butuh CMap ToUnicode. Untuk menolak
 * rasterisasi, keberadaan lapisan teks sudah cukup; isi surat diperiksa
 * manual saat Gotenberg pertama kali dipasang (HANDOFF).
 */
export function periksaPdfBerteks(pdf: Buffer): PemeriksaanPdf {
  const teks = pdf.toString('latin1');
  let operatorTeks = 0;
  let gambar = 0;
  let berfont = false;

  const pola = /<<((?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>)*)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = pola.exec(teks)) !== null) {
    const kamus = m[1] ?? '';
    const awal = m.index + m[0].length;
    const akhir = teks.indexOf('endstream', awal);
    if (akhir === -1) break;
    if (/\/Subtype\s*\/Image/.test(kamus)) {
      gambar++;
      continue;
    }
    let isi = pdf.subarray(awal, akhir);
    if (/\/FlateDecode/.test(kamus)) {
      try {
        isi = inflateSync(isi);
      } catch {
        try {
          // Beberapa penulis menyertakan CRLF sebelum `endstream`.
          isi = inflateSync(isi.subarray(0, Math.max(0, isi.length - 2)));
        } catch {
          continue;
        }
      }
    } else if (/\/Filter/.test(kamus)) {
      continue;
    }
    const s = isi.toString('latin1');
    for (const blok of s.match(/\bBT\b[\s\S]*?\bET\b/g) ?? []) {
      operatorTeks += (blok.match(/(?:\)|>|\])\s*(?:Tj|TJ|'|")/g) ?? []).length;
      if (/\/[^\s/]+\s+[\d.]+\s+Tf\b/.test(blok)) berfont = true;
    }
  }

  // `Tf` (pilih font) di dalam blok teks, bukan kamus `/Type /Font`: LibreOffice
  // dapat menyimpan kamus font di object stream termampat yang tak terbaca di sini.
  return { berteks: berfont && operatorTeks > 0, operatorTeks, gambar };
}
