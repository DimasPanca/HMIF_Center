/**
 * LPJ: isian manual, prasyarat, generate DOCX, dan alur persetujuan (T-105,
 * PRD F-12.1, ADR-015). Server-only.
 *
 *   hak tulis   `lpj.generate` (Admin, Bendum) — RLS lpj_insert/update 015b
 *   setujui     DIAJUKAN → DISETUJUI_BENDUM oleh Bendum/Admin;
 *               DISETUJUI_BENDUM → FINAL oleh Ketua (RLS lpj_update_ketua 046)
 *   FINAL       beku (trigger 046/047); RAB acaranya maju REALISASI → SELESAI
 *   generate    hanya selama DRAFT; snapshot `analisisLpj` + buku pengeluaran
 *               disimpan ke `lpj.analisis` (kontrak 7) — dokumen DAN tampilan
 *               LPJ yang sudah diajukan memakai snapshot, bukan hitung ulang
 *   lampiran    gambar MASTER setiap nota terverifikasi per divisi (INV-19;
 *               JPEG disematkan apa adanya). Preview/thumbnail tidak pernah dipakai.
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-105 · ADR-015 · TEMPLATE_MAPPING §5.11
 */

import { Prisma } from '@prisma/client';
import sharp from 'sharp';

import { muatAcara } from '@/lib/acara/service';
import type { Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { GalatTemplate, renderDocx } from '@/lib/documents/docx-engine';
import type { GambarDocx } from '@/lib/documents/image-module';
import {
  GalatPdf,
  PdfTidakTersedia,
  bacaKonfigPdf,
  docxToPdf,
} from '@/lib/documents/pdf-converter';
import { muatBerkas } from '@/lib/documents/template-loader';
import { analisisLpj, muatBahanLpj, type AnalisisLpj } from '@/lib/lpj/analyze';
import {
  NARASI_KOSONG,
  SkemaDataManualLpj,
  kurangManual,
  manualKosong,
  normalisasiManual,
  prasyaratLpj,
  type ButirPrasyarat,
  type DataManualLpj,
} from '@/lib/lpj/schema';
import { normalisasiProposal } from '@/lib/proposal/schema';
import { bukuPengeluaran, type BarisPengeluaran } from '@/lib/rab/realisasi';
import { majukanStatusRab } from '@/lib/rab/service';
import { keys, storage } from '@/lib/storage';
import { bacaKetuaHimpunan, bacaKonfigSurat } from '@/lib/surat/konfig';
import { kunciTemplateDokumen } from '@/lib/surat/template-registry';
import { MIME_DOCX } from '@/lib/tor/generate';
import { muatRundown } from '@/lib/tor/service';
import { normalisasiTor } from '@/lib/tor/schema';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import {
  formatTanggalPanjang,
  formatTanggalSurat,
  tanggalHariIniJakarta,
} from '@/lib/utils/format-tanggal';

if (typeof window !== 'undefined') {
  throw new Error('lib/lpj/generate.ts adalah modul server-only.');
}

/**
 * Matriks PRD §5.1 baris "LPJ": Admin & Bendum = C (tanpa R), pimpinan/BPH = R,
 * Kadept = R*. Penyusun tentu membaca yang ia susun — hak baca = R atau C.
 */
export function bolehBacaLpj(roles: Konteks['roles']): boolean {
  return can(roles, 'lpj.read') || can(roles, 'lpj.generate');
}

export type StatusLpj = 'DRAFT' | 'DIAJUKAN' | 'DISETUJUI_BENDUM' | 'FINAL';
export type KodeGagalLpj =
  'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'BELUM_LENGKAP' | 'KONFLIK' | 'GAGAL';
export const STATUS_GAGAL_LPJ: Record<KodeGagalLpj, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  BELUM_LENGKAP: 422,
  KONFLIK: 409,
  GAGAL: 502,
};
export type Hasil<T> =
  | { ok: true; nilai: T }
  | { ok: false; kode: KodeGagalLpj; pesan: string; details?: Record<string, unknown> };

/** Snapshot yang dibekukan di `lpj.analisis`: analisis + buku pengeluaran saat generate. */
export type SnapshotLpj = AnalisisLpj & { pengeluaran: BarisPengeluaran[] };

export interface NotaLampiran {
  id: string;
  divisi: string;
  tanggal: string;
  total: number;
  keterangan: string;
  image_id: string;
  master_path: string;
  master_mime: string;
  thumbnail_path: string;
  lebar: number;
  tinggi: number;
}

export interface DataLpjLengkap {
  kepanitiaan_id: string;
  nama_acara: string;
  status: StatusLpj;
  manual: DataManualLpj;
  divisi: { id: string; nama: string }[];
  prasyarat: ButirPrasyarat[];
  /** Snapshot bila sudah pernah generate, selain itu hitungan langsung. */
  analisis: AnalisisLpj;
  analisis_snapshot: boolean;
  lampiran: NotaLampiran[];
  izin: { tulis: boolean; ajukan: boolean; setujui: boolean; kembalikan: boolean };
  persetujuan: {
    bendum: { oleh: string; at: string } | null;
    ketua: { oleh: string; at: string } | null;
  };
  diperbarui_at: string | null;
}

