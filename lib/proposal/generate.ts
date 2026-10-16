/**
 * Generator Proposal (T-096 kontrak 6). Server-only.
 *
 *   muatProposal ─▶ periksa field wajib ─▶ petakanProposal ─▶
 *   renderDocx(template/proposal_v1) ─▶ storage dokumen/proposal/{id}.docx
 *   (+ PDF bila PDF_ENABLED) ─▶ baris `dokumen` (jenis PROPOSAL)
 *
 * Susunan kepanitiaan, anggaran, rincian RAB, dan rundown DITARIK saat
 * generate (kontrak 3–5) — perubahan RAB/panitia langsung tercermin.
 * Lembar pengesahan memakai placeholder bernama per posisi (TEMPLATE_MAPPING
 * Temuan 12); pejabat fakultas tidak punya akun, jadi tanpa gambar TTD.
 *
 * Sumber: docs/ai/tasks/P6-tor-proposal.md T-096 · TEMPLATE_MAPPING §5.10
 */

import { GalatTemplate, renderDocx } from '@/lib/documents/docx-engine';
import {
  GalatPdf,
  PdfTidakTersedia,
  bacaKonfigPdf,
  docxToPdf,
} from '@/lib/documents/pdf-converter';
import { muatBerkas } from '@/lib/documents/template-loader';
import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { kurangProposal, type DataProposal } from '@/lib/proposal/schema';
import { muatProposal, type DivisiPanitia } from '@/lib/proposal/service';
import { hitungRab } from '@/lib/rab/calculate';
import type { DivisiRab, ItemRab, SectionRab } from '@/lib/rab/item';
import { muatRab } from '@/lib/rab/service';
import { keys, storage } from '@/lib/storage';
import { bacaKonfigSurat } from '@/lib/surat/konfig';
import { kunciTemplateDokumen } from '@/lib/surat/template-registry';
import { MIME_DOCX, kelompokRundown, paragrafTeksKaya } from '@/lib/tor/generate';
import type { BarisRundown } from '@/lib/tor/schema';
import type { AnggaranTor } from '@/lib/tor/service';
import { bisaTulisTor } from '@/lib/tor/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import {
  formatTanggalPanjang,
  formatTanggalSurat,
  tanggalHariIniJakarta,
} from '@/lib/utils/format-tanggal';

if (typeof window !== 'undefined') {
  throw new Error('lib/proposal/generate.ts adalah modul server-only.');
}

// ---------------------------------------------------------------------------
// Pemetaan — murni
// ---------------------------------------------------------------------------

export interface RincianDivisi {
  divisi: string;
  item: { no: string; jenis_barang: string; jumlah: string; harga_satuan: string; total: string }[];
}

/** Rincian RAB per divisi untuk Lampiran I — total item dari hitungRab (satu rumus). */
export function rincianRab(divisi: readonly DivisiRab[]): RincianDivisi[] {
  return hitungRab<ItemRab, SectionRab, DivisiRab>(divisi)
    .perDivisi.map((d) => ({
      divisi: d.nama,
      item: d.sections
        .flatMap((s) => s.items)
        .map((it, i) => ({
          no: String(i + 1),
          jenis_barang: it.jenis_barang,
          jumlah: it.jumlah_teks || (it.jumlah_numerik === null ? '-' : String(it.jumlah_numerik)),
          harga_satuan: it.total_manual ? '-' : formatRupiah(it.harga_satuan),
          total: formatRupiah(it.total),
        })),
    }))
    .filter((d) => d.item.length > 0);
}

export interface MasukanProposal {
  data: DataProposal;
  tahun: string;
  kota: string;
  tanggal: string;
  ketuaPelaksana: { nama: string; nim: string };
  ketuaHimpunan: { nama: string; nim: string };
  susunan: DivisiPanitia[];
  anggaran: AnggaranTor;
  rincian: RincianDivisi[];
  rundown: BarisRundown[];
}

const teksKaya = (d: DataProposal['penutup']) => paragrafTeksKaya(d).join('\n');
const isi = (s: string) => s.trim().length > 0;
const atauStrip = (s: string) => (isi(s) ? s.trim() : '-');

