import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  GalatPdf,
  PdfTidakTersedia,
  bacaKonfigPdf,
  docxToPdf,
  periksaPdfBerteks,
  pilihJalur,
  type DepPdf,
  type KonfigPdf,
} from '@/lib/documents/pdf-converter';

// ---------------------------------------------------------------------------
// PDF buatan tangan — cukup untuk pemeriksa lapisan teks
// ---------------------------------------------------------------------------

function pdf(isiHalaman: Buffer, kamusIsi: string, tambahan = ''): Buffer {
  return Buffer.concat([
    Buffer.from(
      '%PDF-1.4\n' +
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
        '/Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >> endobj\n' +
        `4 0 obj << /Length ${isiHalaman.length}${kamusIsi} >>\nstream\n`,
      'latin1',
    ),
    isiHalaman,
    Buffer.from(
      '\nendstream endobj\n' + '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n' + tambahan + 'trailer << /Root 1 0 R >>\n%%EOF\n',
      'latin1',
    ),
  ]);
}

const TEKS = Buffer.from('BT /F1 12 Tf 72 712 Td (Surat Uji HMIF) Tj 0 -14 Td [(Nomor) -250 (05/001)] TJ ET', 'latin1');
const GAMBAR =
  '6 0 obj << /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\xff\nendstream endobj\n';

const PDF_TEKS = pdf(TEKS, '');
const PDF_TEKS_MAMPAT = pdf(deflateSync(TEKS), ' /Filter /FlateDecode');
const PDF_RASTER = pdf(Buffer.from('q 595 0 0 842 0 0 cm /Im1 Do Q', 'latin1'), '', GAMBAR);

const DOCX = Buffer.from('PK\u0003\u0004 bukan docx sungguhan — konverter disuntik');

const AKTIF: KonfigPdf = { aktif: true, gotenbergUrl: 'http://gotenberg.uji:3000/', sofficePath: null, fallbackHtml: false };

function depGotenberg(jawab: () => Response | Promise<Response>): DepPdf & { fetch: ReturnType<typeof vi.fn> } {
  return { fetch: vi.fn(async () => jawab()), jalankan: vi.fn(async () => undefined) } as never;
}

// ---------------------------------------------------------------------------

describe('periksaPdfBerteks', () => {
  it('PDF dengan blok teks dan font → berteks', () => {
    const r = periksaPdfBerteks(PDF_TEKS);
    expect(r).toMatchObject({ berteks: true, gambar: 0 });
    expect(r.operatorTeks).toBe(2);
  });

  it('content stream FlateDecode (bentuk LibreOffice) tetap terbaca', () => {
    expect(periksaPdfBerteks(PDF_TEKS_MAMPAT)).toMatchObject({ berteks: true, operatorTeks: 2 });
  });

  it('PDF berisi gambar halaman saja (rasterisasi) → TIDAK berteks', () => {
    expect(periksaPdfBerteks(PDF_RASTER)).toEqual({ berteks: false, operatorTeks: 0, gambar: 1 });
  });

  it('bukan PDF → tidak berteks, tanpa melempar', () => {
    expect(periksaPdfBerteks(Buffer.from('halo')).berteks).toBe(false);
  });
});

describe('konfigurasi dan pemilihan jalur', () => {
  it('membaca env; hanya "true" yang mengaktifkan', () => {
    expect(bacaKonfigPdf({ PDF_ENABLED: 'false', GOTENBERG_URL: 'http://g' })).toEqual({
      aktif: false,
      gotenbergUrl: 'http://g',
      sofficePath: null,
      fallbackHtml: false,
    });
    expect(bacaKonfigPdf({ PDF_ENABLED: '1' }).aktif).toBe(false);
    expect(bacaKonfigPdf({ PDF_ENABLED: 'true', SOFFICE_PATH: '  ' }).sofficePath).toBeNull();
  });

  it('urutan: Gotenberg → soffice → HTML (hanya bila eksplisit)', () => {
    const k = { aktif: true, gotenbergUrl: null, sofficePath: null, fallbackHtml: false };
    expect(pilihJalur({ ...k, gotenbergUrl: 'x', sofficePath: 'y', fallbackHtml: true })).toBe('GOTENBERG');
    expect(pilihJalur({ ...k, sofficePath: 'y', fallbackHtml: true })).toBe('SOFFICE');
    expect(pilihJalur({ ...k, fallbackHtml: true })).toBe('HTML');
    expect(pilihJalur(k)).toBeNull();
  });
});