// ---------------------------------------------------------------------------
// Pemuatan
// ---------------------------------------------------------------------------

async function notaLampiran(divisiIds: string[]): Promise<NotaLampiran[]> {
  if (!divisiIds.length) return [];
  const rows = await db.$queryRaw<
    {
      id: string;
      divisi: string;
      urutan: number;
      tanggal: string;
      total: string;
      image_id: string;
      master_path: string;
      master_mime: string;
      thumbnail_path: string;
      lebar: number;
      tinggi: number;
      rincian: { nama: string; nominal: number | string }[] | null;
    }[]
  >`
    SELECT n.id::text, d.nama AS divisi, d.urutan, to_char(n.tanggal_belanja, 'YYYY-MM-DD') AS tanggal, n.total_nota::text AS total,
           i.id::text AS image_id, i.master_path, i.master_mime_type AS master_mime, i.thumbnail_path,
           i.master_width AS lebar, i.master_height AS tinggi,
           (SELECT json_agg(json_build_object('nama', COALESCE(r.jenis_barang, 'Di luar RAB: ' || a.uraian_luar_rab),
                                              'nominal', a.nominal) ORDER BY a.nominal DESC)
              FROM nota_alokasi a LEFT JOIN rab_item r ON r.id = a.rab_item_id WHERE a.nota_id = n.id) AS rincian
    FROM nota n JOIN divisi d ON d.id = n.divisi_id JOIN image i ON i.id = n.image_id
    WHERE n.status = 'TERVERIFIKASI' AND n.divisi_id = ANY(${divisiIds}::uuid[])
    ORDER BY d.urutan, d.nama, n.tanggal_belanja, n.created_at`;
  return rows.map((r) => ({
    id: r.id,
    divisi: r.divisi,
    tanggal: r.tanggal,
    total: Number(r.total),
    keterangan: `${formatTanggalPanjang(r.tanggal)} · ${formatRupiah(Number(r.total))}${
      r.rincian?.length ? ` · ${r.rincian.map((x) => `${x.nama} ${formatRupiah(Number(x.nominal))}`).join(', ')}` : ''
    }`,
    image_id: r.image_id,
    master_path: r.master_path,
    master_mime: r.master_mime,
    thumbnail_path: r.thumbnail_path,
    lebar: r.lebar,
    tinggi: r.tinggi,
  }));
}

/** Prefill sekali dari TOR & proposal acara ini — hanya mengisi yang kosong. */
async function prefillManual(kepanitiaanId: string, d: DataManualLpj): Promise<DataManualLpj> {
  const [tor, proposal] = await Promise.all([
    db.tor.findUnique({ where: { kepanitiaan_id: kepanitiaanId }, select: { data: true } }),
    db.proposal.findUnique({ where: { kepanitiaan_id: kepanitiaanId }, select: { data: true } }),
  ]);
  const hasil = structuredClone(d);
  if (tor) {
    const t = normalisasiTor(tor.data);
    const sasaran = [
      ...(t.sasaran.uraian.content ?? [])
        .map((p) => (p.content ?? []).map((x) => x.text ?? '').join(''))
        .filter(Boolean),
      ...(t.sasaran.estimasi_jumlah !== null
        ? [`Estimasi ${t.sasaran.estimasi_jumlah} peserta.`]
        : []),
    ].join('\n');
    if (!hasil.target_peserta.trim()) hasil.target_peserta = sasaran;
    const w = t.waktu_tempat.find((x) => x.tanggal || x.tempat);
    if (w && !hasil.waktu.hari_tanggal.trim()) {
      hasil.waktu = {
        hari_tanggal: w.tanggal ? formatTanggalPanjang(w.tanggal) : '',
        waktu: w.waktu,
        tempat: w.tempat,
      };
    }
  }
  if (proposal) {
    const p = normalisasiProposal(proposal.data);
    if (!hasil.pejabat.kaprodi.nama.trim()) hasil.pejabat.kaprodi = p.kaprodi;
    if (!hasil.pejabat.wd3.nama.trim()) hasil.pejabat.wd3 = p.wd3;
  }
  return hasil;
}

function izinLpj(konteks: Konteks, status: StatusLpj) {
  const tulis = can(konteks.roles, 'lpj.generate');
  const bendum = konteks.roles.includes('BENDUM') || konteks.roles.includes('ADMIN');
  const ketua = konteks.roles.includes('KETUA');
  return {
    tulis: tulis && status === 'DRAFT',
    ajukan: tulis && status === 'DRAFT',
    setujui: (status === 'DIAJUKAN' && bendum) || (status === 'DISETUJUI_BENDUM' && ketua),
    kembalikan: (status === 'DIAJUKAN' && bendum) || (status === 'DISETUJUI_BENDUM' && ketua),
  };
}

