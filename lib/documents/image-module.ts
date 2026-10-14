/**
 * image-module — gambar inline untuk tag `{%nama}` docxtemplater. Server-only.
 *
 * ===========================================================================
 * KENAPA BUKAN docxtemplater-image-module-free
 * ===========================================================================
 * SYSTEM_DESIGN §2 menyebut paket itu, tetapi versi terakhirnya (1.1.1) menarik
 * `xmldom@0.1.31` yang ditandai rentan (CVE-2021-21366) dan sudah ditinggalkan
 * pembuatnya. Yang dibutuhkan surat HMIF jauh lebih sempit dari yang paket itu
 * tawarkan: satu gambar PNG inline per tag, ukuran tetap, hanya DOCX. Modul di
 * bawah ini memakai API modul resmi docxtemplater dan tidak bergantung pada
 * paket lain (ADR-029).
 *
 * ===========================================================================
 * CARA KERJANYA
 * ===========================================================================
 * Tag `{%ttd}` berada di dalam `<w:t>`. Render menutup `<w:t>` dan `<w:r>` yang
 * sedang terbuka, menulis satu run berisi `<w:drawing>` (inline, atau melayang
 * di dalam sel seperti tanda tangan berkas contoh), lalu membuka run dan
 * `<w:t>` baru untuk sisa teks di potongan yang sama. Dengan begitu tag tidak
 * wajib berdiri sendiri di paragrafnya — `{#kanan}{%ttd}{%stempel}` tetap sah,
 * dan tag loop di sebelahnya tidak ikut terhapus seperti bila tag diperluas ke
 * seluruh `<w:t>`.
 *
 * Konsekuensinya: run baru itu TIDAK membawa format run asal. Tag gambar karena
 * itu wajib berada di AKHIR teksnya — `{nama}{%ttd}`, bukan `{%ttd}{nama}` —
 * dan `docx-engine.test.ts` memeriksa setiap template untuk itu.
 *
 * Relasi dan berkas media baru ditambahkan SESUDAH render (`pasangGambar`),
 * karena baru saat itu diketahui berapa gambar yang benar-benar dipakai — loop
 * yang kosong tidak menyisakan gambar yatim di dalam zip.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-061 · SYSTEM_DESIGN §8 · ADR-004, ADR-029
 */

import type { DXT } from 'docxtemplater';
import type PizZip from 'pizzip';
import sharp from 'sharp';

