/**
 * restore — memulihkan bundel backup (SYSTEM_DESIGN §15.3, USER_FLOW §10.2).
 * SERVER-ONLY.
 *
 * Bertahap, dan setiap tahap tersimpan di `restore_job` supaya dapat
 * dilanjutkan bila fungsi serverless terputus:
 *   PRA_RESTORE  backup kondisi SAAT INI (jenis PRA_RESTORE) — WAJIB, tanpa
 *                opsi dilewati; gagal → restore batal, data tak tersentuh
 *   VERIFIKASI   seluruh berkas diunduh & dicocokkan SHA-256 + versi skema
 *   TERAPKAN     PENUH: arsip storage (upsert) lalu database dalam SATU
 *                transaksi dari `full-dump.sql.gz` — gagal = rollback utuh.
 *                MODUL: satu transaksi per modul; laporan mencatat modul yang
 *                sudah terpakai bila gagal di tengah (kontrak 6).
 *
 * Restore penuh dari dump DATA (`sql_per_tabel`) hanya sah pada database yang
 * migrasinya SAMA PERSIS dengan saat backup — kolom dump terkunci pada waktu
 * itu. Tidak ada migrasi otomatis (kontrak 3). audit_log tidak pernah dihapus
 * (INV-06): dump menyisipkan barisnya dengan ON CONFLICT DO NOTHING.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-112 · PRD F-16.3 · ADR-016 · ADR-034
 */

import { gunzipSync } from 'node:zlib';

import type { Prisma } from '@prisma/client';
import PizZip from 'pizzip';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { klienLangsung } from '@/lib/db/connection';
import { withServiceContext, type TxKlien } from '@/lib/db/with-audit-context';
import { storage as storageBawaan } from '@/lib/storage';
import type { StorageAdapter } from '@/lib/storage/adapter';
import { keys } from '@/lib/storage/keys';

import {
  DAFTAR_MODUL,
  MODUL_BACKUP,
  migrasiTerakhir,
  versiSkema,
  type ModulBackup,
} from './export-modul';
import {
  STRATEGI,
  imporModul,
  strategiSah,
  validasiModul,
  type RingkasTabel,
  type Strategi,
} from './import-modul';
import { JALUR, SkemaManifest, sha256, type Manifest } from './manifest';
import { mulaiBackup, prosesBackup, tandaiTerhenti } from './service';
import { NAMA_INDEKS, type EntriIndeks } from './zip-storage';

if (typeof window !== 'undefined') {
  throw new Error('lib/backup/restore.ts adalah modul server-only.');
}

/** Teks yang wajib diketik untuk restore penuh — konfirmasi tingkat kritis (ADR-034). */
export const NAMA_SISTEM = 'HMIF Center';

/**
 * Restore BERJALAN tanpa kabar selama ini dianggap terputus dan boleh
 * dilanjutkan. Di atas `maxDuration` fungsi (5 menit): satu tahap yang masih
 * hidup tidak pernah diam selama ini.
 */
export const BATAS_DIAM_MS = 6 * 60_000;

export const SkemaPermintaanRestore = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('PENUH'), konfirmasi: z.string() }),
  z.object({
    mode: z.literal('MODUL'),
    modul: z
      .array(z.enum(DAFTAR_MODUL as [ModulBackup, ...ModulBackup[]]))
      .min(1, 'Pilih minimal satu modul.'),
    strategi: z.enum(STRATEGI),
  }),
]);
export type PermintaanRestore = z.infer<typeof SkemaPermintaanRestore>;

type Penyimpanan = Pick<StorageAdapter, 'get' | 'put'>;

export async function muatManifest(
  backupId: string,
  st: Penyimpanan = storageBawaan,
): Promise<Manifest> {
  const isi = await st.get(keys.backupBerkas(backupId, JALUR.manifest)).catch(() => null);
  if (!isi) throw new Error('manifest.json tidak ditemukan — bundel tidak lengkap.');
  const p = SkemaManifest.safeParse(JSON.parse(isi.toString('utf8')));
  if (!p.success) throw new Error('manifest.json tidak sesuai skema.');
  return p.data;
}

