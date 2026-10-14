/**
 * data-mapper — nilai form surat → kamus placeholder template DOCX. Modul murni.
 *
 * Kamusnya mengikuti SYSTEM_DESIGN §8.3 dan TEMPLATE_MAPPING; bentuk tiap kunci
 * diuji terhadap SETIAP template di `templates/` oleh `docx-engine.test.ts`,
 * sehingga kunci yang kurang langsung ketahuan, bukan tercetak `undefined`.
 *
 * `nama`, `jabatan`, `nim`, `label`, `ttd`, `ttd_nama`, dan `stempel` SENGAJA tidak pernah
 * ada di tingkat atas: docxtemplater menjatuhkan pencarian ke scope induk, jadi
 * kunci itu di tingkat atas akan mengisi `{nama}` yang salah tempat di luar blok
 * tanda tangan alih-alih membuatnya ketahuan (TEMPLATE_MAPPING §3.3).
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-061 · SYSTEM_DESIGN §8.3 · ADR-021, ADR-029
 */

import type { JenisSurat } from '@/lib/surat/field-schemas';
import { sanitasiIsiHtml } from '@/lib/surat/isi-html';
import { jabatanKetua, LABEL_MENGETAHUI } from '@/lib/surat/render-preview';
import { formatTanggalSurat } from '@/lib/utils/format-tanggal';
import { ttdMelayang, type GambarDocx } from './image-module';

// ---------------------------------------------------------------------------
// HTML isi surat → paragraf
// ---------------------------------------------------------------------------

const ENTITAS: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (asli, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : asli;
    }
    return ENTITAS[e.toLowerCase()] ?? asli;
  });
}