if (typeof window !== 'undefined') {
  throw new Error('lib/documents/image-module.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

/** Nilai yang diterima tag `{%…}`. `null`/`undefined` → tidak ada gambar. */
export interface GambarDocx {
  png: Buffer;
  /** Ukuran TAMPIL di dokumen, dalam piksel 96 dpi. */
  lebarPx: number;
  tinggiPx: number;
  /**
   * Gambar melayang, ditengahkan di kolomnya dan dinaikkan `naikPx` dari
   * paragraf tempat tag berada — seperti tanda tangan pada berkas contoh, yang
   * menempati ruang kosong di atas nama alih-alih menambah tinggi baris.
   * Tanpa ini gambar inline.
   */
  melayang?: { naikPx: number };
}

const NAMA_MODUL = 'hmif/gambar-inline';
const EMU_PER_PX = 9525;
const REL_GAMBAR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

interface GambarTerpakai {
  rId: string;
  berkas: string;
  png: Buffer;
}

function adalahGambar(v: unknown): v is GambarDocx {
  if (!v || typeof v !== 'object') return false;
  const g = v as Partial<GambarDocx>;
  return Buffer.isBuffer(g.png) && Number.isFinite(g.lebarPx) && Number.isFinite(g.tinggiPx);
}

function drawing(rId: string, nomor: number, g: GambarDocx): string {
  const cx = Math.round(g.lebarPx * EMU_PER_PX);
  const cy = Math.round(g.tinggiPx * EMU_PER_PX);
  const nama = `Gambar ${nomor}`;
  const ukuran = `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`;
  const docPr = `<wp:docPr id="${9000 + nomor}" name="${nama}"/>`;
  // Atribut anchor disalin dari tanda tangan berkas contoh HMIF: tanpa bungkus
  // teks, di dalam sel tabel (layoutInCell), di depan teks.
  const buka = g.melayang
    ? '<wp:anchor allowOverlap="1" behindDoc="0" distB="0" distT="0" distL="0" distR="0" hidden="0" ' +
      'layoutInCell="1" locked="0" relativeHeight="251659264" simplePos="0">' +
      '<wp:simplePos x="0" y="0"/>' +
      '<wp:positionH relativeFrom="column"><wp:align>center</wp:align></wp:positionH>' +
      `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${-Math.round(g.melayang.naikPx * EMU_PER_PX)}</wp:posOffset></wp:positionV>` +
      ukuran +
      '<wp:wrapNone/>' +
      docPr
    : '<wp:inline distT="0" distB="0" distL="0" distR="0">' + ukuran + docPr;
  return (
    '<w:drawing>' +
    buka +
    '<wp:cNvGraphicFramePr>' +
    '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>' +
    '</wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="0" name="${nama}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    '<pic:spPr>' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr>' +
    '</pic:pic>' +
    '</a:graphicData>' +
    '</a:graphic>' +
    (g.melayang ? '</wp:anchor>' : '</wp:inline>') +
    '</w:drawing>'
  );
}

/**
 * Satu instans per render — daftar gambar terpakai milik dokumen itu saja.
 * Bentuknya objek modul docxtemplater; metode lain diisi bawaan oleh
 * pembungkus modul docxtemplater sendiri.
 */
export class ModulGambar implements DXT.Module {
  readonly name = 'ModulGambarHmif';
  readonly terpakai: GambarTerpakai[] = [];

  matchers(): [string, string, Record<string, unknown>][] {
    return [['%', NAMA_MODUL, {}]];
  }

  render(part: DXT.Part, options: DXT.RenderOptions): DXT.Rendered | null {
    if (part.module !== NAMA_MODUL) return null;
    const nilai: unknown = options.scopeManager.getValue(part.value, { part });
    if (nilai === null || nilai === undefined || nilai === false || nilai === '') return { value: '', errors: [] };
    if (!adalahGambar(nilai)) {
      return { value: '', errors: [new Error(`Tag {%${part.value}} harus berisi gambar PNG, bukan ${typeof nilai}.`)] };
    }

    const nomor = this.terpakai.length + 1;
    const rId = `rIdHmifGambar${nomor}`;
    this.terpakai.push({ rId, berkas: `media/hmif_gambar${nomor}.png`, png: nilai.png });
    return {
      value: `</w:t></w:r><w:r>${drawing(rId, nomor, nilai)}</w:r><w:r><w:t xml:space="preserve">`,
      errors: [],
    };
  }
}

/**
 * Menambahkan berkas media, relasi, dan content type untuk setiap gambar yang
 * dipakai render. Dipanggil sekali, sesudah `doc.render()`.
 */
export function pasangGambar(zip: PizZip, modul: ModulGambar): void {
  if (modul.terpakai.length === 0) return;

  const relsPath = 'word/_rels/document.xml.rels';
  const rels = zip.file(relsPath)?.asText();
  if (!rels) throw new Error('Template tidak punya word/_rels/document.xml.rels — bukan .docx yang sah.');
  const tambahan = modul.terpakai
    .map((g) => `<Relationship Id="${g.rId}" Type="${REL_GAMBAR}" Target="${g.berkas}"/>`)
    .join('');
  zip.file(relsPath, rels.replace('</Relationships>', `${tambahan}</Relationships>`));

  for (const g of modul.terpakai) zip.file(`word/${g.berkas}`, g.png);

  const ctPath = '[Content_Types].xml';
  const ct = zip.file(ctPath)?.asText() ?? '';
  // Urutan atribut bebas — template HMIF menulis ContentType lebih dulu. Default
  // ganda untuk ekstensi yang sama membuat Word menolak membuka berkasnya.
  if (!/<Default\b[^>]*\bExtension="png"/i.test(ct)) {
    zip.file(ctPath, ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  }

  // Gambar inline memakai prefix wp:, a:, pic:, r:. `a:` dan `pic:` dideklarasikan
  // di tempat; `wp:` dan `r:` wajib ada di akar dokumen.
  const docPath = 'word/document.xml';
  const doc = zip.file(docPath)?.asText() ?? '';
  const akar = /<w:document\b[^>]*>/.exec(doc)?.[0] ?? '';
  const kurang: string[] = [];
  if (!akar.includes('xmlns:wp=')) kurang.push('xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"');
  if (!akar.includes('xmlns:r=')) kurang.push('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  if (kurang.length > 0) {
    zip.file(docPath, doc.replace(akar, akar.replace(/>$/, ` ${kurang.join(' ')}>`)));
  }
}

// ---------------------------------------------------------------------------
// Tanda tangan + stempel
// ---------------------------------------------------------------------------

/** Ukuran tampil blok TTD di dokumen: ±5,3 × 2,6 cm. */
export const UKURAN_TTD = { lebarPx: 200, tinggiPx: 100 } as const;
/** Faktor resolusi kanvas terhadap ukuran tampil, supaya tetap tajam saat dicetak. */
const SKALA = 3;

/**
 * Menggabungkan tanda tangan dan stempel menjadi SATU gambar.
 *
 * Stempel harus menimpa sebagian tanda tangan, seperti cap basah di atas
 * tanda tangan basah. Dua gambar terpisah bergantung pada cara tiap pengolah
 * kata menumpuk objek melayang — Word, LibreOffice, dan Google Docs berbeda.
 * Digabung lebih dulu, letak stempel terhadap tanda tangan sudah pasti di
 * dalam satu gambar, apa pun yang membuka berkasnya.
 *
 * Tanda tangan di kanan, stempel di kiri menimpanya — tata letak berkas contoh
 * HMIF. Salah satu boleh tidak ada; keduanya tidak ada → `null`.
 */
export async function gabungTtdStempel(ttd: Buffer | null, stempel: Buffer | null): Promise<GambarDocx | null> {
  if (!ttd && !stempel) return null;
  const W = UKURAN_TTD.lebarPx * SKALA;
  const H = UKURAN_TTD.tinggiPx * SKALA;
  const lapisan: sharp.OverlayOptions[] = [];

  if (ttd) {
    const lebarTtd = Math.round(W * 0.72);
    const g = await sharp(ttd)
      .resize({ width: lebarTtd, height: H, fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true });
    lapisan.push({
      input: g.data,
      left: W - g.info.width,
      top: Math.round((H - g.info.height) / 2),
    });
  }
  if (stempel) {
    const g = await sharp(stempel)
      .resize({ width: H, height: H, fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true });
    lapisan.push({
      input: g.data,
      left: Math.round(W * 0.08),
      top: Math.round((H - g.info.height) / 2),
    });
  }

  const png = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(lapisan)
    .png()
    .toBuffer();
  // Dinaikkan setinggi gambarnya dari paragraf tambatannya: dasar gambar jatuh
  // tepat di atas paragraf itu — nama penandatangan, atau baris kosong tepat di
  // atasnya — di ruang yang memang disediakan template untuk tanda tangan.
  return { png, ...UKURAN_TTD, melayang: { naikPx: UKURAN_TTD.tinggiPx + 2 } };
}
