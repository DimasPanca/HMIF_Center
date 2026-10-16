/**
 * Service Proposal (T-096, PRD F-10.2). Server-only.
 *
 *   baca/tulis   sama dengan TOR (`bisaTulisTor`) — RLS proposal_insert/update
 *                (015b) identik dengan tor_*: pimpinan, Kadept, panitia acara.
 *   prefill      `terapkanPrefill` atas TOR, proker, data panitia, dan proposal
 *                terbaru lain di periode yang sama — setiap kali dimuat, hanya
 *                untuk field yang kosong atau belum disunting.
 *   tarikan      susunan kepanitiaan (divisi/divisi_member), anggaran (RAB),
 *                rundown — TIDAK pernah disimpan di proposal.data.
 *
 * Sumber: docs/ai/tasks/P6-tor-proposal.md T-096 · PRD F-10.2
 */

import { Prisma } from '@prisma/client';

import { muatAcara } from '@/lib/acara/service';
import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { sanitasiKonten } from '@/lib/notulensi/sanitasi';
import { terapkanPrefill, type SumberPrefill } from '@/lib/proposal/prefill';
import {
  MAKS_JSON_PROPOSAL,
  SkemaDataProposal,
  normalisasiProposal,
  ukurPrefill,
  type DataProposal,
  type FaktaTarikan,
  type UkuranPrefill,
} from '@/lib/proposal/schema';
import { bacaKetuaHimpunan } from '@/lib/surat/konfig';
import { normalisasiTor, type BarisRundown } from '@/lib/tor/schema';
import { anggaranTor, bisaTulisTor, muatRundown, type AnggaranTor } from '@/lib/tor/service';

if (typeof window !== 'undefined') {
  throw new Error('lib/proposal/service.ts adalah modul server-only.');
}

export type KodeGagalProposal = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG';
export const STATUS_GAGAL_PROPOSAL: Record<KodeGagalProposal, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
};
export type Hasil<T> =
  { ok: true; nilai: T } | { ok: false; kode: KodeGagalProposal; pesan: string };

export interface DivisiPanitia {
  nama_divisi: string;
  anggota: { jabatan: string; nama: string; nim: string }[];
}

export interface DataProposalLengkap {
  kepanitiaan_id: string;
  nama_acara: string;
  data: DataProposal;
  /** Tarikan — tampil baca saja di editor, ditarik ulang saat generate. */
  ketua_pelaksana: { nama: string; nim: string } | null;
  ketua_himpunan: { nama: string; nim: string } | null;
  susunan: DivisiPanitia[];
  anggaran: AnggaranTor | 'TERBATAS';
  rundown: BarisRundown[];
  tahun: string;
  /** Bagian tarikan yang datanya ada — untuk ukuran prefill di klien. */
  tarikan: FaktaTarikan;
  ukuran: UkuranPrefill;
  boleh_tulis: boolean;
  tersimpan: boolean;
  diperbarui_at: string | null;
}

// ---------------------------------------------------------------------------
// Tarikan
// ---------------------------------------------------------------------------

/** Susunan kepanitiaan dari data panitia — Ketua Pelaksana, lalu tiap divisi (koordinator dulu). */
export async function susunanKepanitiaan(kepanitiaanId: string): Promise<DivisiPanitia[]> {
  const k = await db.kepanitiaan.findUnique({
    where: { id: kepanitiaanId },
    select: {
      app_user_kepanitiaan_ketua_pelaksanaToapp_user: { select: { nama_lengkap: true, nim: true } },
      divisi: {
        orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
        select: {
          nama: true,
          koordinator_id: true,
          app_user: { select: { nama_lengkap: true, nim: true } },
          divisi_member: {
            select: {
              user_id: true,
              peran: true,
              app_user: { select: { nama_lengkap: true, nim: true } },
            },
          },
        },
      },
    },
  });
  if (!k) return [];
  const hasil: DivisiPanitia[] = [];
  const ketua = k.app_user_kepanitiaan_ketua_pelaksanaToapp_user;
  if (ketua)
    hasil.push({
      nama_divisi: 'Inti',
      anggota: [{ jabatan: 'Ketua Pelaksana', nama: ketua.nama_lengkap, nim: ketua.nim }],
    });
  for (const d of k.divisi) {
    const anggota: DivisiPanitia['anggota'] = [];
    if (d.app_user)
      anggota.push({ jabatan: 'Koordinator', nama: d.app_user.nama_lengkap, nim: d.app_user.nim });
    const lain = d.divisi_member
      .filter((m) => m.user_id !== d.koordinator_id)
      .sort(
        (a, b) =>
          Number(b.peran === 'KOORDINATOR') - Number(a.peran === 'KOORDINATOR') ||
          a.app_user.nama_lengkap.localeCompare(b.app_user.nama_lengkap, 'id'),
      );
    for (const m of lain)
      anggota.push({
        jabatan: m.peran === 'KOORDINATOR' ? 'Koordinator' : 'Anggota',
        nama: m.app_user.nama_lengkap,
        nim: m.app_user.nim,
      });
    hasil.push({ nama_divisi: d.nama, anggota });
  }
  return hasil;
}

