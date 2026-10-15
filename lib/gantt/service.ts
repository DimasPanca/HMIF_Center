/**
 * service editor Gantt empat level (T-078). Server-only.
 *
 * Hak (matriks PRD §5.1 `gantt`): Admin/Ketua/Wakil CRUD semua; Kadept CRU
 * di departemennya; Anggota RU di departemennya; Sekum/Bendum/BPH baca saja.
 * Panitia (anggota divisi, koordinator, ketua pelaksana) juga boleh mengubah
 * timeline acaranya walau departemennya lain — itu persis yang dijaga RLS
 * `my_kepanitiaan()` (015b). App bypass RLS → seluruh pemeriksaan di sini,
 * termasuk periode: chart periode lain adalah arsip baca saja (INV-08).
 *
 * Urutan pemeriksaan pada mutasi: hak aksi (route) → keberadaan & hak baca
 * (404 bila tak terlihat, supaya chart orang lain tidak bocor) → hak tulis
 * (403).
 *
 * Sumber: T-078 · PRD F-6.1, F-6.3 · SYSTEM_DESIGN §4.4 · INV-08
 */

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { can, type Permission } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import {
  SCOPE_KE_LEVEL,
  SkemaGrupBaru,
  SkemaTaskBaru,
  SkemaUbahGrup,
  SkemaUbahTask,
  membentukSiklus,
  type Dependensi,
  type Level,
} from '@/lib/gantt/skema';