/** Murni: alasan penolakan, atau `null` bila bundel boleh dipulihkan dengan mode itu. */
export function cekKecocokan(
  m: Pick<Manifest, 'versiSkema' | 'migrasiTerakhir' | 'dump'>,
  sistem: { versiSkema: string; migrasiTerakhir: string },
  mode: 'PENUH' | 'MODUL',
): string | null {
  if (m.versiSkema !== sistem.versiSkema) {
    return `Versi skema tidak cocok: backup v${m.versiSkema}, sistem v${sistem.versiSkema}. Restore dibatalkan — migrasi otomatis tidak dilakukan.`;
  }
  if (mode === 'PENUH' && m.dump.metode !== 'sql_per_tabel') {
    return 'Dump dibuat dengan pg_dump (berisi DDL) — pulihkan manual ke database kosong dengan psql, atau gunakan restore per modul.';
  }
  if (mode === 'PENUH' && m.migrasiTerakhir !== sistem.migrasiTerakhir) {
    return (
      `Restore penuh membutuhkan database pada migrasi ${m.migrasiTerakhir}, sedangkan sistem pada ${sistem.migrasiTerakhir}. ` +
      'Gunakan restore per modul, atau pulihkan ke database yang dimigrasi sampai titik itu.'
    );
  }
  return null;
}

/**
 * Murni: dump → daftar pernyataan untuk dijalankan SATU PER SATU di dalam
 * transaksi pemanggil (pooler Supabase memutus satu kueri belasan MB).
 * BEGIN/COMMIT milik berkas dibuang — COMMIT di tengah akan mengakhiri
 * transaksi kita. Pernyataan dimulai di kolom 0 (`INSERT INTO`, `SELECT
 * setval`, `SET LOCAL`); baris data JSON selalu berindentasi atau diawali
 * `[`/`]`, `jsonb_pretty` tak pernah menulis baris kosong, dan string JSON
 * tidak memuat newline mentah — jadi baris kosong, komentar `--`, `BEGIN;`
 * dan `COMMIT;` di kolom 0 hanya ada DI ANTARA pernyataan.
 */