async function sumberPrefill(
  kepanitiaanId: string,
  namaAcara: string,
  periodeId: string,
): Promise<SumberPrefill> {
  const [tor, kp, sekre, lain] = await Promise.all([
    db.tor.findUnique({ where: { kepanitiaan_id: kepanitiaanId }, select: { data: true } }),
    db.kepanitiaan.findUnique({
      where: { id: kepanitiaanId },
      select: { proker: { select: { deskripsi: true, tujuan: true, sasaran: true } } },
    }),
    db.divisi.findFirst({
      where: {
        kepanitiaan_id: kepanitiaanId,
        nama: { contains: 'sekretar', mode: 'insensitive' },
        koordinator_id: { not: null },
      },
      orderBy: { urutan: 'asc' },
      select: { app_user: { select: { nama_lengkap: true, nim: true } } },
    }),
    db.proposal.findFirst({
      where: {
        kepanitiaan_id: { not: kepanitiaanId },
        kepanitiaan: { proker: { periode_id: periodeId } },
      },
      orderBy: { updated_at: 'desc' },
      select: { data: true },
    }),
  ]);
  return {
    nama_acara: namaAcara,
    tor: tor ? normalisasiTor(tor.data) : null,
    proker: kp?.proker ?? { deskripsi: null, tujuan: null, sasaran: null },
    sekretaris: sekre?.app_user
      ? { nama: sekre.app_user.nama_lengkap, nomor: sekre.app_user.nim }
      : null,
    proposalLain: lain ? normalisasiProposal(lain.data) : null,
  };
}

function sanitasiData(d: DataProposal): DataProposal {
  return {
    ...d,
    latar_belakang: sanitasiKonten(d.latar_belakang),
    landasan_kegiatan: sanitasiKonten(d.landasan_kegiatan),
    sasaran: sanitasiKonten(d.sasaran),
    bentuk_acara: sanitasiKonten(d.bentuk_acara),
    gambaran_umum: sanitasiKonten(d.gambaran_umum),
    penutup: sanitasiKonten(d.penutup),
  };
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

/** null = acara tidak ada / periode lain / tidak terlihat (404). */
export async function muatProposal(
  konteks: Konteks,
  kepanitiaanId: string,
): Promise<DataProposalLengkap | null> {
  const acara = await muatAcara(konteks, kepanitiaanId);
  if (!acara || !konteks.periodeId) return null;
  const [row, sumber, susunan, anggaran, rundown, ketua, boleh, kp] = await Promise.all([
    db.proposal.findUnique({
      where: { kepanitiaan_id: kepanitiaanId },
      select: { data: true, updated_at: true },
    }),
    sumberPrefill(kepanitiaanId, acara.nama_acara, konteks.periodeId),
    susunanKepanitiaan(kepanitiaanId),
    anggaranTor(konteks, kepanitiaanId),
    muatRundown(kepanitiaanId),
    bacaKetuaHimpunan(konteks.periodeId),
    bisaTulisTor(konteks, kepanitiaanId),
    db.kepanitiaan.findUnique({
      where: { id: kepanitiaanId },
      select: {
        app_user_kepanitiaan_ketua_pelaksanaToapp_user: {
          select: { nama_lengkap: true, nim: true },
        },
        proker: { select: { tanggal_hari_h_mulai: true } },
      },
    }),
  ]);
  const data = sanitasiData(terapkanPrefill(row ? normalisasiProposal(row.data) : null, sumber));
  const ketuplak = kp?.app_user_kepanitiaan_ketua_pelaksanaToapp_user;
  const tahun = String(
    kp?.proker.tanggal_hari_h_mulai?.getUTCFullYear() ?? new Date().getFullYear(),
  );
  const ang = anggaran ?? 'TERBATAS';
  const tarikan: FaktaTarikan = {
    tahun: true,
    ketua_pelaksana: !!ketuplak,
    ketua_himpunan: !!ketua,
    susunan_kepanitiaan: susunan.some((d) => d.anggota.length > 0),
    anggaran: ang !== 'TERBATAS' && ang.total_divisi > 0,
    rincian_rab: ang !== 'TERBATAS' && ang.total_divisi > 0,
    rundown: rundown.length > 0,
  };
  return {
    kepanitiaan_id: kepanitiaanId,
    nama_acara: acara.nama_acara,
    data,
    ketua_pelaksana: ketuplak ? { nama: ketuplak.nama_lengkap, nim: ketuplak.nim } : null,
    ketua_himpunan: ketua,
    susunan,
    anggaran: ang,
    rundown,
    tahun,
    tarikan,
    ukuran: ukurPrefill(data, tarikan),
    boleh_tulis: boleh,
    tersimpan: !!row,
    diperbarui_at: row?.updated_at.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Simpan
// ---------------------------------------------------------------------------

export async function simpanProposal(
  tx: TxKlien,
  konteks: Konteks,
  kepanitiaanId: string,
  body: unknown,
): Promise<Hasil<{ diperbarui_at: string }>> {
  if (JSON.stringify(body ?? null).length > MAKS_JSON_PROPOSAL)
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Isi proposal terlalu panjang.' };
  const p = SkemaDataProposal.safeParse((body as { data?: unknown } | null)?.data);
  if (!p.success) {
    const i = p.error.issues[0];
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: i ? `${i.message} (${i.path.join('.')})` : 'Isi proposal tidak valid.',
    };
  }
  if (!(await tx.kepanitiaan.findUnique({ where: { id: kepanitiaanId }, select: { id: true } }))) {
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Acara tidak ditemukan.' };
  }
  if (!(await bisaTulisTor(konteks, kepanitiaanId, tx))) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Proposal disusun panitia acara ini, Kadept penanggung jawab, atau pimpinan.',
    };
  }
  const json = sanitasiData(p.data) as unknown as Prisma.InputJsonValue;
  const sekarang = new Date();
  const r = await tx.proposal.upsert({
    where: { kepanitiaan_id: kepanitiaanId },
    create: {
      kepanitiaan_id: kepanitiaanId,
      data: json,
      updated_by: konteks.sesi.userId,
      updated_at: sekarang,
    },
    update: { data: json, updated_by: konteks.sesi.userId, updated_at: sekarang },
    select: { updated_at: true },
  });
  return { ok: true, nilai: { diperbarui_at: r.updated_at.toISOString() } };
}
