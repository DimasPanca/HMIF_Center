/**
 * service ruang kerja acara (T-084). Server-only, baca saja.
 *
 * ===========================================================================
 * SIAPA MELIHAT APA — app bypass RLS, jadi aturannya ditulis ulang di sini
 * ===========================================================================
 *   acara     `kepanitiaan.read` tanpa lingkup (pimpinan, BPH) → semua acara
 *             periode aktif. Ber-lingkup (Kadept/Anggota `R*`) → acara
 *             departemennya, DITAMBAH acara tempat ia menjadi panitia: panitia
 *             bebas lintas departemen (PRD F-8.1), dan USER_FLOW §12 membuka
 *             ruang kerja acara untuk "Semua".
 *   RAB/nota  angka anggaran hanya untuk yang boleh membacanya: `rab.read`
 *             tanpa lingkup (cermin `is_pimpinan()` di rab_*_select), Kadept
 *             departemen PIC (`R*`), atau panitia acara itu (`my_kepanitiaan()`).
 *             Selain itu angkanya `null` — bukan 0, supaya UI tidak menampilkan
 *             "Rp0" yang terbaca seperti RAB kosong.
 *
 * Periode lain tidak ditampilkan di sini (INV-08 — arsip punya jalurnya sendiri).
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-084 · PRD F-8.1, F-8.2 ·
 *         USER_FLOW §6.2, §12 · 015b rab_section_select, nota_select
 */

import { Prisma } from '@prisma/client';

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';