export function pecahDump(sql: string): string[] {
  const hasil: string[] = [];
  let kini: string[] = [];
  const tutup = () => {
    if (kini.length) hasil.push(kini.join('\n'));
    kini = [];
  };
  for (const b of sql.split('\n')) {
    if (b === '' || b === 'BEGIN;' || b === 'COMMIT;' || b.startsWith('--')) tutup();
    else if (/^(INSERT INTO |SELECT setval\(|SET LOCAL )/.test(b)) {
      tutup();
      kini.push(b);
    } else if (kini.length) kini.push(b);
  }
  tutup();
  return hasil;
}

async function sistemSekarang() {
  return { versiSkema: versiSkema(), migrasiTerakhir: await migrasiTerakhir() };
}

async function ambilTerverifikasi(
  backupId: string,
  m: Manifest,
  path: string,
  st: Penyimpanan,
): Promise<Buffer> {
  const f = m.files.find((x) => x.path === path);
  if (!f) throw new Error(`${path} tidak tercantum di manifest.`);
  const isi = await st.get(keys.backupBerkas(backupId, path));
  if (isi.length !== f.size || sha256(isi) !== f.checksum)
    throw new Error(`Checksum tidak cocok: ${path}.`);
  return isi;
}

// ---------------------------------------------------------------------------
// Pratinjau (kontrak 5)
// ---------------------------------------------------------------------------

export interface PratinjauRestore {
  backupId: string;
  dibuatPada: string;
  versiSkema: string;
  migrasiTerakhir: string;
  mode: 'PENUH' | 'MODUL';
  /** Alasan restore ditolak; bila ada, tombol jalankan tidak boleh tersedia. */
  ditolak: string | null;
  peringatan: string[];
  modul: { modul: string; backup: number; sekarang?: number; tabel?: RingkasTabel[] }[];
  berkasStorage: number;
}

async function jumlahSekarang(modul: ModulBackup): Promise<number> {
  let n = 0;
  for (const t of MODUL_BACKUP[modul]) {
    const [r] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM public."${t}"`,
    );
    n += r!.n;
  }
  return n;
}

export async function pratinjauRestore(
  backupId: string,
  permintaan: PermintaanRestore,
  st: Penyimpanan = storageBawaan,
): Promise<PratinjauRestore> {
  const m = await muatManifest(backupId, st);
  const sistem = await sistemSekarang();
  const ditolak = cekKecocokan(m, sistem, permintaan.mode);
  const dasar: PratinjauRestore = {
    backupId,
    dibuatPada: m.dibuatPada,
    versiSkema: m.versiSkema,
    migrasiTerakhir: m.migrasiTerakhir,
    mode: permintaan.mode,
    ditolak,
    peringatan: [],
    modul: [],
    berkasStorage: m.jumlahBerkasStorage,
  };
  if (ditolak) return dasar;

  if (permintaan.mode === 'PENUH') {
    for (const modul of DAFTAR_MODUL) {
      dasar.modul.push({
        modul,
        backup: m.jumlahRecord[modul] ?? 0,
        sekarang: await jumlahSekarang(modul),
      });
    }
    dasar.peringatan.push(
      `Seluruh data (kecuali audit log) diganti dengan kondisi ${m.dibuatPada}. Perubahan setelah itu hilang — kecuali tersimpan di backup pra-restore yang dibuat otomatis.`,
      'Akun dan role pengguna ikut dipulihkan: pengguna yang dibuat setelah backup tidak dapat masuk lagi.',
      `${m.jumlahBerkasStorage} berkas storage ditulis ulang; berkas yang lebih baru dari backup tidak dihapus.`,
    );
    return dasar;
  }

  if (m.migrasiTerakhir !== sistem.migrasiTerakhir) {
    dasar.peringatan.push(
      `Backup dibuat pada migrasi ${m.migrasiTerakhir}, sistem pada ${sistem.migrasiTerakhir}: kolom yang lebih baru memakai nilai bawaan.`,
    );
  }
  for (const modul of permintaan.modul) {
    const tolak = strategiSah(modul, permintaan.strategi);
    if (tolak) {
      dasar.ditolak = tolak;
      return dasar;
    }
    const v = validasiModul(
      modul,
      JSON.parse((await ambilTerverifikasi(backupId, m, JALUR.modul(modul), st)).toString('utf8')),
      sistem.versiSkema,
    );
    if (!v.ok) {
      dasar.ditolak = v.pesan;
      return dasar;
    }
    // Perhitungan di dalam transaksi; hanya tabel sementara yang dibuat dan
    // ikut lenyap saat commit — tidak ada baris data yang ditulis.
    const tabel = await db.$transaction(
      (tx) => imporModul(tx, v.data, permintaan.strategi, { terapkan: false }),
      { timeout: 300_000, maxWait: 20_000 },
    );
    dasar.modul.push({ modul, backup: m.jumlahRecord[modul] ?? 0, tabel });
  }
  return dasar;
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export type HasilMulaiRestore =
  | { ok: true; id: string }
  | {
      ok: false;
      kode: 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'KONFLIK' | 'DITOLAK';
      pesan: string;
    };

/** Membuat `restore_job` BERJALAN. Di dalam `withAuditContext` agar audit memuat pelaku & IP. */
export async function mulaiRestore(
  tx: TxKlien,
  backupId: string,
  permintaan: PermintaanRestore,
  userId: string | null,
): Promise<HasilMulaiRestore> {
  if (permintaan.mode === 'PENUH' && permintaan.konfirmasi !== NAMA_SISTEM) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: `Ketik "${NAMA_SISTEM}" persis untuk mengonfirmasi restore penuh.`,
    };
  }
  if (permintaan.mode === 'MODUL') {
    for (const modul of permintaan.modul) {
      const tolak = strategiSah(modul, permintaan.strategi);
      if (tolak) return { ok: false, kode: 'DITOLAK', pesan: tolak };
    }
  }
  const b = await tx.backup.findUnique({ where: { id: backupId }, select: { status: true } });
  if (!b) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Backup tidak ditemukan.' };
  if (b.status !== 'SUKSES')
    return {
      ok: false,
      kode: 'DITOLAK',
      pesan: 'Hanya backup berstatus SUKSES yang dapat dipulihkan.',
    };
  const jalan = await tx.restore_job.findFirst({
    where: { status: 'BERJALAN' },
    select: { id: true },
  });
  if (jalan) return { ok: false, kode: 'KONFLIK', pesan: 'Restore lain sedang berjalan.' };

  const ditolak = cekKecocokan(
    await muatManifest(backupId),
    await sistemSekarang(),
    permintaan.mode,
  );
  if (ditolak) return { ok: false, kode: 'DITOLAK', pesan: ditolak };

  const job = await tx.restore_job.create({
    data: {
      backup_id: backupId,
      mode: permintaan.mode,
      modul: permintaan.mode === 'MODUL' ? permintaan.modul : [],
      strategi: permintaan.mode === 'MODUL' ? permintaan.strategi : null,
      dibuat_oleh: userId,
      progres: { persen: 0, pesan: 'Menyiapkan backup pra-restore' },
    },
    select: { id: true },
  });
  const nilai = {
    backup_id: backupId,
    mode: permintaan.mode,
    ...(permintaan.mode === 'MODUL'
      ? { modul: permintaan.modul, strategi: permintaan.strategi }
      : {}),
  };
  await tx.$executeRaw`
    INSERT INTO audit_log (user_id, aksi, entitas, entitas_id, nilai_baru, ip_address, user_agent, periode_id)
    VALUES (${userId}::uuid, 'RESTORE_MULAI', 'restore_job', ${job.id}, ${nilai as Prisma.InputJsonValue}::jsonb,
            nullif(current_setting('app.ip', true), '')::inet, nullif(current_setting('app.user_agent', true), ''), periode_aktif())
  `;
  return { ok: true, id: job.id };
}

export interface LaporanRestore {
  praRestoreId?: string;
  berkasDiperiksa?: number;
  /** MODUL: modul yang SUDAH terpakai (tetap terpakai walau modul berikutnya gagal). */
  terpakai?: { modul: string; tabel: RingkasTabel[] }[];
  gagalPada?: string;
  /** PENUH */
  berkasStorage?: number;
  database?: { tabelDikosongkan: number; detik: number };
  detik?: number;
}

type Tahap = 'PRA_RESTORE' | 'VERIFIKASI' | 'TERAPKAN' | 'SELESAI';

async function perbarui(
  id: string,
  data: {
    tahap?: Tahap;
    progres?: { persen: number; pesan: string };
    laporan?: LaporanRestore;
    pra_restore_id?: string;
  },
) {
  await db.restore_job.update({
    where: { id },
    data: {
      ...data,
      laporan: data.laporan as Prisma.InputJsonValue | undefined,
      updated_at: new Date(),
    },
  });
}

export type HasilRestore =
  { ok: true; laporan: LaporanRestore } | { ok: false; pesan: string; laporan: LaporanRestore };

/**
 * Menjalankan restore dari tahap yang tersimpan sampai selesai. Tidak
 * melempar; kegagalan menjadi GAGAL + laporan. Aman dipanggil ulang untuk
 * melanjutkan job yang terputus (tahap TERAPKAN modul melewati modul yang
 * sudah terpakai; PENUH mengulang transaksi database yang atomik).
 */
export async function jalankanRestore(
  jobId: string,
  st: Penyimpanan = storageBawaan,
): Promise<HasilRestore> {
  const mulai = Date.now();
  const job = await db.restore_job.findUniqueOrThrow({ where: { id: jobId } });
  const laporan: LaporanRestore = { ...((job.laporan ?? {}) as LaporanRestore) };
  let tahap = job.tahap as Tahap;
  const cache = new Map<string, Buffer>();
  const lapor = (persen: number, pesan: string) =>
    perbarui(jobId, { progres: { persen, pesan } }).catch(() => undefined);

  try {
    if (job.status !== 'BERJALAN') throw new Error('Restore ini sudah tidak berjalan.');

    if (tahap === 'PRA_RESTORE') {
      const pra = job.pra_restore_id
        ? await db.backup.findUnique({
            where: { id: job.pra_restore_id },
            select: { status: true },
          })
        : null;
      if (pra?.status !== 'SUKSES') {
        const m = await withServiceContext((tx) =>
          mulaiBackup(tx, { jenis: 'PRA_RESTORE', userId: job.dibuat_oleh }),
        );
        if (!m.ok)
          throw new Error(
            `Backup pra-restore tidak dapat dimulai: ${m.pesan} Restore dibatalkan; data tidak disentuh.`,
          );
        laporan.praRestoreId = m.id;
        await perbarui(jobId, {
          pra_restore_id: m.id,
          laporan,
          progres: { persen: 5, pesan: 'Membuat backup pra-restore (safety net)' },
        });
        const h = await prosesBackup(m.id, 'PRA_RESTORE');
        if (!h.ok)
          throw new Error(
            `Backup pra-restore gagal: ${h.pesan} Restore dibatalkan; data tidak disentuh.`,
          );
      }
      tahap = 'VERIFIKASI';
      await perbarui(jobId, {
        tahap,
        laporan,
        progres: { persen: 40, pesan: 'Memverifikasi checksum bundel' },
      });
    }

    const m = await muatManifest(job.backup_id, st);
    const ditolak = cekKecocokan(m, await sistemSekarang(), job.mode as 'PENUH' | 'MODUL');
    if (ditolak) throw new Error(ditolak);

    if (tahap === 'VERIFIKASI') {
      const rusak: string[] = [];
      for (const [i, f] of m.files.entries()) {
        await lapor(40 + Math.round((i / m.files.length) * 15), `Memverifikasi ${f.path}`);
        const isi = await st.get(keys.backupBerkas(job.backup_id, f.path)).catch(() => null);
        if (!isi) rusak.push(`${f.path} (tidak ada)`);
        else if (isi.length !== f.size || sha256(isi) !== f.checksum)
          rusak.push(`${f.path} (checksum tidak cocok)`);
        else cache.set(f.path, isi);
      }
      if (rusak.length) throw new Error(`Backup rusak — restore dibatalkan: ${rusak.join(', ')}.`);
      laporan.berkasDiperiksa = m.files.length;
      tahap = 'TERAPKAN';
      await perbarui(jobId, {
        tahap,
        laporan,
        progres: { persen: 55, pesan: 'Menerapkan restore' },
      });
    }

    const ambil = async (path: string) =>
      cache.get(path) ?? ambilTerverifikasi(job.backup_id, m, path, st);

    if (job.mode === 'MODUL') {
      const strategi = job.strategi as Strategi;
      laporan.terpakai ??= [];
      const sudah = new Set(laporan.terpakai.map((x) => x.modul));
      for (const [i, modul] of (job.modul as ModulBackup[]).entries()) {
        if (sudah.has(modul)) continue;
        laporan.gagalPada = modul;
        await lapor(
          55 + Math.round((i / job.modul.length) * 40),
          `Memulihkan ${modul}.json (${strategi.toLowerCase()})`,
        );
        const v = validasiModul(
          modul,
          JSON.parse((await ambil(JALUR.modul(modul))).toString('utf8')),
          m.versiSkema,
        );
        if (!v.ok) throw new Error(v.pesan);
        const tabel = await db.$transaction(
          (tx) => imporModul(tx, v.data, strategi, { terapkan: true }),
          { timeout: 600_000, maxWait: 20_000 },
        );
        laporan.terpakai.push({ modul, tabel });
        delete laporan.gagalPada;
        await perbarui(jobId, { laporan });
      }
    } else {
      // 1. Berkas storage (upsert, tidak pernah menghapus).
      let n = 0;
      for (let v = 1; v <= m.volumeArsip; v++) {
        const zip = new PizZip(await ambil(JALUR.arsip(v)));
        const indeks = JSON.parse(zip.file(NAMA_INDEKS)!.asText()) as EntriIndeks[];
        for (const e of indeks) {
          const isi = zip.file(e.key)!.asNodeBuffer();
          if (sha256(isi) !== e.checksum) throw new Error(`Berkas ${e.key} di arsip rusak.`);
          await (st.put as StorageAdapter['put'])(
            e.key,
            isi,
            e.contentType ?? 'application/octet-stream',
            { upsert: true },
          );
          if (++n % 20 === 0)
            await lapor(
              55 + Math.round((n / Math.max(1, m.jumlahBerkasStorage)) * 20),
              `Memulihkan berkas ${n}/${m.jumlahBerkasStorage}`,
            );
        }
      }
      laporan.berkasStorage = n;
      laporan.gagalPada = 'database';
      await perbarui(jobId, {
        laporan,
        progres: { persen: 78, pesan: 'Memulihkan database (satu transaksi)' },
      });
      // 2. Database — atomik: gagal di tengah = tidak ada yang berubah.
      laporan.database = await pulihkanDump(
        m,
        gunzipSync(await ambil(JALUR.dump)).toString('utf8'),
      );
      delete laporan.gagalPada;
    }

    laporan.detik = Math.round((Date.now() - mulai) / 1000);
    await db.restore_job.update({
      where: { id: jobId },
      data: {
        status: 'SUKSES',
        tahap: 'SELESAI',
        laporan: laporan as Prisma.InputJsonValue,
        progres: { persen: 100, pesan: 'Restore selesai' },
        completed_at: new Date(),
        updated_at: new Date(),
      },
    });
    await auditAkhir(jobId, job.dibuat_oleh, { status: 'SUKSES', mode: job.mode, laporan });
    return { ok: true, laporan };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    await db.restore_job
      .update({
        where: { id: jobId },
        data: {
          status: 'GAGAL',
          error_message: pesan.slice(0, 2000),
          laporan: laporan as Prisma.InputJsonValue,
          completed_at: new Date(),
          updated_at: new Date(),
        },
      })
      .catch(() => undefined);
    await auditAkhir(jobId, job.dibuat_oleh, {
      status: 'GAGAL',
      mode: job.mode,
      tahap,
      pesan: pesan.slice(0, 500),
      laporan,
    }).catch(() => undefined);
    return { ok: false, pesan, laporan };
  }
}

async function auditAkhir(id: string, userId: string | null, nilai: Record<string, unknown>) {
  await db.$executeRaw`
    INSERT INTO audit_log (user_id, aksi, entitas, entitas_id, nilai_baru, user_agent, periode_id)
    VALUES (${userId}::uuid, 'RESTORE', 'restore_job', ${id}, ${nilai as Prisma.InputJsonValue}::jsonb, 'sistem', periode_aktif())
  `;
}

/**
 * Database dari dump data, dalam SATU transaksi koneksi langsung: kosongkan
 * tabel dump (kecuali audit_log), jalankan dump. `opsi.kering` = rollback di
 * akhir — dipakai scripts/e2e-restore.ts untuk mengukur & membandingkan
 * tanpa mengganti data bersama.
 */
export async function pulihkanDump(
  m: Pick<Manifest, 'dump'>,
  sqlDump: string,
  opsi: {
    kering?: boolean;
    periksa?: (tx: ReturnType<typeof klienLangsung>) => Promise<void>;
  } = {},
): Promise<{ tabelDikosongkan: number; detik: number }> {
  const mulai = Date.now();
  const sql = klienLangsung();
  const tabel = m.dump.tabel.filter((t) => t !== 'audit_log');
  const KERING = '__ROLLBACK_KERING__';
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL session_replication_role = replica');
      await tx.unsafe(`SET LOCAL statement_timeout = '30min'`);
      for (const t of tabel) {
        if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`Nama tabel tidak sah: ${t}`);
        const [ada] = await tx.unsafe<{ ada: boolean }[]>(
          `SELECT to_regclass('public."${t}"') IS NOT NULL AS ada`,
        );
        if (ada?.ada) await tx.unsafe(`DELETE FROM public."${t}"`);
      }
      for (const p of pecahDump(sqlDump)) await tx.unsafe(p);
      if (opsi.periksa) await opsi.periksa(tx as unknown as ReturnType<typeof klienLangsung>);
      if (opsi.kering) throw new Error(KERING);
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === KERING)) throw e;
  } finally {
    await sql.end();
  }
  return { tabelDikosongkan: tabel.length, detik: Math.round((Date.now() - mulai) / 1000) };
}

/** Job BERJALAN yang terlalu lama diam — boleh dilanjutkan dari tahapnya. */
export async function bolehDilanjutkan(jobId: string, sekarang = new Date()): Promise<boolean> {
  const j = await db.restore_job.findUnique({
    where: { id: jobId },
    select: { status: true, updated_at: true, pra_restore_id: true },
  });
  if (!j || j.status !== 'BERJALAN' || sekarang.getTime() - j.updated_at.getTime() <= BATAS_DIAM_MS)
    return false;
  // Backup pra-restore memperbarui barisnya sendiri, bukan job ini — selama
  // ia masih BERJALAN (belum ditandai terhenti), job belum terputus.
  if (j.pra_restore_id) {
    await tandaiTerhenti(sekarang);
    const pra = await db.backup.findUnique({
      where: { id: j.pra_restore_id },
      select: { status: true },
    });
    if (pra?.status === 'BERJALAN') return false;
  }
  return true;
}

export interface RingkasRestore {
  id: string;
  mode: string;
  modul: string[];
  strategi: string | null;
  status: 'BERJALAN' | 'SUKSES' | 'GAGAL';
  tahap: string;
  progres: { persen?: number; pesan?: string };
  laporan: LaporanRestore;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  terputus: boolean;
}

export async function daftarRestore(backupId: string): Promise<RingkasRestore[]> {
  const baris = await db.restore_job.findMany({
    where: { backup_id: backupId },
    orderBy: { created_at: 'desc' },
    take: 10,
  });
  const kini = Date.now();
  return baris.map((j) => ({
    id: j.id,
    mode: j.mode,
    modul: j.modul,
    strategi: j.strategi,
    status: j.status,
    tahap: j.tahap,
    progres: j.progres as RingkasRestore['progres'],
    laporan: j.laporan as LaporanRestore,
    error_message: j.error_message,
    created_at: j.created_at.toISOString(),
    updated_at: j.updated_at.toISOString(),
    completed_at: j.completed_at?.toISOString() ?? null,
    terputus: j.status === 'BERJALAN' && kini - j.updated_at.getTime() > BATAS_DIAM_MS,
  }));
}