function rapikan(s: string): string {
  return s
    .split('\n')
    .map((b) => b.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * Isi surat (HTML TipTap) menjadi daftar paragraf teks.
 *
 * Satu `<p>` atau satu `<li>` → satu paragraf dokumen, yang mewarisi perataan
 * dan indentasi paragraf template. Butir daftar diberi awalan "• " atau "1. ";
 * `<br>` menjadi pindah baris di dalam paragraf yang sama. Tebal dan miring
 * TIDAK dibawa — template menentukan font badan surat, dan isi surat resmi
 * HMIF tidak memakai penekanan di tengah kalimat (ADR-029). Tag di luar daftar
 * putih `sanitasiIsiHtml` sudah dibuang sebelum sampai di sini.
 */
export function paragrafDariIsiHtml(html: unknown): string[] {
  const bersih = sanitasiIsiHtml(html);
  const hasil: string[] = [];
  const daftar: { jenis: 'ul' | 'ol'; n: number }[] = [];
  let kini: string | null = null;
  /** Paragraf baru dibuka `<li>` dan belum berisi teks — `<p>` di dalamnya tidak memecahnya lagi. */
  let awalButir = false;

  const tutup = () => {
    if (kini !== null) {
      const t = rapikan(kini);
      if (t && !/^(?:•|\d+\.)$/.test(t)) hasil.push(t);
    }
    kini = null;
    awalButir = false;
  };

  for (const potong of bersih.split(/(<[^>]+>)/)) {
    if (!potong) continue;
    const tag = /^<(\/?)([a-z]+)>$/.exec(potong);
    if (!tag) {
      const teks = decode(potong);
      if (kini === null) {
        if (!teks.trim()) continue;
        kini = '';
      }
      kini += teks;
      if (teks.trim()) awalButir = false;
      continue;
    }
    const [, garis, nama] = tag;
    const buka = garis !== '/';
    switch (nama) {
      case 'p':
        if (buka) {
          if (!awalButir) {
            tutup();
            kini = '';
          }
        } else if (!awalButir) {
          tutup();
        }
        break;
      case 'br':
        kini = (kini ?? '') + '\n';
        break;
      case 'ul':
      case 'ol':
        tutup();
        if (buka) daftar.push({ jenis: nama, n: 0 });
        else daftar.pop();
        break;
      case 'li':
        tutup();
        if (buka) {
          const d = daftar.at(-1);
          kini = d?.jenis === 'ol' ? `${++d.n}. ` : '• ';
          awalButir = true;
        }
        break;
      default:
        // strong, em: penekanan tidak dibawa (lihat di atas).
        break;
    }
  }
  tutup();
  return hasil;
}

// ---------------------------------------------------------------------------
// Kamus placeholder
// ---------------------------------------------------------------------------

export interface PenandatanganDocx {
  nama: string;
  nim: string;
}

export interface MasukanPeta {
  /** Nilai form surat — bentuk `muatSurat().nilai`. */
  nilai: Record<string, unknown> & { jenis: JenisSurat };
  nomorLengkap: string;
  ketua: PenandatanganDocx;
  /** TTD Ketua yang SUDAH digabung dengan stempel (`gabungTtdStempel`). */
  ttdKetua: GambarDocx | null;
}

function teks(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function larik(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];
}

/**
 * Satu entri blok tanda tangan; `ttd`/`ttd_nama`/`stempel` selalu ada supaya
 * tak jatuh ke scope induk. Gambar yang sama dalam dua tambatan — template
 * memakai salah satunya (`ttdMelayang`).
 */
function blokTtd(p: { label?: string; jabatan: string; nama: string; nim: string; ttd: GambarDocx | null }) {
  return {
    label: p.label ?? '',
    jabatan: p.jabatan,
    nama: p.nama,
    nim: p.nim,
    ttd: p.ttd ? ttdMelayang(p.ttd, 'BARIS_ATAS_NAMA') : null,
    ttd_nama: p.ttd ? ttdMelayang(p.ttd, 'PARAGRAF_NAMA') : null,
    stempel: null,
  };
}

export function petakanSurat(m: MasukanPeta): Record<string, unknown> {
  const n = m.nilai;
  const d = (n.data_dinamis ?? {}) as Record<string, unknown>;
  const isi = paragrafDariIsiHtml(n.isi_surat);

  const kiriIsian = larik(n.penandatangan_tambahan)[0];
  const kiri = kiriIsian
    ? [blokTtd({ jabatan: teks(kiriIsian.jabatan), nama: teks(kiriIsian.nama), nim: teks(kiriIsian.nim), ttd: null })]
    : [];
  const kanan = [
    blokTtd({
      label: kiri.length > 0 ? LABEL_MENGETAHUI : '',
      jabatan: jabatanKetua(n.jenis),
      nama: m.ketua.nama,
      nim: m.ketua.nim,
      ttd: m.ttdKetua,
    }),
  ];

  // data_dinamis dulu, lalu kolom surat menimpanya: kunci yang sama di kedua
  // tempat (mis. `tujuan_jabatan` lama) tidak boleh mengalahkan kolom resmi.
  const dinamis: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'string' || typeof v === 'number') dinamis[k] = teks(v);
  }

  return {
    ...dinamis,
    nomor_lengkap: m.nomorLengkap,
    tanggal_surat_format: formatTanggalSurat(teks(n.tanggal_surat)),
    kota: teks(n.kota),
    lampiran: teks(n.lampiran) || '-',
    perihal: teks(n.perihal),
    tujuan_nama: teks(n.tujuan_nama),
    tujuan_jabatan: teks(d.tujuan_jabatan),
    ada_tujuan_jabatan: teks(d.tujuan_jabatan) !== '',
    tujuan_alamat: teks(n.tujuan_alamat),
    isi_paragraf: isi.join('\n'),
    paragraf_isi: isi.map((t) => ({ teks: t })),
    label_atas: teks(d.label_atas),

    items: larik(d.items).map((b, i) => ({ no: `${i + 1}.`, kebutuhan: teks(b.kebutuhan), banyaknya: teks(b.banyaknya) })),
    rundown: larik(d.rundown).map((r) => ({
      hari_tanggal: teks(r.hari_tanggal),
      waktu: teks(r.waktu),
      acara: teks(r.acara),
      keterangan: teks(r.keterangan),
    })),
    poin: larik(d.poin).map((p) => ({
      judul: teks(p.judul),
      paragraf: (Array.isArray(p.paragraf) ? p.paragraf : []).map((t) => ({ teks: teks(t) })).filter((t) => t.teks),
    })),

    kiri,
    kanan,
  };
}