if (typeof window !== 'undefined') {
  throw new Error('lib/gantt/service.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type KodeGagalGantt = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG';
export const STATUS_GAGAL_GANTT: Record<KodeGagalGantt, number> = { VALIDASI_GAGAL: 422, TIDAK_DITEMUKAN: 404, TIDAK_BERWENANG: 403 };
export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalGantt; pesan: string };

type Klien = TxKlien | typeof db;

const tidakAda = (apa = 'Chart'): Hasil<never> => ({ ok: false, kode: 'TIDAK_DITEMUKAN', pesan: `${apa} tidak ditemukan.` });
const ditolak = (pesan: string): Hasil<never> => ({ ok: false, kode: 'TIDAK_BERWENANG', pesan });
const salah = (pesan: string | undefined): Hasil<never> => ({ ok: false, kode: 'VALIDASI_GAGAL', pesan: pesan ?? 'Isian tidak valid.' });

// ---------------------------------------------------------------------------
// Chart & hak
// ---------------------------------------------------------------------------

export interface MetaChart {
  id: string;
  scope: keyof typeof SCOPE_KE_LEVEL;
  judul: string;
  periode_id: string;
  proker_id: string | null;
  divisi_id: string | null;
  /** Departemen pemilik — langsung, atau lewat proker/kepanitiaan/divisi. */
  departemen_id: string | null;
  /** Kepanitiaan pemilik — langsung, lewat proker, atau lewat divisi. */
  kepanitiaan_id: string | null;
}

async function metaChart(k: Klien, chartId: string): Promise<MetaChart | null> {
  const [m] = await k.$queryRaw<MetaChart[]>`
    SELECT c.id::text, c.scope, c.judul, c.periode_id::text, c.proker_id::text, c.divisi_id::text,
           COALESCE(c.departemen_id, p.departemen_id, pk.departemen_id, pd.departemen_id)::text AS departemen_id,
           COALESCE(c.kepanitiaan_id, kp.id, d.kepanitiaan_id)::text AS kepanitiaan_id
    FROM gantt_chart c
    LEFT JOIN proker p ON p.id = c.proker_id
    LEFT JOIN kepanitiaan kp ON kp.proker_id = c.proker_id
    LEFT JOIN kepanitiaan k ON k.id = c.kepanitiaan_id
    LEFT JOIN proker pk ON pk.id = k.proker_id
    LEFT JOIN divisi d ON d.id = c.divisi_id
    LEFT JOIN kepanitiaan kd ON kd.id = d.kepanitiaan_id
    LEFT JOIN proker pd ON pd.id = kd.proker_id
    WHERE c.id = ${chartId}::uuid`;
  return m ?? null;
}

/** Panitia acara chart ini: anggota/koordinator divisinya, atau ketua pelaksana. */
async function panitiaChart(k: Klien, userId: string, m: MetaChart): Promise<boolean> {
  if (!m.kepanitiaan_id) return false;
  const [r] = await k.$queryRaw<{ ya: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM kepanitiaan kp WHERE kp.id = ${m.kepanitiaan_id}::uuid AND kp.ketua_pelaksana = ${userId}::uuid
      UNION ALL
      SELECT 1 FROM divisi d
      LEFT JOIN divisi_member dm ON dm.divisi_id = d.id AND dm.user_id = ${userId}::uuid
      WHERE d.kepanitiaan_id = ${m.kepanitiaan_id}::uuid
        AND (${m.divisi_id}::uuid IS NULL OR d.id = ${m.divisi_id}::uuid)
        AND (dm.id IS NOT NULL OR d.koordinator_id = ${userId}::uuid)
    ) AS ya`;
  return r?.ya ?? false;
}

async function punyaHak(k: Klien, konteks: Konteks, m: MetaChart, perm: Permission): Promise<boolean> {
  if (!can(konteks.roles, perm)) return false;
  if (lingkupKonteks(konteks, perm) === null) return true;
  if (m.departemen_id && konteks.departemenIds.includes(m.departemen_id)) return true;
  return panitiaChart(k, konteks.sesi.userId, m);
}

export interface HakChart {
  baca: boolean;
  /** Geser bar, ubah task/grup. */
  tulis: boolean;
  /** Tambah task/grup. */
  tambah: boolean;
  hapus: boolean;
}

export async function hakChart(k: Klien, konteks: Konteks, m: MetaChart): Promise<HakChart> {
  const [baca, ubah, buat, hapus] = await Promise.all([
    punyaHak(k, konteks, m, 'gantt.read'),
    punyaHak(k, konteks, m, 'gantt.update'),
    punyaHak(k, konteks, m, 'gantt.create'),
    punyaHak(k, konteks, m, 'gantt.delete'),
  ]);
  const berjalan = m.periode_id === konteks.periodeId;
  return { baca, tulis: baca && berjalan && ubah, tambah: baca && berjalan && buat, hapus: baca && berjalan && hapus };
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export interface GrupData {
  id: string;
  nama: string;
  warna: string;
  pj_nama: string | null;
  urutan: number;
  collapsed: boolean;
}

export interface TaskData {
  id: string;
  group_id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  progres: number;
  is_milestone: boolean;
  urutan: number;
  assignee_name: string | null;
}

export interface DataChart {
  chart: { id: string; judul: string; level: Level; periode_id: string; arsip: boolean };
  grup: GrupData[];
  task: TaskData[];
  dependensi: Dependensi[];
  hak: HakChart;
}

export async function muatChart(konteks: Konteks, chartId: string): Promise<DataChart | null> {
  const m = await metaChart(db, chartId);
  if (!m) return null;
  const hak = await hakChart(db, konteks, m);
  if (!hak.baca) return null;
  const [grup, task, dependensi] = await Promise.all([
    db.$queryRaw<GrupData[]>`
      SELECT id::text, nama, warna, pj_nama, urutan, collapsed FROM gantt_group
      WHERE chart_id = ${chartId}::uuid ORDER BY urutan, nama, id`,
    db.$queryRaw<TaskData[]>`
      SELECT t.id::text, t.group_id::text, t.nama, to_char(t.tanggal_mulai, 'YYYY-MM-DD') AS tanggal_mulai,
             to_char(t.tanggal_selesai, 'YYYY-MM-DD') AS tanggal_selesai, t.progres::int AS progres,
             t.is_milestone, t.urutan, u.nama_lengkap AS assignee_name
      FROM gantt_task t LEFT JOIN app_user u ON u.id = t.assignee_id
      WHERE t.chart_id = ${chartId}::uuid ORDER BY t.urutan, t.tanggal_mulai, t.id`,
    db.$queryRaw<Dependensi[]>`
      SELECT d.from_task::text AS dari, d.to_task::text AS ke FROM gantt_dependency d
      JOIN gantt_task t ON t.id = d.to_task WHERE t.chart_id = ${chartId}::uuid AND d.tipe = 'FS'`,
  ]);
  return {
    chart: { id: m.id, judul: m.judul, level: SCOPE_KE_LEVEL[m.scope], periode_id: m.periode_id, arsip: m.periode_id !== konteks.periodeId },
    grup,
    task,
    dependensi,
    hak,
  };
}

export interface ChartRingkas {
  id: string;
  judul: string;
  level: Level;
  departemen: string | null;
  jumlah_task: number;
}

/** Chart periode berjalan yang dapat dibaca pengguna, untuk halaman indeks. */
export async function daftarChart(konteks: Konteks): Promise<ChartRingkas[]> {
  const semua = await db.$queryRaw<(ChartRingkas & { scope: keyof typeof SCOPE_KE_LEVEL })[]>`
    SELECT c.id::text, c.judul, c.scope,
           (SELECT nama FROM departemen WHERE id = COALESCE(c.departemen_id, p.departemen_id, pk.departemen_id, pd.departemen_id)) AS departemen,
           (SELECT count(*)::int FROM gantt_task t WHERE t.chart_id = c.id) AS jumlah_task
    FROM gantt_chart c
    LEFT JOIN proker p ON p.id = c.proker_id
    LEFT JOIN kepanitiaan k ON k.id = c.kepanitiaan_id
    LEFT JOIN proker pk ON pk.id = k.proker_id
    LEFT JOIN divisi d ON d.id = c.divisi_id
    LEFT JOIN kepanitiaan kd ON kd.id = d.kepanitiaan_id
    LEFT JOIN proker pd ON pd.id = kd.proker_id
    WHERE c.periode_id = ${konteks.periodeId}::uuid
    ORDER BY array_position(ARRAY['DEPARTEMEN','PROKER','KETUPLAK','DIVISI'], c.scope), c.judul
    LIMIT 500`;
  const hasil: ChartRingkas[] = [];
  for (const c of semua) {
    const m = await metaChart(db, c.id);
    if (m && (await punyaHak(db, konteks, m, 'gantt.read'))) {
      hasil.push({ id: c.id, judul: c.judul, level: SCOPE_KE_LEVEL[c.scope], departemen: c.departemen, jumlah_task: c.jumlah_task });
    }
  }
  return hasil;
}

/**
 * Chart DEPARTEMEN periode berjalan; dibuat saat pertama dibuka bila pengguna
 * boleh membuat. Indeks unik 037 menangani dua pembuka bersamaan.
 */
export async function pastikanChartDepartemen(tx: TxKlien, konteks: Konteks, departemen: { id: string; nama: string }): Promise<string | null> {
  const ada = await tx.gantt_chart.findFirst({
    where: { scope: 'DEPARTEMEN', departemen_id: departemen.id, periode_id: konteks.periodeId },
    select: { id: true },
  });
  if (ada) return ada.id;
  const calon: MetaChart = {
    id: '',
    scope: 'DEPARTEMEN',
    judul: '',
    periode_id: konteks.periodeId,
    proker_id: null,
    divisi_id: null,
    departemen_id: departemen.id,
    kepanitiaan_id: null,
  };
  if (!(await punyaHak(tx, konteks, calon, 'gantt.create'))) return null;
  const [baru] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO gantt_chart (scope, departemen_id, periode_id, judul)
    VALUES ('DEPARTEMEN', ${departemen.id}::uuid, ${konteks.periodeId}::uuid, ${`Gantt ${departemen.nama}`})
    ON CONFLICT (departemen_id, periode_id) WHERE scope = 'DEPARTEMEN' DO NOTHING
    RETURNING id::text`;
  if (baru) return baru.id;
  const lagi = await tx.gantt_chart.findFirst({
    where: { scope: 'DEPARTEMEN', departemen_id: departemen.id, periode_id: konteks.periodeId },
    select: { id: true },
  });
  return lagi?.id ?? null;
}

// ---------------------------------------------------------------------------
// Tulis
// ---------------------------------------------------------------------------

/** Chart + hak, baris chart dikunci selama transaksi (urutan tulis stabil). */
async function chartUntukTulis(tx: TxKlien, konteks: Konteks, chartId: string) {
  await tx.$queryRaw`SELECT id FROM gantt_chart WHERE id = ${chartId}::uuid FOR UPDATE`;
  const m = await metaChart(tx, chartId);
  if (!m) return null;
  return { m, hak: await hakChart(tx, konteks, m) };
}

async function chartDariTask(tx: TxKlien, taskId: string): Promise<string | null> {
  const t = await tx.gantt_task.findUnique({ where: { id: taskId }, select: { chart_id: true } });
  return t?.chart_id ?? null;
}

async function chartDariGrup(tx: TxKlien, grupId: string): Promise<string | null> {
  const g = await tx.gantt_group.findUnique({ where: { id: grupId }, select: { chart_id: true } });
  return g?.chart_id ?? null;
}

/** Tetapkan pendahulu FS task (ganti seluruhnya); tolak lintas chart & siklus. */
async function aturDependensi(tx: TxKlien, chartId: string, taskId: string, pendahulu: string[]): Promise<Hasil<null>> {
  const unik = [...new Set(pendahulu)];
  if (unik.includes(taskId)) return salah('Task tidak dapat bergantung pada dirinya sendiri.');
  if (unik.length) {
    const sah = await tx.gantt_task.count({ where: { id: { in: unik }, chart_id: chartId } });
    if (sah !== unik.length) return salah('Task pendahulu harus berada di chart yang sama.');
  }
  const deps = await tx.$queryRaw<Dependensi[]>`
    SELECT d.from_task::text AS dari, d.to_task::text AS ke FROM gantt_dependency d
    JOIN gantt_task t ON t.id = d.to_task WHERE t.chart_id = ${chartId}::uuid`;
  if (membentukSiklus(deps, taskId, unik)) return salah('Dependensi ini membentuk siklus (task saling menunggu).');
  await tx.gantt_dependency.deleteMany({ where: { to_task: taskId } });
  if (unik.length) await tx.gantt_dependency.createMany({ data: unik.map((dari) => ({ from_task: dari, to_task: taskId, tipe: 'FS' })) });
  return { ok: true, nilai: null };
}

const hari = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function tambahTask(tx: TxKlien, konteks: Konteks, chartId: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const c = await chartUntukTulis(tx, konteks, chartId);
  if (!c || !c.hak.baca) return tidakAda();
  if (!c.hak.tambah) return ditolak('Anda tidak dapat menambah task pada chart ini.');
  const p = SkemaTaskBaru.safeParse(body);
  if (!p.success) return salah(p.error.issues[0]?.message);
  if ((await chartDariGrup(tx, p.data.group_id)) !== chartId) return salah('Grup tidak ditemukan di chart ini.');
  const urutan = await tx.gantt_task.count({ where: { group_id: p.data.group_id } });
  const t = await tx.gantt_task.create({
    data: {
      group_id: p.data.group_id,
      chart_id: chartId,
      nama: p.data.nama,
      tanggal_mulai: hari(p.data.tanggal_mulai),
      tanggal_selesai: hari(p.data.tanggal_selesai),
      progres: p.data.progres,
      is_milestone: p.data.is_milestone,
      urutan,
    },
    select: { id: true },
  });
  if (p.data.bergantung_pada.length) {
    const d = await aturDependensi(tx, chartId, t.id, p.data.bergantung_pada);
    if (!d.ok) throw new GagalTransaksi(d);
  }
  return { ok: true, nilai: t };
}

export async function ubahTask(tx: TxKlien, konteks: Konteks, taskId: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const chartId = await chartDariTask(tx, taskId);
  const c = chartId ? await chartUntukTulis(tx, konteks, chartId) : null;
  if (!c || !c.hak.baca) return tidakAda('Task');
  if (!c.hak.tulis) return ditolak('Anda hanya dapat membaca chart ini.');
  const p = SkemaUbahTask.safeParse(body);
  if (!p.success) return salah(p.error.issues[0]?.message);
  const lama = await tx.gantt_task.findUniqueOrThrow({ where: { id: taskId }, select: { tanggal_mulai: true, tanggal_selesai: true } });
  const mulai = p.data.tanggal_mulai ?? lama.tanggal_mulai.toISOString().slice(0, 10);
  const selesai = p.data.tanggal_selesai ?? lama.tanggal_selesai.toISOString().slice(0, 10);
  if (selesai < mulai) return salah('Tanggal selesai tidak boleh mendahului tanggal mulai.');
  if (p.data.group_id && (await chartDariGrup(tx, p.data.group_id)) !== chartId) return salah('Grup tidak ditemukan di chart ini.');
  await tx.gantt_task.update({
    where: { id: taskId },
    data: {
      ...(p.data.nama !== undefined ? { nama: p.data.nama } : {}),
      ...(p.data.group_id ? { group_id: p.data.group_id } : {}),
      ...(p.data.tanggal_mulai ? { tanggal_mulai: hari(p.data.tanggal_mulai) } : {}),
      ...(p.data.tanggal_selesai ? { tanggal_selesai: hari(p.data.tanggal_selesai) } : {}),
      ...(p.data.progres !== undefined ? { progres: p.data.progres } : {}),
      ...(p.data.is_milestone !== undefined ? { is_milestone: p.data.is_milestone } : {}),
    },
  });
  if (p.data.bergantung_pada) {
    const d = await aturDependensi(tx, chartId!, taskId, p.data.bergantung_pada);
    if (!d.ok) throw new GagalTransaksi(d);
  }
  return { ok: true, nilai: { id: taskId } };
}

export async function hapusTask(tx: TxKlien, konteks: Konteks, taskId: string): Promise<Hasil<{ id: string }>> {
  const chartId = await chartDariTask(tx, taskId);
  const c = chartId ? await chartUntukTulis(tx, konteks, chartId) : null;
  if (!c || !c.hak.baca) return tidakAda('Task');
  if (!c.hak.hapus) return ditolak('Anda tidak dapat menghapus task pada chart ini.');
  await tx.gantt_task.delete({ where: { id: taskId } });
  return { ok: true, nilai: { id: taskId } };
}

export async function tambahGrup(tx: TxKlien, konteks: Konteks, chartId: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const c = await chartUntukTulis(tx, konteks, chartId);
  if (!c || !c.hak.baca) return tidakAda();
  if (!c.hak.tambah) return ditolak('Anda tidak dapat menambah grup pada chart ini.');
  const p = SkemaGrupBaru.safeParse(body);
  if (!p.success) return salah(p.error.issues[0]?.message);
  const urutan = await tx.gantt_group.count({ where: { chart_id: chartId } });
  const g = await tx.gantt_group.create({ data: { chart_id: chartId, ...p.data, urutan }, select: { id: true } });
  return { ok: true, nilai: g };
}

export async function ubahGrup(tx: TxKlien, konteks: Konteks, grupId: string, body: unknown): Promise<Hasil<{ id: string }>> {
  const chartId = await chartDariGrup(tx, grupId);
  const c = chartId ? await chartUntukTulis(tx, konteks, chartId) : null;
  if (!c || !c.hak.baca) return tidakAda('Grup');
  if (!c.hak.tulis) return ditolak('Anda hanya dapat membaca chart ini.');
  const p = SkemaUbahGrup.safeParse(body);
  if (!p.success) return salah(p.error.issues[0]?.message);
  await tx.gantt_group.update({ where: { id: grupId }, data: p.data });
  return { ok: true, nilai: { id: grupId } };
}

export async function hapusGrup(tx: TxKlien, konteks: Konteks, grupId: string): Promise<Hasil<{ id: string }>> {
  const chartId = await chartDariGrup(tx, grupId);
  const c = chartId ? await chartUntukTulis(tx, konteks, chartId) : null;
  if (!c || !c.hak.baca) return tidakAda('Grup');
  if (!c.hak.hapus) return ditolak('Anda tidak dapat menghapus grup pada chart ini.');
  await tx.gantt_group.delete({ where: { id: grupId } });
  return { ok: true, nilai: { id: grupId } };
}

/**
 * Dilempar di dalam transaksi supaya task yang sudah ditulis ikut dibatalkan
 * bila dependensinya ditolak; route menangkap dan mengubahnya kembali ke Hasil.
 */
export class GagalTransaksi extends Error {
  constructor(readonly hasil: Hasil<never>) {
    super(hasil.ok ? '' : hasil.pesan);
  }
}