/** null = acara tak terlihat / bukan hak baca LPJ. 'TERBATAS' = angka keuangan bukan hak pengguna. */
export async function muatLpj(
  konteks: Konteks,
  kepanitiaanId: string,
): Promise<DataLpjLengkap | 'TERBATAS' | null> {
  if (!bolehBacaLpj(konteks.roles)) return null;
  const bahan = await muatBahanLpj(konteks, kepanitiaanId);
  if (bahan === null || bahan === 'TERBATAS') return bahan;
  const [acara, row, rab, tor, proposal] = await Promise.all([
    muatAcara(konteks, kepanitiaanId),
    db.lpj.findUnique({
      where: { kepanitiaan_id: kepanitiaanId },
      select: {
        status: true,
        data_manual: true,
        analisis: true,
        updated_at: true,
        disetujui_bendum_at: true,
        disetujui_ketua_at: true,
        app_user_lpj_disetujui_bendum_olehToapp_user: { select: { nama_lengkap: true } },
        app_user_lpj_disetujui_ketua_olehToapp_user: { select: { nama_lengkap: true } },
      },
    }),
    db.rab_meta.findUnique({ where: { kepanitiaan_id: kepanitiaanId }, select: { status: true } }),
    db.tor.count({ where: { kepanitiaan_id: kepanitiaanId } }),
    db.proposal.count({ where: { kepanitiaan_id: kepanitiaanId } }),
  ]);
  if (!acara) return null;
  const status = (row?.status ?? 'DRAFT') as StatusLpj;
  const manual =
    status === 'DRAFT'
      ? await prefillManual(kepanitiaanId, normalisasiManual(row?.data_manual))
      : normalisasiManual(row?.data_manual);
  const snapshot = row?.analisis ? (row.analisis as unknown as SnapshotLpj) : null;
  return {
    kepanitiaan_id: kepanitiaanId,
    nama_acara: acara.nama_acara,
    status,
    manual,
    divisi: bahan.divisi.map((d) => ({ id: d.id, nama: d.nama })),
    prasyarat: prasyaratLpj({
      notaTerverifikasi: bahan.nota.length,
      statusRab: rab?.status ?? null,
      torAda: tor > 0,
      proposalAda: proposal > 0,
      dokumentasi: manual.dokumentasi.length,
    }),
    // Setelah diajukan, tampilan SELALU snapshot; selama DRAFT, hitungan langsung.
    analisis: status !== 'DRAFT' && snapshot ? snapshot : analisisLpj(bahan),
    analisis_snapshot: status !== 'DRAFT' && !!snapshot,
    lampiran: await notaLampiran(bahan.divisi.map((d) => d.id)),
    izin: izinLpj(konteks, status),
    persetujuan: {
      bendum:
        row?.disetujui_bendum_at && row.app_user_lpj_disetujui_bendum_olehToapp_user
          ? {
              oleh: row.app_user_lpj_disetujui_bendum_olehToapp_user.nama_lengkap,
              at: row.disetujui_bendum_at.toISOString(),
            }
          : null,
      ketua:
        row?.disetujui_ketua_at && row.app_user_lpj_disetujui_ketua_olehToapp_user
          ? {
              oleh: row.app_user_lpj_disetujui_ketua_olehToapp_user.nama_lengkap,
              at: row.disetujui_ketua_at.toISOString(),
            }
          : null,
    },
    diperbarui_at: row?.updated_at.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Simpan isian manual
// ---------------------------------------------------------------------------

async function kunciLpj(tx: TxKlien, kepanitiaanId: string): Promise<StatusLpj | null> {
  const [r] = await tx.$queryRaw<
    { status: string }[]
  >`SELECT status::text FROM lpj WHERE kepanitiaan_id = ${kepanitiaanId}::uuid FOR UPDATE`;
  return (r?.status as StatusLpj | undefined) ?? null;
}

export async function simpanManualLpj(
  tx: TxKlien,
  konteks: Konteks,
  kepanitiaanId: string,
  body: unknown,
): Promise<Hasil<{ diperbarui_at: string }>> {
  if (!can(konteks.roles, 'lpj.generate'))
    return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'LPJ disusun Bendahara atau Admin.' };
  const p = SkemaDataManualLpj.safeParse((body as { manual?: unknown } | null)?.manual);
  if (!p.success) {
    const i = p.error.issues[0];
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: i ? `${i.message} (${i.path.join('.')})` : 'Isian LPJ tidak valid.',
    };
  }
  const status = await kunciLpj(tx, kepanitiaanId);
  if (status && status !== 'DRAFT')
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'LPJ sudah diajukan — kembalikan ke DRAFT untuk mengubahnya.',
    };
  // Foto dokumentasi wajib milik pengisi (diunggah lewat /api/images/upload).
  const ids = p.data.dokumentasi.map((x) => x.image_id);
  if (ids.length) {
    const milik = await tx.image.count({
      where: { id: { in: ids }, uploader_id: konteks.sesi.userId },
    });
    const sudah = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM jsonb_array_elements(COALESCE((SELECT data_manual->'dokumentasi' FROM lpj WHERE kepanitiaan_id = ${kepanitiaanId}::uuid), '[]'::jsonb)) e
      WHERE e->>'image_id' = ANY(${ids}::text[])`;
    if (milik + (sudah[0]?.n ?? 0) < new Set(ids).size)
      return {
        ok: false,
        kode: 'VALIDASI_GAGAL',
        pesan: 'Foto dokumentasi tidak ditemukan. Unggah ulang fotonya.',
      };
  }
  const json = {
    ...p.data,
    catatan_pengembalian: p.data.catatan_pengembalian,
  } as unknown as Prisma.InputJsonValue;
  const r = await tx.lpj.upsert({
    where: { kepanitiaan_id: kepanitiaanId },
    create: { kepanitiaan_id: kepanitiaanId, data_manual: json },
    update: { data_manual: json, updated_at: new Date() },
    select: { updated_at: true },
  });
  return { ok: true, nilai: { diperbarui_at: r.updated_at.toISOString() } };
}

// ---------------------------------------------------------------------------
// Pemetaan DOCX — murni
// ---------------------------------------------------------------------------

/** Lampiran RAB (TEMPLATE_MAPPING Temuan 10: satu blok teks) dari SNAPSHOT. */
export function ringkasanKeuangan(s: SnapshotLpj): string {
  const b: string[] = [];
  b.push('RINCIAN PEMASUKAN');
  s.pemasukan.forEach((p, i) => b.push(`${i + 1}. ${p.keterangan}: ${formatRupiah(p.saldo)}`));
  b.push(`Total pemasukan: ${formatRupiah(s.totalPemasukan)}`, '');
  b.push('RINCIAN PENGELUARAN');
  s.pengeluaran.forEach((p) =>
    b.push(
      `${p.no}. ${formatTanggalPanjang(p.tanggal)} — ${p.uraian} (${p.divisi}): ${formatRupiah(p.nominal)} · saldo ${formatRupiah(p.saldo)}`,
    ),
  );
  b.push(`Total pengeluaran: ${formatRupiah(s.totalAktual)}`, '');
  b.push('PERBANDINGAN RAB VS AKTUAL PER DIVISI');
  s.perDivisi.forEach((d) =>
    b.push(
      `- ${d.nama}: rencana ${formatRupiah(d.rencana)}, aktual ${formatRupiah(d.aktual)}, selisih ${formatRupiah(d.selisih)}${d.persenSelisih === null ? '' : ` (${d.persenSelisih}%)`}`,
    ),
  );
  b.push(
    `Total rencana ${formatRupiah(s.totalRencana)} · total aktual ${formatRupiah(s.totalAktual)}`,
    '',
  );
  if (s.overBudget.length) {
    b.push('ITEM MELEBIHI ANGGARAN');
    s.overBudget.forEach((i) =>
      b.push(
        `- ${i.divisi} · ${i.jenis_barang}: lebih ${formatRupiah(i.selisih)}${i.persenSelisih === null ? '' : ` (${i.persenSelisih}%)`}`,
      ),
    );
    b.push('');
  }
  if (s.belumRealisasi.length) {
    b.push('ITEM BELUM DIREALISASIKAN');
    s.belumRealisasi.forEach((i) =>
      b.push(`- ${i.divisi} · ${i.jenis_barang} (rencana ${formatRupiah(i.rencana)})`),
    );
    b.push('');
  }
  if (s.diLuarRab.length) {
    b.push('PENGELUARAN DI LUAR RAB (TEMUAN)');
    s.diLuarRab.forEach((a) =>
      b.push(
        `- ${formatTanggalPanjang(a.tanggal)} · ${a.divisi} · ${a.uraian}: ${formatRupiah(a.nominal)}`,
      ),
    );
    b.push('');
  }
  b.push(
    `Dana tak terduga: ${formatRupiah(s.danaTakTerduga)} · terpakai ${formatRupiah(s.danaTakTerdugaTerpakai)}`,
  );
  b.push(`SISA DANA: ${formatRupiah(s.sisaDana)}`);
  return b.join('\n');
}

export interface MasukanLpj {
  namaKegiatan: string;
  tema: string;
  tujuan: string[];
  tahun: string;
  kota: string;
  tanggal: string;
  ketuaPelaksana: { nama: string; nim: string };
  ketuaHimpunan: { nama: string; nim: string };
  manual: DataManualLpj;
  snapshot: SnapshotLpj;
  susunan: {
    id: string;
    nama: string;
    koordinator: string | null;
    anggota: { jabatan: string; nama: string }[];
  }[];
  rundown: { hari_tanggal: string; waktu: string; acara: string; pj: string }[];
  lampiranNota: {
    nama_divisi: string;
    nota: { gambar: GambarDocx | null; keterangan: string }[];
  }[];
  dokumentasi: { foto: GambarDocx | null; caption: string }[];
}

const strip = (s: string) => (s.trim() ? s.trim() : '-');

export function petakanLpj(m: MasukanLpj): Record<string, unknown> {
  const d = m.manual;
  return {
    nama_kegiatan: m.namaKegiatan,
    tahun: m.tahun,
    kota: m.kota,
    tanggal_format: formatTanggalSurat(m.tanggal),
    ketupel_nama: m.ketuaPelaksana.nama,
    ketupel_nim: m.ketuaPelaksana.nim,
    ketua_himpunan_nama: m.ketuaHimpunan.nama,
    ketua_himpunan_nim: m.ketuaHimpunan.nim,
    kaprodi_nama: d.pejabat.kaprodi.nama.trim(),
    kaprodi_nip: strip(d.pejabat.kaprodi.nomor),
    wd3_nama: d.pejabat.wd3.nama.trim(),
    wd3_nip: strip(d.pejabat.wd3.nomor),
    pendahuluan: d.pendahuluan.trim(),
    tema_kegiatan: strip(m.tema),
    tujuan: (m.tujuan.length ? m.tujuan : ['-']).map((t) => ({ teks: t })),
    target_peserta: strip(d.target_peserta),
    hari_tanggal: strip(d.waktu.hari_tanggal),
    waktu: strip(d.waktu.waktu),
    tempat: strip(d.waktu.tempat),
    divisi_panitia: m.susunan.map((s) => ({ nama_divisi: s.nama, anggota: s.anggota })),
    proses_perencanaan: strip(d.proses_perencanaan),
    pelaksanaan_kegiatan: d.pelaksanaan_kegiatan.trim(),
    output: strip(d.output),
    penutup: d.penutup.trim(),
    divisi_narasi: m.susunan
      .filter((s) => s.nama !== 'Inti')
      .map((s) => {
        const n = d.narasi[s.id] ?? NARASI_KOSONG;
        return {
          nama_divisi: s.nama,
          koordinator: s.koordinator ?? '-',
          anggota: (s.anggota.filter((a) => a.jabatan !== 'Koordinator').length
            ? s.anggota.filter((a) => a.jabatan !== 'Koordinator')
            : [{ nama: '-' }]
          ).map((a) => ({ nama: a.nama })),
          narasi: strip(n.narasi),
          perencanaan: strip(n.perencanaan),
          pelaksanaan: strip(n.pelaksanaan),
          pendukung: strip(n.pendukung),
          penghambat: strip(n.penghambat),
          saran: strip(n.saran),
        };
      }),
    catatan_materi: strip(d.catatan_materi),
    materi: (d.materi.length ? d.materi : [{ judul: '-', pengisi: '-', tautan: '-' }]).map((x) => ({
      judul: strip(x.judul),
      pengisi: strip(x.pengisi),
      tautan: strip(x.tautan),
    })),
    rab_ringkasan: ringkasanKeuangan(m.snapshot),
    rundown: m.rundown.length
      ? m.rundown
      : [{ hari_tanggal: '-', waktu: '-', acara: '-', pj: '-' }],
    daftar_hadir: strip(d.daftar_hadir),
    lampiran_nota: m.lampiranNota.map((g) => ({
      nama_divisi: g.nama_divisi,
      nota: g.nota.map((n) => ({ gambar: n.gambar, keterangan: n.keterangan })),
    })),
    dokumentasi: m.dokumentasi.map((x) => ({ foto: x.foto, caption: strip(x.caption) })),
  };
}

// ---------------------------------------------------------------------------
// Gambar master
// ---------------------------------------------------------------------------

/** Ukuran tampil maksimum di halaman A4 (piksel 96 dpi, ±16 × 21 cm). */
const MAKS_TAMPIL = { lebar: 600, tinggi: 800 };

/**
 * Master apa adanya bila JPEG/PNG (kualitas cetak = master, INV-19); WebP —
 * tidak didukung Word — dikonversi lossless ke PNG.
 */
export async function gambarMaster(
  isi: Buffer,
  mime: string,
  lebar: number,
  tinggi: number,
): Promise<GambarDocx> {
  const skala = Math.min(1, MAKS_TAMPIL.lebar / lebar, MAKS_TAMPIL.tinggi / tinggi);
  const ukuran = { lebarPx: Math.round(lebar * skala), tinggiPx: Math.round(tinggi * skala) };
  if (mime === 'image/jpeg') return { png: isi, jenis: 'jpeg', ...ukuran };
  if (mime === 'image/png') return { png: isi, jenis: 'png', ...ukuran };
  return { png: await sharp(isi).png().toBuffer(), jenis: 'png', ...ukuran };
}

async function petaTerbatas<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const hasil: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const j = i++;
        hasil[j] = await f(xs[j]!);
      }
    }),
  );
  return hasil;
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

export type HasilGenerateLpj = Hasil<{
  dokumen_id: string;
  ukuran: number;
  jumlah_nota: number;
  pdf: boolean;
  peringatan: string | null;
}>;

export async function generateLpj(
  konteks: Konteks,
  kepanitiaanId: string,
  mulaiTx: <T>(f: (tx: TxKlien) => Promise<T>) => Promise<T>,
): Promise<HasilGenerateLpj> {
  if (!can(konteks.roles, 'lpj.generate'))
    return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'LPJ dibuat Bendahara atau Admin.' };
  const data = await muatLpj(konteks, kepanitiaanId);
  if (data === null) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Acara tidak ditemukan.' };
  if (data === 'TERBATAS')
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Angka keuangan acara ini bukan hak Anda.',
    };
  if (data.status !== 'DRAFT')
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: `LPJ berstatus ${data.status} — hanya DRAFT yang dapat di-generate ulang.`,
    };

  const belum = data.prasyarat.filter((p) => p.wajib && !p.terpenuhi).map((p) => p.label);
  const kurang = [...belum, ...kurangManual(data.manual)];
  if (kurang.length)
    return {
      ok: false,
      kode: 'BELUM_LENGKAP',
      pesan: `LPJ belum dapat dibuat: ${kurang.join(', ')}.`,
      details: { kurang },
    };

  const bahan = await muatBahanLpj(konteks, kepanitiaanId);
  if (!bahan || bahan === 'TERBATAS')
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Angka keuangan acara ini bukan hak Anda.',
    };
  const saldoAwal = bahan.pemasukan.reduce((s, p) => s + p.saldo, 0);
  const snapshot: SnapshotLpj = {
    ...analisisLpj(bahan),
    pengeluaran: bukuPengeluaran(saldoAwal, bahan.nota).baris,
  };

  const kp = await db.kepanitiaan.findUnique({
    where: { id: kepanitiaanId },
    select: {
      nama_acara: true,
      tema: true,
      app_user_kepanitiaan_ketua_pelaksanaToapp_user: { select: { nama_lengkap: true, nim: true } },
      proker: { select: { tanggal_hari_h_mulai: true } },
      divisi: {
        orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
        select: {
          id: true,
          nama: true,
          koordinator_id: true,
          app_user: { select: { nama_lengkap: true } },
          divisi_member: {
            select: { user_id: true, peran: true, app_user: { select: { nama_lengkap: true } } },
          },
        },
      },
    },
  });
  const ketuaHimpunan = konteks.periodeId ? await bacaKetuaHimpunan(konteks.periodeId) : null;
  const ketuplak = kp?.app_user_kepanitiaan_ketua_pelaksanaToapp_user;
  if (!kp || !ketuplak || !ketuaHimpunan) {
    return {
      ok: false,
      kode: 'BELUM_LENGKAP',
      pesan: 'Ketua Pelaksana acara atau Ketua Himpunan periode belum ditetapkan.',
      details: { kurang: ['Penandatangan'] },
    };
  }
  const torRow = await db.tor.findUnique({
    where: { kepanitiaan_id: kepanitiaanId },
    select: { data: true },
  });
  const tor = torRow ? normalisasiTor(torRow.data) : null;

  const susunan = [
    {
      id: 'inti',
      nama: 'Inti',
      koordinator: null,
      anggota: [{ jabatan: 'Ketua Pelaksana', nama: ketuplak.nama_lengkap }],
    },
    ...kp.divisi.map((d) => {
      const anggota = [
        ...(d.app_user ? [{ jabatan: 'Koordinator', nama: d.app_user.nama_lengkap }] : []),
        ...d.divisi_member
          .filter((m) => m.user_id !== d.koordinator_id)
          .map((m) => ({
            jabatan: m.peran === 'KOORDINATOR' ? 'Koordinator' : 'Anggota',
            nama: m.app_user.nama_lengkap,
          })),
      ];
      return { id: d.id, nama: d.nama, koordinator: d.app_user?.nama_lengkap ?? null, anggota };
    }),
  ];

  let isiDocx: Buffer;
  try {
    const [template, konfig, rundown] = await Promise.all([
      muatBerkas(kunciTemplateDokumen('LPJ')),
      bacaKonfigSurat(),
      muatRundown(kepanitiaanId),
    ]);
    // Master nota & foto dokumentasi dari bucket privat — paralel terbatas.
    const notaGambar = await petaTerbatas(data.lampiran, 4, async (n) => ({
      n,
      gambar: await gambarMaster(
        await storage.get(n.master_path),
        n.master_mime,
        n.lebar,
        n.tinggi,
      ),
    }));
    const fotoRows = data.manual.dokumentasi.length
      ? await db.image.findMany({
          where: { id: { in: data.manual.dokumentasi.map((x) => x.image_id) } },
          select: {
            id: true,
            master_path: true,
            master_mime_type: true,
            master_width: true,
            master_height: true,
          },
        })
      : [];
    const foto = await petaTerbatas(data.manual.dokumentasi, 4, async (x) => {
      const r = fotoRows.find((f) => f.id === x.image_id);
      return {
        foto: r
          ? await gambarMaster(
              await storage.get(r.master_path),
              r.master_mime_type,
              r.master_width,
              r.master_height,
            )
          : null,
        caption: x.caption,
      };
    });
    const perDivisi = new Map<string, { gambar: GambarDocx | null; keterangan: string }[]>();
    for (const { n, gambar } of notaGambar)
      perDivisi.set(n.divisi, [
        ...(perDivisi.get(n.divisi) ?? []),
        { gambar, keterangan: n.keterangan },
      ]);

    let no = 0;
    isiDocx = renderDocx(
      template,
      petakanLpj({
        namaKegiatan: tor?.nama_kegiatan.trim() || kp.nama_acara,
        tema: tor?.tema.trim() || kp.tema || '',
        tujuan: tor?.tujuan.filter((t) => t.trim()) ?? [],
        tahun: String(kp.proker.tanggal_hari_h_mulai?.getUTCFullYear() ?? new Date().getFullYear()),
        kota: konfig.kotaDefault,
        tanggal: tanggalHariIniJakarta(),
        ketuaPelaksana: { nama: ketuplak.nama_lengkap, nim: ketuplak.nim },
        ketuaHimpunan,
        manual: data.manual,
        snapshot,
        susunan,
        rundown: rundown.map((r, i) => ({
          hari_tanggal:
            i === 0 || rundown[i - 1]!.tanggal !== r.tanggal ? formatTanggalPanjang(r.tanggal) : '',
          waktu: r.waktu_mulai
            ? `${r.waktu_mulai}${r.waktu_selesai ? ` - ${r.waktu_selesai}` : ''}`
            : '-',
          acara: r.acara,
          pj: r.keterangan || '-',
        })),
        lampiranNota: [...perDivisi.entries()].map(([nama_divisi, nota]) => ({
          nama_divisi,
          nota: nota.map((x) => ({ ...x, keterangan: `Nota ${++no}: ${x.keterangan}` })),
        })),
        dokumentasi: foto,
      }),
    );
  } catch (e) {
    console.error(`[lpj] ${kepanitiaanId}: generate gagal`, e);
    return {
      ok: false,
      kode: 'GAGAL',
      pesan:
        e instanceof GalatTemplate
          ? `Template LPJ tidak dapat diisi: ${e.message}`
          : 'Template, nota, atau foto tidak dapat dimuat dari penyimpanan.',
    };
  }

  const key = keys.lpjDocx(kepanitiaanId);
  try {
    await storage.put(key, isiDocx, MIME_DOCX, { upsert: true });
  } catch (e) {
    console.error(`[lpj] ${kepanitiaanId}: unggah gagal`, e);
    return { ok: false, kode: 'GAGAL', pesan: 'Dokumen LPJ gagal disimpan ke penyimpanan.' };
  }

  // Snapshot + baris dokumen dalam satu transaksi; status tetap DRAFT.
  const dok = await mulaiTx(async (tx) => {
    const s = await kunciLpj(tx, kepanitiaanId);
    if (s && s !== 'DRAFT') return null;
    const json = snapshot as unknown as Prisma.InputJsonValue;
    const manual = data.manual as unknown as Prisma.InputJsonValue;
    await tx.lpj.upsert({
      where: { kepanitiaan_id: kepanitiaanId },
      create: { kepanitiaan_id: kepanitiaanId, data_manual: manual, analisis: json },
      update: { data_manual: manual, analisis: json, updated_at: new Date() },
    });
    return tx.dokumen.create({
      data: {
        kepanitiaan_id: kepanitiaanId,
        jenis: 'LPJ',
        format: 'DOCX',
        storage_key: key,
        file_size: BigInt(isiDocx.length),
        generated_by: konteks.sesi.userId,
      },
      select: { id: true },
    });
  });
  if (!dok)
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'LPJ berubah status selama dibuat. Muat ulang halaman.',
    };

  const dasar = { dokumen_id: dok.id, ukuran: isiDocx.length, jumlah_nota: data.lampiran.length };
  if (!bacaKonfigPdf().aktif)
    return { ok: true, nilai: { ...dasar, pdf: false, peringatan: null } };
  try {
    const h = await docxToPdf(isiDocx);
    const keyPdf = keys.lpjPdf(kepanitiaanId);
    await storage.put(keyPdf, h.pdf, 'application/pdf', { upsert: true });
    await db.dokumen.create({
      data: {
        kepanitiaan_id: kepanitiaanId,
        jenis: 'LPJ',
        format: 'PDF',
        storage_key: keyPdf,
        file_size: BigInt(h.pdf.length),
        generated_by: konteks.sesi.userId,
      },
    });
    return { ok: true, nilai: { ...dasar, pdf: true, peringatan: null } };
  } catch (e) {
    const sebab =
      e instanceof PdfTidakTersedia || e instanceof GalatPdf ? e.message : 'Konversi PDF gagal.';
    return {
      ok: true,
      nilai: {
        ...dasar,
        pdf: false,
        peringatan: `PDF tidak dibuat: ${sebab} Dokumen DOCX tetap tersedia.`,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Alur persetujuan (ADR-015)
// ---------------------------------------------------------------------------

export async function aksiLpj(
  tx: TxKlien,
  konteks: Konteks,
  kepanitiaanId: string,
  body: unknown,
): Promise<Hasil<{ status: StatusLpj }>> {
  const b = (body ?? {}) as { aksi?: unknown; alasan?: unknown };
  if (b.aksi !== 'ajukan' && b.aksi !== 'setujui' && b.aksi !== 'kembalikan')
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Aksi tidak dikenal.' };
  if (!(await muatAcara(konteks, kepanitiaanId)))
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Acara tidak ditemukan.' };
  const [row] = await tx.$queryRaw<
    { status: StatusLpj; analisis: unknown; data_manual: unknown }[]
  >`
    SELECT status::text, analisis, data_manual FROM lpj WHERE kepanitiaan_id = ${kepanitiaanId}::uuid FOR UPDATE`;
  if (!row) return { ok: false, kode: 'KONFLIK', pesan: 'LPJ belum pernah dibuat. Generate dulu.' };
  const izin = izinLpj(konteks, row.status);
  const sekarang = new Date();

  if (b.aksi === 'ajukan') {
    if (!izin.ajukan)
      return {
        ok: false,
        kode: row.status === 'DRAFT' ? 'TIDAK_BERWENANG' : 'KONFLIK',
        pesan: 'LPJ hanya dapat diajukan dari DRAFT oleh Bendahara/Admin.',
      };
    if (!row.analisis)
      return {
        ok: false,
        kode: 'KONFLIK',
        pesan: 'Generate LPJ dulu — snapshot analisis belum ada.',
      };
    await tx.lpj.update({
      where: { kepanitiaan_id: kepanitiaanId },
      data: { status: 'DIAJUKAN', updated_at: sekarang },
    });
    return { ok: true, nilai: { status: 'DIAJUKAN' } };
  }

  if (b.aksi === 'setujui') {
    if (!izin.setujui) {
      return {
        ok: false,
        kode: row.status === 'FINAL' || row.status === 'DRAFT' ? 'KONFLIK' : 'TIDAK_BERWENANG',
        pesan:
          row.status === 'DIAJUKAN'
            ? 'Tahap ini disetujui Bendahara Umum.'
            : row.status === 'DISETUJUI_BENDUM'
              ? 'Tahap akhir disetujui Ketua Himpunan.'
              : `LPJ berstatus ${row.status}.`,
      };
    }
    if (row.status === 'DIAJUKAN') {
      await tx.lpj.update({
        where: { kepanitiaan_id: kepanitiaanId },
        data: {
          status: 'DISETUJUI_BENDUM',
          disetujui_bendum_oleh: konteks.sesi.userId,
          disetujui_bendum_at: sekarang,
          updated_at: sekarang,
        },
      });
      return { ok: true, nilai: { status: 'DISETUJUI_BENDUM' } };
    }
    await tx.lpj.update({
      where: { kepanitiaan_id: kepanitiaanId },
      data: {
        status: 'FINAL',
        disetujui_ketua_oleh: konteks.sesi.userId,
        disetujui_ketua_at: sekarang,
        updated_at: sekarang,
      },
    });
    // LPJ terbit: RAB acara selesai (T-089 REALISASI → SELESAI).
    await majukanStatusRab(tx, kepanitiaanId, 'SELESAI');
    return { ok: true, nilai: { status: 'FINAL' } };
  }

  // kembalikan
  if (!izin.kembalikan)
    return {
      ok: false,
      kode: row.status === 'FINAL' || row.status === 'DRAFT' ? 'KONFLIK' : 'TIDAK_BERWENANG',
      pesan: `LPJ berstatus ${row.status} tidak dapat dikembalikan oleh Anda.`,
    };
  const alasan = typeof b.alasan === 'string' ? b.alasan.trim() : '';
  if (alasan.length < 5)
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Pengembalian wajib disertai alasan (minimal 5 karakter).',
    };
  const manual = {
    ...normalisasiManual(row.data_manual),
    catatan_pengembalian: alasan.slice(0, 500),
  } as unknown as Prisma.InputJsonValue;
  await tx.lpj.update({
    where: { kepanitiaan_id: kepanitiaanId },
    data: {
      status: 'DRAFT',
      data_manual: manual,
      disetujui_bendum_oleh: null,
      disetujui_bendum_at: null,
      disetujui_ketua_oleh: null,
      disetujui_ketua_at: null,
      updated_at: sekarang,
    },
  });
  return { ok: true, nilai: { status: 'DRAFT' } };
}

export async function dokumenLpjTerakhir(
  konteks: Konteks,
  kepanitiaanId: string,
  format: 'DOCX' | 'PDF' = 'DOCX',
) {
  if (!bolehBacaLpj(konteks.roles)) return null;
  const acara = await muatAcara(konteks, kepanitiaanId);
  if (!acara) return null;
  const d = await db.dokumen.findFirst({
    where: { kepanitiaan_id: kepanitiaanId, jenis: 'LPJ', format },
    orderBy: { created_at: 'desc' },
    select: { id: true, storage_key: true, created_at: true },
  });
  return d ? { ...d, nama_acara: acara.nama_acara } : null;
}

export { manualKosong };