describe('docxToPdf — menolak dengan jelas, tidak menurunkan mutu diam-diam (ADR-010)', () => {
  it('PDF_ENABLED=false → PdfTidakTersedia, konverter tidak disentuh walau terpasang', async () => {
    const dep = depGotenberg(() => new Response(new Uint8Array(PDF_TEKS)));
    await expect(docxToPdf(DOCX, { ...AKTIF, aktif: false }, dep)).rejects.toThrowError(PdfTidakTersedia);
    await expect(docxToPdf(DOCX, { ...AKTIF, aktif: false }, dep)).rejects.toThrow(/PDF_ENABLED=false/);
    expect(dep.fetch).not.toHaveBeenCalled();
  });

  it('aktif tanpa konverter → PdfTidakTersedia', async () => {
    await expect(docxToPdf(DOCX, { ...AKTIF, gotenbergUrl: null })).rejects.toThrow(/belum ada konverter/);
  });

  it('fallback HTML yang diaktifkan tetap menolak — belum dipasang', async () => {
    await expect(docxToPdf(DOCX, { ...AKTIF, gotenbergUrl: null, fallbackHtml: true })).rejects.toThrow(/fallback HTML→PDF belum dipasang/);
  });

  it('Gotenberg: DOCX dikirim sebagai `files` ke /forms/libreoffice/convert', async () => {
    const dep = depGotenberg(() => new Response(new Uint8Array(PDF_TEKS_MAMPAT), { headers: { 'content-type': 'application/pdf' } }));
    const r = await docxToPdf(DOCX, AKTIF, dep);
    expect(r).toMatchObject({ jalur: 'GOTENBERG', fidelitasRendah: false });
    expect(r.pdf.equals(PDF_TEKS_MAMPAT)).toBe(true);
    const [url, init] = dep.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gotenberg.uji:3000/forms/libreoffice/convert');
    expect(init.method).toBe('POST');
    const berkas = (init.body as FormData).get('files') as File;
    expect(berkas.name).toBe('surat.docx');
    expect(Buffer.from(await berkas.arrayBuffer()).equals(DOCX)).toBe(true);
  });

  it('Gotenberg mengembalikan PDF raster → GalatPdf, bukan diterima', async () => {
    const dep = depGotenberg(() => new Response(new Uint8Array(PDF_RASTER)));
    await expect(docxToPdf(DOCX, AKTIF, dep)).rejects.toThrowError(GalatPdf);
    await expect(docxToPdf(DOCX, AKTIF, dep)).rejects.toThrow(/rasterisasi/);
  });

  it('Gotenberg galat HTTP / tak terjangkau / bukan PDF → GalatPdf', async () => {
    await expect(docxToPdf(DOCX, AKTIF, depGotenberg(() => new Response('x', { status: 503 })))).rejects.toThrow(/HTTP 503/);
    await expect(
      docxToPdf(DOCX, AKTIF, depGotenberg(() => Promise.reject(new Error('ECONNREFUSED')))),
    ).rejects.toThrow(/tidak dapat dihubungi/);
    await expect(docxToPdf(DOCX, AKTIF, depGotenberg(() => new Response('<html>')))).rejects.toThrow(/bukan PDF/);
  });

  it('soffice: dipanggil headless dengan profil sendiri; PDF dibaca dari outdir', async () => {
    const jalankan = vi.fn(async (_berkas: string, argumen: string[]) => {
      const outdir = argumen[argumen.indexOf('--outdir') + 1]!;
      writeFileSync(path.join(outdir, 'surat.pdf'), PDF_TEKS);
    });
    const r = await docxToPdf(DOCX, { ...AKTIF, gotenbergUrl: null, sofficePath: '/opt/lo/soffice' }, { fetch: vi.fn() as never, jalankan });
    expect(r.jalur).toBe('SOFFICE');
    const [berkas, argumen] = jalankan.mock.calls[0]!;
    expect(berkas).toBe('/opt/lo/soffice');
    expect(argumen).toEqual(expect.arrayContaining(['--headless', '--convert-to', 'pdf']));
    expect(argumen[0]).toMatch(/^-env:UserInstallation=file:\/\/\//);
  });

  it('soffice selesai tanpa berkas / gagal → GalatPdf', async () => {
    const k = { ...AKTIF, gotenbergUrl: null, sofficePath: 'soffice' };
    await expect(docxToPdf(DOCX, k, { fetch: vi.fn() as never, jalankan: vi.fn(async () => undefined) })).rejects.toThrow(/tanpa menghasilkan PDF/);
    await expect(
      docxToPdf(DOCX, k, { fetch: vi.fn() as never, jalankan: vi.fn(async () => Promise.reject(new Error('timeout'))) }),
    ).rejects.toThrow(/LibreOffice gagal/);
  });
});