if (typeof window !== 'undefined') {
  throw new Error('lib/acara/service.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

// ---------------------------------------------------------------------------
// Hak baca
// ---------------------------------------------------------------------------

/** Kepanitiaan tempat pengguna menjadi ketua pelaksana atau anggota divisi — cermin `my_kepanitiaan()`. */
async function kepanitiaanSaya(userId: string): Promise<Set<string>> {
  const baris = await db.$queryRaw<{ id: string }[]>`
    SELECT d.kepanitiaan_id::text AS id FROM divisi_member dm JOIN divisi d ON d.id = dm.divisi_id WHERE dm.user_id = ${userId}::uuid
    UNION
    SELECT k.id::text FROM kepanitiaan k WHERE k.ketua_pelaksana = ${userId}::uuid`;
  return new Set(baris.map((b) => b.id));
}

interface Akses {
  semuaAcara: boolean;
  departemen: string[];
  saya: Set<string>;
  rabSemua: boolean;
  rabDepartemen: boolean;
}

async function akses(konteks: Konteks): Promise<Akses> {
  return {
    semuaAcara: can(konteks.roles, 'kepanitiaan.read') && lingkupKonteks(konteks, 'kepanitiaan.read') === null,
    departemen: konteks.departemenIds,
    saya: await kepanitiaanSaya(konteks.sesi.userId),
    rabSemua: can(konteks.roles, 'rab.read') && lingkupKonteks(konteks, 'rab.read') === null,
    rabDepartemen: can(konteks.roles, 'rab.read') && lingkupKonteks(konteks, 'rab.read') === 'DEPARTEMEN',
  };
}

const bolehLihat = (a: Akses, k: { id: string; departemen_id: string }) =>
  a.semuaAcara || a.saya.has(k.id) || a.departemen.includes(k.departemen_id);

const bolehRab = (a: Akses, k: { id: string; departemen_id: string }) =>
  a.rabSemua || a.saya.has(k.id) || (a.rabDepartemen && a.departemen.includes(k.departemen_id));

// ---------------------------------------------------------------------------
// Agregat
// ---------------------------------------------------------------------------

const angka = (v: Prisma.Decimal | number | bigint | null | undefined): number => (v == null ? 0 : Number(v));

/** Total RAB per divisi (jumlah `rab_item.total`). */
async function totalRabDivisi(divisiIds: string[]): Promise<Map<string, number>> {
  if (!divisiIds.length) return new Map();
  const baris = await db.$queryRaw<{ divisi_id: string; total: Prisma.Decimal | null }[]>`
    SELECT s.divisi_id::text, SUM(i.total) AS total
    FROM rab_section s JOIN rab_item i ON i.section_id = s.id
    WHERE s.divisi_id = ANY(${divisiIds}::uuid[])
    GROUP BY s.divisi_id`;
  return new Map(baris.map((b) => [b.divisi_id, angka(b.total)]));
}

export interface Progres {
  selesai: number;
  total: number;
  /** 0–100, atau null bila belum ada kartu sama sekali. */
  persen: number | null;
}

const progres = (selesai: number, total: number): Progres => ({
  selesai,
  total,
  persen: total ? Math.round((selesai / total) * 100) : null,
});

/** Progres Kanban per divisi: kartu DONE dibanding seluruh kartu. */
async function progresDivisi(divisiIds: string[]): Promise<Map<string, Progres>> {
  if (!divisiIds.length) return new Map();
  const baris = await db.$queryRaw<{ divisi_id: string; selesai: number; total: number }[]>`
    SELECT divisi_id::text, COUNT(*) FILTER (WHERE kolom = 'DONE')::int AS selesai, COUNT(*)::int AS total
    FROM kanban_card WHERE divisi_id = ANY(${divisiIds}::uuid[])
    GROUP BY divisi_id`;
  return new Map(baris.map((b) => [b.divisi_id, progres(b.selesai, b.total)]));
}

function gabungProgres(daftar: Progres[]): Progres {
  return progres(
    daftar.reduce((s, p) => s + p.selesai, 0),
    daftar.reduce((s, p) => s + p.total, 0),
  );
}

const keTanggal = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------------------
// Daftar acara
// ---------------------------------------------------------------------------

export interface BarisAcara {
  id: string;
  nama_acara: string;
  kode_kegiatan: string | null;
  status: string;
  departemen: { id: string; nama: string; kode: string };
  ketua_pelaksana: string | null;
  persiapan_mulai: string | null;
  hari_h_mulai: string | null;
  hari_h_selesai: string | null;
  /** null = pengguna tidak berhak melihat angka RAB acara ini. */
  total_rab: number | null;
  progres: Progres;
  jumlah_divisi: number;
  saya_panitia: boolean;
}

const PILIH_KEPANITIAAN = {
  id: true,
  nama_acara: true,
  tema: true,
  kode_kegiatan: true,
  target_anggaran: true,
  proker: {
    select: {
      id: true,
      status: true,
      periode_id: true,
      departemen_id: true,
      tanggal_mulai_persiapan: true,
      tanggal_hari_h_mulai: true,
      tanggal_hari_h_selesai: true,
      departemen: { select: { id: true, nama: true, kode: true } },
    },
  },
  app_user_kepanitiaan_ketua_pelaksanaToapp_user: { select: { nama_lengkap: true } },
  divisi: { select: { id: true }, orderBy: { urutan: 'asc' } },
} as const satisfies Prisma.kepanitiaanSelect;

export async function daftarAcara(konteks: Konteks): Promise<BarisAcara[]> {
  const a = await akses(konteks);
  const semua = await db.kepanitiaan.findMany({
    where: { proker: { periode_id: konteks.periodeId } },
    select: PILIH_KEPANITIAAN,
    take: 500,
  });
  const terlihat = semua.filter((k) => bolehLihat(a, { id: k.id, departemen_id: k.proker.departemen_id }));
  const divisiIds = terlihat.flatMap((k) => k.divisi.map((d) => d.id));
  const [rab, prog] = await Promise.all([totalRabDivisi(divisiIds), progresDivisi(divisiIds)]);

  return terlihat
    .map((k): BarisAcara => {
      const ids = k.divisi.map((d) => d.id);
      return {
        id: k.id,
        nama_acara: k.nama_acara,
        kode_kegiatan: k.kode_kegiatan,
        status: k.proker.status,
        departemen: k.proker.departemen,
        ketua_pelaksana: k.app_user_kepanitiaan_ketua_pelaksanaToapp_user?.nama_lengkap ?? null,
        persiapan_mulai: keTanggal(k.proker.tanggal_mulai_persiapan),
        hari_h_mulai: keTanggal(k.proker.tanggal_hari_h_mulai),
        hari_h_selesai: keTanggal(k.proker.tanggal_hari_h_selesai),
        total_rab: bolehRab(a, { id: k.id, departemen_id: k.proker.departemen_id }) ? ids.reduce((s, id) => s + (rab.get(id) ?? 0), 0) : null,
        progres: gabungProgres(ids.map((id) => prog.get(id) ?? progres(0, 0))),
        jumlah_divisi: ids.length,
        saya_panitia: a.saya.has(k.id),
      };
    })
    .sort((x, y) => (x.hari_h_mulai ?? '9999').localeCompare(y.hari_h_mulai ?? '9999') || x.nama_acara.localeCompare(y.nama_acara));
}

// ---------------------------------------------------------------------------
// Ruang kerja acara
// ---------------------------------------------------------------------------

export interface KartuDivisi {
  id: string;
  nama: string;
  warna: string | null;
  koordinator: string | null;
  jumlah_anggota: number;
  total_rab: number | null;
  progres: Progres;
  /** Peran pengguna di divisi ini, bila ada. */
  peran_saya: 'KOORDINATOR' | 'ANGGOTA' | null;
}

export interface ChartAcara {
  id: string;
  judul: string;
  divisi_id: string | null;
}

export interface RuangAcara {
  id: string;
  nama_acara: string;
  tema: string | null;
  kode_kegiatan: string | null;
  status: string;
  departemen: { id: string; nama: string; kode: string };
  ketua_pelaksana: string | null;
  persiapan_mulai: string | null;
  hari_h_mulai: string | null;
  hari_h_selesai: string | null;
  target_anggaran: number | null;
  boleh_rab: boolean;
  /** Peran pengguna di acara ini — untuk kalimat "Anda adalah …". */
  peran_saya: { ketua_pelaksana: boolean; divisi: { nama: string; peran: 'KOORDINATOR' | 'ANGGOTA' }[] };
  divisi: KartuDivisi[];
  chart: ChartAcara[];
  ringkasan: {
    total_rab: number | null;
    status_rab: string | null;
    dana_tak_terduga: number | null;
    jumlah_panitia: number;
    progres: Progres;
    nota: { menunggu: number; terverifikasi: number; ditolak: number } | null;
  };
}

/** `null` bila acara tidak ada, periode lain, atau tidak terlihat — pemanggil menjawab 404. */
export async function muatAcara(konteks: Konteks, id: string): Promise<RuangAcara | null> {
  const k = await db.kepanitiaan.findUnique({
    where: { id },
    select: {
      ...PILIH_KEPANITIAAN,
      ketua_pelaksana: true,
      rab_meta: { select: { status: true, dana_tak_terduga: true } },
      gantt_chart: { select: { id: true, judul: true } },
      divisi: {
        orderBy: { urutan: 'asc' },
        select: {
          id: true,
          nama: true,
          warna: true,
          koordinator_id: true,
          app_user: { select: { nama_lengkap: true } },
          divisi_member: { select: { user_id: true } },
          gantt_chart: { select: { id: true, judul: true } },
        },
      },
    },
  });
  if (!k || k.proker.periode_id !== konteks.periodeId) return null;

  const a = await akses(konteks);
  const pemilik = { id: k.id, departemen_id: k.proker.departemen_id };
  if (!bolehLihat(a, pemilik)) return null;
  const rabBoleh = bolehRab(a, pemilik);

  const ids = k.divisi.map((d) => d.id);
  const [rab, prog, nota] = await Promise.all([
    totalRabDivisi(ids),
    progresDivisi(ids),
    rabBoleh && ids.length
      ? db.nota.groupBy({ by: ['status'], where: { divisi_id: { in: ids } }, _count: { _all: true } })
      : Promise.resolve(null),
  ]);

  const saya = konteks.sesi.userId;
  const kartu: KartuDivisi[] = k.divisi.map((d) => {
    const anggota = new Set(d.divisi_member.map((m) => m.user_id));
    if (d.koordinator_id) anggota.add(d.koordinator_id);
    return {
      id: d.id,
      nama: d.nama,
      warna: d.warna,
      koordinator: d.app_user?.nama_lengkap ?? null,
      jumlah_anggota: anggota.size,
      total_rab: rabBoleh ? (rab.get(d.id) ?? 0) : null,
      progres: prog.get(d.id) ?? progres(0, 0),
      peran_saya: d.koordinator_id === saya ? 'KOORDINATOR' : anggota.has(saya) ? 'ANGGOTA' : null,
    };
  });

  const panitia = new Set(k.divisi.flatMap((d) => [...d.divisi_member.map((m) => m.user_id), ...(d.koordinator_id ? [d.koordinator_id] : [])]));
  if (k.ketua_pelaksana) panitia.add(k.ketua_pelaksana);
  const hitungNota = (s: string[]) => (nota ?? []).filter((n) => s.includes(n.status)).reduce((x, n) => x + n._count._all, 0);

  return {
    id: k.id,
    nama_acara: k.nama_acara,
    tema: k.tema,
    kode_kegiatan: k.kode_kegiatan,
    status: k.proker.status,
    departemen: k.proker.departemen,
    ketua_pelaksana: k.app_user_kepanitiaan_ketua_pelaksanaToapp_user?.nama_lengkap ?? null,
    persiapan_mulai: keTanggal(k.proker.tanggal_mulai_persiapan),
    hari_h_mulai: keTanggal(k.proker.tanggal_hari_h_mulai),
    hari_h_selesai: keTanggal(k.proker.tanggal_hari_h_selesai),
    target_anggaran: rabBoleh && k.target_anggaran ? angka(k.target_anggaran) : null,
    boleh_rab: rabBoleh,
    peran_saya: {
      ketua_pelaksana: k.ketua_pelaksana === saya,
      divisi: kartu.filter((d) => d.peran_saya).map((d) => ({ nama: d.nama, peran: d.peran_saya! })),
    },
    divisi: kartu,
    chart: [
      ...k.gantt_chart.map((c) => ({ id: c.id, judul: c.judul, divisi_id: null })),
      ...k.divisi.flatMap((d) => d.gantt_chart.map((c) => ({ id: c.id, judul: c.judul, divisi_id: d.id }))),
    ],
    ringkasan: {
      total_rab: rabBoleh ? kartu.reduce((s, d) => s + (d.total_rab ?? 0), 0) : null,
      status_rab: rabBoleh ? (k.rab_meta?.status ?? null) : null,
      dana_tak_terduga: rabBoleh && k.rab_meta ? angka(k.rab_meta.dana_tak_terduga) : null,
      jumlah_panitia: panitia.size,
      progres: gabungProgres(kartu.map((d) => d.progres)),
      nota: nota
        ? {
            menunggu: hitungNota(['DIUNGGAH', 'MENUNGGU_VERIFIKASI', 'PERLU_PERBAIKAN']),
            terverifikasi: hitungNota(['TERVERIFIKASI']),
            ditolak: hitungNota(['DITOLAK']),
          }
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Ruang kerja divisi
// ---------------------------------------------------------------------------

export interface ItemRab {
  id: string;
  no_urut: number;
  jenis_barang: string;
  jumlah_teks: string;
  harga_satuan: number;
  total: number;
  keterangan: string | null;
}

export interface RuangDivisi {
  acara: RuangAcara;
  divisi: KartuDivisi;
  anggota: { nama: string; peran: string | null; koordinator: boolean }[];
  job_desk_ada: boolean;
  chart: ChartAcara[];
  /** null = tidak berhak membaca RAB. */
  rab: { id: string; nama: string; item: ItemRab[]; subtotal: number }[] | null;
  kanban: { kolom: string; jumlah: number }[];
  /** null = tidak berhak membaca nota. */
  nota: { id: string; tanggal_belanja: string; total_nota: number; status: string; keterangan: string | null }[] | null;
}

export async function muatDivisi(konteks: Konteks, acaraId: string, divisiId: string): Promise<RuangDivisi | null> {
  const acara = await muatAcara(konteks, acaraId);
  const kartu = acara?.divisi.find((d) => d.id === divisiId);
  if (!acara || !kartu) return null;

  const [d, kanban, nota] = await Promise.all([
    db.divisi.findUnique({
      where: { id: divisiId },
      select: {
        koordinator_id: true,
        app_user: { select: { nama_lengkap: true } },
        divisi_member: { select: { user_id: true, peran: true, app_user: { select: { nama_lengkap: true } } } },
        job_desk: { select: { konten: true } },
        rab_section: {
          orderBy: { urutan: 'asc' },
          select: {
            id: true,
            nama: true,
            rab_item: {
              orderBy: { no_urut: 'asc' },
              select: { id: true, no_urut: true, jenis_barang: true, jumlah_teks: true, harga_satuan: true, total: true, keterangan: true },
            },
          },
        },
      },
    }),
    db.kanban_card.groupBy({ by: ['kolom'], where: { divisi_id: divisiId }, _count: { _all: true } }),
    acara.boleh_rab
      ? db.nota.findMany({
          where: { divisi_id: divisiId },
          orderBy: { tanggal_belanja: 'desc' },
          take: 200,
          select: { id: true, tanggal_belanja: true, total_nota: true, status: true, keterangan: true },
        })
      : Promise.resolve(null),
  ]);
  if (!d) return null;

  const anggota = d.divisi_member
    .map((m) => ({ nama: m.app_user.nama_lengkap, peran: m.peran, koordinator: m.user_id === d.koordinator_id }))
    .sort((x, y) => Number(y.koordinator) - Number(x.koordinator) || x.nama.localeCompare(y.nama));
  if (d.koordinator_id && !d.divisi_member.some((m) => m.user_id === d.koordinator_id) && d.app_user) {
    anggota.unshift({ nama: d.app_user.nama_lengkap, peran: 'Koordinator', koordinator: true });
  }

  const jumlahKolom = new Map(kanban.map((k) => [k.kolom as string, k._count._all]));

  return {
    acara,
    divisi: kartu,
    anggota,
    job_desk_ada: d.job_desk?.konten != null,
    chart: acara.chart.filter((c) => c.divisi_id === divisiId),
    rab: acara.boleh_rab
      ? d.rab_section.map((s) => {
          const item = s.rab_item.map((i) => ({ ...i, harga_satuan: angka(i.harga_satuan), total: angka(i.total) }));
          return { id: s.id, nama: s.nama, item, subtotal: item.reduce((x, i) => x + i.total, 0) };
        })
      : null,
    kanban: ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].map((kolom) => ({ kolom, jumlah: jumlahKolom.get(kolom) ?? 0 })),
    nota: nota
      ? nota.map((n) => ({ id: n.id, tanggal_belanja: keTanggal(n.tanggal_belanja)!, total_nota: angka(n.total_nota), status: n.status, keterangan: n.keterangan }))
      : null,
  };
}