export function petakanProposal(m: MasukanProposal): Record<string, unknown> {
  const d = m.data;
  const sesi = d.sesi
    .filter((w) => isi(w.sesi) || w.tanggal || isi(w.tempat))
    .map((w) => ({
      nama_sesi: w.sesi.trim(),
      hari_tanggal: w.tanggal ? formatTanggalPanjang(w.tanggal) : '-',
      waktu: atauStrip(w.waktu),
      tempat: atauStrip(w.tempat),
    }));
  const rabDivisi = [
    ...m.anggaran.divisi.map((x) => ({ divisi: x.nama, besaran: formatRupiah(x.total) })),
    ...(m.anggaran.dana_tak_terduga
      ? [{ divisi: 'Dana Tak Terduga', besaran: formatRupiah(m.anggaran.dana_tak_terduga) }]
      : []),
  ].map((x, i) => ({ no: String(i + 1), ...x }));
  const pengisi = d.pengisi.filter((p) => isi(p.peran) || isi(p.nama));

  return {
    nama_kegiatan: d.nama_kegiatan.trim(),
    tahun: m.tahun,
    // Lembar pengesahan — enam posisi bernama (Temuan 12).
    ketupel_nama: m.ketuaPelaksana.nama,
    ketupel_nim: m.ketuaPelaksana.nim,
    sekretaris_nama: d.sekretaris.nama.trim(),
    sekretaris_nim: atauStrip(d.sekretaris.nomor),
    ketua_bem_nama: d.ketua_bem.nama.trim(),
    ketua_bem_nim: atauStrip(d.ketua_bem.nomor),
    ketua_himpunan_nama: m.ketuaHimpunan.nama,
    ketua_himpunan_nim: m.ketuaHimpunan.nim,
    wd3_nama: d.wd3.nama.trim(),
    wd3_nip: atauStrip(d.wd3.nomor),
    kaprodi_nama: d.kaprodi.nama.trim(),
    kaprodi_nip: atauStrip(d.kaprodi.nomor),
    // Pendahuluan & realisasi — nama placeholder sama dengan tor.docx.
    latar_belakang: teksKaya(d.latar_belakang),
    landasan_kegiatan: teksKaya(d.landasan_kegiatan),
    asas: d.asas.filter(isi).map((t) => ({ teks: t.trim() })),
    tujuan: d.tujuan.filter(isi).map((t) => ({ teks: t.trim() })),
    sasaran: teksKaya(d.sasaran),
    bentuk_acara: teksKaya(d.bentuk_acara),
    sesi,
    pengisi: pengisi.length
      ? pengisi.map((p) => ({ peran: atauStrip(p.peran), nama: atauStrip(p.nama) }))
      : [{ peran: 'Pengisi acara', nama: '-' }],
    gambaran_umum: teksKaya(d.gambaran_umum),
    rangkaian: d.rangkaian
      .filter((r) => isi(r.nama))
      .map((r) => ({ nama: r.nama.trim(), uraian: r.uraian.trim() })),
    penutup: teksKaya(d.penutup),
    kota: m.kota,
    tanggal_format: formatTanggalSurat(m.tanggal),
    // Tarikan.
    rab_divisi: rabDivisi,
    rab_total: formatRupiah(m.anggaran.total),
    rincian: m.rincian,
    divisi_panitia: m.susunan.map((g) => ({
      nama_divisi: g.nama_divisi,
      anggota: g.anggota.map((a) => ({ jabatan: a.jabatan, nama: a.nama })),
    })),
    sesi_rundown: kelompokRundown(m.rundown, d.sesi),
  };
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

export type HasilGenerateProposal =
  | { ok: true; dokumen_id: string; ukuran: number; pdf: boolean; peringatan?: string }
  | {
      ok: false;
      kode: 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'BELUM_LENGKAP' | 'GAGAL';
      pesan: string;
      kurang?: string[];
    };

export async function generateProposal(
  konteks: Konteks,
  kepanitiaanId: string,
): Promise<HasilGenerateProposal> {
  const p = await muatProposal(konteks, kepanitiaanId);
  if (!p) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Acara tidak ditemukan.' };
  if (!p.boleh_tulis || !(await bisaTulisTor(konteks, kepanitiaanId))) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Proposal dibuat panitia acara ini, Kadept penanggung jawab, atau pimpinan.',
    };
  }
  const rab = await muatRab(konteks, kepanitiaanId);
  if (p.anggaran === 'TERBATAS' || !rab || rab === 'TERBATAS')
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Anggaran acara ini tidak dapat Anda baca.',
    };

  const kurang = kurangProposal(p.data);
  if (!p.ketua_pelaksana) kurang.push('Ketua Pelaksana (data acara)');
  if (!p.ketua_himpunan) kurang.push('Ketua Himpunan (pengurus periode)');
  if (kurang.length)
    return {
      ok: false,
      kode: 'BELUM_LENGKAP',
      pesan: `Proposal belum lengkap: ${kurang.join(', ')}.`,
      kurang,
    };

  let isiDocx: Buffer;
  try {
    const [template, konfig] = await Promise.all([
      muatBerkas(kunciTemplateDokumen('PROPOSAL')),
      bacaKonfigSurat(),
    ]);
    isiDocx = renderDocx(
      template,
      petakanProposal({
        data: p.data,
        tahun: p.tahun,
        kota: konfig.kotaDefault,
        tanggal: tanggalHariIniJakarta(),
        ketuaPelaksana: p.ketua_pelaksana!,
        ketuaHimpunan: p.ketua_himpunan!,
        susunan: p.susunan,
        anggaran: p.anggaran,
        rincian: rincianRab(rab.divisi),
        rundown: p.rundown,
      }),
    );
  } catch (e) {
    console.error(`[proposal] ${kepanitiaanId}: generate gagal`, e);
    return {
      ok: false,
      kode: 'GAGAL',
      pesan:
        e instanceof GalatTemplate
          ? `Template proposal tidak dapat diisi: ${e.message}`
          : 'Template proposal tidak dapat dimuat.',
    };
  }

  const key = keys.proposalDocx(kepanitiaanId);
  try {
    await storage.put(key, isiDocx, MIME_DOCX, { upsert: true });
  } catch (e) {
    console.error(`[proposal] ${kepanitiaanId}: unggah gagal`, e);
    return { ok: false, kode: 'GAGAL', pesan: 'Dokumen proposal gagal disimpan ke penyimpanan.' };
  }
  const d = await db.dokumen.create({
    data: {
      kepanitiaan_id: kepanitiaanId,
      jenis: 'PROPOSAL',
      format: 'DOCX',
      storage_key: key,
      file_size: BigInt(isiDocx.length),
      generated_by: konteks.sesi.userId,
    },
    select: { id: true },
  });

  // PDF hanya bila PDF_ENABLED (ADR-010): gagal → DOCX tetap ada, dengan peringatan.
  if (!bacaKonfigPdf().aktif)
    return { ok: true, dokumen_id: d.id, ukuran: isiDocx.length, pdf: false };
  try {
    const h = await docxToPdf(isiDocx);
    const keyPdf = keys.proposalPdf(kepanitiaanId);
    await storage.put(keyPdf, h.pdf, 'application/pdf', { upsert: true });
    await db.dokumen.create({
      data: {
        kepanitiaan_id: kepanitiaanId,
        jenis: 'PROPOSAL',
        format: 'PDF',
        storage_key: keyPdf,
        file_size: BigInt(h.pdf.length),
        generated_by: konteks.sesi.userId,
      },
    });
    return { ok: true, dokumen_id: d.id, ukuran: isiDocx.length, pdf: true };
  } catch (e) {
    const sebab =
      e instanceof PdfTidakTersedia || e instanceof GalatPdf ? e.message : 'Konversi PDF gagal.';
    if (!(e instanceof PdfTidakTersedia))
      console.error(`[proposal] ${kepanitiaanId}: PDF gagal`, e);
    return {
      ok: true,
      dokumen_id: d.id,
      ukuran: isiDocx.length,
      pdf: false,
      peringatan: `PDF tidak dibuat: ${sebab} Dokumen DOCX tetap tersedia.`,
    };
  }
}

/** Dokumen proposal terakhir per format; null bila belum pernah dibuat / tak terlihat. */
export async function dokumenProposalTerakhir(
  konteks: Konteks,
  kepanitiaanId: string,
  format: 'DOCX' | 'PDF' = 'DOCX',
) {
  const p = await muatProposal(konteks, kepanitiaanId);
  if (!p) return null;
  const d = await db.dokumen.findFirst({
    where: { kepanitiaan_id: kepanitiaanId, jenis: 'PROPOSAL', format },
    orderBy: { created_at: 'desc' },
    select: { id: true, storage_key: true, created_at: true },
  });
  return d ? { ...d, nama_acara: p.nama_acara } : null;
}
